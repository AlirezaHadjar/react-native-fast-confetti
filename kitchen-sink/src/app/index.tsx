import {
  CannonConfetti,
  Confetti,
  ContinuousConfetti,
  PIConfetti,
} from 'react-native-fast-confetti';
import {
  MODE_CARD_HEIGHT,
  MODE_CARD_WIDTH,
  ModeMenu,
} from '../components/ModeMenu';

const previewFlakes = (Flake: typeof Confetti.Flake) => (
  <>
    <Flake size={12} radius={6} />
    <Flake width={8} height={14} />
    <Flake width={8} height={14} radius={6.5} />
    <Flake width={8} height={14} radius={4} />
  </>
);

const modes = [
  {
    key: 'single',
    title: 'Single',
    description: 'One-shot confetti burst',
    render: () => (
      <Confetti
        autoplay
        count={100}
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
        autoplay
        count={400}
        containerStyle={{ width: MODE_CARD_WIDTH, height: MODE_CARD_HEIGHT }}
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
        autoplay
        flakeStyle="glossy"
        gravity={6}
        infinite
        containerStyle={{ width: MODE_CARD_WIDTH, height: MODE_CARD_HEIGHT }}
      >
        <PIConfetti.Origin blastPosition="center" count={100} initialSpeed={4}>
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
        autoplay
        fadeOutOnEnd
        infinite
        flakeStyle="glossy"
        gravity={4}
        drag={{ vertical: 3, horizontal: 6 }}
        sprayDuration={300}
        initialScale={0.7}
        containerStyle={{ width: MODE_CARD_WIDTH, height: MODE_CARD_HEIGHT }}
      >
        <CannonConfetti.Origin
          position="bottom-left"
          count={50}
          initialSpeed={6}
          spread={Math.PI / 3}
          depth={{ min: 1, max: 1.1 }}
        >
          {previewFlakes(CannonConfetti.Flake)}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-right"
          count={50}
          initialSpeed={6}
          spread={Math.PI / 3}
          depth={{ min: 1, max: 1.1 }}
        >
          {previewFlakes(CannonConfetti.Flake)}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-center"
          count={50}
          initialSpeed={4}
          spread={Math.PI / 3}
        >
          {previewFlakes(CannonConfetti.Flake)}
        </CannonConfetti.Origin>
      </CannonConfetti>
    ),
  },
] as const;

export default function HomeScreen() {
  return <ModeMenu items={modes} />;
}
