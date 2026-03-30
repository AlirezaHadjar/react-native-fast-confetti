import type { ViewStyle, TextStyle } from 'react-native';
import type { ReactNode } from 'react';

type ModeItem = {
  key: string;
  title: string;
  description: string;
  render: () => ReactNode;
};

export type ModeCardProps = {
  item: ModeItem;
  styles: {
    card: ViewStyle;
    cardTitleContainer: ViewStyle;
    cardTitle: TextStyle;
    cardDescriptionContainer: ViewStyle;
    cardDescription: TextStyle;
  };
};

export function ModeCard(props: ModeCardProps): React.JSX.Element;
