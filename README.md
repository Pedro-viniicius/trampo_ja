# Trampo Já

App mobile que conecta freelancers e empregadores. A visão do produto está em `docs/produto/visao.md`.

Monorepo pnpm (Node 22, TypeScript estrito). A API fica em `apps/api` e o app mobile (Expo SDK 57) em `apps/mobile`.

## Comandos

Na raiz:

```bash
pnpm install          # instala as dependências
pnpm typecheck        # tsc --noEmit
pnpm lint             # Biome
pnpm test             # testes de unidade e BDD (sem banco) da API e testes do app
pnpm test:integracao  # testes de integração e ponta a ponta (exigem o Postgres de teste)
```

Um arquivo de teste isolado: `pnpm --filter api exec vitest run <caminho>`. Para um arquivo de integração, acrescente
`--config vitest.integracao.config.ts`.

## Banco local (PostgreSQL 16 em Docker)

O `docker-compose.yml` fica na raiz e cria os bancos `trampoja` (desenvolvimento) e `trampoja_teste` (testes de
integração).

```bash
docker compose up -d banco                    # sobe o Postgres em 127.0.0.1:5432
cp apps/api/.env.example apps/api/.env        # uma vez: DATABASE_URL, DATABASE_URL_TESTE, PORT e TRUST_PROXY locais
pnpm --filter api migrar                      # aplica as migrações no banco de desenvolvimento
pnpm --filter api migrar -- --teste           # o mesmo no banco de teste (o test:integracao já faz isso)
pnpm --filter api migrar -- --baixar          # reverte a última migração (só remove tabela vazia)
pnpm test:integracao                          # migra o banco de teste e roda os testes de integração
docker compose down -v                        # apaga o banco local (volume) para recriar do zero
```

Variáveis já exportadas no shell têm prioridade sobre o `apps/api/.env`. As variáveis estão documentadas em
`apps/api/.env.example`. As migrações seguem as regras de `apps/api/migracoes/README.md`.

## Rodar a API

```bash
pnpm --filter api dev      # tsx em modo watch, lê apps/api/.env
pnpm --filter api build    # compila para apps/api/dist
pnpm --filter api start    # roda o build (node dist/src/servidor.js)
```

A porta vem de `PORT` (padrão 3000) e o servidor escuta em `0.0.0.0`. Em `SIGINT`/`SIGTERM`, ele para de aceitar
requisições, termina as que estão em andamento e fecha a conexão com o banco. A API não aplica migrações sozinha:
rode `pnpm --filter api migrar` antes.

## Semente (dados fictícios)

```bash
pnpm --filter api semear                # banco de desenvolvimento
pnpm --filter api semear -- --teste     # banco de teste
```

Aplica as migrações pendentes e cria, pela própria API (com as mesmas validações de uma requisição real):

- 4 contas com perfil completo (nome, cidade e de 2 a 3 habilidades, D9);
- 5 trampos de categorias e cidades variadas, um com prazo e um em andamento;
- 4 serviços, um sem cidade;
- 3 candidaturas: uma aceita, uma recusada pelo aceite e uma pendente;
- 2 conversas com 5 mensagens.

Contas (todas com a senha de desenvolvimento **`Semente#2026`**):

| E-mail | Papel nos dados |
|---|---|
| `ana.empregadora@exemplo.test` | publica a pintura (em andamento) e a faxina; aceitou o Bruno |
| `bruno.freela@exemplo.test` | contratado na pintura; oferta pintura residencial |
| `carla.design@exemplo.test` | candidata ao logo do Diego; oferta identidade visual (sem cidade) e fotografia |
| `diego.aulas@exemplo.test` | publica o logo; candidatura recusada na pintura; oferta aulas |

A senha só serve para a máquina local. É idempotente: se a conta da Ana já existir, o script avisa "Semente já
aplicada" e sai sem criar nada. Se uma execução parar no meio, apague os dados (`docker compose down -v`, depois
`docker compose up -d banco` e `migrar`) e rode de novo. A saída mostra só contagens, nunca e-mails, tokens ou a URL
do banco.

