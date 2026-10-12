module.exports = function (api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { worklets: false }]],
    plugins: [
      'unplugin-typegpu/babel',
      '@babel/plugin-transform-class-static-block',
      'react-native-worklets/plugin',
    ],
  };
};
