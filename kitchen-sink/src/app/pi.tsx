import { useScreenEffectVisible } from '../hooks/useScreenEffectVisible';
import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { PIConfettiMethods } from 'react-native-fast-confetti';
import { PIConfetti as SkiaPIConfetti } from '../../../src';
import { PIConfetti as WebGPUPIConfetti } from '../../../src/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import {
  PARTICLE_COUNTS,
  rendererOptions,
  TEXTURE_SIZES,
  textureOptions,
} from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

export default function PIScreen() {
  const isFocused = useScreenEffectVisible();
  const piConfettiRef = useRef<PIConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('pi');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets(
    config.textureType
  );
  const { width } = useWindowDimensions();

  if (isLoading) return null;

  const PIConfetti =
    config.renderer === 'webgpu' ? WebGPUPIConfetti : SkiaPIConfetti;
  const rotation = getRotation(config.textureType, 'pi');
  const confettiKey = `pi-${config.renderer}-${config.textureType}`;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <PIConfetti.Flake size={TEXTURE_SIZES.money} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return (
        <PIConfetti.Flake size={TEXTURE_SIZES.snowflake} {...textureProps} />
      );
    }
    return (
      <>
        <PIConfetti.Flake width={8} height={16} />
        <PIConfetti.Flake size={10} radius={2} />
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
      </View>

      <ConfettiControls
        actions={{
          resume: () => piConfettiRef.current?.resume(),
          pause: () => piConfettiRef.current?.pause(),
          restart: () => piConfettiRef.current?.restart(),
          reset: () => piConfettiRef.current?.reset(),
        }}
      />

      {isFocused ? (
        <PIConfetti key={confettiKey} ref={piConfettiRef} rotation={rotation}>
          <PIConfetti.Origin
            blastPosition={{ x: width / 2, y: 450 }}
            count={PARTICLE_COUNTS.piOrigin}
          >
            {renderFlakes()}
          </PIConfetti.Origin>
          <PIConfetti.Origin
            blastPosition={{ x: width / 2, y: 150 }}
            count={PARTICLE_COUNTS.piOrigin}
            delay={300}
          >
            {renderFlakes()}
          </PIConfetti.Origin>
        </PIConfetti>
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