## App mobile (`apps/mobile`)

Expo SDK 57 com Expo Router, React Native e TanStack Query. Os testes usam jest-expo e a Testing Library, sem
emulador nem serviço externo: a API é um `fetch` falso (`src/testes/fetch-falso.ts`) e o token fica num
armazenamento em memória.

### Ver no celular (Expo Go)

1. Suba a API com dados: `docker compose up -d banco`, `pnpm --filter api migrar`, `pnpm --filter api semear` e
   `pnpm --filter api dev`.
2. Uma vez: `cp apps/mobile/.env.example apps/mobile/.env` e troque o IP de `EXPO_PUBLIC_API_URL` pelo IP da
   máquina na rede local (ex.: `http://192.168.0.10:3000`). `localhost` não serve: no celular ele aponta para o
   próprio celular.
3. `pnpm --filter mobile start` e leia o QR code com o **Expo Go**, com o celular na mesma rede Wi-Fi.

Cuidados:

- **`.env` obrigatório.** Sem `EXPO_PUBLIC_API_URL`, ou com valor inválido, a raiz do app lança erro no primeiro
  render (a mensagem diz o que falta, sem repetir o valor). Fora de desenvolvimento (`__DEV__` falso) o app só
  aceita `https://`. O valor vai embutido no bundle: nada secreto entra ali.
- **Portas e firewall.** O celular precisa alcançar a porta 8081 (Metro, que entrega o bundle) e a porta 3000 (API)
  da máquina. Libere as duas no firewall; redes de visitante e alguns roteadores isolam os aparelhos. O túnel do
  Expo (`--tunnel`) não resolve, porque expõe só o Metro, não a API.
- **`TRUST_PROXY` não se aplica ao app.** É variável da API (`apps/api/.env`) e só importa com proxy reverso na
  frente dela. Com o celular falando direto com a API na rede local, deixe-a vazia.
- **Expo Go só abre o SDK 57.** O app está no SDK 57 porque o Expo Go da App Store ainda não abre o 58; quando a
  loja suportar o 58, o app sobe de versão (decisão D16). Se a loja passar do SDK do app, ele precisa de um
  development build.

### Verificação

```bash
pnpm --filter mobile typecheck   # tsc --noEmit
pnpm --filter mobile lint        # Biome (inclui noConsole como erro)
pnpm --filter mobile test        # jest-expo + Testing Library
pnpm --filter mobile build       # expo export para Android em apps/mobile/dist (apague depois)
```

Um arquivo de teste isolado: `pnpm --filter mobile exec jest <caminho>`. Na raiz, `pnpm typecheck|lint|test` rodam
a API e o app. No fim do `build`, o CLI pode imprimir "Something prevented Expo from exiting"; não é falha (sai com
código 0).

### Estrutura

| Pasta (`apps/mobile/src/`) | O que fica | Quem mexe |
|---|---|---|
| `app/` | rotas do Expo Router = contêineres: dados, estado, navegação e tradução de erro. Todo arquivo aqui vira rota, então apoio e testes ficam fora | `dev` |
| `api/` | cliente HTTP, configuração da URL, erros e tipos da API | `dev` (regra de negócio) |
| `estado/` | sessão, consultas do TanStack, validação, tradução de erro em chave de texto | `dev` (regra de negócio) |
| `telas/` | telas apresentacionais, só por props | `designer` |
| `componentes/` | componentes visuais e opções de navegação | `designer` |
| `tema/` e `textos/` | tokens visuais e todos os textos da interface (`textos/pt-BR.ts`) | `designer` |
| `testes/` | apoio dos testes (fetch falso, provedores, `renderizarRotas`) e testes de rota | `dev` |

O `designer` não toca `api/` nem `estado/`; o `dev` não põe texto de interface fora de `textos/pt-BR.ts`.

### Rotas e telas

