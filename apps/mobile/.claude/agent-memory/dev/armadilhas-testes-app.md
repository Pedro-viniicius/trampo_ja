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
- Abas por modo (V2, etapa 6): o layout `(abas)/_layout.tsx` declara 6 rotas (`index`, `meus-trampos`, `demandas`, `buscar`, `conversas`, `perfil`). Mapa de teste com o layout real precisa de todas, senão o console avisa "No route named …" e os testes que varrem o console falham: use `...abasDeStub()` de `testes/rotas/apoio.tsx`.
- Duas `renderizarRotas` no mesmo `it` (com `unmount` no meio) deixam o expo-router num estado que quebra todos os testes seguintes do arquivo (nada renderiza). Para "reabrir o app", faça outro `it` com o armazenamento já preenchido.
- O `minHeight` da aba fica no pai do botão (`getByRole('button', {name}).parent`), não no botão. A aba "Meus trampos" tem o mesmo nome do antigo atalho do Perfil: filtre por `props.href === undefined`.
- Leitores do router (`getRouterState`, `getSearchParams`, `getPathname`) não existem no tipo do `screen`: use os do resultado de `renderizarRotas`/`abrirApp` (`RotasRenderizadas`). `expect(screen).toHavePathname` funciona.
- Candidatura enviada (V2, CA80): o 201 abre `/candidatura-enviada` em vez do toast. Jornadas que candidatam usam `esperarCandidaturaEnviada()` e `voltarDaCandidaturaEnviada(detalhe)` de `testes/qa/apoio-qa.tsx`; mapa de rotas local precisa de `'(app)/candidatura-enviada'` (sem ela cai em `expo-router-unmatched`). Botões da tela usam `router.dismissTo` (`navigate` empilhava um segundo `(abas)`).
- Memória da máquina (14 GiB, outras sessões abertas): jest do app sempre com `--maxWorkers=2`; `jest src/testes src/telas` com todos os workers derrubou o PC por OOM (2026-11-13). Nunca jest em paralelo com outro jest nem com o build.
- Neste shell o `pnpm` pode não estar no PATH (e `timeout pnpm …` falha): `export PATH=~/.nvm/versions/node/v22.23.0/bin:$PATH`.
- Relógio fixo em teste de rota: `jest.useFakeTimers({ now: new Date(…) })` antes de `renderizarRotas` (o `renderRouter` do expo-router chama `useFakeTimers` mas preserva o `Date.now()` de antes). Volte com `jest.useRealTimers()` no `afterEach`.
- `testes/rotas/conversa.test.tsx` chama o `renderItem` da FlatList direto (CA60): o item pode vir embrulhado num `View` com o `SeparadorDeDia`; use `tentarDeNovoDoItem`.
- Vínculo conversa↔trampo (V2, quadro 09): a API não liga conversa a trampo; `useVinculoDaConversa` (estado/consultas/conversas.ts) só lê o cache (minhasCandidaturas, candidaturasRecebidas/*, trampo/meusTrampos). Teste semeando o `queryClient` com `setQueryData` dentro de `act`, depois de abrir.
