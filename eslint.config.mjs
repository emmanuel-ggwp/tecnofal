// §21: ninguna lógica de negocio importa nhost-js ni supabase-js fuera de los adaptadores.
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  {
    files: ['packages/core/**/*.ts', 'apps/**/*.{ts,tsx}'],
    ignores: ['**/dist/**', '**/node_modules/**'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@supabase/supabase-js', message: 'Solo permitido en packages/provider-supabase (§21)' },
          { name: '@nhost/nhost-js', message: 'Solo permitido en packages/provider-nhost (§21)' },
        ],
      }],
    },
  },
];
