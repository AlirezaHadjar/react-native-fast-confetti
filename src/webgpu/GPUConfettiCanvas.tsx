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
import { DEFAULT_FOCAL_LENGTH_RATIO, DEFAULT_LIGHT_DIR } from './constants';
import {
  createConfettiResources,
  destroyConfettiResources,
  type ConfettiResourceConfig,
  type ConfettiResources,
} from './resources/confettiResources';
import {
  UNIFORM_FLOAT_OFFSETS,
  UNIFORMS_BYTES,
  VERTS_PER_FLAKE,
  createConfettiPipelines,
} from './shaders/confetti';
import {
  CYCLE_COMPLETIONS,
  CYCLE_ELAPSED,
  CYCLE_VALUE_COUNT,
  FIXED_SIMULATION_STEP_SECONDS,
  SCHEDULE_ACCUMULATOR,
  SCHEDULE_ALPHA,
  SCHEDULE_STEPS,
  SCHEDULE_VALUE_COUNT,
  SUSPENSION_GAP_SECONDS,
  getLoopingCycleDuration,
  writeCycleClock,
  writeFixedStepSchedule,
} from './fixedStepScheduler';
import {
  useDedicatedGPUFrame,
  type DedicatedGPUFrameState,
  type DedicatedGPUFrameTarget,
} from './hooks/useDedicatedGPUFrame';
import { useGPUDevice } from './hooks/useGPUDevice';
import { configureCanvasSurface } from './configureCanvasSurface';
import { createPhasePermutation } from './resourcePacking';
import {
  createGPUFrameRetirement,
  type GPUFrameRetirement,
} from './resourceCleanup';
import type {
  FixedLengthArray,
  ReadonlyFixedLengthArray,
} from '../typeHelpers';
import { useLazyRef } from '../hooks/useLazyRef';
import { interpolateOpacity, type ResolvedOpacityAnimation } from '../fadeOut';
import { useGPUResources } from './hooks/useGPUResources';
import { useGPUResourceRetirement } from './hooks/useGPUResourceRetirement';
import { GPUCanvasHost, gpuCanvasStyles } from './GPUCanvasHost';
import type { ReadableValue } from './controlValues';
import { useGPUCanvasSurfaceCleanup } from './hooks/useGPUCanvasSurfaceCleanup';
import {
  dispatchWorkletCallback,
  useWorkletCallback,
} from './hooks/useWorkletCallback';

export type GPUConfettiInitialization = {
  seed: number;
  revision: number;
  layoutCount: number;
  columnsNum: number;
  rowsNum: number;
  columnWidth: number;
  verticalSpacing: number;
  maxFlakeWidth: number;
  maxFlakeHeight: number;
  verticalOffset: number;
  rotationX: ReadonlyFixedLengthArray<number, 2>;
  rotationZ: ReadonlyFixedLengthArray<number, 2>;
  depth: ReadonlyFixedLengthArray<number, 2>;
  wobble: ReadonlyFixedLengthArray<number, 2>;
  zRange: ReadonlyFixedLengthArray<number, 2>;
  cycleDuration: number;
  gravity: number;
};

export type GPUConfettiCanvasParams = {
  windStrength: number;
  magnusStrength: number;
  flipIntensity: number;
  settleOnFloor: boolean;
  floorRestitution: number;
  floorFriction: number;
  floorVariation: number;
  motionBlurAmount: number;
  shadowOpacity: number;
  iridescence: number;
  textureMode: number;
  easing: EasingFunction | EasingFunctionFactory;
  gravityDir: ReadableValue<FixedLengthArray<number, 3>>;
};

type Props = {
  device?: GPUDevice;
  containerStyle?: StyleProp<ViewStyle>;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  initialization: GPUConfettiInitialization;
  cycleDuration: number;
  motionDuration: number;
  running: ReadableValue<boolean>;
  opacity: ReadableValue<number>;
  drift: number;
  initialScale: number;
  continuous: boolean;
  infinite: boolean;
  opacityAnimation: ResolvedOpacityAnimation | null;
  gravityPxPerSec2: number;
  viewportWidth: number;
  viewportHeight: number;
  params: GPUConfettiCanvasParams;
  onCycleEnd: () => void;
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
  initPipeline: GPUComputePipeline;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  textureRenderPipeline: GPURenderPipeline | null;
  computeBindGroup: GPUBindGroup;
  initBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
  workgroupCount: number;
  count: number;
  focalLength: number;
  viewportWidth: number;
  viewportHeight: number;
};

