import {
  FlatList,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { colors } from '../constants/colors';
import {
  CannonConfetti,
  Confetti,
  ContinuousConfetti,
  PIConfetti,
} from 'react-native-fast-confetti';
import { ModeCard } from '../components/ModeCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PADDING = 16;
const ITEM_HEIGHT = 140;
const ITEM_WIDTH = SCREEN_WIDTH - PADDING * 2;

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
        containerStyle={{ width: ITEM_WIDTH, height: ITEM_HEIGHT }}
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
        containerStyle={{ width: ITEM_WIDTH, height: ITEM_HEIGHT }}
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
        containerStyle={{ width: ITEM_WIDTH, height: ITEM_HEIGHT }}
      >
        <PIConfetti.Origin
          blastPosition="center"
          count={100}
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
        autoplay
        fadeOutOnEnd
        infinite
        flakeStyle="glossy"
        gravity={4}
        drag={{ vertical: 3, horizontal: 6 }}
        sprayDuration={300}
        initialScale={0.7}
        containerStyle={{ width: ITEM_WIDTH, height: ITEM_HEIGHT }}
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
  return (
    <FlatList
      data={modes}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => <ModeCard item={item} styles={styles} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: PADDING,
    gap: 10,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  cardDescriptionContainer: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  cardTitleContainer: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    flex: 1,
  },
  card: {
    height: ITEM_HEIGHT,
    backgroundColor: colors.secondaryBackground,
    boxShadow:
      'inset 0 0 10px 0 rgba(0, 0, 0, 0.03), 0 0 2px 0 rgba(0, 0, 0, 0.1)',
    borderRadius: 24,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.secondaryLabel,
  },
});
