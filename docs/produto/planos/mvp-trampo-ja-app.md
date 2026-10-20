# Plano técnico: MVP do Trampo Já, entrega 2a (app mobile: fundação, conta, perfil, busca e detalhes)
- Brief: docs/produto/briefs/mvp-trampo-ja.md
- Spec: docs/produto/specs/mvp-trampo-ja.md
- Entrega 1 (API): docs/produto/planos/mvp-trampo-ja.md (contrato real no `README.md`, que prevalece)
- Data: 2026-10-20
- **Corte:** a entrega 2 inteira passaria de 250 linhas. Esta é a **2a**. A **2b** fica em `docs/produto/planos/mvp-trampo-ja-app-2b.md`, planejada depois que a 2a estiver pronta, e cobre publicar trampo, ofertar serviço, candidatar-se, as candidaturas (minhas, recebidas e aceite), as conversas, meus trampos e meus serviços, além de fechar o CA16. O escopo e as lacunas da API que ela vai sentir estão na seção "Entrega 2b" no fim deste plano.

## Objetivo e critérios de aceite
Entregar o app Expo em `apps/mobile`, com a marca do dono, em que a pessoa cria conta, entra, monta o perfil, busca trampos e serviços e abre os detalhes, tudo contra a API real e com os estados e os textos da spec. Os números são os do brief.
- CA1: a tela Cadastro chama `POST /contas`, guarda o token e entra autenticada, levando a Editar perfil no modo "completar".
- CA2: o 409 `email_em_uso` mostra o texto genérico da spec, sem repetir o e-mail.
- CA3: Editar perfil grava com `PUT /perfis/eu` (nome, cidade e ao menos uma habilidade) e o perfil de outra pessoa abre por `GET /perfis/:contaId`. O aviso "Complete seu perfil" aparece enquanto `GET /perfis/eu` responde 404.
- CA7: em Buscar, texto, categoria e cidade combinam com E, a lista vem da mais recente para a mais antiga e as abas Trampos e Serviços paginam.
- CA14 (cliente): um 401 em rota autenticada apaga o token e o cache e leva ao login com "Sua sessão expirou. Entre de novo para continuar."; depois de entrar, a pessoa volta à tela em que estava.
- CA15 (cliente): nenhum dado pessoal nem token vai para `console`, log, crash report ou mensagem de erro. Não há telemetria. O token fica só no `expo-secure-store`.
- CA16 (parcial): logo, cores e as telas de entrada, cadastro (com login), início, busca, detalhe de trampo, detalhe de serviço e perfil. As telas de publicação, candidaturas e conversas vêm na 2b, que fecha o CA16.
- Ficam para a 2b: CA4, CA5, CA6 e CA8 a CA13.

## Contexto atual
- Só existe a API. O workspace já inclui `apps/*` (`pnpm-workspace.yaml:1-2`). Os scripts da raiz filtram só a API (`package.json:9-14`). O Biome da raiz cobre `**` (`biome.json:3-5`). O `.gitignore` ignora `.env*`, menos o `.env.example`. O git tem a branch `main`, ainda sem commits.
- Contas: `POST /contas` e `POST /sessoes` devolvem só `{token}` (`apps/api/src/modulos/contas/adaptadores/http/rotas.ts:33-38`). **A API não devolve o id da conta em nenhuma rota.**
  - `GET /perfis/eu` não traz `contaId` (`perfis/adaptadores/http/rotas.ts:52-63`) e responde 404 quando ainda não há perfil (`:122-123`).
  - Todo perfil salvo é completo (`perfis/dominio/perfil.ts:150-157`). No app, portanto, "perfil incompleto" é o mesmo que um 404 em `GET /perfis/eu`.
