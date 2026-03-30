const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const monorepoRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

// Watch the monorepo root so Metro can resolve the library source
config.watchFolders = [monorepoRoot];

// Resolve peer deps from the monorepo root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
