export const getRandomBoolean = () => {
  'worklet';
  return Math.random() >= 0.5;
};

export const getRandomValue = (min: number, max: number): number => {
  'worklet';
  return Math.random() * (max - min) + min;
};

export const randomColor = (colors: string[]): string => {
  'worklet';
  return colors[Math.floor(Math.random() * colors.length)] as string;
};

export const randomXArray = (num: number, min: number, max: number) => {
  'worklet';
  return new Array(num).fill(0).map(() => getRandomValue(min, max));
};

export const generateBoxesArray = (count: number, colors: string[]) => {
  'worklet';
  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(2 * Math.PI, 20 * Math.PI),
      z: getRandomValue(2 * Math.PI, 20 * Math.PI),
    },
    color: randomColor(colors),
    randomXs: randomXArray(5, -50, 50), // Array of randomX values for horizontal movement
    randomSpeed: getRandomValue(0.9, 1.3), // Random speed multiplier
    randomOffsetX: getRandomValue(-10, 10), // Random X offset for initial position
    randomOffsetY: getRandomValue(-10, 10), // Random Y offset for initial position
  }));
};