| Rota | Arquivo (`src/app/`) | Tela |
|---|---|---|
| `/entrada`, `/entrar`, `/cadastro` | `(publico)/` | entrada, login e cadastro (sem sessão) |
| `/` | `(app)/(abas)/index.tsx` | aba Início: saudação, recentes e atalhos (Publicar trampo, Ofertar serviço, Minhas candidaturas) |
| `/buscar` | `(app)/(abas)/buscar.tsx` | aba Buscar |
| `/publicar` | `(app)/(abas)/publicar.tsx` | aba Publicar: escolha entre publicar trampo e ofertar serviço |
| `/conversas` | `(app)/(abas)/conversas.tsx` | aba Conversas: nome do outro, prévia de uma linha e hora, última atividade primeiro |
| `/perfil` | `(app)/(abas)/perfil.tsx` | aba Perfil, com os atalhos Minhas candidaturas, Meus trampos e Meus serviços |
| `/perfil/editar` | `(app)/perfil/editar.tsx` | editar ou completar o perfil |
| `/perfis/:contaId` | `(app)/perfis/[contaId].tsx` | perfil público |
| `/trampos/novo` | `(app)/trampos/novo.tsx` | formulário Publicar trampo (a confirmação é estado da tela) |
| `/servicos/novo` | `(app)/servicos/novo.tsx` | formulário Ofertar serviço |
| `/trampos/:id` | `(app)/trampos/[id].tsx` | detalhe do trampo; o rodapé mostra Candidatar-se (folha), o selo da candidatura com Conversar ou Ver candidaturas (n) |
| `/servicos/:id` | `(app)/servicos/[id].tsx` | detalhe do serviço, com Conversar para quem não é o autor |
| `/candidaturas` | `(app)/candidaturas/index.tsx` | Minhas candidaturas |
| `/candidaturas/:trampoId` | `(app)/candidaturas/[trampoId].tsx` | Candidaturas recebidas de um trampo, com o aceite e Conversar em cada candidatura (só quem publicou vê; para os demais a API responde 404) |
| `/conversas/:id` | `(app)/conversas/[id].tsx` | a conversa: mensagens, campo e Enviar |
| `/meus-anuncios?tipo=trampo\|servico` | `(app)/meus-anuncios.tsx` | Meus trampos e Meus serviços (valor inválido vira `trampo`) |

As abas são Início, Buscar, Publicar, Conversas e Perfil; os formulários, as listas e a conversa ficam na pilha
`(app)`, sem a barra de abas. Os parâmetros de rota levam só ids e o `tipo`: título, mensagem, valor e nome nunca vão
na URL.

Conversar (D22, D23) aparece em três pontos de entrada: no rodapé do detalhe do trampo, para quem se candidatou
(com o autor); no detalhe do serviço, para quem não é o autor; e em cada candidatura recebida, em qualquer status
(com quem se candidatou). O toque faz `POST /conversas` e abre `/conversas/:id`. Quem decide o vínculo é a API:
o 403 `sem_vinculo` mostra "Você só pode conversar com quem tem uma candidatura ou contratação com você." e o 409
`conversa_consigo_mesmo` mostra o seu texto; nos dois casos, o "Conversar" daquela conta fica desabilitado, com o
texto, até a tela ser aberta outra vez. Sem conexão, o botão fica desabilitado com o motivo.

Na conversa, as mensagens chegam por consulta periódica (D20): a cada 5 s, até 60 s depois de falhas seguidas de
rede ou 5xx, e param no 404 (ou outro 4xx) e no 401. A lista da aba Conversas recarrega a cada 30 s, só com a aba
focada.

Link que chega do sistema (deep link) passa antes por `src/app/+native-intent.tsx`: acima de 2 KB ou com escape `%`
malformado, o app abre o Início em vez de tentar interpretá-lo.

### Dados pessoais no app (CA15)

