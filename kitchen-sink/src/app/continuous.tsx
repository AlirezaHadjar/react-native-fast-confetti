import { useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { ContinuousConfetti as SkiaContinuousConfetti } from '../../../src';
import { ContinuousConfetti as WebGPUContinuousConfetti } from '../../../src/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import {
  PERFORMANCE_PARTICLE_COUNT,
  rendererOptions,
  textureOptions,
} from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

export default function ContinuousScreen() {
  const isFocused = useIsFocused();
  const confettiRef = useRef<ConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('continuous');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const ContinuousConfetti =
    config.renderer === 'webgpu'
      ? WebGPUContinuousConfetti
      : SkiaContinuousConfetti;
  const rotation = getRotation(config.textureType, 'continuous');
  const confettiKey = `continuous-${config.renderer}-${config.textureType}`;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <ContinuousConfetti.Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <ContinuousConfetti.Flake size={10} {...textureProps} />;
    }
    return <ContinuousConfetti.Flake width={15} height={8} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <ConfigDropdown
          label="Renderer:"
          data={rendererOptions}
          value={config.renderer}
          onChange={(renderer) => updateConfig({ renderer })}
        />
        <ConfigDropdown
          label="Texture:"
          data={textureOptions}
          value={config.textureType}
          onChange={(v) => updateConfig({ textureType: v })}
        />
      </View>

      <ConfettiControls
        actions={{
          resume: () => confettiRef.current?.resume(),
          pause: () => confettiRef.current?.pause(),
          restart: () => confettiRef.current?.restart(),
          reset: () => confettiRef.current?.reset(),
        }}
      />

      {isFocused ? (
        <ContinuousConfetti
          key={confettiKey}
          ref={confettiRef}
          autoplay
          rotation={rotation}
          count={PERFORMANCE_PARTICLE_COUNT}
          flipIntensity={config.textureType === 'money' ? 0.1 : 0.85}
        >
          {renderFlakes()}
        </ContinuousConfetti>
      ) : null}
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
