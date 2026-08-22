import { useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { Confetti as SkiaConfetti } from '../../../src';
import { Confetti as WebGPUConfetti } from '../../../src/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import {
  rendererOptions,
  textureOptions,
  verticalSpacingOptions,
} from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

export default function SingleScreen() {
  const isFocused = useIsFocused();
  const confettiRef = useRef<ConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('single');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const Confetti = config.renderer === 'webgpu' ? WebGPUConfetti : SkiaConfetti;
  const rotation = getRotation(config.textureType, 'single');
  const confettiKey = `single-${config.renderer}-${config.textureType}-${config.verticalSpacing}`;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <Confetti.Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <Confetti.Flake size={10} {...textureProps} />;
    }
    return (
      <>
        <Confetti.Flake size={12} radius={6} />
        <Confetti.Flake width={8} height={14} />
        <Confetti.Flake width={8} height={14} radius={6.5} />
        <Confetti.Flake width={8} height={14} radius={4} />
      </>
    );
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
        <ConfigDropdown
          label="Vertical Spacing:"
          data={verticalSpacingOptions}
          value={config.verticalSpacing}
          onChange={(v) => updateConfig({ verticalSpacing: v })}
        />
      </View>

      {isFocused ? (
        <Confetti
          key={confettiKey}
          ref={confettiRef}
          rotation={rotation}
          verticalSpacing={config.verticalSpacing}
          autoplay
          count={Platform.OS === 'web' ? 2000 : 400}
          infinite
          flakeStyle="glossy"
          gravity={1}
          flipIntensity={config.textureType === 'money' ? 0.1 : 0.85}
        >
          {renderFlakes()}
        </Confetti>
      ) : null}

      <ConfettiControls
        actions={{
          resume: () => confettiRef.current?.resume(),
          pause: () => confettiRef.current?.pause(),
          restart: () => confettiRef.current?.restart(),
          reset: () => confettiRef.current?.reset(),
        }}
      />
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