- O token só existe no `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), atrás da porta
  `ArmazenamentoDeToken`. Nunca vai para estado persistido, URL, parâmetro de rota, log ou mensagem de erro. Não há
  AsyncStorage.
- `console` é proibido em `apps/mobile` (regra `noConsole` do Biome como erro). Erros da API viram chaves de
  `textos.erros`; `ErroDaApi` não guarda corpo, URL com query nem o que a pessoa digitou.
- Sem telemetria nem crash report no app. `src/testes/sem-dado-pessoal.test.tsx` percorre os fluxos com espiões
  em todos os métodos do `console`:
  - 2a: cadastro, perfil, busca, detalhe, 401, senha errada, cadastro duplicado, 429 e queda de rede;
  - 2b, com duas contas: publicar trampo (400 por campo e 201), ofertar serviço (queda de rede no envio e 201),
    Meus trampos e Meus serviços, candidatar-se (409 `autor_nao_pode_candidatar`, `perfil_incompleto`,
    `candidatura_duplicada`, queda de rede e 201), Minhas candidaturas, 401 com volta ao login, Candidaturas
    recebidas com o nome dos candidatos e o aceite (200, `trampo_nao_aberto` e `conflito_de_versao`);
  - 2c, com as mesmas duas contas: a lista de conversas, abrir conversa (200, 403 `sem_vinculo` e 409
    `conversa_consigo_mesmo`), enviar mensagem (201, queda de rede com novo toque e 404), a consulta periódica
    com 500 e com 401, e a conversa vista pela outra conta depois do login.

  O teste falha se aparecer, em texto puro, em maiúsculas ou codificado para URL, e-mail, senha, nome, cidade,
  habilidade, texto da busca, token, título, descrição, cidade do anúncio, mensagem da candidatura, nome de
  candidato, valor digitado (como `9.876,54`, e também em centavos), texto de mensagem enviada ou recebida, prévia
  de conversa ou nome de quem está do outro lado. Na jornada 2c, essas sentinelas também não podem aparecer em
  `testID`, em chave de lista, em propriedade da árvore renderizada que não seja texto da tela, na URL nem nos
  parâmetros de rota, na URL das requisições nem em erro guardado pelo cache de consultas ou de mutações. O mesmo
  arquivo falha se
  `apps/mobile/package.json` ganhar dependência de AsyncStorage, Sentry, Bugsnag, Firebase, analytics, Segment,
  Amplitude ou Mixpanel.
- O que fica em memória nos fluxos da 2b (nada vai para disco):
  - **Rascunhos.** Título, descrição, categoria, cidade, valor e prazo de Publicar trampo e Ofertar serviço, e a
    mensagem e o valor proposto da folha Candidatar-se, ficam só no estado do componente da tela. Somem quando a
    tela fecha, e também ao sair da conta ou quando a sessão expira, porque o 401 leva ao login.
  - **Envios.** O que foi enviado (o trampo, o serviço, a candidatura ou o id do aceite) fica como `variables` da
    mutação no cache de mutações do TanStack. Dura enquanto a tela está aberta e sai assim que ela fecha
    (`gcTime: 0`).
  - **Consultas.** O cache de consultas do TanStack guarda os dados frescos por 30 s e os remove 5 min depois que
    nenhuma tela os usa. Entram nele:
    - as listas "minhas": Meus trampos (`/trampos/meus`), Meus serviços (`/servicos/meus`) e Minhas candidaturas
      (`/candidaturas/minhas`, com a mensagem e o valor da própria candidatura);
    - as candidaturas recebidas (`/trampos/:id/candidaturas`), com a mensagem e o valor de terceiros;
    - os nomes de terceiros, vindos de `GET /perfis/:id` (mesma chave do perfil público). Ficam no cache por
      5 min e nunca entram em texto de erro; perfil 404 aparece como "Perfil indisponível".
  - **Saída e expiração.** Sair da conta ou ter a sessão expirada limpa os dois caches (`queryClient.clear()`).
    Uma mutação que termine depois disso não grava nada no cache novo (`Sessao.geracao()`).
- O que fica em memória nas conversas (2c; nada vai para disco):
  - **Mensagens.** A lista de conversas (com a prévia da última mensagem) e as mensagens de cada conversa ficam no
    cache de consultas do TanStack, em memória, com teto de 500 mensagens por conversa (as mais antigas saem do
    cache; D24). Saem 5 min depois que nenhuma tela as usa e são limpas ao sair da conta ou quando a sessão expira
    (`queryClient.clear()`; uma busca que ainda estava no ar é descartada).
  - **Pendentes e rascunho.** A mensagem em envio (relógio ou "Não enviada") e o texto do campo ficam só no estado
    do componente da tela da conversa e somem quando ela fecha. O envio não usa fila: sem conexão, nada sai, e o
    reenvio só acontece por toque, depois de buscar as mensagens novas. O texto enviado fica como `variables` da
    mutação só enquanto a tela está aberta (`gcTime: 0`).
  - **Consulta periódica.** As mensagens só são buscadas com a tela da conversa focada e o app ativo: param com o
    app em segundo plano, sem rede, com outra tela por cima, no 404 e no 401. A lista recarrega por tempo só com a
    aba Conversas focada; com a conversa aberta, não.
  - **Rota.** `/conversas/:id` leva só o `conversaId`. O id da outra conta vai só no corpo de `POST /conversas`, e
    o texto da mensagem, só no corpo de `POST /conversas/:id/mensagens`.
- Opcional: `EXPO_NO_TELEMETRY=1` no shell desliga a coleta de uso do CLI do Expo (`expo start`, `expo export`).
  Isso vale para a máquina de desenvolvimento; o app em si não envia nada.

## Arquitetura da API

Monólito modular hexagonal com núcleo DDD. Cada módulo é um bounded context em `apps/api/src/modulos/<modulo>/`:

| Módulo | Responsabilidade | Tabelas |
|---|---|---|
| `contas` | cadastro, credencial (scrypt) e sessões (token opaco) | `contas`, `sessoes` |
| `perfis` | nome, cidade, descrição e habilidades; diz se o perfil está completo (D9) | `perfis` |
| `trampos` | agregado `Trampo` com as candidaturas; aceite com trava otimista | `trampos`, `candidaturas` |
| `servicos` | ofertas de serviço dos freelancers | `servicos` |
| `conversas` | conversas entre quem tem candidatura em comum e as mensagens | `conversas`, `mensagens` |
| `busca` | só leitura: junta trampos e serviços, mais recentes primeiro, com cursor | nenhuma |

Camadas de cada módulo:

- `dominio/`: entidades, objetos de valor, erros e portas. Sem import de `fastify`, `kysely` ou `pg`.
- `aplicacao/`: casos de uso e os testes BDD (`*.bdd.test.ts`, cenários nomeados pelo CA).
- `adaptadores/http` (rotas Fastify), `adaptadores/postgres` (Kysely) e `adaptadores/memoria` (fakes para os testes).
- `index.ts`: a fachada. É o único arquivo que outro módulo ou a composição pode importar.

Regras que ligam os módulos:

- **Composição:** `src/composicao.ts` (`montarAplicacao`) é o único lugar que conhece todos os módulos. Ela liga
  `perfis.perfilEstaCompleto` a `trampos` e `servicos` (D9), `trampos.existeVinculoEntre` a `conversas` (CA13),
  as buscas de `trampos` e `servicos` a `busca` e `contas.validarSessao` ao hook de autenticação. O entrypoint é
  `src/servidor.ts`.
- **Banco:** cada módulo é dono das suas tabelas e recebe uma visão `Kysely<TabelasDoModulo>`. Não há FK entre
  módulos: a referência é só pelo id (FK só dentro do módulo).
- **Erros por código:** a API devolve códigos, nunca texto com valor digitado. O app traduz os códigos.
- **Compartilhado:** `src/compartilhado/dominio` (erros, categorias, relógio, normalização de texto),
  `src/compartilhado/http` (servidor, logger, erros, autenticação) e `src/compartilhado/banco` (conexão, migrador).

### Módulo novo

1. Crie `src/modulos/<modulo>/` com `dominio/`, `aplicacao/`, `adaptadores/{http,postgres,memoria}/` e `index.ts`.
2. A migração vai em `apps/api/migracoes/NNNN_<modulo>.ts` e cria só as tabelas do módulo, sem FK para outro
   módulo.
3. Precisa de outro módulo? Declare uma porta no seu `dominio/portas.ts` e deixe a composição ligá-la à fachada
   do outro. Nunca importe de dentro de outro módulo.
4. Registre as rotas em `src/composicao.ts`, com `exigirAutenticacao` no `onRequest`. O teste
   `test/e2e/autenticacao.integracao.test.ts` falha se uma rota nova responder sem token.
5. `src/compartilhado/arquitetura.test.ts` (roda no `pnpm test`) falha se `dominio/` ou `aplicacao/` importar
   `fastify`, `kysely` ou `pg`, ou se um módulo importar algo de outro que não seja o `index.ts`.

## API HTTP

JSON em todas as rotas. Valores em centavos (inteiros), datas em ISO 8601 e prazo como `YYYY-MM-DD` (anos de 1900
a 9999). Textos são medidos em caracteres (pontos de código: um emoji conta 1), inclusive a senha; texto com o
caractere nulo (`\u0000`) é recusado com 400 `invalido` no campo. Chave fora da lista no corpo dá 400
`dados_invalidos`.

### Autenticação

`POST /contas` e `POST /sessoes` devolvem `{"token":"..."}`. As demais rotas exigem o cabeçalho
`Authorization: Bearer <token>`. Sem token, com token inválido, expirado ou revogado, a resposta é
`401 {"erro":"nao_autenticado"}` (com `WWW-Authenticate: Bearer`). A sessão dura 30 dias; `DELETE /sessoes` revoga
só a sessão do token enviado. O banco guarda só o SHA-256 do token.

### Formato de erro

```json
{"erro":"dados_invalidos","campos":[{"campo":"titulo","motivo":"tamanho"}]}
```

`campos` só aparece em `dados_invalidos`; `motivo` é `obrigatorio`, `tamanho` ou `invalido`. Nenhum erro traz o
valor enviado. Códigos gerais:

| Status | `erro` | Quando |
|---|---|---|
| 400 | `dados_invalidos` | campo inválido, chave extra no corpo, tipo errado |
| 400 | `requisicao_invalida` | JSON malformado |
| 401 | `nao_autenticado` | sem sessão válida |
| 404 | `nao_encontrado` | rota inexistente, recurso inexistente ou de outra pessoa |
| 409 | código da regra | regra de domínio (ex.: `perfil_incompleto`, `email_em_uso`) |
| 413 | `corpo_grande_demais` | corpo acima do limite do Fastify (1 MiB) |
| 415 | `tipo_nao_suportado` | `Content-Type` que não é JSON nem `text/plain` (corpo `text/plain` dá 400 `dados_invalidos`) |
| 429 | `muitas_requisicoes` | rate limit de cadastro ou entrada (por IP ou, na entrada, por e-mail) |
| 500 | `interno` | falha inesperada (o detalhe fica só no log, sem dado pessoal) |

### Endpoints

Contas (públicas, exceto `DELETE /sessoes`):

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /contas` | `{email, senha}` | 201 `{token}` | 400; 409 `email_em_uso` |
| `POST /sessoes` | `{email, senha}` | 200 `{token}` | 400; 401 `credenciais_invalidas` (genérico) |
| `DELETE /sessoes` | — | 204 | 401 |