type FrameConfig = {
  resources: ConfettiResourceConfig;
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
  resources: ConfettiResources,
  initialization: GPUConfettiInitialization,
  continuous: boolean,
  infinite: boolean,
  sizeCount: number
) => {
  const scaledGravity = Math.max(
    initialization.gravity * state.viewportHeight,
    0.001
  );
  const normalDrag = 4 / scaledGravity;
  const tangentialDrag = normalDrag * 0.25;
  const averageDrag = ((normalDrag + tangentialDrag) * 4) / (3 * Math.PI);
  const terminalVelocity = Math.sqrt(scaledGravity / averageDrag);
  const focalLength = Math.max(
    100,
    state.viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO
  );
  const phasePermutation = createPhasePermutation(
    initialization.layoutCount,
    initialization.seed
  );

  resources.initUniforms.write({
    viewportAndLayout: [
      state.viewportWidth,
      state.viewportHeight,
      state.count,
      initialization.layoutCount,
    ],
    grid: [
      initialization.columnsNum,
      initialization.rowsNum,
      initialization.columnWidth,
      Math.min(initialization.maxFlakeHeight, 20) +
        initialization.verticalSpacing,
    ],
    spawn: [
      initialization.verticalOffset,
      initialization.verticalSpacing,
      initialization.maxFlakeWidth,
      focalLength,
    ],
    rotation: [
      initialization.rotationX[0],
      initialization.rotationX[1],
      initialization.rotationZ[0],
      initialization.rotationZ[1],
    ],
    depthAndWobble: [
      initialization.depth[0],
      initialization.depth[1],
      initialization.wobble[0],
      initialization.wobble[1],
    ],
    physics: [
      initialization.cycleDuration,
      scaledGravity,
      normalDrag,
      tangentialDrag,
    ],
    dynamics: [terminalVelocity, 2, 1, 0],
    zAndSizes: [
      initialization.zRange[0],
      initialization.zRange[1],
      sizeCount,
      0,
    ],
    seedAndFlags: [
      initialization.seed >>> 0,
      continuous ? 1 : 0,
      infinite ? 1 : 0,
      0,
    ],
    phasePermutation: [phasePermutation.stride, phasePermutation.offset, 0, 0],
  });

  const encoder = state.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(state.initPipeline);
  pass.setBindGroup(0, state.initBindGroup);
  pass.dispatchWorkgroups(state.workgroupCount);
  pass.end();
  state.queue.submit([encoder.finish()]);
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

const GPUConfettiRenderer = ({
  device,
  count,
  sizeVariations,
  allColors,
  colorOverrides,
  parentColorCount,
  initialization,
  cycleDuration,
  motionDuration,
  running,
  opacity,
  drift,
  initialScale,
  continuous,
  infinite,
  opacityAnimation,
  gravityPxPerSec2,
  viewportWidth,
  viewportHeight,
  params,
  onCycleEnd,
  onReadyChange,
  onError,
}: RendererProps) => {
  const canvasRef = useRef<CanvasRef>(null);
  const [frameRegistration, setFrameRegistration] =
    useState<FrameRegistration | null>(null);
  const uniformDataRef = useLazyRef(
    () => new Float32Array(UNIFORMS_BYTES / Float32Array.BYTES_PER_ELEMENT)
  );
  const scheduleDataRef = useLazyRef(
    () => new Float64Array(SCHEDULE_VALUE_COUNT)
  );
  const cycleDataRef = useLazyRef(() => new Float64Array(CYCLE_VALUE_COUNT));
  const initializedRef = useRef<{
    state: RawFrameState;
    initialization: GPUConfettiInitialization;
  } | null>(null);
  const frameRetirementsRef = useRef(
    new WeakMap<ConfettiResources, GPUFrameRetirement>()
  );
  const elapsed = useSharedValue(0);
  const lastSimSeconds = useSharedValue(0);
  const simulatedSeconds = useSharedValue(0);
  const simulationAccumulator = useSharedValue(0);
  const wasRunning = useSharedValue(false);
  const lastFrameTimestampMs = useSharedValue(0);
  const surfaceReady = useSharedValue(false);
  const needsRender = useSharedValue(false);
  const easingFunction = useMemo(
    () => resolveEasing(params.easing ?? Easing.linear),
    [params.easing]
  );
  const cycleEndCallbackId = useWorkletCallback(onCycleEnd);

  const reportReady = useCallback(() => onReadyChange(true), [onReadyChange]);

  const resourceConfig = useMemo<ConfettiResourceConfig>(
    () => ({
      device,
      count,
      sizeVariations,
      allColors,
      colorOverrides,
      parentColorCount,
    }),
    [device, count, sizeVariations, allColors, colorOverrides, parentColorCount]
  );
  const resources = useGPUResources({
    config: resourceConfig,
    create: createConfettiResources,
    destroy: destroyConfettiResources,
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
    lastSimSeconds.set(0);
    simulatedSeconds.set(0);
    simulationAccumulator.set(0);
    wasRunning.set(false);
    lastFrameTimestampMs.set(0);
  }, [
    elapsed,
    lastFrameTimestampMs,
    lastSimSeconds,
    simulatedSeconds,
    simulationAccumulator,
    wasRunning,
  ]);

  useEffect(() => {
    resetClock();
  }, [cycleDuration, resetClock]);

  useEffect(() => {
    if (!resources || resources.config !== resourceConfig) {
      return;
    }
    if (viewportWidth <= 0 || viewportHeight <= 0) {
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

    const {
      initPipeline,
      computePipeline,
      renderPipeline,
      textureRenderPipeline,
    } = createConfettiPipelines(
      resources.root,
      presentationFormat,
      resources.canUseTextureOnlyPipeline
    );

    resetClock();
    const nextRawFrameState: RawFrameState = {
      device,
      queue: resources.queue,
      context,
      uniformBuffer: resources.uniforms.buffer.buffer,
      initPipeline: resources.root.unwrap(initPipeline),
      computePipeline: resources.root.unwrap(computePipeline),
      renderPipeline: resources.root.unwrap(renderPipeline),
      textureRenderPipeline: textureRenderPipeline
        ? resources.root.unwrap(textureRenderPipeline)
        : null,
      computeBindGroup: resources.root.unwrap(resources.computeBindGroup),
      initBindGroup: resources.root.unwrap(resources.initBindGroup),
      renderBindGroup: resources.root.unwrap(resources.renderBindGroup),
      workgroupCount: Math.ceil(count / 64),
      count,
      focalLength: Math.max(100, viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO),
      viewportWidth,
      viewportHeight,
    };
    const retirement = createGPUFrameRetirement();
    frameRetirementsRef.current.set(resources, retirement);
    initializeParticles(
      nextRawFrameState,
      resources,
      initialization,
      continuous,
      infinite,
      sizeVariations.length
    );
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
    surfaceReady,
    reportReady,
    resetClock,
    continuous,
    infinite,
    sizeVariations,
    needsRender,
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
    initializeParticles(
      activeRawFrameState,
      resources,
      initialization,
      continuous,
      infinite,
      sizeVariations.length
    );
    needsRender.set(true);
    initializedRef.current = {
      state: activeRawFrameState,
      initialization,
    };
    resetClock();
    onReadyChange(true);
  }, [
    activeRawFrameState,
    resources,
    initialization,
    continuous,
    infinite,
    sizeVariations,
    needsRender,
    onReadyChange,
    resetClock,
  ]);

  const shouldScheduleFrame = useCallback(() => {
    'worklet';
    return (
      surfaceReady.get() &&
      (running.get() || wasRunning.get() || needsRender.get())
    );
  }, [needsRender, running, surfaceReady, wasRunning]);

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

      const isRunning = running.get();
      const wasRunningBeforeFrame = wasRunning.get();
      if (!isRunning && !wasRunningBeforeFrame && !needsRender.get()) {
        wasRunning.set(false);
        lastFrameTimestampMs.set(0);
        return null;
      }

      const previousTimestamp = lastFrameTimestampMs.get();
      const timestampDelta =
        isRunning && wasRunningBeforeFrame && previousTimestamp > 0
          ? Math.max((timestamp - previousTimestamp) / 1000, 0)
          : 0;
      // Treat suspension/background gaps as a pause. Short render stalls retain
      // their simulation debt and are caught up over bounded GPU dispatches.
      const rawDt =
        timestampDelta <= SUSPENSION_GAP_SECONDS ? timestampDelta : 0;
      lastFrameTimestampMs.set(isRunning ? timestamp : 0);
      wasRunning.set(isRunning);

      const loopingDuration = getLoopingCycleDuration(
        infinite,
        continuous,
        cycleDuration
      );
      const cycleData = cycleDataRef.current;
      writeCycleClock(elapsed.get(), rawDt, loopingDuration, cycleData);
      const rawElapsed = cycleData[CYCLE_ELAPSED]!;
      const completedCycles = cycleData[CYCLE_COMPLETIONS]!;
      elapsed.set(rawElapsed);

      if (completedCycles > 0) {
        lastSimSeconds.set(0);
        simulatedSeconds.set(0);
        simulationAccumulator.set(0);
      }

      const nowSim =
        continuous || infinite || motionDuration <= 0
          ? rawElapsed
          : rawElapsed < motionDuration
            ? easingFunction(clamp01(rawElapsed / motionDuration)) *
              motionDuration
            : rawElapsed;

      const targetDelta = Math.max(nowSim - lastSimSeconds.get(), 0);
      lastSimSeconds.set(nowSim);
      const scheduleData = scheduleDataRef.current;
      writeFixedStepSchedule(
        simulationAccumulator.get(),
        targetDelta,
        scheduleData
      );
      const accumulator = scheduleData[SCHEDULE_ACCUMULATOR]!;
      const simulationSteps = scheduleData[SCHEDULE_STEPS]!;
      const simulationTimeBeforeFrame = simulatedSeconds.get();
      if (simulationSteps > 0) {
        const advancedSeconds = simulationSteps * FIXED_SIMULATION_STEP_SECONDS;
        simulatedSeconds.set(simulationTimeBeforeFrame + advancedSeconds);
      }
      simulationAccumulator.set(accumulator);
      const interpolationAlpha = scheduleData[SCHEDULE_ALPHA]!;

      const gDir = params.gravityDir.get();
      const cycleProgress =
        !continuous && cycleDuration > 0
          ? clamp01(rawElapsed / cycleDuration)
          : 0;
      const animatedOpacity = opacityAnimation
        ? interpolateOpacity(
            cycleProgress,
            opacityAnimation.timestamps,
            opacityAnimation.opacities
          )
        : 1;
      const minVisibleScale = Math.max(
        0,
        Math.min(1, 1 - params.flipIntensity)
      );

      const uniformData = uniformDataRef.current;
      uniformData[UNIFORM_FLOAT_OFFSETS.viewportX] =
        state.viewportWidth;
      uniformData[UNIFORM_FLOAT_OFFSETS.viewportY] =
        state.viewportHeight;
      uniformData[UNIFORM_FLOAT_OFFSETS.focalLength] =
        state.focalLength;
      uniformData[UNIFORM_FLOAT_OFFSETS.opacity] =
        opacity.get() * animatedOpacity;
      uniformData[UNIFORM_FLOAT_OFFSETS.dt] = FIXED_SIMULATION_STEP_SECONDS;
      uniformData[UNIFORM_FLOAT_OFFSETS.time] = simulationTimeBeforeFrame;
      uniformData[UNIFORM_FLOAT_OFFSETS.drift] = drift;
      uniformData[UNIFORM_FLOAT_OFFSETS.initialScale] = initialScale;
      uniformData[UNIFORM_FLOAT_OFFSETS.windStrength] = params.windStrength;
      uniformData[UNIFORM_FLOAT_OFFSETS.magnusStrength] = params.magnusStrength;
      uniformData[UNIFORM_FLOAT_OFFSETS.continuous] = continuous ? 1 : 0;
      uniformData[UNIFORM_FLOAT_OFFSETS.infinite] = infinite ? 1 : 0;
      uniformData[UNIFORM_FLOAT_OFFSETS.interpolationAlpha] =
        interpolationAlpha;
      uniformData[UNIFORM_FLOAT_OFFSETS.stepsThisFrame] = simulationSteps;
      uniformData[UNIFORM_FLOAT_OFFSETS.motionDuration] = motionDuration;
      uniformData[UNIFORM_FLOAT_OFFSETS.floorVariation] = params.floorVariation;
      uniformData[UNIFORM_FLOAT_OFFSETS.reserved] = 0;
      uniformData[UNIFORM_FLOAT_OFFSETS.floorRestitution] =
        params.floorRestitution;
      uniformData[UNIFORM_FLOAT_OFFSETS.floorFriction] = params.floorFriction;
      uniformData[UNIFORM_FLOAT_OFFSETS.motionBlurAmount] =
        params.motionBlurAmount;
      uniformData[UNIFORM_FLOAT_OFFSETS.shadowOpacity] = params.shadowOpacity;
      uniformData[UNIFORM_FLOAT_OFFSETS.iridescence] = params.iridescence;
      uniformData[UNIFORM_FLOAT_OFFSETS.gravityMagnitude] = gravityPxPerSec2;
      uniformData[UNIFORM_FLOAT_OFFSETS.textureMode] = params.textureMode;
      uniformData[UNIFORM_FLOAT_OFFSETS.lightDirectionX] = DEFAULT_LIGHT_DIR[0];
      uniformData[UNIFORM_FLOAT_OFFSETS.lightDirectionY] = DEFAULT_LIGHT_DIR[1];
      uniformData[UNIFORM_FLOAT_OFFSETS.lightDirectionZ] = DEFAULT_LIGHT_DIR[2];
      uniformData[UNIFORM_FLOAT_OFFSETS.minVisibleScale] = minVisibleScale;
      uniformData[UNIFORM_FLOAT_OFFSETS.gravityDirectionX] = gDir[0];
      uniformData[UNIFORM_FLOAT_OFFSETS.gravityDirectionY] = gDir[1];
      uniformData[UNIFORM_FLOAT_OFFSETS.gravityDirectionZ] = gDir[2];
      uniformData[UNIFORM_FLOAT_OFFSETS.settleOnFloor] =
        params.settleOnFloor && !continuous ? 1 : 0;
      state.queue.writeBuffer(state.uniformBuffer, 0, uniformData);

      const encoder = state.device.createCommandEncoder();
      if (completedCycles > 0) {
        const initPass = encoder.beginComputePass();
        initPass.setPipeline(state.initPipeline);
        initPass.setBindGroup(0, state.initBindGroup);
        initPass.dispatchWorkgroups(state.workgroupCount);
        initPass.end();
      }
      if (simulationSteps > 0) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(state.computePipeline);
        computePass.setBindGroup(0, state.computeBindGroup);
        computePass.dispatchWorkgroups(state.workgroupCount);
        computePass.end();
      }

      target.colorAttachment.view = state.context
        .getCurrentTexture()
        .createView();
      const renderPass = encoder.beginRenderPass(target.descriptor);
      renderPass.setPipeline(
        params.textureMode === 0 && state.textureRenderPipeline
          ? state.textureRenderPipeline
          : state.renderPipeline
      );
      renderPass.setBindGroup(0, state.renderBindGroup);
      renderPass.draw(VERTS_PER_FLAKE, state.count);
      renderPass.end();

      const commandBuffer = encoder.finish();
      needsRender.set(false);

      if (completedCycles > 0) {
        scheduleOnRN(dispatchWorkletCallback, cycleEndCallbackId);
      }

      if (!continuous && !infinite && cycleDuration > 0) {
        const done =
          rawElapsed >= cycleDuration &&
          accumulator < FIXED_SIMULATION_STEP_SECONDS;
        if (done) {
          resetClock();
          scheduleOnRN(dispatchWorkletCallback, cycleEndCallbackId);
        }
      }

      return commandBuffer;
    },
    [
      continuous,
      cycleDataRef,
      cycleEndCallbackId,
      cycleDuration,
      drift,
      elapsed,
      easingFunction,
      opacityAnimation,
      gravityPxPerSec2,
      infinite,
      initialScale,
      motionDuration,
      lastFrameTimestampMs,
      lastSimSeconds,
      needsRender,
      opacity,
      params,
      running,
      resetClock,
      scheduleDataRef,
      simulatedSeconds,
      simulationAccumulator,
      uniformDataRef,
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
    destroyConfettiResources
  );

  return <Canvas ref={canvasRef} style={gpuCanvasStyles.canvas} transparent />;
};

export const GPUConfettiCanvas = (props: Props) => {
  const device = useGPUDevice(props.device, props.onError);
  const canRender =
    device !== null &&
    props.count > 0 &&
    props.viewportWidth > 0 &&
    props.viewportHeight > 0;

  return (
    <GPUCanvasHost
      onContainerLayout={props.onContainerLayout}
      containerStyle={props.containerStyle}
    >
      {canRender ? <GPUConfettiRenderer {...props} device={device} /> : null}
    </GPUCanvasHost>
  );
};
