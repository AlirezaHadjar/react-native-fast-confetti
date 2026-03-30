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
  return Children.toArray(children).reduce(
    (acc: FlatChild[], node: any, nodeIndex) => {
      if (node.type === React.Fragment) {
        acc.push.apply(
          acc,
          flattenChildren(
            node.props.children,
            depth + 1,
            keys.concat(node.key || nodeIndex)
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

export const pickChildren = <Props = any>(
  _children: ReactNode | undefined,
  targetChild: React.ElementType
) => {
  const children = flattenChildren(_children);
  const target: ReactElement<Props>[] = [];
  const withoutTargetChildren = Children.map(children, (item) => {
    if (!isValidElement(item)) return item;
    if (isInstanceOfComponent(item, targetChild)) {
      // @ts-expect-error - cloneElement type mismatch with generic Props
      target.push(cloneElement(item));
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

export const isInstanceOfComponent = <Props,>(
  element: ReactElement | undefined,
  targetElement: React.ComponentType<Props> | React.ElementType<Props>
): element is NonNullable<ReactElement<Props>> => {
  const matches =
    (element as any)?.type === targetElement ||
    (typeof (element as any)?.type == 'function' &&
      (element as any)?.type?.displayName ===
        (targetElement as any).displayName);

  return matches;
};
