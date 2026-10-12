import { useLayoutEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useIsFocused, useNavigation } from 'expo-router';
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/** Keep the outgoing effect attached while its native screen animates away. */
export const useScreenEffectVisible = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const focused = useIsFocused();
  const [visible, setVisible] = useState(focused);

  useLayoutEffect(() => {
    const removeFocus = navigation.addListener('focus', () => setVisible(true));
    const removeTransitionEnd = navigation.addListener('transitionEnd', () => {
      setVisible(navigation.isFocused());
    });
    return () => {
      removeFocus();
      removeTransitionEnd();
    };
  }, [navigation]);

  return Platform.OS === 'web' ? focused : visible;
};
