import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { PIConfetti } from 'react-native-fast-confetti';
import type { PIConfettiMethods } from 'react-native-fast-confetti';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation } from '../utils/confettiConfig';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { textureOptions } from '../constants/config';

export default function PIScreen() {
  const piConfettiRef = useRef<PIConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('pi');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();
  const { width } = useWindowDimensions();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'pi');
  const confettiKey = `pi-${config.textureType}`;

  const piTextureProps =
    config.textureType === 'money'
      ? { image: moneyStackImage! }
      : config.textureType === 'snowflake'
        ? { svg: snowFlakeSVG! }
        : {};

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <PIConfetti.Flake size={50} />;
    }
    if (config.textureType === 'snowflake') {
      return <PIConfetti.Flake size={10} />;
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
          label="Texture:"
          data={textureOptions}
          value={config.textureType}
          onChange={(v) => updateConfig({ textureType: v })}
        />
      </View>

      <PIConfetti
        key={confettiKey}
        ref={piConfettiRef}
        count={500}
        blastPosition={{ x: width / 2, y: 450 }}
        rotation={rotation}
        {...piTextureProps}
      >
        {renderFlakes()}
      </PIConfetti>

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