Perfis:

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `GET /perfis/eu` | — | 200 `{nome, cidade, descricao, habilidades, completo}` | 404 sem perfil |
| `PUT /perfis/eu` | `{nome, cidade, descricao?, habilidades}` | 200, mesmo formato | 400 |
| `GET /perfis/:contaId` | — | 200 `{contaId, nome, cidade, descricao, habilidades}` | 404 inexistente ou incompleto |

Trampos e candidaturas:

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /trampos` | `{titulo, descricao, categoria, cidade, valorCentavos, prazo?}` | 201 `{id, status:"aberto"}` | 400; 409 `perfil_incompleto` |
| `GET /trampos/meus` | — | 200 lista de trampos | — |
| `GET /trampos/:id` | — | 200 trampo (com `autorId` e `status`) | 404 |
| `POST /trampos/:id/candidaturas` | `{mensagem, valorPropostoCentavos}` | 201 `{id, status:"pendente"}` | 400; 404; 409 (abaixo) |
| `GET /trampos/:id/candidaturas` | — | 200 lista (só o autor) | 404 para quem não é o autor |
| `POST /trampos/:id/candidaturas/:cid/aceitar` | — | 200 `{status:"aceita"}` | 404; 409 (abaixo) |
| `GET /candidaturas/minhas` | — | 200 lista com `trampoId` e `status` | — |

Códigos 409 de trampos: `perfil_incompleto`, `autor_nao_pode_candidatar`, `candidatura_duplicada`,
`trampo_nao_aberto`, `candidatura_nao_pendente` e `conflito_de_versao`. Aceitar põe o trampo `em_andamento` e
recusa as demais candidaturas pendentes. Candidaturas e aceites simultâneos no mesmo trampo não dão erro: quem perde
a trava otimista relê o trampo e tenta de novo (até 10 vezes), então candidaturas de freelancers diferentes são
todas gravadas, o segundo toque do mesmo freelancer vira `candidatura_duplicada` e o aceite que perde para outro
aceite vira `trampo_nao_aberto`. `conflito_de_versao` só sai se o trampo mudar a cada uma das 10 tentativas (mais de
10 gravações simultâneas no mesmo trampo); o app pode repetir a ação. Os ids na URL não distinguem maiúsculas.

Serviços:

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /servicos` | `{titulo, descricao, categoria, cidade?, precoBaseCentavos}` | 201 `{id, status:"ativo"}` | 400; 409 `perfil_incompleto` |
| `GET /servicos/meus` | — | 200 lista | — |
| `GET /servicos/:id` | — | 200 serviço (`cidade` pode ser `null`) | 404 |

