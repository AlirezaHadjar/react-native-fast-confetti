import { Text, Pressable, StyleSheet, View } from 'react-native';
import { Link, useIsFocused } from 'expo-router';
import type { ModeCardProps } from './ModeCard';

export function ModeCard({ item, styles }: ModeCardProps) {
  const isFocused = useIsFocused();

  return (
    <Link href={`/${item.key}`} asChild>
      <Pressable
        accessibilityLabel={item.title}
        accessibilityRole="button"
        testID={`mode-card-${item.key}`}
        style={styles.card}
      >
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          {isFocused ? item.render() : null}
        </View>
        <View style={styles.cardTitleContainer}>
          <Text style={styles.cardTitle}>{item.title}</Text>
        </View>
        <View
          style={[
            styles.cardDescriptionContainer,
            { backgroundColor: 'rgba(255,255,255,0.85)' },
          ]}
        >
          <Text style={styles.cardDescription}>{item.description}</Text>
        </View>
      </Pressable>
    </Link>
  );
}
