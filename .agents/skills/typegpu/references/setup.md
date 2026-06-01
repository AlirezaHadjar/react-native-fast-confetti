# TypeGPU Project Setup

## 1. Install TypeGPU

```sh
npm install typegpu
# pnpm add typegpu / yarn add typegpu
```

## 2. WebGPU types

TypeScript doesn't ship WebGPU types by default:

```sh
npm install --save-dev @webgpu/types
```

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"]
  }
}
```

---

## 3. Build plugin - `unplugin-typegpu` (required for `'use gpu'`)

The `'use gpu'` directive and JS/TS shader functions need the build plugin. Without it, TypeGPU functions implemented in TypeScript won't work.

```sh
npm install --save-dev unplugin-typegpu
```

### Vite

```js title="vite.config.js"
import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu()],
});
```

### Babel (React Native / Expo)

```js title="babel.config.js"
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['unplugin-typegpu/babel'],
  };
};
```

Other bundlers supported: esbuild, rollup, rolldown, rspack, webpack, farm. Vite and Babel are actively maintained by the TypeGPU team.

### Plugin options

```ts
typegpu({
  include?: FilterPattern,       // default: [/\.m?[jt]sx?$/]
  exclude?: FilterPattern,
  enforce?: 'pre' | 'post',
  autoNamingEnabled?: boolean,   // default: true - names resources from variable names
  earlyPruning?: boolean,        // default: true - skips files without typegpu/tgpu/'use gpu'
  forceTgpuAlias?: string,       // only if tgpu import is aliased unusually
})
```

The plugin also auto-names TypeGPU resources from variable names, improving debugging without manual `.$name()` calls.

---

## 4. Operator overloading - `tsover` (highly recommended)

`tsover` is a drop-in TypeScript replacement adding operator overloading (`+ - * / %` on vectors and matrices). Without it, the IDE treats `d.vec3f() * 2` as a type error, even though it compiles and runs.

**Note:** `unplugin-typegpu` already handles runtime operator overloads inside `'use gpu'` functions — no bundler plugin needed for shader code. `tsover` adds IDE type-checking support and enables operators outside `'use gpu'` blocks (CPU-side vector math).

### Install

Replace `typescript` with `tsover` in `package.json`:

```json
{
  "devDependencies": {
    "typescript": "npm:tsover@latest"
  }
}
```

For monorepos, add overrides:

```json
// npm / pnpm
{ "overrides": { "typescript": "npm:tsover@latest" } }

// Yarn
{ "resolutions": { "typescript": "npm:tsover@latest" } }
```

Match major.minor: if your project uses `typescript@5.8.x`, use `tsover@5.8.x`.

### Configure

Add `"tsover"` to `lib` in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"],
    "lib": ["tsover", "DOM", "ES2022"]
  }
}
```

### Bundler plugin (only for CPU-side operators)

Only needed if you use operators outside `'use gpu'` blocks. Most projects can skip this.

```js title="vite.config.js"
import tsoverPlugin from 'tsover/plugin/vite';
// add to plugins array alongside typegpuPlugin()
```

Also available: `tsover/plugin/rollup`, `tsover/plugin/rolldown`.

### IDE: use workspace TypeScript version

VS Code / Cursor / Windsurf: command palette -> **TypeScript: Select TypeScript Version** -> **Use Workspace Version**.

Or in `.vscode/settings.json`:

```json
{ "typescript.tsdk": "node_modules/typescript/lib" }
```

Zed: set `tsdk` in `.zed/settings.json` for `vtsls` or `typescript-language-server`.

---

## Minimal `vite.config.js`

```js
import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu()],
});
```

## Minimal `tsconfig.json`

```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"],
    "lib": ["tsover", "DOM", "ES2022"],
    "strict": true
  }
}
```

## Lint plugin - `eslint-plugin-typegpu`

Highlights common pitfalls and unsupported syntax in `'use gpu'` functions. 
Optional, but highly recommended. 
Use unless told otherwise, or unless the project uses incompatible linter.
Include a `lint` script in `package.json`.

```sh
npm install --save-dev eslint-plugin-typegpu
# pnpm add -D eslint-plugin-typegpu / yarn add -D eslint-plugin-typegpu
```

### ESLint (`eslint.config.js`)

```ts
import { defineConfig } from 'eslint/config';
import typegpu from 'eslint-plugin-typegpu';

export default defineConfig([
  {
    ...typegpu.configs.recommended,
    files: ['**/*.{js,mjs,ts,jsx,tsx}'],
  },
]);
```

### Oxlint (`oxlint.config.ts`)

```ts
import { defineConfig } from 'oxlint';
import typegpu from 'eslint-plugin-typegpu';

export default defineConfig({
  jsPlugins: ['eslint-plugin-typegpu'],
  rules: {
    ...typegpu.configs.recommended.rules,
  },
  ignorePatterns: ['node_modules'],
});
```
