import { CannonConfetti, ConfettiPresets } from 'react-native-fast-confetti';
import {
  MODE_CARD_HEIGHT,
  MODE_CARD_WIDTH,
  ModeMenu,
} from '../components/ModeMenu';

const twinBloomColors = ['#F6D61B', '#EE6A10', '#6F1EE8', '#B21FBA', '#DC1F5D'];

const originalFlakes = (
  <>
    <CannonConfetti.Flake size={12} radius={6} />
    <CannonConfetti.Flake width={8} height={14} />
    <CannonConfetti.Flake width={8} height={14} radius={6.5} />
    <CannonConfetti.Flake width={8} height={14} radius={4} />
  </>
);

const twinBloomFlakes = (
  <>
    <CannonConfetti.Flake size={32} radius={16} />
    <CannonConfetti.Flake width={44} height={16} radius={8} />
    <CannonConfetti.Flake size={28} radius={14} />
    <CannonConfetti.Flake width={36} height={16} radius={8} />
    <CannonConfetti.Flake size={36} shape="heart" />
    <CannonConfetti.Flake size={36} shape="star" />
    <CannonConfetti.Flake size={36} shape="flower" />
    <CannonConfetti.Flake width={56} height={40} shape="streamer" />
  </>
);

const cannonModes = [
  {
    key: 'cannon-original',
    title: 'Original',
    description: 'The original cannon example from main',
    render: () => (
      <CannonConfetti
        autoplay
        fadeOutOnEnd
        infinite
        flakeStyle="glossy"
        gravity={3}
        sprayDuration={300}
        initialScale={0.7}
        containerStyle={{ width: MODE_CARD_WIDTH, height: MODE_CARD_HEIGHT }}
      >
        <CannonConfetti.Origin
          position="bottom-left"
          count={50}
          initialSpeed={3}
          depth={{ min: 1, max: 1.1 }}
        >
          {originalFlakes}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-right"
          count={50}
          initialSpeed={3}
          depth={{ min: 1, max: 1.1 }}
        >
          {originalFlakes}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-center"
          count={50}
          initialSpeed={4}
          target="center"
        >
          {originalFlakes}
        </CannonConfetti.Origin>
      </CannonConfetti>
    ),
  },
  {
    key: 'twin-bloom',
    title: 'Twin Bloom',
    description: 'Colorful confetti blooming in from both sides',
    render: () => (
      <CannonConfetti
        autoplay
        infinite
        colors={twinBloomColors}
        particleSystem={ConfettiPresets.TwinBloom}
        reduceMotion="never"
        flakeStyle="solid"
        containerStyle={{ width: MODE_CARD_WIDTH, height: MODE_CARD_HEIGHT }}
      >
        <CannonConfetti.Origin position="center-left" count={20}>
          {twinBloomFlakes}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin position="center-right" count={16}>
          {twinBloomFlakes}
        </CannonConfetti.Origin>
      </CannonConfetti>
    ),
  },
] as const;

export default function CannonMenuScreen() {
  return <ModeMenu items={cannonModes} />;
}
