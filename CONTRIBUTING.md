# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

This project is a monorepo managed using [Bun workspaces](https://bun.sh/docs/install/workspaces). It contains the following packages:

- The library package in the root directory.
- A minimal native example app in the `example/` directory.
- A full-featured native and web kitchen-sink app in the `kitchen-sink/` directory.

To get started with the project, run `bun install` in the root directory to install the required dependencies for each package:

```sh
bun install
```

> Since the project relies on Bun workspaces, you cannot use [`npm`](https://github.com/npm/cli) for development.

Both apps use Expo SDK 58 and this checkout. Skia v3 and WebGPU require native builds; these demos do not run in Expo Go.

The [example app](/example/) demonstrates basic usage of the library. The [kitchen-sink app](/kitchen-sink/) is a full-featured showcase. You need to run one of them to test any changes you make.

They are configured to use the local version of the library, so any changes you make to the library's source code will be reflected in the apps. Changes to the library's JavaScript code will be reflected without a rebuild, but native code changes will require a rebuild.

You can use various commands from the root directory to work with the project.

To start the packager:

```sh
bun run example start
```

To run the example app on Android:

```sh
bun run example android
```

To run the example app on iOS:

```sh
bun run example ios
```

To run the example app on Web:

```sh
bun run kitchen-sink web
```

Make sure your code passes TypeScript, Oxlint, and Oxfmt. Run the following to verify:

```sh
bun run typecheck
bun run lint
bun run format:check
```

To fix formatting errors, run the following:

```sh
bun run format
```

Remember to add tests for your change if possible. Run the unit tests by:

```sh
bun run test
```

### Commit message convention

We follow the [conventional commits specification](https://www.conventionalcommits.org/en) for our commit messages:

- `fix`: bug fixes, e.g. fix crash due to deprecated method.
- `feat`: new features, e.g. add new method to the module.
- `refactor`: code refactor, e.g. migrate from class components to hooks.
- `docs`: changes into documentation, e.g. add usage example for the module..
- `test`: adding or updating tests, e.g. add integration tests using detox.
- `chore`: tooling changes, e.g. change CI config.

Our pre-commit hooks verify that your commit message matches this format when committing.

### Linting and tests

[Oxlint](https://oxc.rs/docs/guide/usage/linter), [Oxfmt](https://oxc.rs/docs/guide/usage/formatter), [TypeScript](https://www.typescriptlang.org/)

We use [TypeScript](https://www.typescriptlang.org/) for type checking, [Oxlint](https://oxc.rs/docs/guide/usage/linter) with [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) for linting and formatting the code, and [Jest](https://jestjs.io/) for testing.

Our pre-commit hooks verify that the linter and tests pass when committing.

### Publishing to npm

We use [release-it](https://github.com/release-it/release-it) to make it easier to publish new versions. It handles common tasks like bumping version based on semver, creating tags and releases etc.

To publish new versions, run the following:

```sh
bun run release
```

Publishing first runs `bun run check:optional-peers` and stops if the default
entry can reach `react-native-webgpu` or `typegpu`. Only `/gpu` may import them;
Oxlint enforces the same boundary in `src`.

### Scripts

The `package.json` file contains various scripts for common tasks:

- `bun install`: setup project by installing dependencies.
- `bun run typecheck`: type-check files with TypeScript.
- `bun run lint`: lint files with Oxlint.
- `bun run format`: format files with Oxfmt.
- `bun run format:check`: check formatting.
- `bun run test`: run unit tests with Jest.
- `bun run check:optional-peers`: pack the library and fail if the default entry reaches an optional peer.
- `bun run smoke:skia-only`: bundle the packed library in a Skia-only Expo app without WebGPU.
- `bun run example start`: start the Metro server for the example app.
- `bun run example android`: run the example app on Android.
- `bun run example ios`: run the example app on iOS.
- `bun run kitchen-sink start`: start the Metro server for the kitchen-sink app.
- `bun run kitchen-sink android`: run the kitchen-sink app on Android.
- `bun run kitchen-sink ios`: run the kitchen-sink app on iOS.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.
