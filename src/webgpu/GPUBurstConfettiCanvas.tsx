import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio } from 'react-native';
import {
  Easing,
  useSharedValue,
  type EasingFunction,
  type EasingFunctionFactory,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Canvas, type CanvasRef } from 'react-native-webgpu';

import type { ColorRange, SizeVariation } from '../hooks/useConfettiFlakes';
import type { ResolvedOpacityAnimation } from '../fadeOut';
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
  BURST_INIT_GENERATION_BYTE_OFFSET,
  createBurstConfettiPipelines,
} from './shaders/burstConfetti';
import {
  useDedicatedGPUFrame,
  type DedicatedGPUFrameState,
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
import { DEFAULT_FOCAL_LENGTH_RATIO } from './constants';
import {
  BURST_SCHEDULE_ACCUMULATOR,
  BURST_SCHEDULE_ALPHA,
  BURST_SCHEDULE_REINITIALIZE,
  BURST_SCHEDULE_STEPS,
  BURST_SCHEDULE_VALUE_COUNT,
  writeBurstFixedStepSchedule,
} from './burstFixedStepScheduler';
import {
  CYCLE_COMPLETIONS,
  CYCLE_ELAPSED,
  CYCLE_VALUE_COUNT,
  FIXED_SIMULATION_STEP_SECONDS,
  SCHEDULE_VALUE_COUNT,
  SUSPENSION_GAP_SECONDS,
  writeCycleClock,
} from './fixedStepScheduler';
import {
  dispatchWorkletCallback,
  useWorkletCallback,
} from './hooks/useWorkletCallback';

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
  cycleDuration: number;
  flightDuration: number;
  infinite: boolean;
  easing?: EasingFunction | EasingFunctionFactory;
  opacityAnimation: ResolvedOpacityAnimation | null;
  floor: ResolvedSettleOnFloor;
  running: ReadableValue<boolean>;
  visibility: ReadableValue<number>;
  resetVersion: ReadableValue<number>;
  completeCycle: () => void;
  onCycleEnd: () => void;
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

type RawFrameState = DedicatedGPUFrameState & {
  uniformBuffer: GPUBuffer;
  initUniformBuffer: GPUBuffer;
  initPipeline: GPUComputePipeline;
  transformPipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  initBindGroup: GPUBindGroup;
  transformBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
  workgroupCount: number;
  count: number;
  viewportWidth: number;
  viewportHeight: number;
  focalLength: number;
};

const clamp01 = (value: number) => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};

const resolveEasing = (
  easing: EasingFunction | EasingFunctionFactory
): EasingFunction => {
  'worklet';
  if (typeof easing === 'function') return easing;
  return easing.factory();
};

type FrameConfig = {
  resources: BurstConfettiResourceConfig;
  viewportWidth: number;
  viewportHeight: number;
};

