import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CannonConfettiMethods } from 'react-native-fast-confetti';
import {
  CannonConfetti as SkiaCannonConfetti,
} from 'react-native-fast-confetti';
import {
  CannonConfetti as GpuCannonConfetti,
} from 'react-native-fast-confetti/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import { engineOptions, textureOptions } from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

export default function CannonScreen() {
  const cannonConfettiRef = useRef<CannonConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('cannon');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'cannon');
  const confettiKey = `cannon-${config.textureType}`;
  const isGpu = config.engineType === 'webgpu';

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = (Flake: typeof SkiaCannonConfetti.Flake) => {
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
      </View>

      {isGpu ? (
        <GpuCannonConfetti
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
          <GpuCannonConfetti.Origin
            position="bottom-left"
            count={150}
            initialSpeed={3}
            depth={{ min: 1, max: 1.1 }}
          >
            {renderFlakes(GpuCannonConfetti.Flake)}
          </GpuCannonConfetti.Origin>
          <GpuCannonConfetti.Origin
            position="bottom-right"
            count={150}
            initialSpeed={3}
            depth={{ min: 1, max: 1.1 }}
          >
            {renderFlakes(GpuCannonConfetti.Flake)}
          </GpuCannonConfetti.Origin>
          <GpuCannonConfetti.Origin
            position="bottom-center"
            count={150}
            initialSpeed={4}
            target={'center'}
          >
            {renderFlakes(GpuCannonConfetti.Flake)}
          </GpuCannonConfetti.Origin>
        </GpuCannonConfetti>
      ) : (
        <SkiaCannonConfetti
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
          <SkiaCannonConfetti.Origin
            position="bottom-left"
            count={150}
            initialSpeed={3}
            depth={{ min: 1, max: 1.1 }}
          >
            {renderFlakes(SkiaCannonConfetti.Flake)}
          </SkiaCannonConfetti.Origin>
          <SkiaCannonConfetti.Origin
            position="bottom-right"
            count={150}
            initialSpeed={3}
            depth={{ min: 1, max: 1.1 }}
          >
            {renderFlakes(SkiaCannonConfetti.Flake)}
          </SkiaCannonConfetti.Origin>
          <SkiaCannonConfetti.Origin
            position="bottom-center"
            count={150}
            initialSpeed={4}
            target={'center'}
          >
            {renderFlakes(SkiaCannonConfetti.Flake)}
          </SkiaCannonConfetti.Origin>
        </SkiaCannonConfetti>
      )}

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
