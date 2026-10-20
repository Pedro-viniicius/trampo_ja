import { defineConfig } from 'vitest/config';

// Testes de integração: exigem o Postgres de teste (`docker compose up -d banco`).
// Os arquivos rodam em série porque compartilham o mesmo banco.
export default defineConfig({
  test: {
    include: ['src/**/*.integracao.test.ts', 'test/**/*.integracao.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['test/setup-integracao.ts'],
    fileParallelism: false,
  },
});
