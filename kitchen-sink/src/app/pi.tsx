import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { PIConfettiMethods } from 'react-native-fast-confetti';
import { PIConfetti as SkiaPIConfetti } from 'react-native-fast-confetti';
import { PIConfetti as GpuPIConfetti } from 'react-native-fast-confetti/gpu';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import { engineOptions, textureOptions } from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

export default function PIScreen() {
  const piConfettiRef = useRef<PIConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('pi');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();
  const { width } = useWindowDimensions();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'pi');
  const confettiKey = `pi-${config.textureType}`;
  const isGpu = config.engineType === 'webgpu';

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = (Flake: typeof SkiaPIConfetti.Flake) => {
    if (config.textureType === 'money') {
      return <Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <Flake size={10} {...textureProps} />;
    }
    return (
      <>
        <Flake width={8} height={16} />
        <Flake size={10} radius={2} />
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
        <GpuPIConfetti ref={piConfettiRef} rotation={rotation}>
          <GpuPIConfetti.Origin
            blastPosition={{ x: width / 2, y: 450 }}
            count={500}
          >
            {renderFlakes(GpuPIConfetti.Flake)}
          </GpuPIConfetti.Origin>
          <GpuPIConfetti.Origin
            blastPosition={{ x: width / 2, y: 150 }}
            count={500}
            delay={300}
          >
            {renderFlakes(GpuPIConfetti.Flake)}
          </GpuPIConfetti.Origin>
        </GpuPIConfetti>
      ) : (
        <SkiaPIConfetti
          key={confettiKey}
          ref={piConfettiRef}
          rotation={rotation}
        >
          <SkiaPIConfetti.Origin
            blastPosition={{ x: width / 2, y: 450 }}
            count={500}
          >
            {renderFlakes(SkiaPIConfetti.Flake)}
          </SkiaPIConfetti.Origin>
          <SkiaPIConfetti.Origin
            blastPosition={{ x: width / 2, y: 150 }}
            count={500}
            delay={300}
          >
            {renderFlakes(SkiaPIConfetti.Flake)}
          </SkiaPIConfetti.Origin>
        </SkiaPIConfetti>
      )}

      <ConfettiControls
        actions={{
          resume: () => piConfettiRef.current?.resume(),
          pause: () => piConfettiRef.current?.pause(),
          restart: () => piConfettiRef.current?.restart(),
          reset: () => piConfettiRef.current?.reset(),
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
