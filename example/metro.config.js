const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const monorepoRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [monorepoRoot];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-fast-confetti': monorepoRoot,
};

module.exports = config;
