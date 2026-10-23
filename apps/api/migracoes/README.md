# Migrações

Migrações do banco, aplicadas pelo `Migrator` do Kysely (`src/compartilhado/banco/migrador.ts`).

- Nome: `NNNN_<modulo>.ts` (ex.: `0001_contas.ts`); exportam `up(db)` e `down(db)` e rodam em ordem alfabética; cada execução do migrador é uma transação só (se uma falha, nenhuma do lote fica aplicada).
- Cada módulo cria só as próprias tabelas. Sem FK entre módulos.
- O `down` nunca apaga nem converte dado; se não der para desfazer sem isso, aborta antes de mudar qualquer coisa.
  - Migração que cria tabela: o `down` usa `removerTabelaSeVazia(db, '<tabela>')`, que aborta se houver linhas.
    - Exceção: tabela só de contadores de segurança que vencem sozinhos, sem dado de pessoa (ex.: `0008_tentativas_de_entrada`), pode ser removida com linhas, desde que o `down` justifique em comentário.
  - Migração que altera tabela (a primeira é `0006_anuncios.ts`): o `down` trava a tabela (`lock table … in access exclusive mode`) e confere se há linha que o esquema antigo não aceita ou cujo dado se perderia; se houver, lança um erro com `code` próprio (é o que aparece na saída do `migrar`) e mensagem fixa, sem valor de linha. Só remove sem conferir a coluna que não guarda dado de pessoa (ex.: o contador `servicos.versao`).
- Aplicar: `pnpm --filter api migrar` (banco de desenvolvimento) ou `pnpm --filter api migrar -- --teste`.
- Reverter a última: `pnpm --filter api migrar -- --baixar`.

Este README é ignorado pelo migrador, que só lê arquivos `.ts`/`.js`.
