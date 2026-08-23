import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Canvas, type CanvasRef } from 'react-native-webgpu';

import type { ColorRange, SizeVariation } from '../hooks/useConfettiFlakes';
import type { GPUBurstInitialization } from './burstResourcePacking';
import {
  createBurstConfettiResources,
  destroyBurstConfettiResources,
  type BurstConfettiResources,
} from './hooks/useBurstConfettiResources';
import {
  BURST_UNIFORMS_BYTES,
  BURST_VERTS_PER_FLAKE,
  createBurstConfettiPipelines,
} from './shaders/burstConfetti';
import {
  useDedicatedGPUFrame,
  type DedicatedGPUFrameTarget,
} from './hooks/useDedicatedGPUFrame';
import { useGPUDevice } from './hooks/useGPUDevice';
import {
  configureCanvasSurface,
  unconfigureCanvasSurface,
} from './configureCanvasSurface';
import {
  createGPUFrameRetirement,
  retireGPUResourceSet,
  type GPUFrameRetirement,
} from './resourceCleanup';
import { useLazyRef } from '../hooks/useLazyRef';
import type { ResolvedSettleOnFloor } from './settleOnFloor';

type NumericValue = {
  get: () => number;
};

type BooleanValue = {
  get: () => boolean;
};

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
  progress: NumericValue;
  running: BooleanValue;
  opacity: NumericValue;
  gravityPxPerSec2: number;
  horizontalDrag: number;
  verticalDrag: number;
  initialScale: number;
  flipIntensity: number;
  viewportWidth: number;
  viewportHeight: number;
  onReadyChange: (ready: boolean) => void;
};

type RendererProps = Omit<
  Props,
  'containerStyle' | 'device' | 'onContainerLayout'
> & {
  device: GPUDevice;
};

type RawFrameState = {
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
}: RendererProps) => {
  const canvasRef = useRef<CanvasRef>(null);
  const [resources, setResources] = useState<BurstConfettiResources | null>(
    null
  );
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

  useEffect(() => {
    onReadyChange(false);
    if (!device || count <= 0 || initialization.origins.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await createBurstConfettiResources({
          device,
          count,
          originCount: initialization.origins.length,
          sizeVariations,
          allColors,
          colorOverrides,
          parentColorCount,
          isCancelled: () => cancelled,
        });
        if (cancelled) {
          destroyBurstConfettiResources(res);
          return;
        }
        setResources(res);
      } catch (error) {
        if (!cancelled) console.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    device,
    count,
    initialization.origins.length,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
    onReadyChange,
  ]);

  useEffect(() => {
    if (!device || !resources) {
      return;
    }
    if (
      resources.device !== device ||
      resources.count !== count ||
      resources.originCount !== initialization.origins.length ||
      resources.sizeVariations !== sizeVariations ||
      resources.allColors !== allColors ||
      resources.colorOverrides !== colorOverrides ||
      resources.parentColorCount !== parentColorCount
    ) {
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
      currentFrame?.device === device &&
      currentFrame.uniformBuffer === resources.uniforms.buffer.buffer &&
      currentFrame.count === count &&
      currentFrame.viewportWidth === viewportWidth &&
      currentFrame.viewportHeight === viewportHeight
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
    count,
    viewportWidth,
    viewportHeight,
    lastRenderedProgress,
    surfaceReady,
    reportReady,
    initialization.origins.length,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
    initialization,
  ]);

  const rawFrameState = frameRegistration?.rawFrameState ?? null;

  const resourcesAreCurrent =
    resources?.device === device &&
    resources.count === count &&
    resources.originCount === initialization.origins.length &&
    resources.sizeVariations === sizeVariations &&
    resources.allColors === allColors &&
    resources.colorOverrides === colorOverrides &&
    resources.parentColorCount === parentColorCount;
  const activeRawFrameState =
    resourcesAreCurrent &&
    rawFrameState?.device === device &&
    rawFrameState.uniformBuffer === resources.uniforms.buffer.buffer &&
    rawFrameState.count === count &&
    rawFrameState.viewportWidth === viewportWidth &&
    rawFrameState.viewportHeight === viewportHeight
      ? rawFrameState
      : null;

  useEffect(() => {
    if (!activeRawFrameState || !resources) return;
    if (
      resources.count !== count ||
      resources.originCount !== initialization.origins.length ||
      resources.sizeVariations !== sizeVariations ||
      resources.allColors !== allColors ||
      resources.colorOverrides !== colorOverrides ||
      resources.parentColorCount !== parentColorCount
    ) {
      return;
    }
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
    count,
    initialization,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
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
      uniformData[0] = activeRawFrameState.viewportWidth;
      uniformData[1] = activeRawFrameState.viewportHeight;
      uniformData[2] = opacity.get();
      uniformData[3] =
        totalDuration > 0
          ? (currentProgress * cycleDuration) / totalDuration
          : currentProgress;
      uniformData[4] = totalDuration;
      uniformData[5] = flightDuration;
      uniformData[6] = gravityPxPerSec2;
      uniformData[7] = initialScale;
      uniformData[8] = flipIntensity;
      uniformData[9] = 0;
      uniformData[10] = horizontalDrag;
      uniformData[11] = verticalDrag;
      uniformData[12] = 0;
      uniformData[13] = 0;
      uniformData[14] = 0;
      uniformData[15] = 0;
      uniformData[16] = floor.enabled ? 1 : 0;
      uniformData[17] = floor.restitution;
      uniformData[18] = floor.friction;
      uniformData[19] = floor.variation;
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

  useLayoutEffect(() => {
    if (!activeRawFrameState) return;
    return () => {
      onReadyChange(false);
      initializedRef.current = null;
      unconfigureCanvasSurface(activeRawFrameState.context, surfaceReady);
    };
  }, [activeRawFrameState, onReadyChange, surfaceReady]);

  useEffect(() => {
    if (!resources) return;
    const frameRetirements = frameRetirementsRef.current;
    return () => {
      void retireGPUResourceSet(
        resources.queue,
        () => destroyBurstConfettiResources(resources),
        frameRetirements.get(resources)?.promise
      );
    };
  }, [resources]);

  return <Canvas ref={canvasRef} style={styles.canvas} transparent />;
};

export const GPUBurstConfettiCanvas = (props: Props) => {
  const device = useGPUDevice(props.device);
  const canRender =
    device !== null &&
    props.count > 0 &&
    props.initialization.origins.length > 0 &&
    props.viewportWidth > 0 &&
    props.viewportHeight > 0;

  return (
    <View
      pointerEvents="none"
      onLayout={props.onContainerLayout}
      style={[styles.container, props.containerStyle]}
    >
      {canRender ? (
        <GPUBurstConfettiRenderer {...props} device={device} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill },
  canvas: { flex: 1 },
});
