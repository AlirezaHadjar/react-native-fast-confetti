import { useRef } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  View,
  Platform,
  useColorScheme,
} from 'react-native';
import { Link } from 'expo-router';
import { BlurView, BlurTargetView } from 'expo-blur';
import type { ModeCardProps } from './ModeCard';

export function ModeCard({ item, styles }: ModeCardProps) {
  const blurTargetRef = useRef(null);
  const colorScheme = useColorScheme();
  const isAndroidDark = Platform.OS === 'android' && colorScheme === 'dark';

  return (
    <Link href={`/${item.key}`} asChild>
      <Link.AppleZoom>
        <Pressable style={styles.card}>
          <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  zIndex: -1,
                },
              ]}
            >
              {item.render()}
            </View>
          </BlurTargetView>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
          <BlurView
            intensity={isAndroidDark ? 70 : 8}
            blurMethod="dimezisBlurView"
            blurTarget={blurTargetRef}
            tint={
              isAndroidDark
                ? 'systemChromeMaterialDark'
                : 'systemThickMaterial'
            }
            style={styles.cardDescriptionContainer}
          >
            <Text style={styles.cardDescription}>{item.description}</Text>
          </BlurView>
        </Pressable>
      </Link.AppleZoom>
    </Link>
  );
}
