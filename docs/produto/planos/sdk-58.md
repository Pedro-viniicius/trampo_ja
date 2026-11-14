# Plano técnico: app no Expo SDK 58
- Brief: não há (pedido do lead; motivo na D16 de `docs/produto/decisoes.md:38`)
- Data: 2026-11-14

## Objetivo e critérios de aceite

Subir `apps/mobile` do Expo SDK 57 (RN 0.86.3, React 19.2.3) para o SDK 58 (RN 0.88.1, React 19.3.0). A D16 manteve o 57 até o Expo Go da loja abrir o 58. O fato novo: o iPhone do dono já tem o Expo Go 58.0.0, que recusa o projeto no 57. Sem a subida, a parte da etapa 12 da V2 que falta no iPhone, com VoiceOver, fica travada (`docs/produto/planos/visual-v2.md:171`). A API não muda.

- CA1 — O app abre pelo QR code no Expo Go 58 do iPhone e no emulador Android com o Expo Go 58. Isso inclui o login, as abas dos dois modos e a troca de modo, sem tela vermelha nem aviso de SDK incompatível no `expo start`.
- CA2 — `pnpm typecheck`, `pnpm lint` e `pnpm test` ficam limpos na raiz.
  - Linha de base: a API com 1396 testes passando e o app com 108 suítes, 3305 testes passando e 2 pulados.
  - Depois da subida, a API fica igual. O app não perde teste nem ganha `skip`; teste reescrito mantém a mesma asserção.
- CA3 — As fontes da marca continuam carregando, com reserva na fonte do sistema (ADR-009, CA72).
  - `expo-font` fica fixo na versão exata que o SDK 58 indica.
  - `src/testes/raiz-fontes.test.tsx` passa.
  - No aparelho, Bricolage e Figtree aparecem.
- CA4 — A navegação por abas e a correção F4 (D74) continuam valendo.
  - O teste F4 de `src/componentes/componentes-v2.test.tsx:109-140` passa.
  - No emulador, nenhum rótulo corta em 360 dp com fonte 1,0 nem em 411 dp com fonte 1,3, nos dois modos.
- CA5 — README, decisões e o texto "Expo Go (SDK 57)" do CLAUDE.md são atualizados.
  - Os dois primeiros ficam com o lead.
  - O CLAUDE.md, o lead edita com aprovação do dono.
- CA6 (novo) — Todas as versões de `apps/mobile/package.json` seguem exatas, sem `^` nem `~` (`src/testes/qa/fronteiras-qa.test.ts:124-130`). `expo install --check` e `expo-doctor` não acusam nada, ou cada aviso que sobrar vem com justificativa no relatório.
- CA7 (novo) — Nenhuma regressão de segurança.
  - O teste da árvore de produção sem telemetria (CA52, `src/testes/dependencias-de-producao.test.ts`) passa.
  - O marcador de instalação (S2) e o arquivo temporário da exportação mantêm a gravação síncrona e o mesmo comportamento.

## Contexto atual

- `apps/mobile/package.json`: `expo` 57.0.30, `expo-router` 57.0.28, `react` 19.2.3, `react-native` 0.86.3, `expo-font` 57.0.4, `jest` 29.7.0, `@types/jest` 29.5.14, `jest-expo` 57.0.6, `@types/react` 19.2.18, `typescript` 6.0.3. Todas as versões são exatas.
- O script `typecheck` roda `expo customize tsconfig.json && tsc --noEmit`. `tsconfig.json` tem `types: ["jest","expo/types"]` e estende `expo/tsconfig.base`.
- `app.json` tem os plugins `expo-router`, `expo-secure-store`, `expo-splash-screen` e `expo-status-bar`, e `experiments.typedRoutes`. `app.config.ts` só confere a URL de produção. Não há `web.output`, então a mudança do padrão do web no 58 não afeta o build Android.
- O lock fica na raiz (`pnpm-lock.yaml`). Não há `.npmrc`. O `@react-native/jest-preset@0.86.3` entra como peer resolvido do `jest-expo`, e o `@expo/vector-icons@15.1.1` já puxa `expo-font@58.0.9`. Hoje há duas versões de `expo-font` no lock.
- Testes acoplados ao SDK:
  - `src/testes/qa/fronteiras-qa.test.ts:166-172` espera `expo-font` igual a `'57.0.4'`.
  - `src/testes/render-router.tsx:21-47` adapta o `renderRouter` síncrono do 57 ao RNTL 14.
  - `src/testes/expo-router-matchers.d.ts:1-15` declara os matchers porque o 57 não publicava os tipos.
