/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

type ExportConditions = string | { [condition: string]: ExportConditions };

type PackageJson = {
  exports: Record<string, ExportConditions>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const GPU_EXPORTS = new Set(['./gpu']);
const RESOLVE_SUFFIXES = [
  '',
  '.js',
  '.ts',
  '.tsx',
  '/index.js',
  '/index.ts',
  '/index.tsx',
];

const root = resolve(import.meta.dirname, '..');
const workDir = mkdtempSync(join(tmpdir(), 'optional-peers-'));

try {
  // npm pack runs the `prepare` build, so the check sees freshly built files.
  // `npm publish --dry-run` exports npm_config_dry_run, which would skip the tarball.
  execFileSync('npm', ['pack', '--pack-destination', workDir], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, npm_config_dry_run: 'false' },
  });
  const filename = readdirSync(workDir).find((file) => file.endsWith('.tgz'));
  if (!filename) throw new Error('npm pack produced no tarball');
  execFileSync('tar', ['xzf', join(workDir, filename), '-C', workDir]);
  const pkgDir = join(workDir, 'package');
  const pkg: PackageJson = JSON.parse(
    readFileSync(join(pkgDir, 'package.json'), 'utf8')
  );

  const optionalPeers = Object.entries(pkg.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta.optional)
    .map(([name]) => name);
  if (optionalPeers.length === 0) {
    throw new Error('package.json declares no optional peer dependencies');
  }

  const failures: string[] = [];
  for (const [subpath, conditions] of Object.entries(pkg.exports)) {
    if (subpath === './package.json') continue;
    const reached = runtimeTargets(conditions).flatMap((target) =>
      findOptionalPeerImports(join(pkgDir, target), optionalPeers, pkgDir)
    );
    if (GPU_EXPORTS.has(subpath)) {
      if (reached.length === 0) {
        failures.push(
          `Sanity check: "${subpath}" should reach an optional peer but none was found; the import walker is broken.`
        );
      }
    } else {
      failures.push(
        ...reached.map((hit) => `"${subpath}" reaches optional peer ${hit}`)
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      `Optional peer check failed for ${filename}:\n\n${failures.join('\n\n')}`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Optional peer check passed for ${filename}: only ${[...GPU_EXPORTS].join(', ')} reach ${optionalPeers.join(', ')}.`
    );
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

function runtimeTargets(conditions: ExportConditions): string[] {
  if (typeof conditions === 'string') return [conditions];
  return Object.entries(conditions)
    .filter(([condition]) => condition !== 'types')
    .flatMap(([, value]) => runtimeTargets(value));
}

function findOptionalPeerImports(
  entry: string,
  optionalPeers: string[],
  pkgDir: string
): string[] {
  const parents = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  const hits: string[] = [];
  for (let file = queue.shift(); file; file = queue.shift()) {
    for (const specifier of runtimeSpecifiers(file)) {
      if (specifier.startsWith('.')) {
        const target = resolveRelative(file, specifier);
        if (!target) {
          hits.push(
            `(unresolvable "${specifier}")\n${chain(parents, file, pkgDir)}`
          );
        } else if (!parents.has(target)) {
          parents.set(target, file);
          queue.push(target);
        }
        continue;
      }
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (name && optionalPeers.includes(name)) {
        hits.push(
          `"${name}":\n${chain(parents, file, pkgDir)}\n    imports "${specifier}"`
        );
      }
    }
  }
  return hits;
}

// `import type` is erased at build time; everything else stays at runtime.
function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      !node.importClause?.isTypeOnly &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;
      const isImportOrRequire =
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require');
      if (
        isImportOrRequire &&
        node.arguments.length === 1 &&
        argument &&
        ts.isStringLiteralLike(argument)
      ) {
        specifiers.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function resolveRelative(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function chain(
  parents: Map<string, string | null>,
  file: string,
  pkgDir: string
): string {
  const path: string[] = [];
  for (
    let current: string | null | undefined = file;
    current;
    current = parents.get(current)
  ) {
    path.unshift(relative(pkgDir, current));
  }
  return path
    .map((step, index) => `    ${index === 0 ? '' : '→ '}${step}`)
    .join('\n');
}