- Limites do perfil: nome e cidade de 2 a 80 caracteres, descrição até 300, de 1 a 10 habilidades com 2 a 30 caracteres cada, e habilidade repetida volta como `habilidades.N` `invalido` (`perfis/dominio/perfil.ts:14-20` e `:245-298`).
- Busca: `GET /busca` devolve `{itens, proximoCursor}`. O item não traz o nome do autor e `cidade` pode vir `null` (`busca/adaptadores/http/rotas.ts:30-63`). Não há total de resultados. `limite` vai de 1 a 49 (`busca/aplicacao/buscar.ts:12-17`). `GET /categorias` devolve `[{id, rotulo}]` (`busca/adaptadores/http/rotas.ts:125-129`).
- Detalhes: `GET /trampos/:id` (`trampos/adaptadores/http/rotas.ts:83-110`) e `GET /servicos/:id` (`servicos/adaptadores/http/rotas.ts:61-80`) trazem `autorId`; no serviço, `cidade` pode ser `null`.
- Erros: o corpo é `{erro, campos?}` e `motivo` vale `obrigatorio`, `tamanho` ou `invalido`. Também há 429 `muitas_requisicoes` (`README.md:139-158`, `:230-237`).
- A API escuta em `0.0.0.0:3000`, em HTTP (`README.md:48`). CORS não importa, porque o app é nativo e não web.
- Na spec, os tokens estão em `specs/mvp-trampo-ja.md:66-104`, os estados em `:106-130`, os textos em `:132-158` e a acessibilidade em `:160-171`.
- `logo.svg` contém um `<image>` com `data:image/jpeg;base64`. Conferido: há `python3` com Pillow 12.1.1 e não há ImageMagick. Que a máquina não tem Android Studio nem Xcode é informação do lead, não verificada.
- Versões estáveis consultadas em 2026-10-20 com `pnpm view` e com o `bundledNativeModules.json` do `expo@58.0.16`. Atenção: o SDK fixa `react` em `19.3.0`, embora a última versão publicada seja a 19.3.1.

| Pacote | Versão fixa | | Pacote (dev) | Versão fixa |
|---|---|---|---|---|
| `expo` | 58.0.16 | | `jest-expo` | 58.0.11 |
| `expo-router` | 58.0.24 | | `jest` | 30.5.2 |
| `react` / `react-native` | 19.3.0 / 0.88.0 | | `@testing-library/react-native` | 14.1.0 |
| `expo-secure-store` | 58.0.2 | | `test-renderer` (peer do RNTL 14) | 1.3.1 |
| `expo-network` / `expo-linear-gradient` | 58.0.3 / 58.0.3 | | `typescript` (a mesma da API) | 7.0.2 |
| `expo-splash-screen` / `expo-status-bar` | 58.0.10 / 58.0.3 | | `@types/react` / `@types/jest` | 19.3.0 / 30.0.0 |
| `expo-linking` / `expo-constants` (peers do router) | 58.0.13 / 58.0.12 | | `@biomejs/biome` (o mesmo da API) | 2.5.15 |
| `@expo/metro-runtime` (peer do router) | 58.0.14 | | | |
| `react-native-screens` / `react-native-safe-area-context` | 4.30.0 / 5.10.1 | | | |
| `@expo/vector-icons` | 15.1.1 | | | |
| `@tanstack/react-query` (**pergunta 1**) | 5.104.5 | | | |

## Abordagens consideradas
Estado de servidor (cache, paginação, recarga):

| Abordagem | Prós | Contras | Risco |
|---|---|---|---|
| **TanStack Query** | Cache por chave (mantém o que já carregou quando cai a rede, como pede a spec); `useInfiniteQuery` para o cursor da busca; invalidação depois de mutação; `onlineManager` e `focusManager`; poupa muito código na 2b | Dependência nova fora do Expo | Baixo |
| Hooks próprios (`useConsulta` com um `Map`) | Nenhuma dependência | Reimplementa cache, deduplicação, paginação e invalidação, e a 2b (aceite, candidatura, polling) multiplica isso | Médio |

Fronteira entre `designer` e `dev`: há um caminho claramente certo. As rotas do Expo Router em `src/app/` são **contêineres** do `dev` (dados, estado, navegação e tradução de erro). As telas em `src/telas/` e os componentes em `src/componentes/` são **apresentacionais** do `designer` (só props, markup e estilo). Isso segue o CLAUDE.md: o designer não toca `src/api/` nem `src/estado/`.

O resto também tem caminho claro:
- **Formulários:** sem biblioteca; estado local e validação pura em `src/estado/validacao.ts`.
- **Rede:** `expo-network` informa a conexão.
- **Gradiente:** `expo-linear-gradient`.
- **Ícones:** `@expo/vector-icons` (Ionicons), o conjunto nativo da stack.
- **Moeda e data:** formatação própria em pt-BR, sem `Intl`. O ICU do Hermes e o do Node, que roda o Jest, podem divergir (não verificado), e a função manual tem 10 linhas testáveis.
- **Fora:** AsyncStorage, Sentry e qualquer telemetria.

