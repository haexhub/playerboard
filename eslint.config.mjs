// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: [
      '.output/**',
      '.nuxt/**',
      '.worktrees/**',
      'dist/**',
      'node_modules/**',
      'supabase/**',
      'playwright-report/**',
      'coverage/**',
      'graphify-out/**',
      'test-results/**',
      'app/types/database.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Every SFC is `lang="ts"`, and `nuxt typecheck` resolves auto-imported
    // identifiers against the generated import map. `no-undef` would only
    // re-check them against a hand-maintained globals list that goes stale
    // with each new composable.
    files: ['**/*.vue'],
    rules: { 'no-undef': 'off' },
  },
  prettier,
]
