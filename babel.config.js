module.exports = {
  plugins: ['@babel/plugin-transform-class-static-block'],
  overrides: [
    {
      // TypeGPU sources compile only for tests; the published runtime never sees them.
      include: [/\/shaders\//, /\/src\/__tests__\//, /\/src\/__fixtures__\//],
      plugins: ['unplugin-typegpu/babel'],
    },
    {
      exclude: /\/node_modules\//,
      presets: ['module:react-native-builder-bob/babel-preset'],
    },
    {
      include: /\/node_modules\//,
      presets: ['module:@react-native/babel-preset'],
    },
  ],
};
