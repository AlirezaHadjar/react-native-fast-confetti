module.exports = function (api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { worklets: false }]],
    plugins: ['react-native-worklets/plugin'],
  };
};
