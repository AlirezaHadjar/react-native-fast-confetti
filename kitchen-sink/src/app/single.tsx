import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { Confetti as SkiaConfetti } from 'react-native-fast-confetti';
import { Confetti as GpuConfetti } from 'react-native-fast-confetti/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import {
  engineOptions,
  textureOptions,
  verticalSpacingOptions,
} from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

export default function SingleScreen() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('single');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'single');
  const confettiKey = `single-${config.textureType}-${config.verticalSpacing}`;
  const isGpu = config.engineType === 'webgpu';

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = (Flake: typeof SkiaConfetti.Flake) => {
    if (config.textureType === 'money') {
      return <Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <Flake size={10} {...textureProps} />;
    }
    return (
      <>
        <Flake size={12} radius={6} />
        <Flake width={8} height={14} />
        <Flake width={8} height={14} radius={6.5} />
        <Flake width={8} height={14} radius={4} />
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <ConfigDropdown
          label="Engine:"
          data={engineOptions}
          value={config.engineType}
          onChange={(v) => updateConfig({ engineType: v })}
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

      {isGpu ? (
        <GpuConfetti
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
          {renderFlakes(GpuConfetti.Flake)}
        </GpuConfetti>
      ) : (
        <SkiaConfetti
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
          {renderFlakes(SkiaConfetti.Flake)}
        </SkiaConfetti>
      )}

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
