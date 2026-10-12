import { useRef } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { ConfettiMethods } from 'react-native-fast-confetti';

import { Confetti } from '../../../src/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import { useScreenEffectVisible } from '../hooks/useScreenEffectVisible';
import {
  PARTICLE_COUNTS,
  rendererOptions,
  textureOptions,
  verticalSpacingOptions,
} from '../constants/config';

type ProfileVariant = 'current' | 'pure' | 'above-content';

const isProfileVariant = (value: string): value is ProfileVariant =>
  value === 'current' || value === 'pure' || value === 'above-content';

const getProfileVariant = (
  value: string | string[] | undefined
): ProfileVariant => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isProfileVariant(candidate) ? candidate : 'current';
};

const STATIC_ACTIONS = {
  resume: () => {},
  pause: () => {},
  restart: () => {},
  reset: () => {},
};

const ProfileGlassUI = () => (
  <>
    <View style={styles.controls}>
      <ConfigDropdown
        label="Renderer:"
        data={rendererOptions}
        value="webgpu"
        onChange={STATIC_ACTIONS.reset}
      />
      <ConfigDropdown
        label="Texture:"
        data={textureOptions}
        value="default"
        onChange={STATIC_ACTIONS.reset}
      />
      <ConfigDropdown
        label="Vertical Spacing:"
        data={verticalSpacingOptions}
        value={20}
        onChange={STATIC_ACTIONS.reset}
      />
    </View>
    <ConfettiControls actions={STATIC_ACTIONS} />
  </>
);

const ProfileConfetti = ({
  confettiRef,
  count,
  androidTransparencyMode,
}: {
  confettiRef: React.RefObject<ConfettiMethods | null>;
  count: number;
  androidTransparencyMode: 'texture' | 'surface-overlay';
}) => (
  <Confetti
    ref={confettiRef}
    autoplay
    count={count}
    androidTransparencyMode={androidTransparencyMode}
    infinite
    flakeStyle="glossy"
    gravity={1}
    flipIntensity={0.85}
    verticalSpacing={20}
  >
    <Confetti.Flake size={12} radius={6} />
    <Confetti.Flake width={8} height={14} />
    <Confetti.Flake width={8} height={14} radius={6.5} />
    <Confetti.Flake width={8} height={14} radius={4} />
  </Confetti>
);

export default function WebGPUProfileScreen() {
  const {
    variant: variantParam,
    count: countParam,
    surface,
  } = useLocalSearchParams<{
    variant?: string | string[];
    count?: string;
    surface?: string;
  }>();
  const variant = getProfileVariant(variantParam);
  const confettiRef = useRef<ConfettiMethods>(null);
  const effectVisible = useScreenEffectVisible();
  const showGlass = variant !== 'pure';
  const renderAboveContent = variant !== 'current';

  const parsedCount = Number(countParam);
  const count =
    Number.isFinite(parsedCount) && parsedCount > 0
      ? Math.min(100_000, Math.round(parsedCount))
      : PARTICLE_COUNTS.single;
  const confetti = effectVisible ? (
    <ProfileConfetti
      confettiRef={confettiRef}
      count={count}
      androidTransparencyMode={
        surface === 'surface-overlay' ? 'surface-overlay' : 'texture'
      }
    />
  ) : null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: `WebGPU: ${variant}`,
        }}
      />
      {renderAboveContent ? null : confetti}
      {showGlass ? <ProfileGlassUI /> : null}
      {renderAboveContent ? confetti : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  controls: {
    width: '100%',
    maxWidth: 600,
    marginBottom: 30,
    gap: 15,
    paddingHorizontal: 20,
  },
});