## Decisão
```
apps/mobile/
  package.json  app.json  tsconfig.json  .env.example  assets/  scripts/gerar-assets.py
  src/app/          rotas = contêineres (dev). Sem testes aqui: todo arquivo dessa pasta vira rota
  src/telas/        telas apresentacionais por props (designer)
  src/componentes/  botão, campo, seletor, chip, cartão, selo, avatar, folha, diálogo, avisos, logo... (designer)
  src/tema/tokens.ts   src/textos/pt-BR.ts  (designer)
  src/api/          cliente HTTP, erros, tipos e funções por endpoint (dev, regra)
  src/estado/       sessão, token, consultas, validação, erros → chave, formatação, conexão (dev, regra)
  src/testes/       apoio de teste e testes das rotas (dev)
```
- **Navegação:**
  - `src/app/_layout.tsx` usa `Stack.Protected`: o grupo `(publico)` (entrada, entrar, cadastro) aparece quando `!autenticado` e o grupo `(app)` quando `autenticado`.
  - `(app)/(abas)` tem, na 2a, três abas: Início, Buscar e Perfil. A 2b acrescenta Publicar e Conversas.
  - A Entrada fica em `(publico)/entrada.tsx`, e não em `index`, para não disputar a rota `/` com o Início.
- **Cliente HTTP** (`src/api/cliente.ts`): `fetch` injetável, `Authorization: Bearer` lido de `obterToken()`, timeout de 15 s com `AbortController` e ids da URL passados por `encodeURIComponent`.
  - O erro sai como `ErroDaApi {status, codigo, campos}` ou `ErroDeRede`, sem corpo nem URL completa.
  - Um 401 dispara `aoExpirar()` só quando a requisição levou token e não é `POST /sessoes` nem `POST /contas`. O 401 `credenciais_invalidas` do login não conta como sessão expirada.
- **Sessão** (`src/estado/sessao.tsx`): o estado é `carregando`, `anonimo` ou `autenticado`.
  - `entrar(token)` grava no armazenamento seguro.
  - `sair()` chama `DELETE /sessoes` (falhar não impede a saída), apaga o token e roda `queryClient.clear()`.
  - `expirar(rotaAtual)` apaga o token, limpa o cache e guarda em memória a rota de retorno e o aviso.
  - O token fica atrás de uma porta (`ArmazenamentoDeToken`): o adaptador real usa `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` e os testes usam um fake em memória.
  - A splash continua na tela até a sessão terminar de carregar.
- **URL da API:** `EXPO_PUBLIC_API_URL` em `apps/mobile/.env`, que o git ignora; o `.env.example` traz `http://192.168.0.10:3000`. Fora de `__DEV__`, o app exige `https://`.
- **Busca:** dispara quando a pessoa envia o texto (teclado "Buscar") ou muda um filtro; não busca a cada letra. A página tem 20 itens.
  - As abas mandam `tipo=trampos` ou `tipo=servicos`.
  - A cidade é texto livre na folha, porque não há endpoint de cidades.
  - A contagem é "{n} resultados" sobre o que já carregou, com "+" quando há `proximoCursor` (pergunta 3).
  - O Início faz duas chamadas, `GET /busca?tipo=trampos&limite=10` e `GET /busca?tipo=servicos&limite=10`.
- **Rascunhos:** ficam só na memória do componente e nunca vão para o disco, porque contêm dado pessoal.

## Esquema e contratos
Sem migração e sem mudança na API na 2a.
- **`src/api/tipos.ts`** espelha o README: `ItemDaBusca` (união por `tipo`), `PaginaDaBusca`, `FiltrosDaBusca`, `Trampo`, `Servico`, `MeuPerfil`, `PerfilPublico`, `EntradaDePerfil`, `Categoria`, `CampoInvalido {campo, motivo}`.
- **Funções:**
  - `src/api/contas.ts`: `cadastrar` e `entrar` (`{email, senha}` → `{token}`) e `sair()`.
  - `src/api/perfis.ts`: `obterMeuPerfil(): MeuPerfil | null` (404 vira `null`), `salvarMeuPerfil`, `obterPerfilPublico`.
  - `src/api/busca.ts`: `buscar(filtros)`, `listarCategorias()`.
  - `src/api/trampos.ts`: `obterTrampo`.
  - `src/api/servicos.ts`: `obterServico`.
- **`src/estado/erros.ts`:** `type ChaveDeErro = keyof typeof textos.erros` e `chaveDoErro(erro, formulario): {geral?: ChaveDeErro; campos: Partial<Record<string, ChaveDeErro>>}`. O contêiner troca a chave pelo texto e entrega strings prontas à tela.

Chaves de `textos.erros`, criadas pelo designer na etapa 2, e de onde cada uma vem:

