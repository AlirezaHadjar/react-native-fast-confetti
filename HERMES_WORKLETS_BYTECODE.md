# Optional Hermes bytecode for Worklets

`react-native-fast-confetti` does not enable Hermes bytecode compilation. Babel
configuration belongs to the consuming application, and the default Worklets
configuration is the supported baseline.

Apps using React Native Worklets 0.11 or newer may opt into the experimental
`hermesBytecode` option for production builds in Legacy Eval Mode:

```js
/** @type {import('react-native-worklets/plugin').PluginOptions} */
const workletsOptions = {
  hermesBytecode: true,
  getHBCBinary: () => '/absolute/path/to/hermesc',
};

module.exports = {
  plugins: [['react-native-worklets/plugin', workletsOptions]],
};
```

`getHBCBinary` must return the Hermes compiler for the app's toolchain and host
platform. Do not hard-code a machine-specific path in shared configuration.

This can reduce the one-time evaluation cost and memory overhead of worklet
source strings. It does not accelerate animation frames, particle simulation,
or GPU rendering. It is production-only and has no effect in Worklets Bundle
Mode. Benchmark cold mounting and memory in the final application before using
it.

See the [official Worklets plugin options](https://docs.swmansion.com/react-native-worklets/docs/worklets-babel-plugin/plugin-options/#hermesbytecode).
