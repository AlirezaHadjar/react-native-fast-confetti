import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import {
  Easing,
  useSharedValue,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Canvas, type CanvasRef } from 'react-native-webgpu';

import type { ColorRange, SizeVariation } from '../hooks/useConfettiFlakes';
import {
  DEFAULT_FADE_START,
  DEFAULT_FOCAL_LENGTH_RATIO,
  DEFAULT_LIGHT_DIR,
} from './constants';
import {
  createConfettiResources,
  destroyConfettiResources,
  type ConfettiResources,
} from './hooks/useConfettiResources';
import {
  UNIFORMS_BYTES,
  VERTS_PER_FLAKE,
  createConfettiPipelines,
} from './shaders/confetti';
import {
  FIXED_SIMULATION_STEP_SECONDS,
  SCHEDULE_ACCUMULATOR,
  SCHEDULE_ALPHA,
  SCHEDULE_STEPS,
  SCHEDULE_VALUE_COUNT,
  SUSPENSION_GAP_SECONDS,
  writeFixedStepSchedule,
} from './fixedStepScheduler';
import {
  useDedicatedGPUFrame,
  type DedicatedGPUFrameTarget,
} from './hooks/useDedicatedGPUFrame';
import { useGPUDevice } from './hooks/useGPUDevice';
import {
  configureCanvasSurface,
  unconfigureCanvasSurface,
} from './configureCanvasSurface';
import { createPhasePermutation } from './resourcePacking';
import { retireGPUResourceSet } from './resourceCleanup';
import type {
  FixedLengthArray,
  ReadonlyFixedLengthArray,
} from '../typeHelpers';

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
  bounceRestitution: number;
  floorFriction: number;
  motionBlurAmount: number;
  shadowOpacity: number;
  iridescence: number;
  textureMode: number;
  easing: EasingFunction | EasingFunctionFactory;
  gravityDir: SharedValue<FixedLengthArray<number, 3>>;
};

type Props = {
  containerStyle?: StyleProp<ViewStyle>;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  initialization: GPUConfettiInitialization;
  cycleDuration: number;
  running: SharedValue<boolean>;
  opacity: SharedValue<number>;
  drift: number;
  initialScale: number;
  continuous: boolean;
  infinite: boolean;
  fadeOutOnEnd: boolean;
  gravityPxPerSec2: number;
  viewportWidth: number;
  viewportHeight: number;
  params: GPUConfettiCanvasParams;
  onAllOffScreen: () => void;
  onReadyChange: (ready: boolean) => void;
};

