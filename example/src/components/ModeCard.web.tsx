import { Text, Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import type { ModeCardProps } from './ModeCard';

export function ModeCard({ item, styles }: ModeCardProps) {
  return (
    <Link href={`/${item.key}`} asChild>
      <Pressable style={styles.card}>
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          {item.render()}
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
