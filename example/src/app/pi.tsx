import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PIConfetti } from 'react-native-fast-confetti';
import type { PIConfettiMethods } from 'react-native-fast-confetti';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getTextureProps, getFlakeSize, getRotation } from '../utils/confettiConfig';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { textureOptions } from '../constants/config';

export default function PIScreen() {
  const piConfettiRef = useRef<PIConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('pi');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!,
    config.radiusRange
  );
  const flakeSize = getFlakeSize(config.textureType);
  const rotation = getRotation(config.textureType, 'pi');
  const confettiKey = `pi-${config.textureType}`;

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

      <PIConfetti
        key={confettiKey}
        ref={piConfettiRef}
        fallDuration={2000}
        blastDuration={250}
        count={500}
        flakeSize={flakeSize}
        {...textureProps}
        rotation={rotation}
      />

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
    backgroundColor: 'white',
    justifyContent: 'center',
  },
  controls: {
    width: '100%',
    marginBottom: 30,
    gap: 15,
    paddingHorizontal: 20,
  },
});
