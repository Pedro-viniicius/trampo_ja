---
name: armadilhas-testes-app
description: Testes do app fora da lista da etapa que quebram com mudança de sessão/porta do token, rede pendurada no fetch falso e node_modules do app quebrado por instalação avulsa
metadata:
  type: project
---

- `apps/mobile/src/testes/sem-dado-pessoal.test.tsx` e `src/testes/qa/*.test.tsx` têm jornadas ponta a ponta que afirmam o comportamento da sessão (rota de retorno depois de 401, argumentos de `armazenamento.gravar`). Os planos costumam não listá-los; uma mudança em `estado/sessao.tsx` ou na porta do token quebra esses testes. Rode a suíte completa cedo e relate o ajuste como desvio.
  **Why:** na etapa 15 da L3 (2026-10-23), o CA50 quebrou a jornada 2b (troca de conta depois de 401) e o `seguranca-qa` (`gravar` com 2 argumentos).
  **How to apply:** antes de mexer na sessão, procure `consumirRetorno`, `gravar` e `/meus-anuncios` nesses arquivos.
- Rede pendurada no fake: espalhe `criarFetchFalso()` e troque `fetch` por `(url, init) => { const r = base.fetch(url, init); return pendencia.then(() => r); }`. Chamar `base.fetch` primeiro registra a requisição (com cabeçalhos) na hora. Solte a pendência no fim do teste: o timeout de 15 s do cliente fica pendente.
- `jest --maxWorkers=2` na suíte completa do app leva cerca de 1 a 2 min (2458 testes em 2026-10-23).
- Se toda suíte do app falhar com `Cannot find module '@babel/runtime/helpers/interopRequireDefault'`, o `apps/mobile/node_modules` foi trocado por uma instalação avulsa (tem `.pnpm/` próprio e `.pnpm-workspace-state-v1.json` apontando para outro caminho, ex.: cópia de teste de mutação no scratchpad). Conserto: mover `apps/mobile/node_modules` para o scratchpad e rodar na raiz `CI=true pnpm install --frozen-lockfile --offline --force`. Sem mover, o install diz "up to date" e não conserta.
  **Why:** aconteceu na rodada 2 da L3 (2026-10-23), depois de um agente montar `scratchpad/mutapp`.
