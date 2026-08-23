import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Canvas, type CanvasRef } from 'react-native-webgpu';

import type { ColorRange, SizeVariation } from '../hooks/useConfettiFlakes';
import type { GPUBurstInitialization } from './burstResourcePacking';
import {
  createBurstConfettiResources,
  destroyBurstConfettiResources,
  type BurstConfettiResourceConfig,
  type BurstConfettiResources,
} from './resources/burstConfettiResources';
import {
  BURST_UNIFORM_FLOAT_OFFSETS,
  BURST_UNIFORMS_BYTES,
  BURST_VERTS_PER_FLAKE,
  createBurstConfettiPipelines,
} from './shaders/burstConfetti';
import {
  useDedicatedGPUFrame,
  type DedicatedGPUFrameTarget,
} from './hooks/useDedicatedGPUFrame';
import { useGPUDevice } from './hooks/useGPUDevice';
import { configureCanvasSurface } from './configureCanvasSurface';
import {
  createGPUFrameRetirement,
  type GPUFrameRetirement,
} from './resourceCleanup';
import { useLazyRef } from '../hooks/useLazyRef';
import type { ResolvedSettleOnFloor } from './settleOnFloor';
import { useGPUResources } from './hooks/useGPUResources';
import { useGPUResourceRetirement } from './hooks/useGPUResourceRetirement';
import { GPUCanvasHost, gpuCanvasStyles } from './GPUCanvasHost';
import type { ReadableValue } from './controlValues';
import { useGPUCanvasSurfaceCleanup } from './hooks/useGPUCanvasSurfaceCleanup';

type Props = {
  device?: GPUDevice;
  containerStyle?: StyleProp<ViewStyle>;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  count: number;
  initialization: GPUBurstInitialization;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  totalDuration: number;
  cycleDuration: number;
  flightDuration: number;
  floor: ResolvedSettleOnFloor;
  progress: ReadableValue<number>;
  running: ReadableValue<boolean>;
  opacity: ReadableValue<number>;
  gravityPxPerSec2: number;
  horizontalDrag: number;
  verticalDrag: number;
  initialScale: number;
  flipIntensity: number;
  viewportWidth: number;
  viewportHeight: number;
  onReadyChange: (ready: boolean) => void;
  onError?: (error: unknown) => void;
};

type RendererProps = Omit<
  Props,
  'containerStyle' | 'device' | 'onContainerLayout'
> & {
  device: GPUDevice;
};

type RawFrameState = {
  config: FrameConfig;
  device: GPUDevice;
  queue: GPUQueue;
  context: GPUCanvasContext & { present?: () => void };
  uniformBuffer: GPUBuffer;
  initPipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  initBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
  workgroupCount: number;
  count: number;
  viewportWidth: number;
  viewportHeight: number;
};

type FrameConfig = {
  resources: BurstConfettiResourceConfig;
  viewportWidth: number;
  viewportHeight: number;
};

type FrameRegistration = {
  rawFrameState: RawFrameState;
  retirement: GPUFrameRetirement;
};

const initializeParticles = (
  state: RawFrameState,
  resources: BurstConfettiResources,
  initialization: GPUBurstInitialization
) => {
  resources.originsBuffer.write(initialization.origins);
  resources.initUniforms.write({
    counts: [
      initialization.seed >>> 0,
      initialization.layoutCount,
      initialization.origins.length,
      0,
    ],
    globals: [
      initialization.containerHeight,
      initialization.launchDelayMax,
      0,
      0,
    ],
    floorImpact: initialization.floorImpact,
  });

  const encoder = state.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(state.initPipeline);
  pass.setBindGroup(0, state.initBindGroup);
  pass.dispatchWorkgroups(state.workgroupCount);
  pass.end();
  state.queue.submit([encoder.finish()]);
};

