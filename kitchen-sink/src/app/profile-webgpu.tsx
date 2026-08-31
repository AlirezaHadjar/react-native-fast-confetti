import { useRef } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { ConfettiMethods } from 'react-native-fast-confetti';

import { Confetti } from '../../../src/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
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
}: {
  confettiRef: React.RefObject<ConfettiMethods | null>;
}) => (
  <Confetti
    ref={confettiRef}
    autoplay
    count={PARTICLE_COUNTS.single}
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
  const { variant: variantParam } = useLocalSearchParams<{
    variant?: string | string[];
  }>();
  const variant = getProfileVariant(variantParam);
  const confettiRef = useRef<ConfettiMethods>(null);
  const showGlass = variant !== 'pure';
  const renderAboveContent = variant !== 'current';

  const confetti = <ProfileConfetti confettiRef={confettiRef} />;

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
