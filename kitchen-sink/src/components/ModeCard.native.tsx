import { useRef } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  View,
  Platform,
  useColorScheme,
} from 'react-native';
import { Link, useIsFocused } from 'expo-router';
import { BlurView, BlurTargetView } from 'expo-blur';
import type { ModeCardProps } from './ModeCard';

export function ModeCard({ item, styles }: ModeCardProps) {
  const isFocused = useIsFocused();
  const blurTargetRef = useRef(null);
  const colorScheme = useColorScheme();
  const isAndroidDark = Platform.OS === 'android' && colorScheme === 'dark';

  return (
    <Link href={`/${item.key}`} asChild>
      <Link.AppleZoom>
        <Pressable style={styles.card}>
          <BlurTargetView ref={blurTargetRef} style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </BlurTargetView>
          <BlurView
            intensity={isAndroidDark ? 70 : 8}
            blurMethod="dimezisBlurView"
            blurTarget={blurTargetRef}
            tint={
              isAndroidDark ? 'systemChromeMaterialDark' : 'systemThickMaterial'
            }
            style={styles.cardDescriptionContainer}
          >
            <Text style={styles.cardDescription}>{item.description}</Text>
          </BlurView>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {isFocused ? item.render() : null}
          </View>
        </Pressable>
      </Link.AppleZoom>
    </Link>
  );
}