Busca:

| Rota | Consulta | Sucesso | Erros |
|---|---|---|---|
| `GET /busca` | `texto, categoria, cidade, tipo, antesDe, limite` | 200 `{itens, proximoCursor}` | 400 |
| `GET /categorias` | — | 200 `[{id, rotulo}]` (10 categorias, D5) | — |

Todos os filtros são opcionais e combinam com E. `tipo` é `trampos`, `servicos` ou `todos` (padrão); `limite` vai
de 1 a 49 (padrão 20); `texto` tem até 100 caracteres. A próxima página usa `antesDe=<proximoCursor>`. Só trampos
abertos aparecem; filtrar por cidade não traz serviço sem cidade (D7). Cada item traz `tipo`, `id`, `autorId`,
`titulo`, `categoria`, `cidade`, `criadoEm` e `valorCentavos` (trampo) ou `precoBaseCentavos` (serviço).

Conversas:

| Rota | Corpo ou consulta | Sucesso | Erros |
|---|---|---|---|
| `POST /conversas` | `{outroUsuarioId}` | 201 `{conversaId}` (nova) ou 200 (já existia) | 400; 403 `sem_vinculo`; 409 `conversa_consigo_mesmo` |
| `GET /conversas` | — | 200 `[{conversaId, outroUsuarioId, criadaEm, ultimaMensagem}]` | — |
| `GET /conversas/:id/mensagens` | `?depoisDe=<id da mensagem>` | 200 até 50, na ordem de envio | 400; 404 |
| `POST /conversas/:id/mensagens` | `{texto}` | 201 `{id, enviadaEm}` | 400 texto vazio; 404 |

