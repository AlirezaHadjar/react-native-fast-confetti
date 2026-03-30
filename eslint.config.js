const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  [globalIgnores(['lib/*', 'dist/*', 'kitchen-sink/ios/*', 'kitchen-sink/android/*'])],
  expoConfig,
  {
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
