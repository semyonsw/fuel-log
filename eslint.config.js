/**
 * ESLint, flat config.
 *
 * The job here is NOT to impose a style. Prettier's config is the style written
 * down (2-space indent, single quotes, trailing commas, 100 columns, semicolons);
 * ESLint only checks the things a formatter cannot see:
 *
 *  - THE HOOKS RULES. A missing effect dependency is a stale closure that reads
 *    the previous trip or the previous reading, and nothing else catches it.
 *  - UNUSED CODE. An unread import or local is usually a half-finished change.
 *
 * `recommended`, not `strict`, and no type-aware pass: a type-aware lint would
 * need a second full TypeScript program on every run, and `npm run typecheck` —
 * which CI runs beside this — already is one.
 */

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  {
    // Generated, vendored or not ours. `android/` and `ios/` are written by
    // `expo prebuild` and are not a source of truth — see .gitignore.
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'web-build/**',
      '.expo/**',
      'plugins/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `_`-prefixed names mean "part of the signature, deliberately unused";
      // rest siblings are how a field gets dropped from a persisted shape.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Rehydration guards narrow `unknown` by hand and sometimes assert a field
      // the check above already proved. Worth seeing, not worth failing CI over.
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    // Config files are CommonJS and run in Node (Babel and this file load before
    // any ESM transform exists).
    files: ['*.js', '*.config.js'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // A test that indexes its own fixture KNOWS the row is there; `!` says so.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  // Last, so it can switch off anything the sets above turned on that Prettier
  // owns instead.
  prettier,
);
