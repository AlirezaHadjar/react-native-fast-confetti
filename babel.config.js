module.exports = {
  plugins: [
    'unplugin-typegpu/babel',
    '@babel/plugin-transform-class-static-block',
  ],
  overrides: [
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