type FrameRegistration = {
  config: FrameConfig;
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
      state.focalLength,
      initialization.flightDurationSeconds,
    ],
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
  cycleDuration,
  flightDuration,
  infinite,
  easing,
  opacityAnimation,
  floor,
  running,
  visibility,
  resetVersion,
  completeCycle,
  onCycleEnd,
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
  const elapsed = useSharedValue(0);
  const lastTargetSimulationSeconds = useSharedValue(0);
  const simulationAccumulator = useSharedValue(0);
  const simulatedSeconds = useSharedValue(0);
  const wasRunning = useSharedValue(false);
  const lastFrameTimestampMs = useSharedValue(0);
  const needsRender = useSharedValue(false);
  const handledResetVersion = useSharedValue(0);
  const cycleGeneration = useSharedValue(0);
  const fixedStepScratchRef = useLazyRef(
    () => new Float64Array(SCHEDULE_VALUE_COUNT)
  );
  const burstScheduleRef = useLazyRef(
    () => new Float64Array(BURST_SCHEDULE_VALUE_COUNT)
  );
  const cycleDataRef = useLazyRef(() => new Float64Array(CYCLE_VALUE_COUNT));
  const generationDataRef = useLazyRef(() => new Uint32Array(1));
  const surfaceReady = useSharedValue(false);
  const easingFunction = useMemo(
    () => resolveEasing(easing ?? Easing.linear),
    [easing]
  );
  const cycleEndCallbackId = useWorkletCallback(onCycleEnd);

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
      opacityAnimation,
    }),
    [
      device,
      count,
      initialization.origins.length,
      sizeVariations,
      allColors,
      colorOverrides,
      parentColorCount,
      opacityAnimation,
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

  const resetClock = useCallback(() => {
    'worklet';
    elapsed.set(0);
    lastTargetSimulationSeconds.set(0);
    simulationAccumulator.set(0);
    simulatedSeconds.set(0);
    wasRunning.set(false);
    lastFrameTimestampMs.set(0);
  }, [
    elapsed,
    lastFrameTimestampMs,
    lastTargetSimulationSeconds,
    simulatedSeconds,
    simulationAccumulator,
    wasRunning,
  ]);

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
      frameRegistration?.rawFrameState === currentFrame &&
      frameRegistration.config === frameConfig &&
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

    const { initPipeline, transformPipeline, renderPipeline } =
      createBurstConfettiPipelines(
        resources.root,
        presentationFormat,
        resources.canUseTextureOnlyPipeline
      );

    const nextRawFrameState: RawFrameState = {
      device,
      queue: resources.queue,
      context,
      uniformBuffer: resources.uniforms.buffer.buffer,
      initUniformBuffer: resources.initUniforms.buffer.buffer,
      initPipeline: resources.root.unwrap(initPipeline),
      transformPipeline: resources.root.unwrap(transformPipeline),
      renderPipeline: resources.root.unwrap(renderPipeline),
      initBindGroup: resources.root.unwrap(resources.initBindGroup),
      transformBindGroup: resources.root.unwrap(resources.transformBindGroup),
      renderBindGroup: resources.root.unwrap(resources.renderBindGroup),
      workgroupCount: Math.ceil(count / 64),
      count,
      viewportWidth,
      viewportHeight,
      focalLength: Math.max(
        100,
        viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO
      ),
    };
    const retirement = createGPUFrameRetirement();
    frameRetirementsRef.current.set(resources, retirement);
    initializeParticles(nextRawFrameState, resources, initialization);
    cycleGeneration.set(0);
    handledResetVersion.set(resetVersion.get());
    resetClock();
    needsRender.set(true);
    initializedRef.current = {
      state: nextRawFrameState,
      initialization,
    };
    setFrameRegistration({
      config: frameConfig,
      rawFrameState: nextRawFrameState,
      retirement,
    });
    configureCanvasSurface(
      context,
      device,
      Math.max(1, Math.round(viewportWidth * dpr)),
      Math.max(1, Math.round(viewportHeight * dpr)),
      presentationFormat,
      surfaceReady,
      reportReady
    );
  }, [
    device,
    resources,
    resourceConfig,
    frameConfig,
    count,
    viewportWidth,
    viewportHeight,
    cycleGeneration,
    handledResetVersion,
    resetVersion,
    resetClock,
    needsRender,
    surfaceReady,
    reportReady,
    initialization.origins.length,
    sizeVariations,
    initialization,
    frameRegistration,
  ]);

  const rawFrameState = frameRegistration?.rawFrameState ?? null;

  const activeRawFrameState =
    resources &&
    rawFrameState &&
    resources.config === resourceConfig &&
    frameRegistration?.config === frameConfig &&
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
    cycleGeneration.set(0);
    handledResetVersion.set(resetVersion.get());
    resetClock();
    needsRender.set(true);
    initializedRef.current = {
      state: activeRawFrameState,
      initialization,
    };
    onReadyChange(true);
  }, [
    activeRawFrameState,
    resources,
    initialization,
    cycleGeneration,
    handledResetVersion,
    resetVersion,
    resetClock,
    needsRender,
    onReadyChange,
  ]);

  const shouldScheduleFrame = useCallback(() => {
    'worklet';
    return (
      surfaceReady.get() &&
      (running.get() ||
        wasRunning.get() ||
        needsRender.get() ||
        resetVersion.get() !== handledResetVersion.get() ||
        simulationAccumulator.get() >= FIXED_SIMULATION_STEP_SECONDS)
    );
  }, [
    handledResetVersion,
    needsRender,
    resetVersion,
    running,
    simulationAccumulator,
    surfaceReady,
    wasRunning,
  ]);

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
      timestamp: number,
      _timeSinceFirstFrame: number,
      target: DedicatedGPUFrameTarget,
      state: RawFrameState
    ): GPUCommandBuffer | null => {
      'worklet';

      const pendingResetVersion = resetVersion.get();
      const shouldReset =
        pendingResetVersion !== handledResetVersion.get();
      if (shouldReset) {
        resetClock();
        handledResetVersion.set(pendingResetVersion);
        needsRender.set(true);
      }

      const isRunning = running.get();
      const wasRunningBeforeFrame = wasRunning.get();
      if (
        !isRunning &&
        !wasRunningBeforeFrame &&
        !needsRender.get() &&
        !shouldReset
      ) {
        lastFrameTimestampMs.set(0);
        return null;
      }

      const previousTimestamp = lastFrameTimestampMs.get();
      const timestampDelta =
        isRunning && wasRunningBeforeFrame && previousTimestamp > 0
          ? Math.max((timestamp - previousTimestamp) / 1000, 0)
          : 0;
      const rawDt =
        timestampDelta <= SUSPENSION_GAP_SECONDS ? timestampDelta : 0;
      lastFrameTimestampMs.set(isRunning ? timestamp : 0);
      wasRunning.set(isRunning);

      const cycleDurationSeconds = Math.max(cycleDuration / 1000, 0);
      const cycleData = cycleDataRef.current;
      writeCycleClock(
        elapsed.get(),
        rawDt,
        infinite ? cycleDurationSeconds : 0,
        cycleData
      );
      const rawElapsed = cycleData[CYCLE_ELAPSED]!;
      const completedCycles = cycleData[CYCLE_COMPLETIONS]!;
      elapsed.set(rawElapsed);

      let reinitializeGeneration = shouldReset;
      if (completedCycles > 0) {
        const nextGeneration =
          (cycleGeneration.get() + completedCycles) >>> 0;
        cycleGeneration.set(nextGeneration);
        const generationData = generationDataRef.current;
        generationData[0] = nextGeneration;
        state.queue.writeBuffer(
          state.initUniformBuffer,
          BURST_INIT_GENERATION_BYTE_OFFSET,
          generationData
        );
        lastTargetSimulationSeconds.set(0);
        simulationAccumulator.set(0);
        simulatedSeconds.set(0);
        reinitializeGeneration = true;
      }

      const rawProgress =
        cycleDurationSeconds > 0
          ? clamp01(rawElapsed / cycleDurationSeconds)
          : 1;
      const targetSimulationSeconds =
        easingFunction(rawProgress) * cycleDurationSeconds;
      const fixedStepScratch = fixedStepScratchRef.current;
      const burstSchedule = burstScheduleRef.current;
      writeBurstFixedStepSchedule(
        lastTargetSimulationSeconds.get(),
        targetSimulationSeconds,
        simulationAccumulator.get(),
        fixedStepScratch,
        burstSchedule
      );
      const shouldReinitialize =
        reinitializeGeneration ||
        burstSchedule[BURST_SCHEDULE_REINITIALIZE]! > 0.5;
      const simulationSteps = burstSchedule[BURST_SCHEDULE_STEPS]!;
      const interpolationAlpha = burstSchedule[BURST_SCHEDULE_ALPHA]!;
      simulationAccumulator.set(
        burstSchedule[BURST_SCHEDULE_ACCUMULATOR]!
      );
      lastTargetSimulationSeconds.set(targetSimulationSeconds);
      if (shouldReinitialize) {
        simulatedSeconds.set(0);
      }
      const simulationTimeBeforeFrame = simulatedSeconds.get();
      if (simulationSteps > 0) {
        simulatedSeconds.set(
          simulationTimeBeforeFrame +
            simulationSteps * FIXED_SIMULATION_STEP_SECONDS
        );
      }

      const safeGravity = Math.max(gravityPxPerSec2, 0.001);
      const dragScale = Math.max(
        (horizontalDrag + verticalDrag) / 6,
        0.05
      );
      const normalDrag = (4 / safeGravity) * dragScale;

      const uniformData = uniformDataRef.current;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.viewportX] =
        state.viewportWidth;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.viewportY] =
        state.viewportHeight;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.visibility] = visibility.get();
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.focalLength] = state.focalLength;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.dt] =
        FIXED_SIMULATION_STEP_SECONDS;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.time] =
        simulationTimeBeforeFrame;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.stepsThisFrame] =
        simulationSteps;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.interpolationAlpha] =
        interpolationAlpha;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.motionDuration] =
        flightDuration / 1000;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.gravity] = gravityPxPerSec2;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.initialScale] = initialScale;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.flipIntensity] = flipIntensity;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.normalDrag] = normalDrag;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.tangentialDrag] =
        normalDrag * 0.25;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.rotationalDrag] = 2;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.windStrength] = 0;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorEnabled] = floor.enabled
        ? 1
        : 0;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorRestitution] =
        floor.restitution;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorFriction] = floor.friction;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.floorVariation] = floor.variation;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.opacityKeyframeCount] =
        opacityAnimation?.timestamps.length ?? 0;
      uniformData[BURST_UNIFORM_FLOAT_OFFSETS.opacityDuration] =
        cycleDurationSeconds;
      state.queue.writeBuffer(state.uniformBuffer, 0, uniformData);

      const encoder = state.device.createCommandEncoder();
      if (shouldReinitialize) {
        const initPass = encoder.beginComputePass();
        initPass.setPipeline(state.initPipeline);
        initPass.setBindGroup(0, state.initBindGroup);
        initPass.dispatchWorkgroups(state.workgroupCount);
        initPass.end();
      }
      const transformPass = encoder.beginComputePass();
      transformPass.setPipeline(state.transformPipeline);
      transformPass.setBindGroup(0, state.transformBindGroup);
      transformPass.dispatchWorkgroups(state.workgroupCount);
      transformPass.end();

      target.colorAttachment.view = state.context
        .getCurrentTexture()
        .createView();
      const renderPass = encoder.beginRenderPass(target.descriptor);
      renderPass.setPipeline(state.renderPipeline);
      renderPass.setBindGroup(0, state.renderBindGroup);
      renderPass.draw(BURST_VERTS_PER_FLAKE, state.count);
      renderPass.end();

      const commandBuffer = encoder.finish();
      needsRender.set(false);

      if (completedCycles > 0) {
        for (let index = 0; index < completedCycles; index++) {
          scheduleOnRN(dispatchWorkletCallback, cycleEndCallbackId);
        }
      }

      if (!infinite && cycleDurationSeconds > 0) {
        const done =
          rawElapsed >= cycleDurationSeconds &&
          simulationAccumulator.get() < FIXED_SIMULATION_STEP_SECONDS;
        if (done) {
          completeCycle();
          wasRunning.set(false);
          lastFrameTimestampMs.set(0);
          scheduleOnRN(dispatchWorkletCallback, cycleEndCallbackId);
        }
      }

      return commandBuffer;
    },
    [
      burstScheduleRef,
      completeCycle,
      cycleDataRef,
      cycleEndCallbackId,
      flightDuration,
      fixedStepScratchRef,
      flipIntensity,
      floor.enabled,
      floor.friction,
      floor.restitution,
      floor.variation,
      gravityPxPerSec2,
      horizontalDrag,
      initialScale,
      infinite,
      easingFunction,
      elapsed,
      generationDataRef,
      cycleGeneration,
      handledResetVersion,
      lastFrameTimestampMs,
      lastTargetSimulationSeconds,
      needsRender,
      opacityAnimation,
      resetClock,
      resetVersion,
      running,
      cycleDuration,
      simulatedSeconds,
      simulationAccumulator,
      uniformDataRef,
      verticalDrag,
      visibility,
      wasRunning,
    ]
  );

  useDedicatedGPUFrame(
    renderFrame,
    activeRawFrameState,
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
