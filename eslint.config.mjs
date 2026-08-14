// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/.next/**',
    '**/.expo/**',
    '**/.turbo/**',
    // Vendored reference material, not project source.
    'SKILLS/**',
  ]),

  {
    name: 'eslint/recommended',
    files: [tseslint.globs.jsts],
    extends: [js.configs.recommended],
  },

  // Type-aware linting. These rules run on the real type checker, which is what
  // makes them able to catch floating promises and unsafe any flow.
  {
    name: 'project/typescript-typed',
    files: [tseslint.globs.ts],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        // Every TypeScript file must be covered by a tsconfig or the project
        // service refuses to parse it. The root tsconfig covers config files at
        // the repo root, and each package covers its own src, test and tools.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['warn', { assertionStyle: 'never' }],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      // typescript-eslint has no dedicated rule for banning enums, so this
      // targets the AST node. erasableSyntaxOnly enforces the same at compile time.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Enums are banned. Use a union of string literals or an as const object.',
        },
      ],
    },
  },

  // Plain JavaScript config files must never run type-aware rules, which would
  // fail to parse them.
  {
    name: 'project/javascript-untyped',
    files: [tseslint.globs.js],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Scripts that run in a browser rather than in Node.
  {
    name: 'project/browser-scripts',
    files: ['docs/design/**/*.js'],
    languageOptions: {
      globals: {
        Element: 'readonly',
        IntersectionObserver: 'readonly',
        document: 'readonly',
        window: 'readonly',
      },
    },
  },
);
