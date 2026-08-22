import { useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { CannonConfettiMethods } from 'react-native-fast-confetti';
import { CannonConfetti as SkiaCannonConfetti } from '../../../src';
import { CannonConfetti as WebGPUCannonConfetti } from '../../../src/gpu';
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

export default function CannonScreen() {
  const isFocused = useIsFocused();
  const cannonConfettiRef = useRef<CannonConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('cannon');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const CannonConfetti =
    config.renderer === 'webgpu' ? WebGPUCannonConfetti : SkiaCannonConfetti;
  const rotation = getRotation(config.textureType, 'cannon');
  const confettiKey = `cannon-${config.renderer}-${config.textureType}`;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <CannonConfetti.Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <CannonConfetti.Flake size={10} {...textureProps} />;
    }
    return (
      <>
        <CannonConfetti.Flake size={12} radius={6} />
        <CannonConfetti.Flake width={8} height={14} />
        <CannonConfetti.Flake width={8} height={14} radius={6.5} />
        <CannonConfetti.Flake width={8} height={14} radius={4} />
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
          resume: () => cannonConfettiRef.current?.resume(),
          pause: () => cannonConfettiRef.current?.pause(),
          restart: () => cannonConfettiRef.current?.restart(),
          reset: () => cannonConfettiRef.current?.reset(),
        }}
      />

      {isFocused ? (
        <CannonConfetti
          key={confettiKey}
          ref={cannonConfettiRef}
          fadeOutOnEnd
          autoplay
          infinite
          rotation={rotation}
          gravity={3}
          sprayDuration={300}
          initialScale={0.7}
          flakeStyle="glossy"
        >
          <CannonConfetti.Origin
            position="bottom-left"
            count={PERFORMANCE_PARTICLE_COUNT}
            initialSpeed={3}
            depth={{ min: 1, max: 1.1 }}
          >
            {renderFlakes()}
          </CannonConfetti.Origin>
          <CannonConfetti.Origin
            position="bottom-right"
            count={PERFORMANCE_PARTICLE_COUNT}
            initialSpeed={3}
            depth={{ min: 1, max: 1.1 }}
          >
            {renderFlakes()}
          </CannonConfetti.Origin>
          <CannonConfetti.Origin
            position="bottom-center"
            count={PERFORMANCE_PARTICLE_COUNT}
            initialSpeed={4}
            target={'center'}
          >
            {renderFlakes()}
          </CannonConfetti.Origin>
        </CannonConfetti>
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