- F4: `src/componentes/navegacao.ts:87-111` depende de três coisas:
  - o bottom-tabs montar o item com `[styles.bottomItem {flex:1}, tabBarItemStyle]`;
  - o `BottomTabItem` repassar o `flex` ao botão;
  - o `processFlexBasis` do Yoga.
- Gravação de arquivo com `File.write` síncrono:
  - `src/estado/armazenamento-token.ts:55-57`, no marcador S2, dentro de `criar(): void`;
  - `src/estado/exportacao.ts:86`.
  - Os fakes de `File.write` ficam em `src/estado/exportacao.test.ts:35`, `src/estado/armazenamento-token.test.ts:35`, `src/estado/consultas/conta.test.tsx:42` e `src/testes/qa/conta-l1.test.tsx:42`.
- `usePreventRemove` vem de `expo-router/react-navigation` em `src/app/(app)/trampos/editar/[id].tsx:2`. O callback repete a ação com `navigation.dispatch(data.action)` (`:148-151`).
- Três refs tipadas pela classe, que o "Strict TypeScript API" do RN 0.87 deve recusar (não verificado: depende dos tipos do 0.88):
  - `src/telas/CandidaturasRecebidas.tsx:45` (`useRef<View>`);
  - `src/telas/MeusAnuncios.tsx:80` (`useRef<View>`);
  - `src/telas/CandidaturaEnviada.tsx:53` (`useRef<Text>`).
  - O resto do app já usa `ComponentRef<typeof X>`.
- Sem impacto conferido no código (`rg` em `src`):
  - nenhum import profundo de `react-native/Libraries`;
  - nenhum uso de `InteractionManager`, `Touchable`, `ImageBackground`, `freezeOnBlur`, `initialRouteName`, `initialParams` ou prop removida do `StatusBar`;
  - cabeçalho nativo desligado em todas as pilhas (`headerShown: false`), então o cabeçalho transparente do iOS 26 não aparece;
  - todas as abas declaradas em `src/app/(app)/(abas)/_layout.tsx`.

### O que mudou no SDK 58 (pesquisado em 2026-11-14)

