import { useMemo } from 'react';
import {
  CannonConfetti as SkiaCannonConfetti,
  Confetti as SkiaConfetti,
  ContinuousConfetti as SkiaContinuousConfetti,
  PIConfetti as SkiaPIConfetti,
} from '../../../src';
import {
  CannonConfetti as WebGPUCannonConfetti,
  Confetti as WebGPUConfetti,
  ContinuousConfetti as WebGPUContinuousConfetti,
  PIConfetti as WebGPUPIConfetti,
} from '../../../src/gpu';
import {
  ModeMenu,
  MODE_CARD_HEIGHT,
  MODE_CARD_WIDTH,
} from '../components/ModeMenu';
import { PARTICLE_COUNTS, type RendererType } from '../constants/config';
import { useRenderer } from '../hooks/useRenderer';

const previewFlakes = (Flake: typeof SkiaConfetti.Flake) => (
  <>
    <Flake size={12} radius={6} />
    <Flake width={8} height={14} />
    <Flake width={8} height={14} radius={6.5} />
    <Flake width={8} height={14} radius={4} />
  </>
);

const createModes = (renderer: RendererType) => {
  const previewCanvasProps =
    renderer === 'webgpu'
      ? ({ androidTransparencyMode: 'texture' } as const)
      : {};
  const Confetti = renderer === 'webgpu' ? WebGPUConfetti : SkiaConfetti;
  const ContinuousConfetti =
    renderer === 'webgpu' ? WebGPUContinuousConfetti : SkiaContinuousConfetti;
  const PIConfetti = renderer === 'webgpu' ? WebGPUPIConfetti : SkiaPIConfetti;
  const CannonConfetti =
    renderer === 'webgpu' ? WebGPUCannonConfetti : SkiaCannonConfetti;

  return [
    {
      key: 'single',
      title: 'Single',
      description: 'One-shot confetti burst',
      render: () => (
        <Confetti
          {...previewCanvasProps}
          autoplay
          count={PARTICLE_COUNTS.menu.single}
          containerStyle={{ width: MODE_CARD_WIDTH, height: MODE_CARD_HEIGHT }}
          verticalSpacing={50}
          infinite
          flakeStyle="glossy"
          gravity={2}
        >
          {previewFlakes(Confetti.Flake)}
        </Confetti>
      ),
    },
    {
      key: 'continuous',
      title: 'Continuous',
      description: 'Continuous falling confetti',
      render: () => (
        <ContinuousConfetti
          {...previewCanvasProps}
          autoplay
          count={PARTICLE_COUNTS.menu.continuous}
          containerStyle={{
            width: MODE_CARD_WIDTH,
            height: MODE_CARD_HEIGHT,
          }}
          verticalSpacing={120}
          flakeStyle="glossy"
          gravity={2}
        >
          {previewFlakes(ContinuousConfetti.Flake)}
        </ContinuousConfetti>
      ),
    },
    {
      key: 'pi',
      title: 'PI',
      description: 'Physics-inspired confetti',
      render: () => (
        <PIConfetti
          {...previewCanvasProps}
          autoplay
          flakeStyle="glossy"
          gravity={6}
          infinite
          containerStyle={{
            width: MODE_CARD_WIDTH,
            height: MODE_CARD_HEIGHT,
          }}
        >
          <PIConfetti.Origin
            blastPosition="center"
            count={PARTICLE_COUNTS.menu.piOrigin}
            initialSpeed={4}
          >
            {previewFlakes(PIConfetti.Flake)}
          </PIConfetti.Origin>
        </PIConfetti>
      ),
    },
    {
      key: 'cannon',
      title: 'Cannon',
      description: 'Confetti cannons from edges',
      render: () => (
        <CannonConfetti
          {...previewCanvasProps}
          autoplay
          opacityAnimation={{ enabled: true }}
          infinite
          flakeStyle="glossy"
          gravity={4}
          drag={{ vertical: 3, horizontal: 6 }}
          sprayDuration={300}
          initialScale={0.7}
          containerStyle={{
            width: MODE_CARD_WIDTH,
            height: MODE_CARD_HEIGHT,
          }}
        >
          <CannonConfetti.Origin
            position="bottom-left"
            count={PARTICLE_COUNTS.menu.cannonOrigin}
            initialSpeed={6}
            spread={Math.PI / 3}
            depth={{ min: 1, max: 1.1 }}
          >
            {previewFlakes(CannonConfetti.Flake)}
          </CannonConfetti.Origin>
          <CannonConfetti.Origin
            position="bottom-right"
            count={PARTICLE_COUNTS.menu.cannonOrigin}
            initialSpeed={6}
            spread={Math.PI / 3}
            depth={{ min: 1, max: 1.1 }}
          >
            {previewFlakes(CannonConfetti.Flake)}
          </CannonConfetti.Origin>
          <CannonConfetti.Origin
            position="bottom-center"
            count={PARTICLE_COUNTS.menu.cannonOrigin}
            initialSpeed={4}
            spread={Math.PI / 3}
          >
            {previewFlakes(CannonConfetti.Flake)}
          </CannonConfetti.Origin>
        </CannonConfetti>
      ),
    },
  ] as const;
};

export default function HomeScreen() {
  const { renderer } = useRenderer();
  const modes = useMemo(() => createModes(renderer), [renderer]);

  return <ModeMenu items={modes} />;
}
