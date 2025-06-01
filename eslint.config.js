const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    plugins: {
      'react-compiler': require('eslint-plugin-react-compiler'),
    },
    rules: {
      '@typescript-eslint/no-shadow': 'off',
      'react/react-in-jsx-scope': 'off',
      'curly': 'off',
      'react-compiler/react-compiler': 'error',
    },
  },
]);