Só abre conversa quem tem candidatura em comum, em qualquer estado (CA13). Quem não participa da conversa recebe
404, não 403, para não confirmar que ela existe.

### Rate limit (D2)

`POST /contas` e `POST /sessoes` aceitam até 10 requisições por minuto por IP, com contador separado por rota
(constante `LIMITE_PADRAO_DAS_ROTAS_PUBLICAS` em `apps/api/src/composicao.ts`). `POST /sessoes` tem ainda um
segundo limite, por conta: 10 tentativas por 15 minutos no mesmo e-mail, venham de qualquer IP
(`LIMITE_PADRAO_DE_ENTRADAS_POR_EMAIL`). O contador guarda só o SHA-256 do e-mail normalizado (aparado e em
minúsculas), nunca o e-mail; corpo sem e-mail conta pelo IP. Acima de qualquer limite, 429 `muitas_requisicoes`.
As rotas autenticadas não têm limite.

O IP vem da conexão, a menos que `TRUST_PROXY` (em `apps/api/.env`) diga quais proxies são confiáveis. Atrás de
proxy reverso ou balanceador, sem isso todos os clientes chegam com o IP do proxy e dividem o mesmo limite: liste
os IPs/CIDRs do proxy separados por vírgula (ex.: `TRUST_PROXY=10.0.0.1,10.0.1.0/24`). `TRUST_PROXY=true` confia em
qualquer `X-Forwarded-For` e só é seguro quando nada além do proxy alcança a porta da API; com a API exposta
direto, qualquer cliente forjaria o IP e escaparia do limite.