| Chave | Origem |
|---|---|
| `email_invalido` | `email` com qualquer motivo, ou validação local |
| `senha_curta` | `senha` com qualquer motivo; o campo limita a 128 caracteres |
| `credenciais_invalidas` / `email_em_uso` | 401 no login / 409 no cadastro (CA2) |
| `muitas_tentativas` | 429 (texto novo, sem equivalente na spec) |
| `sessao_expirada` / `sem_conexao` / `erro_servidor` | 401 autenticado / `ErroDeRede` / 5xx e o que não tiver mapa |
| `nao_encontrado` | 404 em detalhe ou perfil (texto novo) |
| `nome_obrigatorio` / `nome_tamanho` / `cidade_obrigatoria` / `cidade_tamanho` | `nome` e `cidade` com `obrigatorio` ou `tamanho` (os `_tamanho` são textos novos) |
| `descricao_tamanho` | `descricao` com `tamanho` (texto novo) |
| `habilidade_obrigatoria` / `habilidades_demais` / `habilidade_tamanho` / `habilidade_invalida` | `habilidades` com `obrigatorio` ou `tamanho`, e `habilidades.N` com `tamanho` ou `invalido`, que inclui a repetida (os três últimos são textos novos) |

Tela, contêiner e endpoints da 2a:

| Tela (`src/telas/`) | Contêiner (`src/app/`) | Endpoints |
|---|---|---|
| `Entrada` | `(publico)/entrada.tsx` | nenhum |
| `Entrar` | `(publico)/entrar.tsx` | `POST /sessoes` |
| `Cadastro` | `(publico)/cadastro.tsx` | `POST /contas`; ao dar certo, vai para `perfil/editar?completar=1` |
| `Inicio` | `(app)/(abas)/index.tsx` | `GET /perfis/eu`, `GET /busca` (duas vezes), `GET /categorias` |
| `Buscar` | `(app)/(abas)/buscar.tsx` | `GET /busca` com cursor, `GET /categorias` |
| `DetalheDoTrampo` / `DetalheDoServico` | `(app)/trampos/[id].tsx` / `(app)/servicos/[id].tsx` | `GET /trampos/:id` ou `GET /servicos/:id`, e `GET /perfis/:autorId` |
| `Perfil` (meu ou de outra pessoa) | `(app)/(abas)/perfil.tsx` / `(app)/perfis/[contaId].tsx` | `GET /perfis/eu` e `DELETE /sessoes` / `GET /perfis/:contaId` |
| `EditarPerfil` | `(app)/perfil/editar.tsx` | `GET /perfis/eu`, `PUT /perfis/eu` |

## Etapas
`M` = `apps/mobile`. A verificação base é `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <pasta ou arquivo da etapa>`. Todas as dependências e todos os scripts entram no `package.json` na etapa 1, então nenhuma outra etapa mexe nele.

| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Fundação do app. Cria `M` com as versões fixas da tabela e os scripts `start` (`expo start`), `test` (`jest`), `typecheck` (`tsc --noEmit`), `lint` (`biome check .`) e `build` (`expo export --platform android --output-dir dist`). `app.json` com nome "Trampo Já", slug `trampo-ja`, scheme `trampoja`, `userInterfaceStyle: light`, `orientation: default`, plugins `expo-router` e `expo-secure-store` e `experiments.typedRoutes`. tsconfig estrito estendendo `expo/tsconfig.base`, Jest com `preset: jest-expo` e o `.env.example`. Para a etapa 10 substituir: um `_layout.tsx` mínimo e `(publico)/entrada.tsx` provisório, com teste de sanidade que renderiza a entrada por `renderRouter` (`expo-router/testing-library`). Na raiz: `typecheck`, `lint` e `test` passam a `pnpm -r <script>`; o Biome ganha `suspicious/noConsole: error` em `apps/mobile/**` e ignora `**/.expo`; o `.gitignore` ganha `.expo/`, `expo-env.d.ts` e `apps/mobile/{android,ios,dist}` | `M/{package.json,app.json,tsconfig.json,.env.example}`, `M/src/app/_layout.tsx`, `M/src/app/(publico)/entrada.tsx`, `M/src/testes/sanidade.test.tsx`, `package.json`, `biome.json`, `.gitignore`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (só se precisar, ver Riscos) | `pnpm install && pnpm --filter mobile exec expo install --check && pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | A | não | 15 |
| 2 | Tokens e textos. `tokens.ts` com todos os tokens da spec (cores, gradiente, espaço, raio, tipografia, `touch-min`). `pt-BR.ts` com os textos das telas da 2a, por tela, e o objeto `erros` com exatamente as chaves da tabela acima. Os textos novos são do designer. Teste que calcula o contraste dos pares texto/fundo dos tokens (≥ 4,5:1, e ≥ 3:1 para borda e foco) | `M/src/tema/tokens.ts`, `M/src/tema/tokens.test.ts`, `M/src/textos/pt-BR.ts` | base + `jest src/tema` | designer | B | não | 16 |
| 3 | Assets da marca. O script lê `logo.svg`, extrai o JPEG em base64 e gera, com Pillow e só por redução: `icon.png` (1024), `adaptive-icon.png` (1024, logo em 66% centralizada sobre branco), `splash-icon.png` (1024) e `logo.png` (512, para a Entrada). No `app.json`: `icon`, `android.adaptiveIcon` (fundo `#FFFFFF`) e o plugin `expo-splash-screen` (fundo branco, `imageWidth` 200) | `M/scripts/gerar-assets.py`, `M/assets/{icon,adaptive-icon,splash-icon,logo}.png`, `M/app.json` | `python3 -I apps/mobile/scripts/gerar-assets.py logo.svg apps/mobile/assets && pnpm --filter mobile build` | designer | B | não | 16 |
| 4 | Cliente HTTP e endpoints. `config.ts` (URL do `EXPO_PUBLIC_API_URL`, `https` fora de `__DEV__`), `cliente.ts` (contrato de "Decisão"), `erros.ts` (`ErroDaApi`, `ErroDeRede`, sem corpo nem URL), `tipos.ts` e as funções por endpoint. Fake de `fetch` por rota para os testes. Testes cobrem: cabeçalho Bearer, 401 que chama `aoExpirar` contra 401 do login que não chama, 404 de `/perfis/eu` virando `null`, timeout, ids codificados na URL e query da busca sem campo vazio | `M/src/api/{config,cliente,erros,tipos,contas,perfis,busca,trampos,servicos}.ts`, `M/src/api/{cliente,endpoints}.test.ts`, `M/src/testes/fetch-falso.ts` | base + `jest src/api` | dev | B | **sim** (token, HTTP, 401) | 1, 2, 3, 7, 14, 15 |
| 5 | Sessão. Porta `ArmazenamentoDeToken` com o adaptador `expo-secure-store` e o fake. `SessaoProvider`: carregar, entrar, sair, expirar com rota de retorno e aviso. `QueryClient` com `onlineManager` ligado ao `expo-network` e `focusManager` ao `AppState`. Hook `useConexao`. Apoio `renderizar` com os provedores. Testes: o token só passa pela porta; `sair` e `expirar` limpam token e cache; `sair` termina mesmo com falha de rede | `M/src/estado/{armazenamento-token.ts,sessao.tsx,cliente-de-consultas.ts,conexao.ts}`, `M/src/estado/{armazenamento-token,sessao}.test.tsx`, `M/src/testes/renderizar.tsx` | base + `jest src/estado/sessao src/estado/armazenamento-token` | dev | C | **sim** (token, sessão, 401) | 1, 14, 15 |
| 6 | Estado puro. `validacao.ts`: e-mail, senha de 8 a 128, e o perfil com os limites da API e habilidades sem repetir depois de normalizar. `erros.ts`: código e motivo viram `ChaveDeErro` (tabela). `formatacao.ts`: centavos para "R$ 1.234,56", `YYYY-MM-DD` para "dd/mm/aaaa" e o rótulo da categoria. Cada um com teste | `M/src/estado/{validacao,erros,formatacao}.ts` + `.test.ts` | base + `jest src/estado/validacao src/estado/erros src/estado/formatacao` | dev | C | não | 1, 2, 3, 15 |
| 7 | Componentes base com todos os estados da spec e a11y (rótulo, papel, alvo de 44, foco, erro com ícone e texto): `Botao`, `CampoDeTexto` (mostrar/ocultar senha, contador), `Seletor` (folha com lista ou texto livre), `Chip`, `CartaoDeAnuncio`, `Selo`, `Avatar`, `FolhaInferior`, `DialogoDeConfirmacao`, `Aviso`, `FaixaSemConexao`, `Esqueleto`, `EstadoVazio`, `Toast`, `Cabecalho`, `Logo`, `CabecalhoGradiente` e `navegacao.ts` (opções visuais das abas e do cabeçalho). Sem dados e sem `src/api` | `M/src/componentes/*.tsx` (os 17 componentes e `navegacao.ts`), `M/src/componentes/componentes.test.tsx` | base + `jest src/componentes` | designer | C | não | 16 |
| 8 | Consultas e mutações (TanStack): `useMeuPerfil`, `useSalvarPerfil`, `usePerfilPublico`, `useCategorias` (`staleTime: Infinity`), `useBusca` (infinita, por cursor), `useRecentes(tipo)`, `useTrampo`, `useServico`, `useEntrar`, `useCadastrar`, `useSair`. Salvar o perfil invalida `meuPerfil` | `M/src/estado/consultas/{conta,perfil,busca,anuncios}.ts`, `M/src/estado/consultas/consultas.test.tsx` | base + `jest src/estado/consultas` | dev | D | não | 1, 3, 7 |
| 9 | Telas apresentacionais da 2a (tabela de telas), só por props: dados, estado (`carregando`, `erro`, `vazio`, `ok`), strings de erro já traduzidas e callbacks. Seguem layout, estados e textos da spec ("Ler mais", truncamentos, contagem, filtros, aviso de perfil incompleto com "Falta: nome, cidade e habilidades"). Teste de render por estado | `M/src/telas/{Entrada,Entrar,Cadastro,Inicio,Buscar,DetalheDoTrampo,DetalheDoServico,Perfil,EditarPerfil}.tsx`, `M/src/telas/telas.test.tsx` | base + `jest src/telas` | designer | D | não | 1, 2, 3, 7, 16 |
| 10 | Raiz e conta. `_layout.tsx` substitui o da etapa 1: provedores, splash até a sessão carregar, `Stack.Protected`, `FaixaSemConexao` e aviso de sessão expirada. Contêineres de entrada, entrar e cadastro: senha com `autoComplete`/`textContentType`, colar permitido e campo limpo depois do envio; cadastro leva ao modo completar perfil; login volta à rota de retorno. Testes com `renderRouter`: CA1, CA2, 429, 401 voltando ao login com aviso e retornando à tela de antes | `M/src/app/_layout.tsx`, `M/src/app/(publico)/{_layout,entrada,entrar,cadastro}.tsx`, `M/src/testes/rotas/conta.test.tsx` | base + `jest src/testes/rotas/conta` | dev | E | **sim** (senha, sessão, 401) | 1, 2, 14, 15, 16 |
| 11 | Área autenticada, Início e Buscar. `(app)/_layout.tsx`, abas (Início, Buscar, Perfil, com `navegacao.ts`), Início (saudação, recentes, "Ver todos" abrindo Buscar com o tipo, aviso de perfil incompleto) e Buscar (filtros com E, abas, carregar mais, vazio, erro, offline). Testes: CA7 com o fake (filtros na query, ordem preservada, `antesDe` na página 2) e aviso de perfil no 404 | `M/src/app/(app)/_layout.tsx`, `M/src/app/(app)/(abas)/{_layout,index,buscar}.tsx`, `M/src/testes/rotas/inicio-e-busca.test.tsx` | base + `jest src/testes/rotas/inicio-e-busca` | dev | E | não | 3, 7, 14, 16 |
| 12 | Detalhes e perfil. Detalhe de trampo e de serviço com o cartão do autor (`GET /perfis/:autorId`; 404 mostra "nao_encontrado"), perfil de outra pessoa sem ações, meu perfil (sair com confirmação) e editar perfil (modo completar com "Agora não"; erros por campo vindos da API; toast "Perfil atualizado."). Na 2a, o rodapé dos detalhes fica vazio. Testes: CA3 (salvar e voltar), erro por campo, sair | `M/src/app/(app)/{trampos/[id],servicos/[id],perfis/[contaId],perfil/editar}.tsx`, `M/src/app/(app)/(abas)/perfil.tsx`, `M/src/testes/rotas/detalhes-e-perfil.test.tsx` | base + `jest src/testes/rotas/detalhes-e-perfil` | dev | E | não | 1, 3, 14, 16 |
| 13 | Varredura do CA15 e docs. O teste espiona todos os métodos de `console` durante cadastro duplicado, senha errada, 401, 500 e queda de rede, e falha se aparecer o e-mail, a senha, o nome ou o token. Outro teste lê `M/package.json` e falha se houver `async-storage`, `sentry`, `bugsnag`, `firebase` ou `analytics`. O README ganha a seção do app (rodar no Expo Go, `.env`, verificação) | `M/src/testes/sem-dado-pessoal.test.tsx`, `README.md` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | F | **sim** (logs, dado pessoal) | 14, 15 |

