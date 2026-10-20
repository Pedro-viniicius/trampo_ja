import { defineConfig } from 'vitest/config';

// Testes de unidade e BDD: rodam sem banco, com adaptadores em memória.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integracao.test.ts'],
  },
});
