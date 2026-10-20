# Migrações

Migrações do banco, aplicadas pelo `Migrator` do Kysely (`src/compartilhado/banco/migrador.ts`).

- Nome: `NNNN_<modulo>.ts` (ex.: `0001_contas.ts`); exportam `up(db)` e `down(db)` e rodam em ordem alfabética; cada execução do migrador é uma transação só (se uma falha, nenhuma do lote fica aplicada).
- Cada módulo cria só as próprias tabelas. Sem FK entre módulos.
- O `down` só remove tabela vazia: use `removerTabelaSeVazia(db, '<tabela>')`, que aborta se houver linhas.
- Aplicar: `pnpm --filter api migrar` (banco de desenvolvimento) ou `pnpm --filter api migrar -- --teste`.
- Reverter a última: `pnpm --filter api migrar -- --baixar`.

Este README é ignorado pelo migrador, que só lê arquivos `.ts`/`.js`.
