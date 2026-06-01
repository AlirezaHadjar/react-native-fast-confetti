import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ConfettiControls } from '../components/ConfettiControls';
import { ConfigDropdown } from '../components/ConfigDropdown';
import { colors } from '../constants/colors';
import { textureOptions, verticalSpacingOptions } from '../constants/config';
import { useConfettiAssets } from '../hooks/useConfettiAssets';
import { useScreenConfig } from '../hooks/useScreenConfig';
import { getRotation, getTextureProps } from '../utils/confettiConfig';

type GPUConfettiMethods = {
  pause: () => void;
  reset: () => void;
  resume: () => void;
  restart: () => void;
};

type GPUConfettiComponent = ComponentType<any> & {
  Flake: ComponentType<any>;
};

export default function GPUScreen() {
  const confettiRef = useRef<GPUConfettiMethods>(null);
  const [GPUConfetti, setGPUConfetti] =
    useState<GPUConfettiComponent | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { config, updateConfig } = useScreenConfig('single');
  const { snowFlakeSVG, moneyStackImage, isLoading } = useConfettiAssets();

  const confettiKey = useMemo(
    () => `gpu-${config.textureType}-${config.verticalSpacing}`,
    [config.textureType, config.verticalSpacing]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' && !NativeModules.WebGPUModule) {
      setLoadError(true);
      return;
    }

    let mounted = true;
    void import('react-native-fast-confetti/webgpu')
      .then((webgpu) => {
        if (!mounted) return;
        setGPUConfetti(() => webgpu.GPUConfetti as GPUConfettiComponent);
      })
      .catch(() => {
        if (mounted) setLoadError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) return null;

  const rotation = getRotation(config.textureType, 'single');
  const textureProps = getTextureProps(
    config.textureType,
    moneyStackImage!,
    snowFlakeSVG!
  );

  const renderFlakes = () => {
    if (!GPUConfetti) return null;
    if (config.textureType === 'money') {
      return <GPUConfetti.Flake size={50} {...textureProps} />;
    }
    if (config.textureType === 'snowflake') {
      return <GPUConfetti.Flake size={10} {...textureProps} />;
    }
    return (
      <>
        <GPUConfetti.Flake size={12} radius={6} />
        <GPUConfetti.Flake width={8} height={14} />
        <GPUConfetti.Flake width={8} height={14} radius={6.5} />
        <GPUConfetti.Flake width={8} height={14} radius={4} />
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

      {GPUConfetti ? (
        <GPUConfetti
          key={confettiKey}
          ref={confettiRef}
          rotation={rotation}
          verticalSpacing={config.verticalSpacing}
          autoplay
          infinite
          count={Platform.OS === 'web' ? 2000 : 400}
          flakeStyle="glossy"
          gravity={1}
          drift={0.7}
          flipIntensity={config.textureType === 'money' ? 0.1 : 0.85}
          windStrength={0}
          magnusStrength={0}
          motionBlurAmount={0}
          iridescence={0}
          textureMode={0}
        >
          {renderFlakes()}
        </GPUConfetti>
      ) : (
        <View style={styles.messageContainer}>
          <Text style={styles.messageTitle}>
            {loadError ? 'WebGPU native module unavailable' : 'Loading WebGPU'}
          </Text>
          {loadError ? (
            <Text style={styles.messageBody}>
              Rebuild the kitchen-sink dev client after installing
              react-native-wgpu, then reopen this screen.
            </Text>
          ) : null}
        </View>
      )}

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
  messageContainer: {
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 8,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.label,
    textAlign: 'center',
  },
  messageBody: {
    fontSize: 14,
    color: colors.secondaryLabel,
    textAlign: 'center',
    lineHeight: 20,
  },
});
