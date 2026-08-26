import { useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { CannonConfettiMethods } from 'react-native-fast-confetti';
import { CannonConfetti, ConfettiPresets } from 'react-native-fast-confetti';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import { TEXTURE_SIZES, textureOptions } from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getTextureProps } from '../utils/confettiConfig';

const twinBloomColors = ['#F6D61B', '#EE6A10', '#6F1EE8', '#B21FBA', '#DC1F5D'];

export default function TwinBloomScreen() {
  const cannonConfettiRef = useRef<CannonConfettiMethods>(null);
  const { width } = useWindowDimensions();
  const { config, updateConfig } = useScreenConfig('cannon');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  const confettiKey = `twin-bloom-${config.textureType}`;
  const twinBloomParticleSystem = useMemo(() => {
    if (config.textureType === 'default') {
      return ConfettiPresets.TwinBloom;
    }

    const size = TEXTURE_SIZES[config.textureType] / width;
    return {
      ...ConfettiPresets.TwinBloom,
      particles: ConfettiPresets.TwinBloom.particles.map((particle) => ({
        ...particle,
        size,
      })),
    };
  }, [config.textureType, width]);

  if (isLoading) return null;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return (
        <CannonConfetti.Flake size={TEXTURE_SIZES.money} {...textureProps} />
      );
    }
    if (config.textureType === 'snowflake') {
      return (
        <CannonConfetti.Flake
          size={TEXTURE_SIZES.snowflake}
          {...textureProps}
        />
      );
    }
    return (
      <>
        <CannonConfetti.Flake size={32} radius={16} />
        <CannonConfetti.Flake width={44} height={16} radius={8} />
        <CannonConfetti.Flake size={28} radius={14} />
        <CannonConfetti.Flake width={36} height={16} radius={8} />
        <CannonConfetti.Flake size={36} shape="heart" />
        <CannonConfetti.Flake size={36} shape="star" />
        <CannonConfetti.Flake size={36} shape="flower" />
        <CannonConfetti.Flake width={56} height={40} shape="streamer" />
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <ConfigDropdown
          label="Texture:"
          data={textureOptions}
          value={config.textureType}
          onChange={(v) => updateConfig({ textureType: v })}
        />
      </View>

      <CannonConfetti
        key={confettiKey}
        ref={cannonConfettiRef}
        autoplay
        colors={twinBloomColors}
        particleSystem={twinBloomParticleSystem}
        reduceMotion="never"
        flakeStyle="solid"
      >
        <CannonConfetti.Origin position="center-left" count={20}>
          {renderFlakes()}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin position="center-right" count={16}>
          {renderFlakes()}
        </CannonConfetti.Origin>
      </CannonConfetti>

      <ConfettiControls
        actions={{
          resume: () => cannonConfettiRef.current?.resume(),
          pause: () => cannonConfettiRef.current?.pause(),
          restart: () => cannonConfettiRef.current?.restart(),
          reset: () => cannonConfettiRef.current?.reset(),
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