Ordem dos grupos: A → B (2, 3 e 4) → C (5, 6 e 7) → D (8 e 9) → E (10, 11 e 12) → F.
- Nenhum arquivo se repete dentro de um grupo:
  - `app.json` só nas etapas 1 e 3;
  - `_layout.tsx` raiz e `(publico)/entrada.tsx` só nas etapas 1 e 10;
  - `(abas)/_layout.tsx` declara a tela `perfil`, mas o arquivo é da etapa 12;
  - os testes de rota usam `renderRouter` com mapa próprio, então não dependem dos arquivos das outras etapas do grupo E.
- Cada `dev` em paralelo roda só os próprios testes. A etapa 6 depende do `pt-BR.ts` (etapa 2, grupo B), e as telas (etapa 9) dependem de `tipos.ts` (etapa 4) e dos componentes (etapa 7).
- **Como o dono vê o app:** `docker compose up -d banco && pnpm --filter api migrar && pnpm --filter api semear && pnpm --filter api dev`. Depois, `apps/mobile/.env` com o IP da máquina na rede local, `pnpm --filter mobile start` e o QR code lido no **Expo Go** (SDK 58) com o celular na mesma rede e a porta 3000 liberada no firewall.
- O `dev` não precisa de emulador: Jest, typecheck, lint e `expo export` bastam.

