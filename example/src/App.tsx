import { useImage, useSVG } from '@shopify/react-native-skia';
import { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Button,
  useWindowDimensions,
  Text,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import {
  Confetti,
  ContinuousConfetti,
  PIConfetti,
} from 'react-native-fast-confetti';
import type {
  ConfettiMethods,
  ConfettiProps,
} from 'react-native-fast-confetti';

type DropdownOption<T = any> = {
  label: string;
  value: T;
};

const verticalSpacingOptions: DropdownOption<number>[] = [
  { label: 'Dense (5)', value: 5 },
  { label: 'Normal (20)', value: 20 },
  { label: 'Loose (50)', value: 50 },
  { label: 'Very Loose (100)', value: 100 },
];

const radiusOptions: DropdownOption<'square' | 'circle'>[] = [
  { label: 'No Radius (0)', value: 'square' },
  { label: 'Circle', value: 'circle' },
];

const textureOptions: DropdownOption<string>[] = [
  { label: 'Default Confetti', value: 'default' },
  { label: 'Money Stack 💰', value: 'money' },
  { label: 'Snowflake ❄️', value: 'snowflake' },
];

const modeOptions: DropdownOption<'continuous' | 'single' | 'pi' | 'canon'>[] =
  [
    { label: 'Continuous', value: 'continuous' },
    { label: 'Single', value: 'single' },
    { label: 'PI', value: 'pi' },
    { label: 'Canon', value: 'canon' },
  ];

export default function App() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { height, width } = useWindowDimensions();
  const [verticalSpacing, setVerticalSpacing] = useState(20);
  const [radiusRange, setRadiusRange] = useState<'square' | 'circle'>('square');
  const [mode, setMode] = useState<'continuous' | 'single' | 'pi' | 'canon'>(
    'single'
  );
  const [textureType, setTextureType] = useState('default');

  const snowFlakeSVG = useSVG(require('../assets/snow-flake.svg'));
  const moneyStackImage = useImage(require('../assets/money-stack-2.png'));

  const cannonPositions: ConfettiProps['cannonsPositions'] = [
    { x: -30, y: height },
    { x: width + 30, y: height },
  ];

  if (!snowFlakeSVG || !moneyStackImage) return null;

  const effectiveVerticalSpacing =
    mode === 'canon' ? 5 : mode === 'continuous' ? 200 : verticalSpacing;

  const confettiKey = `${mode}-${effectiveVerticalSpacing}-${radiusRange}-${textureType}`;

  const getTextureProps = (): ConfettiProps => {
    switch (textureType) {
      case 'money':
        return {
          type: 'image' as const,
          flakeImage: moneyStackImage,
        };
      case 'snowflake':
        return {
          type: 'svg' as const,
          flakeSvg: snowFlakeSVG,
        };
      default: {
        const range: [number, number] =
          radiusRange === 'square' ? [0, 0] : [0, 15];
        return {
          type: 'default' as const,
          radiusRange: range,
        };
      }
    }
  };

  const getFlakeSize = () => {
    switch (textureType) {
      case 'money':
        return { width: 50, height: 50 };
      case 'snowflake':
        return { width: 10, height: 10 };
      default:
        return { width: 15, height: 8 };
    }
  };

  const getRotation = () => {
    if (mode === 'pi') {
      switch (textureType) {
        case 'money':
          return {
            x: { min: 1 * Math.PI, max: 1.5 * Math.PI },
            z: { min: 1 * Math.PI, max: 3 * Math.PI },
          };
        case 'snowflake':
          return {
            x: { min: 0.5 * Math.PI, max: 2 * Math.PI },
            z: { min: 1 * Math.PI, max: 3 * Math.PI },
          };
        default:
          return {
            x: { min: 0.5 * Math.PI, max: 2 * Math.PI },
            z: { min: 1 * Math.PI, max: 5 * Math.PI },
          };
      }
    }
    switch (textureType) {
      case 'money':
        return {
          x: { min: 1 * Math.PI, max: 2 * Math.PI },
          z: { min: 1 * Math.PI, max: 2 * Math.PI },
        };
      case 'snowflake':
        return {
          x: { min: 0.5 * Math.PI, max: 20 * Math.PI },
          z: { min: 1 * Math.PI, max: 20 * Math.PI },
        };
      default:
        return {
          x: { min: 2 * Math.PI, max: 20 * Math.PI },
          z: { min: 2 * Math.PI, max: 20 * Math.PI },
        };
    }
  };

  const rotation = getRotation();
  const flakeSize = getFlakeSize();
  const textureProps = getTextureProps();

  return (
    <View style={styles.container}>
      <View style={styles.controlsContainer}>
        <View style={styles.dropdownContainer}>
          <Text style={styles.dropdownLabel}>Mode:</Text>
          <Dropdown
            style={styles.dropdown}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            data={modeOptions}
            labelField="label"
            valueField="value"
            placeholder="Select Mode"
            value={mode}
            onChange={(
              item: DropdownOption<'continuous' | 'single' | 'pi' | 'canon'>
            ) => {
              setMode(item.value);
            }}
          />
        </View>
        {mode !== 'pi' && mode !== 'canon' && mode !== 'continuous' && (
          <View style={styles.dropdownContainer}>
            <Text style={styles.dropdownLabel}>Vertical Spacing:</Text>
            <Dropdown
              style={styles.dropdown}
              placeholderStyle={styles.placeholderStyle}
              selectedTextStyle={styles.selectedTextStyle}
              data={verticalSpacingOptions}
              labelField="label"
              valueField="value"
              placeholder="Select spacing"
              value={verticalSpacing}
              onChange={(item: DropdownOption<number>) => {
                setVerticalSpacing(item.value);
              }}
            />
          </View>
        )}

        {textureType === 'default' && (
          <View style={styles.dropdownContainer}>
            <Text style={styles.dropdownLabel}>Corner Radius:</Text>
            <Dropdown
              style={styles.dropdown}
              placeholderStyle={styles.placeholderStyle}
              selectedTextStyle={styles.selectedTextStyle}
              data={radiusOptions}
              labelField="label"
              valueField="value"
              placeholder="Select radius"
              value={radiusRange}
              onChange={(item: DropdownOption<'square' | 'circle'>) => {
                setRadiusRange(item.value);
              }}
            />
          </View>
        )}

        <View style={styles.dropdownContainer}>
          <Text style={styles.dropdownLabel}>Texture:</Text>
          <Dropdown
            style={styles.dropdown}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            data={textureOptions}
            labelField="label"
            valueField="value"
            placeholder="Select texture"
            value={textureType}
            onChange={(item: DropdownOption<string>) => {
              setTextureType(item.value);
            }}
          />
        </View>
      </View>

      {mode === 'pi' ? (
        <PIConfetti
          key={confettiKey}
          ref={confettiRef}
          fallDuration={2000}
          blastDuration={250}
          sizeVariation={0.3}
          count={500}
          flakeSize={flakeSize}
          {...textureProps}
          rotation={rotation}
        />
      ) : mode === 'continuous' ? (
        <>
          <ContinuousConfetti
            key={confettiKey}
            ref={confettiRef}
            flakeSize={flakeSize}
            {...textureProps}
            rotation={rotation}
            verticalSpacing={effectiveVerticalSpacing}
            count={200}
          />
        </>
      ) : (
        <Confetti
          key={confettiKey}
          ref={confettiRef}
          flakeSize={flakeSize}
          {...textureProps}
          rotation={rotation}
          cannonsPositions={mode === 'canon' ? cannonPositions : undefined}
          autoplay
          isInfinite
        />
      )}

      <View style={styles.buttonContainer}>
        <Button title="Resume" onPress={() => confettiRef.current?.resume()} />
        <Button title="Pause" onPress={() => confettiRef.current?.pause()} />
        <Button
          title="Restart"
          onPress={() => confettiRef.current?.restart()}
        />
        <Button title="Reset" onPress={() => confettiRef.current?.reset()} />
      </View>
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
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
    paddingHorizontal: 20,
  },
  controlsContainer: {
    width: '100%',
    marginBottom: 30,
    gap: 15,
    paddingHorizontal: 20,
  },
  dropdownContainer: {
    width: '100%',
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  dropdown: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  placeholderStyle: {
    fontSize: 16,
    color: '#999',
  },
  selectedTextStyle: {
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
});