Fontes:
- [changelog do SDK 58](https://expo.dev/changelog/sdk-58);
- [guia de atualização](https://expo.dev/blog/how-to-upgrade-to-sdk-58);
- [migração do Router 57→58](https://docs.expo.dev/router/migrate/sdk-57-to-58/);
- [testes unitários](https://docs.expo.dev/develop/unit-testing/);
- os pacotes `expo@58.0.25`, `expo-router@58.0.31` e `jest-expo@58.0.14` (`npm pack` no scratchpad);
- o `Node.cpp` do Yoga nas tags v0.86.3 e v0.88.1.

O que muda:
- **Versões** (do `bundledNativeModules.json` do `expo@58.0.25`):

  | Pacote | Versão |
  |---|---|
  | `react-native` | 0.88.1 |
  | `react` | 19.3.0 |
  | `expo-router` | ~58.0.31 |
  | `expo-font` | ~58.0.12 |
  | `expo-secure-store` | ~58.0.3 |
  | `expo-file-system` | ~58.0.13 |
  | `expo-sharing` | ~58.0.23 |
  | `expo-splash-screen` | ~58.0.14 |
  | `expo-status-bar` | ~58.0.5 |
  | `expo-linear-gradient` | ~58.0.4 |
  | `expo-network` | ~58.0.5 |
  | `expo-linking` | ~58.0.17 |
  | `expo-constants` | ~58.0.16 |
  | `@expo/metro-runtime` | ~58.0.17 |
  | `react-native-screens` | ~4.30.1 |
  | `react-native-safe-area-context` | ~5.11.1 |
  | `jest-expo` | ~58.0.14 |

  O template do SDK 58 usa `@types/react ~19.3.0` e `typescript ~6.0.3`.
- **Node:** o `expo` 58 exige `^22.13 || ^24.3 || ^26`. A máquina tem a v22.23.0.
- **jest-expo 58 exige Jest 30**, segundo a doc. As dependências dele já são `^30` (`jest-environment-*`, `babel-jest`, `@jest/globals`), e o peer passa a ser `@react-native/jest-preset ^0.88.1`. É preciso subir `jest` e `@types/jest` juntos. No Jest 30, `jest.restoreAllMocks` só restaura `spyOn`; o app usa isso em `src/telas/foco-no-erro.test.tsx:21`. O app não usa os aliases removidos (`toBeCalled`, `toThrowError` e outros; `rg` sem resultado).
- **Strict TypeScript API (RN 0.87):** o import profundo vira erro, e as refs usam tipos de instância. Para adiar a migração, existe a saída `customConditions: ["react-native-legacy-deep-imports"]` no tsconfig, que some depois do RN 0.89.
- **`expo-file-system`:** `File.write()` vira assíncrono. `File.writeSync()` mantém o comportamento antigo.
- **expo-router 58:**
  - `renderRouter` e `testRouter` são assíncronos de fábrica e devolvem `getPathname()` e companhia no resultado. Os matchers ganham tipos publicados (`build/testing-library/expect.d.ts`), e o peer `@testing-library/react-native` exige versão 14 ou maior; o app tem a 14.1.0.
  - Tabs e drawers escondem a tela fora de foco (Activity).
  - A navegação despachada é enfileirada até o commit do React.
  - Os parâmetros do ancestral deixam de ser herdados.
  - `Stack.Protected` ganha `redirectTo` opcional.
  - `usePreventRemove` continua exportado por `expo-router/react-navigation`, via `export * from '../core'`, e também por `expo-router`. A doc nova manda desligar a prevenção e chamar `repeat()`.
- **F4:** o `BottomTabBar` do 58 continua com `style: [styles.bottomItem, options.tabBarItemStyle]` e `bottomItem: { flex: 1 }`. O `BottomTabItem` continua repassando o `flex` (linhas 121 e 156). O `processFlexBasis`, o `resolveFlexGrow` e o `resolveFlexShrink` do Yoga são idênticos no 0.88.1. A única novidade do 0.88 é a medida de min-content, ligada a nós com `minContentMeasureFunc`, e só a checagem no aparelho cobre esse risco.
- **Expo Go:** o da loja abre só o SDK 58.

## Abordagens consideradas

| Abordagem | Prós | Contras | Risco |
|---|---|---|---|
| A. `expo install expo@^58 --fix` + Jest 30, corrigindo o que o typecheck e os testes apontarem | Caminho oficial; versões alinhadas pelo próprio Expo | Várias correções pequenas espalhadas | Médio, coberto pelos 3305 testes |
| B. Igual a A, mas ligando `react-native-legacy-deep-imports` para adiar o Strict TS API | Menos erros de tipo agora | Dívida com prazo (some no RN 0.89); o app não tem import profundo | Baixo, mas desnecessário |
| C. Development build e ficar no 57 | Não mexe em nada | Exige EAS ou Xcode e conta Apple; contraria a D16 | Fora do escopo |

## Decisão

Seguir a A. A B fica como plano B só se o `tsc` acusar dezenas de erros fora das três refs listadas. Sem biblioteca nova: `jest` 30 e `@types/jest` 30 substituem as versões de agora. Não aproveitar a subida para migrar o `aoPerderASessao` (`src/app/_layout.tsx:36-41`, `:60-65`) para o `redirectTo`, nem o `usePreventRemove` para o import de `expo-router`. As duas mudanças seriam refactor sem CA; só entram se um teste quebrar.

## Etapas

Todas são do `dev`, salvo onde está indicado. Siga em ordem, porque todas dependem da etapa 2, e as etapas 3 a 5 rodam a suíte inteira. Abaixo, `M/` = `apps/mobile/`.

| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Linha de base num branch novo `sdk-58` a partir de `visual-v2` | — | `pnpm typecheck && pnpm lint && pnpm test` (anotar as contagens) | lead | 1 | não | CA2 |
| 2 | Dependências (detalhe abaixo) | `M/package.json`, `pnpm-lock.yaml`, `M/src/testes/qa/fronteiras-qa.test.ts` | `pnpm --filter mobile exec expo install --check`; `cd apps/mobile && npx expo-doctor@latest`; `pnpm why -r expo-font`; `pnpm --filter mobile exec jest src/testes/qa/fronteiras-qa.test.ts src/testes/dependencias-de-producao.test.ts src/testes/sem-dado-pessoal.test.tsx` | dev | 2 | não (dependência: ver seguranca) | CA3, CA6, CA7 |
| 3 | Typecheck no RN 0.88 (detalhe abaixo) | `M/src/telas/CandidaturasRecebidas.tsx`, `M/src/telas/MeusAnuncios.tsx`, `M/src/telas/CandidaturaEnviada.tsx`, `M/tsconfig.json` (só se preciso) e o que o `tsc` apontar | `pnpm --filter mobile typecheck` | dev | 3 | não | CA2 |
| 4 | `File.write` → `File.writeSync` no marcador S2 e na exportação, com os fakes de teste ganhando `writeSync` (o mesmo corpo do `write`). Mantém `criar(): void` e a ordem gravar → compartilhar → apagar | `M/src/estado/armazenamento-token.ts`, `M/src/estado/exportacao.ts`, `M/src/estado/armazenamento-token.test.ts`, `M/src/estado/exportacao.test.ts`, `M/src/estado/consultas/conta.test.tsx`, `M/src/testes/qa/conta-l1.test.tsx` | `pnpm --filter mobile exec jest src/estado src/testes/qa/conta-l1.test.tsx src/testes/qa/seguranca-l3.test.tsx` | dev (opus) | 4 | **sim** (sessão/token, dado pessoal) | CA7 |
| 5 | Testes do Router e do Jest 30 (detalhe abaixo) | `M/src/testes/render-router.tsx`, `M/src/testes/expo-router-matchers.d.ts` (remover), testes que falharem; `M/src/app/(app)/trampos/editar/[id].tsx` só se `editar-anuncio` falhar | `pnpm --filter mobile test` (contagens = linha de base) | dev | 5 | não | CA2 |
| 6 | F4 e comentários de versão (detalhe abaixo) | `M/src/componentes/navegacao.ts`, `M/src/componentes/componentes-v2.test.tsx`, `M/src/app/_layout.tsx`, `M/src/testes/render-router.tsx` | `pnpm --filter mobile exec jest src/componentes/componentes-v2.test.tsx src/testes/raiz-fontes.test.tsx`; `pnpm --filter mobile lint` | dev | 6 | não | CA3, CA4 |
| 7 | Build do bundle Android e verificação completa | — | `pnpm --filter mobile build` e `EXPO_PUBLIC_API_URL=https://api.exemplo.com pnpm --filter mobile build:producao` (apagar `M/dist` depois); `pnpm typecheck && pnpm lint && pnpm test` | dev, depois o lead | 7 | não | CA2 |
| 8 | Aparelhos (detalhe abaixo) | — (resultado no relatório) | roteiro | lead + dono | 8 | não | CA1, CA3, CA4 |
| 9 | Docs (detalhe abaixo) | `README.md`, `docs/produto/decisoes.md`, `docs/produto/planos/visual-v2.md`; `CLAUDE.md` | leitura; `rg -n "SDK 57" README.md CLAUDE.md docs/produto/decisoes.md` só nas notas históricas | lead | 8 | não | CA5 |

**Etapa 2 — Dependências.**
1. Em `apps/mobile`, rodar `npx expo install expo@^58.0.0 --fix` e depois `npx expo install jest-expo jest @types/jest -- --dev` (Jest 30).
2. Conferir que o `@react-native/jest-preset` resolveu em `^0.88.1`.
3. Trocar todo `~` ou `^` gravado por versão exata, a mesma do lock. Também `@types/react` (19.3.x).
4. Atualizar o `'57.0.4'` de `fronteiras-qa.test.ts:167` para a versão exata do `expo-font` 58.

**Etapa 3 — Typecheck no RN 0.88.**
1. Confirmar que o `expo customize tsconfig.json` ainda gera `.expo/types` e não reescreve o `tsconfig.json` (não verificado no 58).
2. Trocar `useRef<View>` e `useRef<Text>` por `useRef<ComponentRef<typeof View>>` e `useRef<ComponentRef<typeof Text>>`, o padrão do app.
3. Corrigir o resto do que o `tsc` apontar.

**Etapa 5 — Testes do Router e do Jest 30.**
1. Em `render-router.tsx`, o `renderRouter` do 58 já é async e devolve os leitores no resultado. A função passa a fazer `const r = await renderRouterDoExpo(...)` e a copiar `getPathname` e os outros leitores de `r` para o `screen`. Confirmar se o 58 já os põe no `screen`; se puser, a cópia sai.
2. Remover a declaração local dos matchers, que agora vem do pacote e pode conflitar na assinatura de `Matchers`.
3. Corrigir as falhas de tempo:
   - navegação enfileirada até o commit: `await waitFor`;
   - tela fora de foco escondida (Activity);
   - parâmetros não herdados.
4. Se o "sair sem salvar" falhar, adotar `repeat()` no `usePreventRemove`.

**Etapa 6 — F4 e comentários de versão.**
1. Atualizar a referência "RN 0.86.3" para "RN 0.88.1" nos comentários de F4 (`navegacao.ts:89`, `componentes-v2.test.tsx:110`). A regra do Yoga foi conferida e é idêntica.
2. Atualizar os comentários "SDK 57" que ficaram falsos (`_layout.tsx:38`; `render-router.tsx:21-28`).
3. Não mudar estilo.

**Etapa 8 — Aparelhos.**
1. Subir a API (`semear` e `dev`) e o `pnpm --filter mobile start`.
2. No iPhone, abrir pelo Expo Go 58.0.0. No emulador Android, `a` no CLI, que instala o Expo Go 58 se faltar.
3. Conferir:
   - login;
   - fontes;
   - abas dos dois modos;
   - F4 em 360 dp com fonte 1,0 e em 411 dp com fonte 1,3;
   - editar anúncio, sair sem salvar;
   - exportar dados.
4. Em seguida, fazer no iPhone a parte da etapa 12 da V2 que ficou pendente, com o leitor de tela nas abas e nas estrelas.

**Etapa 9 — Docs.**
- README:
  - `README.md:5`: SDK 58;
  - `:144-146`: SDK 58;
  - `:170-172`: o aviso "Expo Go só abre o SDK 57" vira "o app está no SDK 58, a versão que o Expo Go da loja abre".
- Decisões: a nova decisão 75 registra que o app está no SDK 58 e substitui a D16. Na D16, acrescentar "(substituída pela 75)".
- V2: em `visual-v2.md:171` e `:214`, trocar "Expo Go SDK 57" por "Expo Go SDK 58" ou adicionar uma nota.
- CLAUDE.md: em "Dados de teste (app)", "Expo Go (SDK 57)" vira "(SDK 58)", e a "Stack" pode citar o SDK 58. **O lead edita com a aprovação do dono.**

## Pontos para o seguranca

- **Etapa 4 (S2 e exportação).**
  - O marcador precisa continuar gravado antes de o token ser considerado válido. Se o `writeSync` falhar, quem chama continua tratando a falha como "não existe" (`armazenamento-token.ts:40-46`).
  - O arquivo da exportação continua apagado no `finally` mesmo quando o compartilhamento falha.
  - Nada de `await` solto que deixe o arquivo no cache.
- **Etapa 2 (árvore de dependências).** Conferir no diff do lock os pacotes transitivos novos (`expo-modules-cli`, `@expo/log-box-utils` e o que vier do `@expo/cli` 58). O teste CA52 precisa passar sem exceção nova em `EXCECOES` (`dependencias-de-producao.test.ts:60`).
- **Fora do Expo Go.** O R8 ligado por padrão nas builds de release Android não afeta o Expo Go nem o `expo export`. Rever antes do primeiro build nativo para as lojas.

## Riscos e como reverter

O branch `sdk-58` isola tudo. Reverter é voltar o `package.json`, o `pnpm-lock.yaml` e o código do branch e rodar `pnpm install --frozen-lockfile`. Não há migração de banco nem mudança na API. Atenção: voltar ao 57 tira de novo o app do Expo Go da loja (que abre só o 58), e aí só um development build abre o app.

- **Jest 30 + jest-expo 58 quebram muitos testes de rota de uma vez.** Corrigir por causa na etapa 5. Se passar de duas rodadas, o lead para e leva ao dono: manter o branch aberto não afeta a `visual-v2`.
- **Strict TS API com muitos erros.** Plano B: `customConditions: ["react-native-legacy-deep-imports"]` no `tsconfig.json`, registrado como dívida com prazo (RN 0.89).
- **F4 muda no aparelho apesar do código igual** (medida de min-content nova no Yoga 0.88). O teste cobre o estilo, e a etapa 8 cobre o layout. Se cortar, reabrir o achado F4 com o designer. Reverter é o branch.
- **Fontes não carregam no Expo Go 58.** O CA72 garante que o app abre com a fonte do sistema. O diagnóstico vem do `erroDeFontes` em `_layout.tsx`; não mudar a ADR-009.
- **`expo install --fix` grava `~`.** O teste de versões fixas falha; a etapa 2 já fixa as versões.
- **`expo-font` duplicado.** Se o `pnpm why` mostrar duas versões 58, fixar a do SDK e aceitar a do `@expo/vector-icons`, como hoje. Anotar no relatório.

## Perguntas em aberto e premissas adotadas

1. Premissa: o emulador Android usa o Expo Go 58 instalado pelo próprio CLI.
2. Premissa: Jest 30 e `@types/jest` 30 não contam como "dependência nova" (D12), porque trocam as versões que já existem e são exigidos pelo `jest-expo` 58.
3. Pergunta ao dono: subir o `engines.node` da raiz de `>=22` para `>=22.13`? O SDK 58 exige isso e a API roda no mesmo Node. A recomendação é sim, na etapa 2, com o arquivo `package.json` da raiz.
4. Não verificado: se o `experiments.typedRoutes` do `app.json` ainda é aceito ou se já é padrão no 58. O `expo-doctor` da etapa 2 vai dizer; se avisar, remover a chave.

## ADR

Sem ADR nova: é a troca de versão prevista na D16, sem padrão novo. A decisão 75, escrita pelo lead, basta.