## Pontos para o seguranca
- Token:
  - só no `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), atrás da porta;
  - nunca em estado persistido, URL, log, mensagem de erro ou parâmetro de rota;
  - sem AsyncStorage, que o teste da etapa 13 barra.
- 401: só com token enviado e fora de `/sessoes` e `/contas`. Ao expirar, apaga o token e limpa o cache, para não mostrar dados de quem saiu. A rota de retorno fica só na memória e leva apenas ids.
- Logout: revoga no servidor (`DELETE /sessoes`) e, mesmo com falha de rede, apaga o token e o cache locais.
- CA15 no cliente:
  - `noConsole` como erro no Biome;
  - `ErroDaApi` não guarda corpo, URL com query nem dado digitado;
  - sem crash report nem telemetria;
  - rascunhos e senha não vão para o disco;
  - a senha é limpa depois do envio.
- Entrada:
  - ids de deep link (`trampoja://`) e de rota tratados como não confiáveis e codificados na URL;
  - `texto` da busca limitado a 100 caracteres;
  - o guarda de rota não substitui a API, que continua exigindo token.
- Transporte: HTTP só em `__DEV__` na rede local; fora disso, `https` obrigatório (`config.ts`). O `EXPO_PUBLIC_*` vai embutido no bundle, então nada secreto entra ali.

## Riscos e como reverter
- **Versões e compatibilidade (não verificado):**
  - TypeScript 7 com `expo/tsconfig.base`, o RNTL 14 com `test-renderer` e o `renderRouter` do `expo-router/testing-library` no SDK 58 são confirmados pela etapa 1 (um teste de rota mínimo) e pela etapa 4.
  - Se o TS 7 falhar, o `dev` fixa no app a versão de TypeScript que o `expo install --check` aceitar e relata.
  - Para reverter, basta trocar a versão no `M/package.json`.
- **Metro com pnpm isolado:** se o Metro não resolver os módulos, use `nodeLinker: hoisted` no `pnpm-workspace.yaml`. Isso muda a instalação da API também, então rode a suíte inteira. Para reverter, remova a linha. Se o `pnpm install` bloquear o script de build de algum pacote do Expo, acrescente esse pacote ao `allowBuilds` (`pnpm-workspace.yaml:3-4`) e registre qual foi no relatório.
- **Expo Go:** a loja só traz a versão do SDK mais recente; se o SDK subir, o dono precisa de um development build (EAS, um serviço externo, que vira pergunta).
- **Rede local:** o firewall ou o roteador podem bloquear a porta 3000. O README documenta isso. O túnel do Expo não resolve, porque só expõe o Metro.
- **Ícone em raster:** a imagem perde qualidade se ampliada. O script só reduz e, quando chegar o vetor, basta rodá-lo de novo.
- Não há migração nem mudança na API. Para reverter a 2a, basta apagar `apps/mobile` e restaurar os scripts da raiz, o `biome.json` e o `.gitignore`.