type RawFrameState = {
  device: GPUDevice;
  queue: GPUQueue;
  context: GPUCanvasContext & { present?: () => void };
  uniformBuffer: GPUBuffer;
  initPipeline: GPUComputePipeline;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  computeBindGroup: GPUBindGroup;
  initBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
  workgroupCount: number;
  count: number;
  focalLength: number;
  viewportWidth: number;
  viewportHeight: number;
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

export const GPUConfettiCanvas = ({
  containerStyle,
  onContainerLayout,
  count,
  sizeVariations,
  allColors,
  colorOverrides,
  parentColorCount,
  initialization,
  cycleDuration,
  running,
  opacity,
  drift,
  initialScale,
  continuous,
  infinite,
  fadeOutOnEnd,
  gravityPxPerSec2,
  viewportWidth,
  viewportHeight,
  params,
  onAllOffScreen,
  onReadyChange,
}: Props) => {
  const device = useGPUDevice();
  const canvasRef = useRef<CanvasRef>(null);
  const [resources, setResources] = useState<ConfettiResources | null>(null);
  const [rawFrameState, setRawFrameState] = useState<RawFrameState | null>(
    null
  );
  const uniformDataRef = useRef(
    new Float32Array(UNIFORMS_BYTES / Float32Array.BYTES_PER_ELEMENT)
  );
  const scheduleDataRef = useRef(new Float64Array(SCHEDULE_VALUE_COUNT));
  const initializedRef = useRef<{
    state: RawFrameState;
    initialization: GPUConfettiInitialization;
  } | null>(null);
  const latestInitializationRef = useRef(initialization);
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

  const reportReady = useCallback(() => onReadyChange(true), [onReadyChange]);

  useEffect(() => {
    latestInitializationRef.current = initialization;
  }, [initialization]);

  useEffect(() => {
    elapsed.set(0);
    lastSimSeconds.set(0);
    simulatedSeconds.set(0);
    simulationAccumulator.set(0);
    wasRunning.set(false);
    lastFrameTimestampMs.set(0);
  }, [
    cycleDuration,
    elapsed,
    lastFrameTimestampMs,
    lastSimSeconds,
    simulatedSeconds,
    simulationAccumulator,
    wasRunning,
  ]);

  useEffect(() => {
    if (!device || count <= 0) return;
    onReadyChange(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await createConfettiResources({
          device,
          count,
          sizeVariations,
          allColors,
          colorOverrides,
          parentColorCount,
          isCancelled: () => cancelled,
        });
        if (cancelled) {
          destroyConfettiResources(res);
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
    const context = canvasRef.current?.getContext('webgpu');
    if (!context) {
      return;
    }

    const dpr = PixelRatio.get();
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    const { initPipeline, computePipeline, renderPipeline } =
      createConfettiPipelines(resources.root, presentationFormat);

    elapsed.set(0);
    lastSimSeconds.set(0);
    simulatedSeconds.set(0);
    simulationAccumulator.set(0);
    wasRunning.set(false);
    lastFrameTimestampMs.set(0);
    const nextRawFrameState: RawFrameState = {
      device,
      queue: resources.queue,
      context,
      uniformBuffer: resources.uniforms.buffer.buffer,
      initPipeline: resources.root.unwrap(initPipeline),
      computePipeline: resources.root.unwrap(computePipeline),
      renderPipeline: resources.root.unwrap(renderPipeline),
      computeBindGroup: resources.root.unwrap(resources.computeBindGroup),
      initBindGroup: resources.root.unwrap(resources.initBindGroup),
      renderBindGroup: resources.root.unwrap(resources.renderBindGroup),
      workgroupCount: Math.ceil(count / 64),
      count,
      focalLength: Math.max(100, viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO),
      viewportWidth,
      viewportHeight,
    };
    const currentInitialization = latestInitializationRef.current;
    initializeParticles(
      nextRawFrameState,
      resources,
      currentInitialization,
      continuous,
      infinite,
      sizeVariations.length
    );
    needsRender.set(true);
    initializedRef.current = {
      state: nextRawFrameState,
      initialization: currentInitialization,
    };
    setRawFrameState(nextRawFrameState);
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
    count,
    viewportWidth,
    viewportHeight,
    elapsed,
    lastFrameTimestampMs,
    lastSimSeconds,
    simulatedSeconds,
    simulationAccumulator,
    surfaceReady,
    reportReady,
    wasRunning,
    continuous,
    infinite,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
    needsRender,
  ]);

  const activeRawFrameState =
    rawFrameState?.device === device &&
    rawFrameState.uniformBuffer === resources?.uniforms.buffer.buffer &&
    rawFrameState.count === count &&
    rawFrameState.viewportWidth === viewportWidth &&
    rawFrameState.viewportHeight === viewportHeight
      ? rawFrameState
      : null;

  useEffect(() => {
    if (!activeRawFrameState || !resources) return;
    if (
      resources.count !== count ||
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
    elapsed.set(0);
    lastSimSeconds.set(0);
    simulatedSeconds.set(0);
    simulationAccumulator.set(0);
    wasRunning.set(false);
    lastFrameTimestampMs.set(0);
    onReadyChange(true);
  }, [
    activeRawFrameState,
    resources,
    count,
    initialization,
    continuous,
    infinite,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
    elapsed,
    lastFrameTimestampMs,
    lastSimSeconds,
    needsRender,
    onReadyChange,
    simulatedSeconds,
    simulationAccumulator,
    wasRunning,
  ]);

  const shouldScheduleFrame = useCallback(() => {
    'worklet';
    return (
      surfaceReady.get() &&
      (running.get() || wasRunning.get() || needsRender.get())
    );
  }, [needsRender, running, surfaceReady, wasRunning]);

  const renderFrame = useCallback(
    (
      timestamp: number,
      _timeSinceFirstFrame: number,
      target: DedicatedGPUFrameTarget
    ): GPUCommandBuffer | null => {
      'worklet';

      if (!activeRawFrameState) return null;

      const isRunning = running.get();
      if (!isRunning && !needsRender.get()) {
        wasRunning.set(false);
        lastFrameTimestampMs.set(0);
        return null;
      }

      const previousTimestamp = lastFrameTimestampMs.get();
      const timestampDelta =
        isRunning && wasRunning.get() && previousTimestamp > 0
          ? Math.max((timestamp - previousTimestamp) / 1000, 0)
          : 0;
      // Treat suspension/background gaps as a pause. Short render stalls retain
      // their simulation debt and are caught up over bounded GPU dispatches.
      const rawDt =
        timestampDelta <= SUSPENSION_GAP_SECONDS ? timestampDelta : 0;
      lastFrameTimestampMs.set(isRunning ? timestamp : 0);
      wasRunning.set(isRunning);

      const rawElapsed = elapsed.get() + rawDt;
      elapsed.set(rawElapsed);

      const nowSim =
        continuous || infinite || cycleDuration <= 0
          ? rawElapsed
          : easingFunction(clamp01(rawElapsed / cycleDuration)) * cycleDuration;

      const targetDelta = Math.max(nowSim - lastSimSeconds.get(), 0);
      lastSimSeconds.set(nowSim);
      const schedule = scheduleDataRef.current;
      writeFixedStepSchedule(
        simulationAccumulator.get(),
        targetDelta,
        schedule
      );
      const accumulator = schedule[SCHEDULE_ACCUMULATOR]!;
      const simulationSteps = schedule[SCHEDULE_STEPS]!;
      const simulationTimeBeforeFrame = simulatedSeconds.get();
      if (simulationSteps > 0) {
        const advancedSeconds = simulationSteps * FIXED_SIMULATION_STEP_SECONDS;
        simulatedSeconds.set(simulationTimeBeforeFrame + advancedSeconds);
      }
      simulationAccumulator.set(accumulator);
      const interpolationAlpha = schedule[SCHEDULE_ALPHA]!;

      const gDir = params.gravityDir.get();
      const cycleProgress =
        !continuous && !infinite && cycleDuration > 0
          ? clamp01(nowSim / cycleDuration)
          : 0;
      const fadeProgress =
        cycleProgress <= DEFAULT_FADE_START
          ? 0
          : (cycleProgress - DEFAULT_FADE_START) / (1 - DEFAULT_FADE_START);
      const fadeOpacity = fadeOutOnEnd ? 1 - clamp01(fadeProgress) : 1;
      const minVisibleScale = Math.max(
        0,
        Math.min(1, 1 - params.flipIntensity)
      );

      const uniforms = uniformDataRef.current;
      uniforms[0] = activeRawFrameState.viewportWidth;
      uniforms[1] = activeRawFrameState.viewportHeight;
      uniforms[2] = activeRawFrameState.focalLength;
      uniforms[3] = opacity.get() * fadeOpacity;
      uniforms[4] = FIXED_SIMULATION_STEP_SECONDS;
      uniforms[5] = simulationTimeBeforeFrame;
      uniforms[6] = drift;
      uniforms[7] = initialScale;
      uniforms[8] = params.windStrength;
      uniforms[9] = params.magnusStrength;
      uniforms[10] = continuous ? 1 : 0;
      uniforms[11] = infinite ? 1 : 0;
      uniforms[12] = interpolationAlpha;
      uniforms[13] = simulationSteps;
      uniforms[14] = cycleDuration;
      uniforms[15] = fadeOutOnEnd ? 1 : 0;
      uniforms[16] = DEFAULT_FADE_START;
      uniforms[17] = params.bounceRestitution;
      uniforms[18] = params.floorFriction;
      uniforms[19] = params.motionBlurAmount;
      uniforms[20] = params.shadowOpacity;
      uniforms[21] = params.iridescence;
      uniforms[22] = gravityPxPerSec2;
      uniforms[23] = params.textureMode;
      uniforms[24] = DEFAULT_LIGHT_DIR[0];
      uniforms[25] = DEFAULT_LIGHT_DIR[1];
      uniforms[26] = DEFAULT_LIGHT_DIR[2];
      uniforms[27] = minVisibleScale;
      uniforms[28] = gDir[0];
      uniforms[29] = gDir[1];
      uniforms[30] = gDir[2];
      uniforms[31] = 0;
      activeRawFrameState.queue.writeBuffer(
        activeRawFrameState.uniformBuffer,
        0,
        uniforms
      );

      const encoder = activeRawFrameState.device.createCommandEncoder();
      if (simulationSteps > 0) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(activeRawFrameState.computePipeline);
        computePass.setBindGroup(0, activeRawFrameState.computeBindGroup);
        computePass.dispatchWorkgroups(activeRawFrameState.workgroupCount);
        computePass.end();
      }

      target.colorAttachment.view = activeRawFrameState.context
        .getCurrentTexture()
        .createView();
      const renderPass = encoder.beginRenderPass(target.descriptor);
      renderPass.setPipeline(activeRawFrameState.renderPipeline);
      renderPass.setBindGroup(0, activeRawFrameState.renderBindGroup);
      renderPass.draw(VERTS_PER_FLAKE, activeRawFrameState.count);
      renderPass.end();

      const commandBuffer = encoder.finish();
      needsRender.set(false);

      if (!continuous && !infinite && cycleDuration > 0) {
        const done =
          rawElapsed >= cycleDuration &&
          accumulator < FIXED_SIMULATION_STEP_SECONDS;
        if (done) {
          elapsed.set(0);
          lastSimSeconds.set(0);
          simulatedSeconds.set(0);
          simulationAccumulator.set(0);
          wasRunning.set(false);
          lastFrameTimestampMs.set(0);
          scheduleOnRN(onAllOffScreen);
        }
      }

      return commandBuffer;
    },
    [
      continuous,
      cycleDuration,
      drift,
      elapsed,
      easingFunction,
      fadeOutOnEnd,
      gravityPxPerSec2,
      infinite,
      initialScale,
      lastFrameTimestampMs,
      lastSimSeconds,
      needsRender,
      onAllOffScreen,
      opacity,
      params,
      activeRawFrameState,
      running,
      scheduleDataRef,
      simulatedSeconds,
      simulationAccumulator,
      uniformDataRef,
      wasRunning,
    ]
  );

  useDedicatedGPUFrame(
    renderFrame,
    activeRawFrameState?.device ?? null,
    activeRawFrameState?.context ?? null,
    activeRawFrameState !== null,
    shouldScheduleFrame
  );

  useEffect(() => {
    if (!activeRawFrameState) return;
    return () => {
      initializedRef.current = null;
      unconfigureCanvasSurface(activeRawFrameState.context, surfaceReady);
    };
  }, [activeRawFrameState, surfaceReady]);

  useEffect(() => {
    if (!resources) return;
    return retireGPUResourceSet(() => destroyConfettiResources(resources));
  }, [resources]);

  return (
    <View
      pointerEvents="none"
      onLayout={onContainerLayout}
      style={[styles.container, containerStyle]}
    >
      <Canvas ref={canvasRef} style={styles.canvas} transparent />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill },
  canvas: { flex: 1 },
});