const GPUBurstConfettiRenderer = ({
  device,
  count,
  initialization,
  sizeVariations,
  allColors,
  colorOverrides,
  parentColorCount,
  totalDuration,
  cycleDuration,
  flightDuration,
  floor,
  progress,
  running,
  opacity,
  gravityPxPerSec2,
  horizontalDrag,
  verticalDrag,
  initialScale,
  flipIntensity,
  viewportWidth,
  viewportHeight,
  onReadyChange,
  onError,
}: RendererProps) => {
  const canvasRef = useRef<CanvasRef>(null);
  const [frameRegistration, setFrameRegistration] =
    useState<FrameRegistration | null>(null);
  const uniformDataRef = useLazyRef(
    () =>
      new Float32Array(BURST_UNIFORMS_BYTES / Float32Array.BYTES_PER_ELEMENT)
  );
  const initializedRef = useRef<{
    state: RawFrameState;
    initialization: GPUBurstInitialization;
  } | null>(null);
  const frameRetirementsRef = useRef(
    new WeakMap<BurstConfettiResources, GPUFrameRetirement>()
  );
  const lastRenderedProgress = useSharedValue(Number.NaN);
  const surfaceReady = useSharedValue(false);

  const reportReady = useCallback(() => onReadyChange(true), [onReadyChange]);

  const resourceConfig = useMemo<BurstConfettiResourceConfig>(
    () => ({
      device,
      count,
      originCount: initialization.origins.length,
      sizeVariations,
      allColors,
      colorOverrides,
      parentColorCount,
    }),
    [
      device,
      count,
      initialization.origins.length,
      sizeVariations,
      allColors,
      colorOverrides,
      parentColorCount,
    ]
  );
  const resources = useGPUResources({
    config: resourceConfig,
    create: createBurstConfettiResources,
    destroy: destroyBurstConfettiResources,
    onReadyChange,
    onError,
  });
  const frameConfig = useMemo<FrameConfig>(
    () => ({ resources: resourceConfig, viewportWidth, viewportHeight }),
    [resourceConfig, viewportWidth, viewportHeight]
  );

  useEffect(() => {
    if (!resources || resources.config !== resourceConfig) {
      return;
    }
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }
    if (count <= 0) {
      return;
    }
    const currentFrame = initializedRef.current?.state;
    if (
      currentFrame &&
      currentFrame.config === frameConfig &&
      currentFrame.uniformBuffer === resources.uniforms.buffer.buffer
    ) {
      return;
    }
    const context = canvasRef.current?.getContext('webgpu');
    if (!context) {
      return;
    }

    const dpr = PixelRatio.get();
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    const { initPipeline, renderPipeline } = createBurstConfettiPipelines(
      resources.root,
      presentationFormat,
      resources.canUseTextureOnlyPipeline
    );

    const nextRawFrameState: RawFrameState = {
      config: frameConfig,
      device,
      queue: resources.queue,
      context,
      uniformBuffer: resources.uniforms.buffer.buffer,
      initPipeline: resources.root.unwrap(initPipeline),
      renderPipeline: resources.root.unwrap(renderPipeline),
      initBindGroup: resources.root.unwrap(resources.initBindGroup),
      renderBindGroup: resources.root.unwrap(resources.renderBindGroup),
      workgroupCount: Math.ceil(count / 64),
      count,
      viewportWidth,
      viewportHeight,
    };
    const retirement = createGPUFrameRetirement();
    frameRetirementsRef.current.set(resources, retirement);
    initializeParticles(nextRawFrameState, resources, initialization);
    initializedRef.current = {
      state: nextRawFrameState,
      initialization,
    };
    setFrameRegistration({ rawFrameState: nextRawFrameState, retirement });
    configureCanvasSurface(
      context,
      device,
      Math.max(1, Math.round(viewportWidth * dpr)),
      Math.max(1, Math.round(viewportHeight * dpr)),
      presentationFormat,
      surfaceReady,
      reportReady
    );
    lastRenderedProgress.set(Number.NaN);
  }, [
    device,
    resources,
    resourceConfig,
    frameConfig,
    count,
    viewportWidth,
    viewportHeight,
    lastRenderedProgress,
    surfaceReady,
    reportReady,
    initialization.origins.length,
    sizeVariations,
    initialization,
  ]);

  const rawFrameState = frameRegistration?.rawFrameState ?? null;

  const activeRawFrameState =
    resources &&
    rawFrameState &&
    resources.config === resourceConfig &&
    rawFrameState.config === frameConfig &&
    rawFrameState.uniformBuffer === resources.uniforms.buffer.buffer
      ? rawFrameState
      : null;

  useEffect(() => {
    if (!activeRawFrameState || !resources) return;
    const initialized = initializedRef.current;
    if (
      initialized?.state === activeRawFrameState &&
      initialized.initialization === initialization
    ) {
      return;
    }

    onReadyChange(false);
    initializeParticles(activeRawFrameState, resources, initialization);
    initializedRef.current = {
      state: activeRawFrameState,
      initialization,
    };
    lastRenderedProgress.set(Number.NaN);
    onReadyChange(true);
  }, [
    activeRawFrameState,
    resources,
    initialization,
    lastRenderedProgress,
    onReadyChange,
  ]);

  const shouldScheduleFrame = useCallback(() => {
    'worklet';
    const currentProgress = progress.get();
    return (
      surfaceReady.get() &&
      (currentProgress !== lastRenderedProgress.get() ||
        (running.get() && currentProgress < 1))
    );
  }, [lastRenderedProgress, progress, running, surfaceReady]);

  const activeFrameRetirement =
    activeRawFrameState === frameRegistration?.rawFrameState
      ? frameRegistration?.retirement
      : undefined;
  const reportFrameRetired = useCallback(
    () => activeFrameRetirement?.resolve(),
    [activeFrameRetirement]
  );
  const clearInitialized = useCallback(() => {
    initializedRef.current = null;
  }, []);

  const renderFrame = useCallback(
    (
      _timestamp: number,
      _timeSinceFirstFrame: number,
      target: DedicatedGPUFrameTarget
    ): GPUCommandBuffer | null => {
      'worklet';

      if (!activeRawFrameState) return null;

      const currentProgress = progress.get();
      if (!running.get() && currentProgress === lastRenderedProgress.get()) {
        return null;
      }
      lastRenderedProgress.set(currentProgress);

      const uniformData = uniformDataRef.current;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.viewportX] =
        activeRawFrameState.viewportWidth;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.viewportY] =
        activeRawFrameState.viewportHeight;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.opacity] = opacity.get();
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.progress] =
        totalDuration > 0
          ? (currentProgress * cycleDuration) / totalDuration
          : currentProgress;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.totalDuration] = totalDuration;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.flightDuration] = flightDuration;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.gravity] = gravityPxPerSec2;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.initialScale] = initialScale;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.flipIntensity] = flipIntensity;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.dragX] = horizontalDrag;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.dragY] = verticalDrag;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.padding] = 0;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorEnabled] = floor.enabled
        ? 1
        : 0;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorRestitution] =
        floor.restitution;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorFriction] = floor.friction;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorVariation] = floor.variation;
      activeRawFrameState.queue.writeBuffer(
        activeRawFrameState.uniformBuffer,
        0,
        uniformData
      );

      const encoder = activeRawFrameState.device.createCommandEncoder();
      target.colorAttachment.view = activeRawFrameState.context
        .getCurrentTexture()
        .createView();
      const renderPass = encoder.beginRenderPass(target.descriptor);
      renderPass.setPipeline(activeRawFrameState.renderPipeline);
      renderPass.setBindGroup(0, activeRawFrameState.renderBindGroup);
      renderPass.draw(BURST_VERTS_PER_FLAKE, activeRawFrameState.count);
      renderPass.end();

      return encoder.finish();
    },
    [
      flightDuration,
      flipIntensity,
      floor.enabled,
      floor.friction,
      floor.restitution,
      floor.variation,
      gravityPxPerSec2,
      horizontalDrag,
      initialScale,
      lastRenderedProgress,
      opacity,
      progress,
      activeRawFrameState,
      running,
      cycleDuration,
      totalDuration,
      uniformDataRef,
      verticalDrag,
    ]
  );

  useDedicatedGPUFrame(
    renderFrame,
    activeRawFrameState?.device ?? null,
    activeRawFrameState?.context ?? null,
    activeRawFrameState !== null,
    shouldScheduleFrame,
    activeFrameRetirement ? reportFrameRetired : undefined
  );

  useGPUCanvasSurfaceCleanup(
    activeRawFrameState,
    surfaceReady,
    onReadyChange,
    clearInitialized
  );

  useGPUResourceRetirement(
    resources,
    frameRetirementsRef,
    destroyBurstConfettiResources
  );

  return <Canvas ref={canvasRef} style={gpuCanvasStyles.canvas} transparent />;
};

export const GPUBurstConfettiCanvas = (props: Props) => {
  const device = useGPUDevice(props.device, props.onError);
  const canRender =
    device !== null &&
    props.count > 0 &&
    props.initialization.origins.length > 0 &&
    props.viewportWidth > 0 &&
    props.viewportHeight > 0;

  return (
    <GPUCanvasHost
      onContainerLayout={props.onContainerLayout}
      containerStyle={props.containerStyle}
    >
      {canRender ? (
        <GPUBurstConfettiRenderer {...props} device={device} />
      ) : null}
    </GPUCanvasHost>
  );
};
