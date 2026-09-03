import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['node_modules/**', 'src/bots/*/*.data.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