## Perguntas em aberto e premissas adotadas
Para o dono:
1. **Aprovar `@tanstack/react-query` 5.104.5?** É a recomendação. Se a resposta for não, a etapa 8 vira `src/estado/consultas/consulta.ts`, com `useConsulta(chave, fn)` e `useConsultaPaginada`, um `Map` como cache e invalidação manual. A etapa 5 perde o `QueryClient`.
2. A fonte do protótipo e o estilo de ícones. Enquanto não vierem, ficam a fonte do sistema e o Ionicons (spec, perguntas 1 e 2).
3. A contagem "{n} resultados" conta só o que já carregou, com "+" se houver mais. Um total exato exigiria mudar a API; a proposta é aceitar assim.
4. O vetor original da logo (decisão já registrada).

Premissas:
- O guarda de rota segue a D8: sem conta, nada além de entrada, login e cadastro.
- A cidade é texto livre (brief).
- A orientação é `default`, porque a spec pede retrato e paisagem utilizáveis.
- Fica fora o tema escuro.

## Entrega 2b (escopo para o próximo plano, `mvp-trampo-ja-app-2b`)
- **Telas e CAs:** publicar trampo e ofertar serviço (CA4, CA5, CA6, `perfil_incompleto`); a folha Candidatar-se e o rodapé do detalhe por situação (CA8, CA9, CA11); minhas candidaturas e candidaturas recebidas, com o aceite (CA10); conversas (CA12, CA13); meus trampos e meus serviços; abas Publicar e Conversas e os atalhos do Início. Ao fim, o CA16 fecha.
- **Lacunas da API e proposta:**
  - **"Quem sou eu":** a API não devolve o id da conta. Para saber se a pessoa é autora, o app compara com `GET /trampos/meus` e `/servicos/meus`; para separar as próprias mensagens, usa `autorId !== outroUsuarioId`. Não precisa mudar a API.
  - **Nomes nas candidaturas e nas conversas:** só há `freelancerId` e `outroUsuarioId`. A proposta é buscar `GET /perfis/:id` com cache por id, já que as listas do MVP são curtas. Se isso pesar, entra `GET /perfis?ids=` em lote na API, num grupo separado e marcado como sensível (dado pessoal).
  - **Mensagens:** o app pagina com `depoisDe` até o fim e faz polling com `depoisDe=<última>`. Uma paginação "últimas N" só entra se as conversas ficarem longas.
  - **"Conversar" no detalhe do serviço:** o app não tem como saber de antemão se há vínculo. A proposta é tentar `POST /conversas` e, no 403 `sem_vinculo`, mostrar o texto do CA13 e desabilitar o botão.

## ADR
**ADR-002: arquitetura do app mobile** (proposto)
- **Contexto:**
  - O app precisa seguir a fronteira do CLAUDE.md, em que o designer não toca a regra de negócio.
  - Rede instável.
  - Token sensível.
  - Testes sem emulador.
- **Decisão:**
  - Rotas do Expo Router como contêineres (dev) e telas e componentes por props (designer).
  - Cliente HTTP próprio com `fetch` injetável.
  - Sessão atrás da porta `ArmazenamentoDeToken` (`expo-secure-store`).
  - Estado de servidor com TanStack Query, se aprovado.
  - Validação e formatação puras em `src/estado/`.
  - Sem telemetria.
- **Consequências:**
  - O designer muda o visual sem tocar em dados.
  - A tela não testa fluxo, e o fluxo é testado na rota com `renderRouter` e o fake de `fetch`.
  - Tela nova exige dois passos: a tela primeiro e o contêiner depois.

## Texto para o CLAUDE.md (o lead preenche depois da aprovação)
```
- **Camadas e pastas (app):** `apps/mobile/src/app/` rotas = contêineres (dev; sem testes dentro); `src/telas/` e `src/componentes/` apresentacionais por props (designer); `src/api/` e `src/estado/` regra de negócio (designer não toca); `src/testes/` apoio e testes de rota.
- **Verificação (app):** `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, `pnpm --filter mobile test` (jest-expo + Testing Library, sem emulador), um arquivo: `pnpm --filter mobile exec jest <caminho>`, build: `pnpm --filter mobile build` (`expo export` Android). Na raiz, `pnpm typecheck|lint|test` rodam API e app.
- **Dados de teste (app):** testes usam o fake de `fetch` (`apps/mobile/src/testes/fetch-falso.ts`) e o armazenamento de token em memória; nenhum serviço externo. Para ver no celular: API com `semear` + `pnpm --filter api dev`, `apps/mobile/.env` com `EXPO_PUBLIC_API_URL=http://<IP-local>:3000`, `pnpm --filter mobile start` e Expo Go (SDK 58).
- **Segredo e dado pessoal (app):** token só no `expo-secure-store`; `console` proibido em `apps/mobile` (Biome `noConsole`); sem telemetria.
```
