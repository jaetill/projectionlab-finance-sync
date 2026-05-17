import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';
import unusedImports from 'eslint-plugin-unused-imports';

const tampermonkeyGlobals = {
  GM_getValue: 'readonly',
  GM_setValue: 'readonly',
  GM_deleteValue: 'readonly',
  GM_listValues: 'readonly',
  GM_registerMenuCommand: 'readonly',
  GM_unregisterMenuCommand: 'readonly',
  GM_xmlhttpRequest: 'readonly',
  GM_notification: 'readonly',
  GM_addStyle: 'readonly',
  GM_info: 'readonly',
  unsafeWindow: 'readonly',
};

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'site/**', '.claude/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...tampermonkeyGlobals,
      },
    },
    plugins: {
      import: importPlugin,
      promise: promisePlugin,
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      'promise/no-return-wrap': 'error',
    },
  },
  {
    files: ['userscript/pl-sync.user.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...tampermonkeyGlobals,
      },
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...tampermonkeyGlobals,
      },
    },
  },
];
