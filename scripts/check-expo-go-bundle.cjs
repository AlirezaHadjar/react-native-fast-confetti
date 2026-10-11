const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const exportDirectory = process.argv[2];
assert(exportDirectory, 'Pass the Expo Go export directory.');

function findSourceMaps(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? findSourceMaps(filename)
      : entry.name.endsWith('.map')
        ? [filename]
        : [];
  });
}

const sourceMaps = findSourceMaps(exportDirectory);
assert(sourceMaps.length > 0, 'Export the example with --source-maps.');

for (const filename of sourceMaps) {
  const { sources } = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert(
    sources.some((source) =>
      source.includes('/node_modules/react-native-fast-confetti/lib/module/')
    ),
    `${filename}: expected the published confetti package.`
  );
  assert(
    sources.some((source) =>
      source.includes('/node_modules/@shopify/react-native-skia/')
    ),
    `${filename}: expected Expo Go's Skia package.`
  );
  const unsupportedSources = sources.filter(
    (source) =>
      source.startsWith('/src/') ||
      source.includes('/node_modules/react-native-skia/') ||
      source.includes('/node_modules/expo-dev-client/') ||
      source.includes('GraphiteConfettiCanvas')
  );
  assert.deepEqual(
    unsupportedSources,
    [],
    `${filename}: the Expo Go example must not bundle the workspace library or development-client modules.`
  );
}

console.log(
  `Verified Expo Go package resolution in ${sourceMaps.length} bundles.`
);
