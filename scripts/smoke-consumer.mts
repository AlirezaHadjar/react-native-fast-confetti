/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const SCENARIOS = {
  'skia-only': {
    entry: 'react-native-fast-confetti',
    extraDependencies: [] as string[],
  },
  'gpu': {
    entry: 'react-native-fast-confetti/gpu',
    extraDependencies: ['react-native-webgpu'],
  },
};
const BUILD_TIME_ONLY = ['typegpu', 'unplugin-typegpu'];

const scenarioName = process.argv[2] as keyof typeof SCENARIOS;
const scenario = SCENARIOS[scenarioName];
if (!scenario) {
  throw new Error(
    `Usage: smoke-consumer.mts <${Object.keys(SCENARIOS).join('|')}>`
  );
}

const root = resolve(import.meta.dirname, '..');
const readManifest = (path: string): Manifest =>
  JSON.parse(readFileSync(join(root, path), 'utf8'));
const library = readManifest('package.json');
const example = readManifest('example/package.json');

const devVersion = (name: string) => {
  const version = library.devDependencies?.[name];
  if (!version) throw new Error(`${name} is missing from devDependencies`);
  return version;
};
const expoVersion = example.dependencies?.expo;
if (!expoVersion) throw new Error('expo is missing from example/package.json');
const expoMajor = expoVersion.replace(/^\D*/, '').split('.')[0];

// Outside the repository, so nothing resolves from the monorepo's node_modules.
const appDir = mkdtempSync(join(tmpdir(), `${scenarioName}-consumer-`));
const run = (command: string, args: string[], cwd = appDir) =>
  execFileSync(command, args, { cwd, stdio: 'inherit' });

try {
  run('npm', ['pack', '--pack-destination', appDir], root);
  const tarball = readdirSync(appDir).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');

  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify(
      {
        name: `${scenarioName}-consumer`,
        private: true,
        main: 'index.js',
        dependencies: {
          'expo': expoVersion,
          'babel-preset-expo': `~${expoMajor}.0.0`,
          'react': devVersion('react'),
          'react-native': devVersion('react-native'),
          'react-native-fast-confetti': `file:./${tarball}`,
          'react-native-reanimated': devVersion('react-native-reanimated'),
          'react-native-skia': devVersion('react-native-skia'),
          'react-native-worklets': devVersion('react-native-worklets'),
          ...Object.fromEntries(
            scenario.extraDependencies.map((name) => [name, devVersion(name)])
          ),
        },
      },
      null,
      2
    )
  );
  writeFileSync(
    join(appDir, 'app.json'),
    JSON.stringify({
      expo: {
        name: `${scenarioName}-consumer`,
        slug: `${scenarioName}-consumer`,
      },
    })
  );
  writeFileSync(
    join(appDir, 'babel.config.js'),
    `module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { worklets: false }]],
    plugins: ['react-native-worklets/plugin'],
  };
};
`
  );
  writeFileSync(
    join(appDir, 'index.js'),
    `import { registerRootComponent } from 'expo';
import { Confetti } from '${scenario.entry}';

registerRootComponent(() => <Confetti autoplay />);
`
  );

  run('npm', ['install', '--no-audit', '--no-fund']);

  const absent = Object.entries(library.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta.optional)
    .map(([name]) => name)
    .filter((name) => !scenario.extraDependencies.includes(name))
    .concat(BUILD_TIME_ONLY);
  const installed = absent.filter((name) =>
    existsSync(join(appDir, 'node_modules', name))
  );
  if (installed.length > 0) {
    throw new Error(`Unexpectedly installed: ${installed.join(', ')}`);
  }

  for (const platform of ['ios', 'android']) {
    run('npx', [
      'expo',
      'export:embed',
      '--entry-file',
      'index.js',
      '--platform',
      platform,
      '--dev',
      'false',
      '--bundle-output',
      join(appDir, `main.${platform}.jsbundle`),
      '--assets-dest',
      join(appDir, `assets-${platform}`),
    ]);
  }
  console.log(
    `${scenarioName} smoke test passed: ${scenario.entry} bundles for iOS and Android without ${absent.join(', ')}.`
  );
} finally {
  rmSync(appDir, { recursive: true, force: true });
}
