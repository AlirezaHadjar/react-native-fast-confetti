import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/colors';
import { CannonConfetti } from 'react-native-fast-confetti';
import type { CannonConfettiMethods } from 'react-native-fast-confetti';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation } from '../utils/confettiConfig';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { textureOptions } from '../constants/config';

export default function CannonScreen() {
  const cannonConfettiRef = useRef<CannonConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('cannon');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'cannon');
  const confettiKey = `cannon-${config.textureType}`;

  const cannonTextureProps =
    config.textureType === 'money'
      ? { image: moneyStackImage! }
      : config.textureType === 'snowflake'
        ? { svg: snowFlakeSVG! }
        : {};

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <CannonConfetti.Flake size={50} />;
    }
    if (config.textureType === 'snowflake') {
      return <CannonConfetti.Flake size={10} />;
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
          label="Texture:"
          data={textureOptions}
          value={config.textureType}
          onChange={(v) => updateConfig({ textureType: v })}
        />
      </View>

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
        {...cannonTextureProps}
      >
        <CannonConfetti.Origin
          position="bottom-left"
          count={150}
          speed={3}
          depth={{ min: 1, max: 1.1 }}
        >
          {renderFlakes()}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-right"
          count={150}
          speed={3}
          depth={{ min: 1, max: 1.1 }}
        >
          {renderFlakes()}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-center"
          count={150}
          speed={4}
          target={'center'}
        >
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
    marginBottom: 30,
    gap: 15,
    paddingHorizontal: 20,
  },
});
