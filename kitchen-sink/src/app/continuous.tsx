import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import {
  ContinuousConfetti as SkiaContinuousConfetti,
} from 'react-native-fast-confetti';
import {
  ContinuousConfetti as GpuContinuousConfetti,
} from 'react-native-fast-confetti/gpu';
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

export default function ContinuousScreen() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('continuous');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'continuous');
  const confettiKey = `continuous-${config.textureType}-${config.verticalSpacing}`;
  const isGpu = config.engineType === 'webgpu';

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = (Flake: typeof SkiaContinuousConfetti.Flake) => {
    if (config.textureType === 'money') {
      return <Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <Flake size={10} {...textureProps} />;
    }
    return <Flake width={15} height={8} />;
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
        <GpuContinuousConfetti
          ref={confettiRef}
          rotation={rotation}
          verticalSpacing={config.verticalSpacing}
          count={200}
          flipIntensity={config.textureType === 'money' ? 0.1 : 0.85}
        >
          {renderFlakes(GpuContinuousConfetti.Flake)}
        </GpuContinuousConfetti>
      ) : (
        <SkiaContinuousConfetti
          key={confettiKey}
          ref={confettiRef}
          rotation={rotation}
          verticalSpacing={config.verticalSpacing}
          count={200}
          flipIntensity={config.textureType === 'money' ? 0.1 : 0.85}
        >
          {renderFlakes(SkiaContinuousConfetti.Flake)}
        </SkiaContinuousConfetti>
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
