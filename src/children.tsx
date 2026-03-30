/**
 * Credit to geist-ui/react for this file, it's copied from there.
 */

import React, {
  type ReactNode,
  type ReactElement,
  Children,
  isValidElement,
  cloneElement,
} from 'react';

type FlatChild = ReactElement | string | number;

export function flattenChildren(
  children: ReactNode,
  depth: number = 0,
  keys: (string | number)[] = []
): FlatChild[] {
  return Children.toArray(children).reduce<FlatChild[]>(
    (acc, node, nodeIndex) => {
      if (isValidElement<{ children?: ReactNode }>(node) && node.type === React.Fragment) {
        acc.push(
          ...flattenChildren(
            node.props.children,
            depth + 1,
            keys.concat(node.key ?? nodeIndex)
          )
        );
      } else {
        if (isValidElement(node)) {
          acc.push(
            cloneElement(node, {
              key: keys.concat(String(node.key)).join('.'),
            })
          );
        } else if (typeof node === 'string' || typeof node === 'number') {
          acc.push(node);
        }
      }
      return acc;
    },
    []
  );
}

export const pickChildren = <Props,>(
  _children: ReactNode | undefined,
  targetChild: React.ElementType
): {
  targetChildren: ReactElement<Props>[] | undefined;
  withoutTargetChildren: (ReactElement | string | number | null)[] | undefined;
} => {
  const children = flattenChildren(_children);
  const target: ReactElement<Props>[] = [];
  const withoutTargetChildren = Children.map(children, (item) => {
    if (!isValidElement(item)) return item;
    if (isInstanceOfComponent(item, targetChild)) {
      target.push(item as ReactElement<Props>);
      return null;
    }
    return item;
  });

  const targetChildren = target.length > 0 ? target : undefined;

  return {
    targetChildren,
    withoutTargetChildren,
  };
};

export const isInstanceOfComponent = (
  element: ReactElement | undefined,
  targetElement: React.ElementType
): boolean => {
  if (!element) return false;
  if (element.type === targetElement) return true;
  if (
    typeof element.type === 'function' &&
    typeof targetElement === 'function' &&
    'displayName' in element.type &&
    'displayName' in targetElement
  ) {
    return (
      (element.type as { displayName?: string }).displayName ===
      (targetElement as { displayName?: string }).displayName
    );
  }
  return false;
};
