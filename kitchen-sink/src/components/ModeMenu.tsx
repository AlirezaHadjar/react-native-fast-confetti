import { Dimensions, FlatList, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { ModeCard } from './ModeCard';
import type { ModeCardProps } from './ModeCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PADDING = 16;

export const MODE_CARD_HEIGHT = 140;
export const MODE_CARD_WIDTH = SCREEN_WIDTH - PADDING * 2;

type ModeMenuProps = {
  items: readonly ModeCardProps['item'][];
};

export function ModeMenu({ items }: ModeMenuProps) {
  return (
    <FlatList
      data={items}
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
    height: MODE_CARD_HEIGHT,
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
