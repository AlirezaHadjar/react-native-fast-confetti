import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Confetti } from 'react-native-fast-confetti';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getTextureProps, getFlakeSize, getRotation } from '../utils/confettiConfig';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import {
  textureOptions,
  radiusOptions,
  verticalSpacingOptions,
} from '../constants/config';

export default function SingleScreen() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { config, updateConfig } = useScreenConfig('single');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  if (isLoading) return null;

  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!,
    config.radiusRange
  );
  const flakeSize = getFlakeSize(config.textureType);
  const rotation = getRotation(config.textureType, 'single');
  const confettiKey = `single-${config.textureType}-${config.radiusRange}-${config.verticalSpacing}`;

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <ConfigDropdown
          label="Texture:"
          data={textureOptions}
          value={config.textureType}
          onChange={(v) => updateConfig({ textureType: v })}
        />
        {config.textureType === 'default' && (
          <ConfigDropdown
            label="Corner Radius:"
            data={radiusOptions}
            value={config.radiusRange}
            onChange={(v) => updateConfig({ radiusRange: v })}
          />
        )}
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
        flakeSize={flakeSize}
        {...textureProps}
        rotation={rotation}
        verticalSpacing={config.verticalSpacing}
        autoplay
        isInfinite
      />

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
