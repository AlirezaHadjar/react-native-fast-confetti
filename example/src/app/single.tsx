import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '../constants/colors';
import { Confetti } from 'react-native-fast-confetti';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getNewTextureProps, getRotation } from '../utils/confettiConfig';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { textureOptions, verticalSpacingOptions } from '../constants/config';

export default function SingleScreen() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('single');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'single');
  const confettiKey = `single-${config.textureType}-${config.verticalSpacing}`;

  const textureProps = getNewTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (config.textureType === 'money') {
      return <Confetti.Flake size={50} />;
    }
    if (config.textureType === 'snowflake') {
      return <Confetti.Flake size={10} />;
    }
    return (
      <>
        <Confetti.Flake size={12} radius={6} />
        <Confetti.Flake width={8} height={14} />
        <Confetti.Flake width={8} height={14} radius={6.5} />
        <Confetti.Flake width={8} height={14} radius={4} />
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
        <ConfigDropdown
          label="Vertical Spacing:"
          data={verticalSpacingOptions}
          value={config.verticalSpacing}
          onChange={(v) => updateConfig({ verticalSpacing: v })}
        />
      </View>

      <Confetti
        key={confettiKey}
        ref={confettiRef}
        rotation={rotation}
        verticalSpacing={config.verticalSpacing}
        autoplay
        count={Platform.OS === 'web' ? 2000 : 400}
        infinite
        flakeStyle="glossy"
        gravity={1}
        tumbleClamp={config.textureType === 'money' ? 0.9 : 0.15}
        {...textureProps}
      >
        {renderFlakes()}
      </Confetti>

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