## Dados pessoais (LGPD) e logs

Dado pessoal fica em `contas.email`, em `perfis` (nome, cidade, descrição, habilidades), em `mensagens.texto`, em
`candidaturas.mensagem` e nos textos livres de `trampos` e `servicos`. O telefone não é coletado. A senha só existe
como hash scrypt; o token, só como SHA-256.

Regras (CA15):

- Nunca registre o corpo da requisição nem cabeçalhos. O Fastify não loga o corpo; mantenha assim.
- Use o logger de `criarLogger` (`src/compartilhado/http/logger.ts`), nunca `logger: true`. Ele tem três defesas:
  `redact` troca por `[redigido]` as chaves de `CHAVES_SENSIVEIS` (e-mail, senha, nome, telefone, token,
  authorization, cidade, descrição, habilidades, texto, mensagem, título) até 6 níveis de profundidade; o serializer
  de erro copia só tipo, código, mensagem e pilha e, para erros do banco, descarta também a mensagem (o `detail` do
  `pg` traz o valor da linha); o serializer da requisição registra o modelo da rota (ex.: `/perfis/:contaId`), sem
  os valores dos parâmetros nem a query string, e `/(rota inexistente)` quando nenhuma rota casa.
- Logue erro com `{ err }` e um texto fixo. Não monte a mensagem do log com valores do usuário, e não ponha dado
  pessoal no caminho da URL.
- Resposta de erro só leva código e nome de campo.
- Scripts e o servidor nunca imprimem a URL do banco (ela traz a senha) nem a mensagem do driver.

`test/e2e/logs-sem-dado-pessoal.integracao.test.ts` força os erros (cadastro duplicado, senha errada, token
inválido, validação, regras, JSON malformado, falha de banco) e varre o log inteiro atrás de dado pessoal e tokens.
Exclusão e exportação de conta ficam para antes da publicação nas lojas (D10).

## Documentos de produto

Em `docs/produto/`:

- `visao.md`: visão do produto;
- `decisoes.md`: decisões do dono (D1 a D19), que não se reabrem sem fato novo;
- `briefs/mvp-trampo-ja.md`: brief do MVP com os critérios de aceite (CA1 a CA16);
- `planos/mvp-trampo-ja.md`: plano técnico da entrega 1 (backend), com etapas, contratos e ADR;
- `specs/mvp-trampo-ja.md`: spec das telas do app (entrega 2);
- `planos/mvp-trampo-ja-app.md`: plano técnico da entrega 2a (app mobile);
- `planos/mvp-trampo-ja-app-2b.md`: plano técnico da entrega 2b (publicação, candidaturas e meus anúncios).
