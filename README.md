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
pnpm --filter api migrar -- --baixar          # reverte a última migração (aborta em vez de apagar dados)
pnpm test:integracao                          # migra o banco de teste e roda os testes de integração
docker compose down -v                        # apaga o banco local (volume) para recriar do zero
```

Banco local e banco remoto (D44): "local" quer dizer host `localhost`, IPv4 em `127.0.0.0/8`, `::1` ou socket Unix.
Local dispensa TLS. Qualquer outro host só é aceito com `sslmode=verify-full` na URL, que liga o TLS e confere o
certificado e o nome do servidor; sem isso, a API e os scripts recusam a partida com um erro que traz só o nome da
variável, nunca o valor. Se o certificado for de uma CA privada (comum em banco gerenciado), acrescente
`sslrootcert=<caminho do arquivo da CA no disco do servidor>`. `require`, `verify-ca` e `no-verify` não servem. Com
banco remoto, a API, o `migrar` e o `semear` também recusam a partida se `NODE_TLS_REJECT_UNAUTHORIZED=0` estiver no
ambiente, porque essa variável desliga a conferência do certificado no processo inteiro (o erro cita só o nome dela);
com banco local, ela não muda nada. Exemplo (valores fictícios):

```text
DATABASE_URL=postgres://usuario:senha@db.exemplo.com:5432/trampoja?sslmode=verify-full&sslrootcert=/caminho/ca.pem
```

Tempos do banco (D42): a API usa tempos fixos no código, sem variável de ambiente: conexão em 5 s
(`connectionTimeoutMillis`), consulta em 10 s (`statement_timeout`) e transação ociosa em 30 s
(`idle_in_transaction_session_timeout`). Uma consulta que passa de 10 s dá erro 500 em vez de travar o pedido. O
`migrar` roda sem `statement_timeout`, porque uma migração pode levar mais que isso. A URL não pode trazer parâmetros
de tempo (`statement_timeout` e parecidos): a API recusa a partida.

Variáveis já exportadas no shell têm prioridade sobre o `apps/api/.env`. As variáveis estão documentadas em
`apps/api/.env.example`. As migrações seguem as regras de `apps/api/migracoes/README.md`.

A `0006_anuncios` (L2) é a primeira que altera tabela em vez de criar: o `up` passa a aceitar o status `encerrado`
em `trampos` e cria `servicos.versao` (1 nas linhas que já existem). O `--baixar` dela trava `trampos` e, se houver
algum trampo encerrado, aborta sem mudar nada, com o código `trampos_encerrados` na saída: converter o status seria
decisão do dono, e não há script para isso. Sem trampo encerrado, restaura a regra antiga do status e remove
`servicos.versao`, que é só um contador. Depois de subir de novo, as versões recomeçam em 1, e um app que mande a
versão antiga recebe 409 `conflito_de_versao` e recarrega o anúncio.

A `0007_contas_excluidas` (L3, D40) só cria a tabela `contas_excluidas` (lápide da conta excluída: só o id e a data,
sem dado pessoal; ver "Limpeza periódica" em "Rodar a API"). Para reverter: volte o código, deixe a limpeza rodar uma
última vez (ou espere a lápide mais nova passar dos 10 min) e rode `pnpm --filter api migrar -- --baixar`. O `down`
só remove a tabela vazia: se ainda houver lápide, aborta sem mudar nada, com o código `tabela_nao_vazia`
na saída.

A `0008_tentativas_de_entrada` (L3, D31) cria a tabela `tentativas_de_entrada`: o teto de entrada de cada conta
(início da janela de 1 h e quantas tentativas caíram nela), sem e-mail nem IP, com FK para `contas` e `on delete
cascade` (a exclusão da conta apaga a linha junto). Ver "Rate limit" em "API". Para reverter: volte o código e rode
`pnpm --filter api migrar -- --baixar`. O `down` remove a tabela mesmo com linhas: ela só guarda contadores de
segurança que vencem em 1 h, nada que a pessoa forneceu (como o contador `servicos.versao` da `0006`). Perder os
contadores só recomeça a janela do teto de cada conta.

## Rodar a API

```bash
pnpm --filter api dev      # tsx em modo watch, lê apps/api/.env
pnpm --filter api build    # compila para apps/api/dist
pnpm --filter api start    # roda o build (node dist/src/servidor.js)
```

A porta vem de `PORT` (padrão 3000) e o servidor escuta em `0.0.0.0`. Em `SIGINT`/`SIGTERM`, ele para de aceitar
requisições, termina as que estão em andamento e fecha a conexão com o banco. A API não aplica migrações sozinha:
rode `pnpm --filter api migrar` antes.

**Limpeza periódica (D40, ADR-007).** O servidor agenda uma tarefa no próprio processo, sem cron: a primeira rodada
1 min depois de subir e as seguintes a cada 1 h. Cada rodada apaga as sessões expiradas, os contadores do teto de
entrada com a janela vencida (`tentativas_de_entrada`, D31) e, pela lápide
`contas_excluidas` (só id e data, migração `0007`), refaz a exclusão das contas excluídas há mais de 10 min, para
varrer o que uma escrita em voo durante a exclusão tenha gravado depois (não há FK entre módulos). Uma lápide vive de
10 a cerca de 70 min. A rodada pega as 100 lápides mais antigas; a lápide cuja exclusão falha espera 6 h na memória
do processo antes de uma nova tentativa (L4, S5, CA67), e as outras seguem na mesma rodada, então uma lápide que
sempre falha não segura a fila. Reiniciar o processo zera a espera e repete a tentativa, sem perda. A tarefa é
idempotente e roda em cada réplica. O log registra só o código do erro, nunca o id da conta. Órfãos anteriores à `0007` não são varridos, porque não têm lápide. Em `SIGINT`/`SIGTERM`, a próxima rodada
é cancelada e a que estiver em curso termina antes de a conexão com o banco fechar.

## Semente (dados fictícios)

```bash
pnpm --filter api semear                # banco de desenvolvimento
pnpm --filter api semear -- --teste     # banco de teste
pnpm --filter api semear -- --permitir-banco-remoto   # só se o banco for mesmo de outra máquina
```

A senha dos dados é pública, então o `semear` só roda em banco local (ver "Banco local" acima). Diante de um banco
que não seja local, ele recusa antes de abrir qualquer conexão e sai com código 2, a não ser que receba
`--permitir-banco-remoto`. O código 2 só aparece rodando dentro de `apps/api`; com `pnpm --filter`, o pnpm achata
qualquer falha em 1. A mensagem de recusa cita o nome da variável, nunca a URL. Com a flag, a URL ainda passa pelas
conferências de TLS de "Banco local" acima (`sslmode=verify-full`, sem `NODE_TLS_REJECT_UNAUTHORIZED=0`).

Aplica as migrações pendentes e cria, pela própria API (com as mesmas validações de uma requisição real):

- 4 contas com perfil completo (nome, cidade e de 2 a 3 habilidades, D9);
- 8 trampos de categorias e cidades variadas: 4 abertos (um com prazo), 1 em andamento e 3 encerrados;
- 4 serviços, um sem cidade;
- 6 candidaturas: quatro aceitas (a do trampo em andamento e as dos três encerrados), uma recusada pelo aceite e
  uma pendente;
- 2 conversas com 5 mensagens;
- 4 avaliações, todas em trampo encerrado e entre as duas partes da candidatura aceita (CA87): num trampo os dois
  lados avaliaram, nos outros dois só um, para o app mostrar "Avaliar" a quem falta;
- 3 favoritos, todos entre contas com candidatura em comum (CA92).

Contas (todas com a senha de desenvolvimento **`Semente#2026`**):

| E-mail | Papel nos dados |
|---|---|
| `ana.empregadora@exemplo.test` | publica a pintura (em andamento) e a faxina; aceitou o Bruno; encerrou as tomadas (Bruno) e a placa (Carla) e avaliou os dois; favoritou o Bruno e a Carla |
| `bruno.freela@exemplo.test` | contratado na pintura; oferta pintura residencial; avaliou a Ana (tomadas) e o Diego (estante) |
| `carla.design@exemplo.test` | candidata ao logo do Diego; oferta identidade visual (sem cidade) e fotografia; ainda não avaliou a Ana (placa) |
| `diego.aulas@exemplo.test` | publica o logo; candidatura recusada na pintura; oferta aulas; encerrou a estante (Bruno) sem avaliar; favoritou o Bruno |

A senha só serve para a máquina local. É idempotente: se a conta da Ana já existir, o script avisa "Semente já
aplicada" e sai sem criar nada. Se uma execução parar no meio, apague os dados (`docker compose down -v`, depois
`docker compose up -d banco` e `migrar`) e rode de novo. A saída mostra só contagens, nunca e-mails, tokens ou a URL
do banco.

## App mobile (`apps/mobile`)

Expo SDK 57 com Expo Router, React Native e TanStack Query. A exportação de dados usa `expo-sharing` (folha de
compartilhamento do sistema, dependência aprovada na D26) e `expo-file-system` (arquivo temporário), as duas na versão
do SDK 57. Os testes usam jest-expo e a Testing Library, sem emulador nem serviço externo: a API é um `fetch` falso
(`src/testes/fetch-falso.ts`) e o token fica num armazenamento em memória.

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
  aceita `https://`. O valor vai embutido no bundle: nada secreto entra ali. A URL também é recusada com usuário e
  senha (`https://u:p@host`), com host vazio (`https://:3000`) e com porta fora de 1 a 65535 (L4, CA68); a regra vale
  em runtime (`src/api/config.ts`) e no `build:producao` (`app.config.ts`), e a mensagem nunca repete o valor.
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
EXPO_PUBLIC_API_URL=https://api.exemplo.com pnpm --filter mobile build:producao   # o mesmo, exigindo https://
```

Um arquivo de teste isolado: `pnpm --filter mobile exec jest <caminho>`. Na raiz, `pnpm typecheck|lint|test` rodam
a API e o app. No fim do `build`, o CLI pode imprimir "Something prevented Expo from exiting"; não é falha (sai com
código 0).

**Build de produção (L3, CA53).** `build:producao` faz o mesmo que `build`, mas confere a URL da API antes de gerar o
bundle: sem `EXPO_PUBLIC_API_URL`, com valor inválido ou sem `https://`, o build falha com uma mensagem fixa que não
repete o valor. A URL **vai no ambiente do comando** (`EXPO_PUBLIC_API_URL=https://… pnpm --filter mobile
build:producao`), e não no `apps/mobile/.env`: o Expo lê o `app.config.ts` (onde a conferência roda) antes de carregar
o `.env`. O `build` comum não confere nada, para o `.env` de desenvolvimento poder usar `http://` na rede local.
Apague o `dist/` depois, como no `build`. Os dois scripts passam `--clear` ao `expo export`: o cache do Metro não
leva o valor de `EXPO_PUBLIC_API_URL` na chave, e sem limpar ele um build reaproveitaria a URL do build anterior.

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
| `/entrada`, `/entrar`, `/cadastro` | `(publico)/` | entrada, login e cadastro (sem sessão); a entrada e o cadastro levam aos documentos legais, e o cadastro mostra o aceite por texto (D27) e o aviso de perfil público |
| `/politica-de-privacidade`, `/termos-de-uso` | `politica-de-privacidade.tsx`, `termos-de-uso.tsx` (raiz) | documentos legais, com e sem sessão |
| `/` | `(app)/(abas)/index.tsx` | aba Início, nos dois modos. Freela: saudação, recentes, "Buscar" e "Ver todos" (levam a `/buscar-trampos`) e atalhos. Contratante: destaque "+" para publicar e até 3 demandas abertas com os interessados (CA82) |
| `/meus-trampos` | `(app)/(abas)/meus-trampos.tsx` | aba Meus trampos (freela, CA78): as candidaturas nos segmentos Em análise, Confirmados e Encerrados, com Mensagem e Retirar |
| `/demandas` | `(app)/(abas)/demandas.tsx` | aba Demandas (contratante, CA79): os trampos publicados nos segmentos Abertas, Em andamento e Encerradas, com "+" e "Mais opções" |
| `/buscar` | `(app)/(abas)/buscar.tsx` | aba Buscar (contratante, CA84): busca de serviços ("Buscar freelancers") |
| `/conversas` | `(app)/(abas)/conversas.tsx` | aba Conversas (freela) ou Mensagens (contratante): nome do outro, prévia de uma linha e hora, última atividade primeiro |
| `/perfil` | `(app)/(abas)/perfil.tsx` | aba Perfil. Freela: cartão de modo, números de candidaturas enviadas e confirmadas, Editar perfil, Meus serviços, Dicas & minicursos, Conta e privacidade e Sair. Contratante (Perfil da empresa): nome, cidade, sobre, cartão de modo, Editar, Conta e privacidade e Sair (CA83) |
| `/buscar-trampos` | `(app)/buscar-trampos.tsx` | busca de trampos do freela (CA84), tela de pilha com voltar |
| `/candidatura-enviada?trampoId=` | `(app)/candidatura-enviada.tsx` | Candidatura enviada (CA80), em tela cheia depois do 201: título, autor, prazo e valor do cache, os passos, "Ver em Meus trampos" e "Buscar mais trampos"; voltar leva ao detalhe |
| `/dicas`, `/dicas/:id` | `(app)/dicas/index.tsx`, `(app)/dicas/[id].tsx` | Dicas & minicursos (CA81): lista com filtro por categoria e leitura; conteúdo local em `src/textos/dicas.ts`, sem rede |
| `/publicar` | `(app)/publicar.tsx` | caminho antigo: redireciona para `/trampos/novo` (D56, CA77) |
| `/perfil/editar` | `(app)/perfil/editar.tsx` | editar ou completar o perfil |
| `/perfil/conta` | `(app)/perfil/conta.tsx` | Conta e privacidade: exportar os dados, excluir a conta, política, termos e Sair |
| `/perfil/exportar` | `(app)/perfil/exportar.tsx` | Exportar meus dados: senha e "Gerar e compartilhar" |
| `/perfil/excluir` | `(app)/perfil/excluir.tsx` | Excluir minha conta: o que acontece, senha e diálogo de confirmação |
| `/perfis/:contaId` | `(app)/perfis/[contaId].tsx` | perfil público |
| `/trampos/novo` | `(app)/trampos/novo.tsx` | formulário Publicar trampo (a confirmação é estado da tela) |
| `/servicos/novo` | `(app)/servicos/novo.tsx` | formulário Ofertar serviço |
| `/trampos/:id` | `(app)/trampos/[id].tsx` | detalhe do trampo; o rodapé mostra Candidatar-se (folha), o selo da candidatura com Conversar e Retirar candidatura (se pendente) ou Ver candidaturas (n); para o autor, "Mais opções" no cabeçalho |
| `/servicos/:id` | `(app)/servicos/[id].tsx` | detalhe do serviço, com Conversar para quem não é o autor e "Mais opções" para o autor |
| `/trampos/editar/:id` | `(app)/trampos/editar/[id].tsx` | Editar trampo: o formulário de publicar, preenchido, com "Salvar alterações" |
| `/servicos/editar/:id` | `(app)/servicos/editar/[id].tsx` | Editar serviço, como o de trampo |
| `/candidaturas` | `(app)/candidaturas/index.tsx` | caminho antigo: redireciona para a aba `/meus-trampos` (CA77) |
| `/candidaturas/:trampoId` | `(app)/candidaturas/[trampoId].tsx` | Candidaturas recebidas de um trampo, com o aceite e Conversar em cada candidatura (só quem publicou vê; para os demais a API responde 404) |
| `/conversas/:id` | `(app)/conversas/[id].tsx` | a conversa: mensagens, campo e Enviar |
| `/meus-anuncios?tipo=servico` | `(app)/meus-anuncios.tsx` | Meus serviços, com "Mais opções" em cada anúncio. Qualquer outro `tipo` (ausente, `trampo` ou inválido) redireciona para a aba `/demandas` (CA77, CA79), que carrega 20 por vez (pede 21 para saber se há mais), com "Carregar mais" no fim da lista só quando há mais |

As abas dependem do modo (D54, ADR-010), numa `Tabs` só: o freela vê Início, Meus trampos, Conversas e Perfil; o
contratante vê Início, Demandas, Buscar, Mensagens e Perfil. As rotas do outro modo continuam declaradas e saem da
barra com `href: null`, então as URLs não mudam. O modo fica guardado no aparelho (`src/estado/modo.tsx`, sem API);
o cadastro grava o objetivo escolhido, e o cartão de modo no Perfil troca na hora. Abrir uma aba exclusiva do outro
modo (link ou URL) troca o modo: o link vence (CA77). Os formulários, as listas, a conversa e as telas novas ficam
na pilha `(app)`, sem a barra de abas. Os parâmetros de rota levam só ids e o `tipo`: título, mensagem, valor e nome nunca vão
na URL.

Anúncios e candidaturas (L2, D30, D33 a D37):

- **Mais opções.** Aparece em cada anúncio de Meus anúncios e, só para o autor, no detalhe. A folha traz Editar,
  Encerrar (só trampo aberto ou em andamento) e Excluir; a ação indisponível fica desabilitada com o motivo (trampo
  com candidaturas, em andamento ou encerrado; sem conexão). Encerrar e excluir pedem confirmação num diálogo que diz
  o efeito, e o sucesso mostra um toast. Um 404 vira "Este anúncio já não existe." e recarrega. O selo "Encerrado"
  aparece em Meus anúncios, no detalhe e em Candidaturas recebidas.
- **Editar.** O formulário abre preenchido com o anúncio lido e manda a `versao` dele. No sucesso, volta à tela de
  antes com "Alterações salvas.". Erro de campo, falta de conexão e 429 mantêm o rascunho. O 409
  `conflito_de_versao` mostra o aviso com "Ver versão atual", que recarrega o anúncio e mantém os campos que a
  pessoa já mexeu (D37); o `trampo_nao_editavel` mostra o aviso e desabilita os campos. Sair com alteração não
  salva pergunta "Descartar alterações?", também no voltar do sistema (botão do Android e gesto do iOS).
- **Aviso de retorno.** "Alterações salvas.", "Trampo excluído.", "Serviço excluído." e "Este anúncio já não
  existe." são deixados por uma tela para a seguinte (`src/estado/aviso-de-retorno.ts`): só a chave do texto, em
  memória, por 10 s e só na mesma sessão. Meus anúncios, os dois detalhes, o Início e a Busca mostram o aviso (L4,
  CA63); se a volta cai numa tela que não o mostra, ele se perde.
- **Retirar candidatura.** Em Meus trampos (aba do freela) e no rodapé do trampo, só para a candidatura pendente e sempre
  com o diálogo "Manter candidatura" ou "Retirar candidatura". No sucesso, ela some da lista e o rodapé volta a
  "Candidatar-se". O 409 avisa que ela já foi respondida e recarrega; o 404 a tira da lista. Toque duplo faz um
  pedido só. Em trampo encerrado, a folha de candidatura mostra "fechado".

Conversar (D22, D23) aparece em três pontos de entrada: no rodapé do detalhe do trampo, para quem se candidatou
(com o autor); no detalhe do serviço, para quem não é o autor; e em cada candidatura recebida, em qualquer status
(com quem se candidatou). O toque faz `POST /conversas` e abre `/conversas/:id`. Quem decide o vínculo é a API, e
só para conversa nova: a já aberta continua abrindo depois da candidatura retirada ou do trampo excluído (D35). O
403 `sem_vinculo` mostra "Você só pode conversar com quem tem uma candidatura ou contratação com você." e o 409
`conversa_consigo_mesmo` mostra o seu texto; nos dois casos, o "Conversar" daquela conta fica desabilitado, com o
texto, até a tela ser aberta outra vez. Sem conexão, o botão fica desabilitado com o motivo.

Na conversa, as mensagens chegam por consulta periódica (D20): a cada 5 s, até 60 s depois de falhas seguidas de
rede, 5xx ou 429 (limite por conta), e param no 404 (ou outro 4xx) e no 401. A lista da aba Conversas recarrega a
cada 30 s, só com a aba focada.

Fora do login e do cadastro, o 429 do limite por conta (D29) mostra "Você fez muitas ações em pouco tempo. Aguarde um
minuto e tente de novo." e mantém o que foi digitado; a mensagem enviada com 429 fica "Não enviada", com o mesmo
aviso. No login e no cadastro, o 429 continua "Muitas tentativas seguidas…".

Qualidade do app (L4, D45, D48, D51):

- **Limite dos campos (D45, CA55).** Nos campos de texto livre com limite (título, descrição, cidade, mensagem da
  candidatura, mensagem da conversa, nome, sobre você, habilidade, texto e cidade da busca), o limite e o contador
  contam pontos de código, como a API, e não unidades UTF-16: um emoji conta 1. Digitar ou colar além do limite
  **corta** no limite (nunca antes) e o leitor de tela anuncia "Limite de n caracteres atingido." ou, se o texto
  colado foi cortado, "O texto passou de n caracteres e foi cortado.". O corte é por ponto de código, não por grafema:
  uma família (emoji com ZWJ) ou uma letra com acento composto pode ser partida no limite. `maxLength` só fica em
  campo ASCII (valor e prazo); a senha usa o mesmo `limite` (128), sem contador visível.
- **Uma só faixa "sem conexão" (D51, CA56).** Ela é desenhada na raiz (`src/app/_layout.tsx`), no topo e com a margem
  segura, com e sem sessão; nenhuma tela desenha a sua (a prop `semConexao` só desabilita ações). Some quando a rede
  volta, com o anúncio "Conexão de volta.", e não se repete ao trocar de tela.
- **Sem rede, entrar, cadastrar e salvar o perfil falham na hora (CA58)** com o aviso de falta de conexão e mantêm o
  que foi digitado. Nada é enviado sozinho quando a rede volta, e a senha não fica pendurada numa mutação pausada.
- **Editar perfil espera a carga (CA57).** O formulário só aparece depois da resposta de `GET /perfis/eu` (o 404 do
  perfil novo conta); antes mostra o carregando e, com erro, o aviso com "Tentar de novo".
- **Ordem das mensagens (D48, CA59).** Uma mensagem gravada depois de outra mais nova (os relógios do servidor
  diferem por milissegundos) aparece no ciclo seguinte, na posição da API e sem duplicata: a cada ciclo o app relê a
  janela dos últimos 60 s (`JANELA_DE_RELEITURA_MS`, por `enviadaEm`) e substitui a cauda do cache pela resposta, ainda
  com 1 GET por ciclo quando há menos de 50 mensagens novas. Supõe relógios das réplicas com menos de cerca de 45 s de
  diferença.
- **Conversa com mais de 500 mensagens (CA60).** "Tentar de novo" de uma pendente cuja âncora saiu do teto do cache
  confere antes na API, a partir da âncora (até 20 páginas, só por toque, sem gravar no cache), se a mensagem
  chegou; se chegou, não reenvia. Se a conferência falhar, ou parar nas 20 páginas (1000 mensagens) com a última
  cheia, sem chegar ao fim, a pendente continua "Não enviada" e nada é reenviado.
- **Foco no primeiro erro (CA62).** Em cadastro, entrar, editar perfil, formulário de anúncio, excluir conta e
  exportar dados, o primeiro campo com erro recebe o foco e a tela rola até ele.
- **Folha "Mais opções" viva (CA61).** A folha aberta mostra o anúncio atual: depois de um 409 `trampo_nao_aberto`, o
  "Excluir" fica desabilitado com o motivo, sem fechar e reabrir. Enquanto o anúncio é relido, as ações ficam
  desabilitadas ("Atualizando as opções…"); o aviso "Atualizamos as opções" só aparece quando a releitura dá certo
  (se ela falha, fica o motivo do 409; se dá 404, a folha fecha com "Este anúncio já não existe."). No detalhe do trampo, o 409
  `candidatura_nao_pendente` do rodapé recarrega o trampo e o selo mostra o status novo (CA64).
- **Autor no detalhe (D46).** O app reconhece o autor pela visão do autor em `GET /trampos/:id` (`versao` presente),
  não mais pela lista Meus trampos, que agora é paginada (ver "Anúncios" em "Endpoints").

Conta e privacidade (D25 a D28):

- **Documentos legais.** As rotas ficam na raiz, fora das guardas de sessão: abrem pela Entrada e pelo Cadastro (o
  rascunho do cadastro continua lá na volta) e por Conta e privacidade. O texto é empacotado em
  `src/textos/legal.ts`, espelho dos rascunhos de `docs/produto/legal/`, e abre sem rede.
- **Exportar.** Com a senha, `POST /contas/eu/exportacao`; o app grava o JSON num arquivo temporário, abre a folha
  de compartilhamento e mostra "Arquivo gerado…" quando ela fecha (cancelar não é detectável). Sem folha no
  aparelho, mostra que o compartilhamento está indisponível. Sair da conta durante o pedido descarta o resultado.
- **Excluir.** Com a senha e a confirmação no diálogo ("Cancelar" é o padrão), `POST /contas/eu/exclusao`. No 204,
  o app apaga o token e os caches sem chamar `DELETE /sessoes` (a API já derrubou as sessões) e vai ao login com
  "Sua conta foi excluída.". Senha errada (403) mostra "Senha incorreta…" no campo, e a sessão continua.
- Sem conexão, exportar e excluir ficam desabilitados com o motivo. Toque duplo faz um pedido só.

Link que chega do sistema (deep link) passa antes por `src/app/+native-intent.tsx`: acima de 2 KB ou com escape `%`
malformado, o app abre o Início em vez de tentar interpretá-lo.

### Dados pessoais no app (CA15)

- O token só existe no `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), atrás da porta
  `ArmazenamentoDeToken`. Nunca vai para estado persistido, URL, parâmetro de rota, log ou mensagem de erro. Não há
  AsyncStorage.
- **Marcador de instalação (L3, S2).** O secure-store do iOS sobrevive à desinstalação do app. Por isso o app cria
  o arquivo `trampoja.instalacao` (conteúdo fixo, sem dado algum) em `Paths.document`, que o sistema apaga junto com
  o app. Uma vez por execução, antes de qualquer leitura ou gravação, a porta confere o marcador: se ele não existe,
  apaga o token e a impressão da conta que sobraram, cria o marcador e abre sem sessão. Se apagar falhar, o marcador
  não é criado e a próxima operação tenta de novo. Na atualização para a versão com o marcador, todos os aparelhos
  saem da conta uma vez (nenhum aparelho tem o marcador antes dela); sem usuários reais, o risco é aceito.
- **Retorno ao login só para a mesma conta (D43).** Quando a sessão expira, o app guarda a rota em que a pessoa
  estava para voltar a ela depois do login. Essa volta só vale se quem entrou for a mesma conta, comparada por uma
  impressão do e-mail (aparado e em minúsculas) guardada no secure-store junto com o token; outra conta cai no Início.
  A impressão nunca vai para log, rota ou cache.
- **O "Sair" não espera a rede (S6).** Sair guarda o token, limpa o secure-store e os caches e só então dispara o
  `DELETE /sessoes` com esse token, sem esperar a resposta: sem rede ou com a API pendurada, a pessoa sai do mesmo
  jeito. O 401 desse pedido é ignorado, para nunca derrubar um login feito depois.
- **Barreira de telemetria na árvore transitiva (S7).** `src/testes/dependencias-de-producao.test.ts` percorre as
  `dependencies` e `optionalDependencies` de cada pacote, a partir do `package.json` do app, resolvendo-os pelo
  `node_modules` real, e falha se algum tiver nome de telemetria ou de crash report (Sentry, Firebase, analytics,
  Datadog, PostHog e similares). Só passa ferramenta de build listada com o motivo no próprio teste.
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
    com 500 e com 401, e a conversa vista pela outra conta depois do login;
  - L1 (CA24): login, exportar com a senha errada (403) e com a certa (200), excluir com a senha errada (403), no
    limite (429) e com a certa (204, de volta ao login com token e caches vazios e sem `DELETE /sessoes`), e outra
    conta entrando no mesmo aparelho depois;
  - L2 (CA35): editar trampo (429, 409 `conflito_de_versao` com "Ver versão atual" e 204) e editar serviço (409,
    429 e 204), com título e descrição sentinelas e um rascunho da descrição que vai num `PUT` recusado e é trocado
    antes de salvar.

  O teste falha se aparecer, em texto puro, em maiúsculas ou codificado para URL, e-mail, senha, nome, cidade,
  habilidade, texto da busca, token, título, descrição, cidade do anúncio, mensagem da candidatura, nome de
  candidato, valor digitado (como `9.876,54`, e também em centavos), texto de mensagem enviada ou recebida, prévia
  de conversa ou nome de quem está do outro lado. Na jornada 2c, essas sentinelas também não podem aparecer em
  `testID`, em chave de lista, em propriedade da árvore renderizada que não seja texto da tela, na URL nem nos
  parâmetros de rota, na URL das requisições nem em erro guardado pelo cache de consultas ou de mutações. Na
  jornada L1, a senha (certa e errada), o e-mail do login, o token e o JSON exportado (e-mail, nome, título e
  descrição de anúncio, texto de mensagem) também não podem aparecer em nada disso nem em estado algum dos caches
  de consultas e de mutações, depois do sucesso e depois do erro. O JSON só pode chegar ao arquivo (a folha é
  simulada e guarda o que seria gravado): nem o texto da tela o mostra. A senha só vai no corpo de `POST /sessoes`
  e dos `POST /contas/eu/*`. Na jornada L2, o título, a descrição e o rascunho da edição também não podem
  aparecer em `testID`, chave de lista, propriedade que não seja texto da tela, URL, parâmetros ou estado da
  navegação, cabeçalho ou corpo de outro pedido que não o `PUT`, erro guardado nem no cache de mutações depois que
  a edição fecha; o rascunho que nunca foi salvo não pode ficar nem no cache de consultas nem na árvore. O aviso de
  retorno só pode receber a chave `alteracoes_salvas`. O mesmo arquivo falha se `apps/mobile/package.json` ganhar
  dependência de AsyncStorage, Sentry, Bugsnag, Firebase, analytics, Segment, Amplitude ou Mixpanel.
- O que fica em memória nos fluxos da 2b (nada vai para disco):
  - **Rascunhos.** Título, descrição, categoria, cidade, valor e prazo de Publicar trampo e Ofertar serviço, e a
    mensagem e o valor proposto da folha Candidatar-se, ficam só no estado do componente da tela. Somem quando a
    tela fecha, e também ao sair da conta ou quando a sessão expira, porque o 401 leva ao login.
  - **Envios.** O que foi enviado (o trampo, o serviço, a candidatura ou o id do aceite) fica como `variables` da
    mutação no cache de mutações do TanStack. Dura enquanto a tela está aberta e sai assim que ela fecha
    (`gcTime: 0`).
  - **Consultas.** O cache de consultas do TanStack guarda os dados frescos por 30 s e os remove 5 min depois que
    nenhuma tela os usa. Entram nele:
    - as listas "minhas": Meus trampos (`/trampos/meus`, página a página), Meus serviços (`/servicos/meus`) e Minhas
      candidaturas (`/candidaturas/minhas`, com a mensagem e o valor da própria candidatura);
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
- O que fica em memória na exclusão e na exportação (L1, CA24):
  - **Senha.** Fica só no estado do componente da tela (nunca na URL, em `testID` ou no `console`). No pedido, vai
    como `variables` da mutação, que sai do cache de mutações com o `reset()` depois do sucesso e do erro e com
    `gcTime: 0`. A mutação não tenta de novo sozinha (`retry: 0`), para não gastar o limite de 5 tentativas.
  - **JSON exportado.** Nunca entra no TanStack: a mutação devolve só o resultado (`compartilhado`,
    `indisponivel`). O app grava `trampo-ja-meus-dados-AAAA-MM-DD.json` no cache do app (`Paths.cache`), abre a
    folha com `application/json` e apaga o arquivo no `finally`: depois que a folha fecha e também quando a
    gravação ou a folha falham. O erro da biblioteca não vai para log nem para a tela. Se o app morre com a folha
    aberta, o `finally` não roda: por isso, ao abrir, a raiz (`src/app/_layout.tsx`) chama
    `limparExportacoesAntigas()` (`src/estado/exportacao.ts`), que apaga de `Paths.cache` os arquivos
    `trampo-ja-meus-dados-*` que sobraram, sem log (S4).
  - **Exclusão.** `sessao.encerrarPorExclusao()` guarda o aviso `conta_excluida`, apaga o token e limpa os dois
    caches, sem `DELETE /sessoes`. Um 401 atrasado (da consulta periódica, por exemplo) é ignorado, porque o token
    já saiu.
- O que fica em memória na edição de anúncio (L2, CA35):
  - **Rascunho.** O que a pessoa mexeu fica só no estado do componente da rota de edição, por cima do anúncio lido;
    nunca na URL nem nos parâmetros de rota, que levam só o id. Some quando a tela fecha (salvando ou descartando)
    e no 401, que leva ao login.
  - **Envio.** O corpo do `PUT` fica como `variables` da mutação enquanto a edição está aberta e sai do cache de
    mutações quando ela fecha (`gcTime: 0`). O que foi salvo volta na leitura do anúncio, no cache de consultas,
    como qualquer anúncio.
  - **Aviso de retorno.** Guarda só a chave do texto, a sessão e o prazo; nunca o que foi digitado.
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
| `avaliacoes` | avaliações mútuas depois do trampo encerrado e a equipe favorita do contratante (ADR-011) | `avaliacoes`, `favoritos` |

Camadas de cada módulo:

- `dominio/`: entidades, objetos de valor, erros e portas. Sem import de `fastify`, `kysely` ou `pg`.
- `aplicacao/`: casos de uso e os testes BDD (`*.bdd.test.ts`, cenários nomeados pelo CA).
- `adaptadores/http` (rotas Fastify), `adaptadores/postgres` (Kysely) e `adaptadores/memoria` (fakes para os testes).
- `index.ts`: a fachada. É o único arquivo que outro módulo ou a composição pode importar.

Regras que ligam os módulos:

- **Composição:** `src/composicao.ts` (`montarAplicacao`) é o único lugar que conhece todos os módulos. Ela liga
  `perfis.perfilEstaCompleto` a `trampos` e `servicos` (D9), `trampos.existeVinculoEntre` a `conversas` (CA13)
  e aos favoritos de `avaliacoes` (CA92), `trampos.vinculoParaAvaliacao` a `avaliacoes` (CA87), as buscas de `trampos` e `servicos` a `busca` e `contas.validarSessao` ao hook de autenticação. O entrypoint é
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
| 409 | código da regra | regra de domínio (ex.: `perfil_incompleto`, `email_em_uso`, `exportacao_grande`) |
| 413 | `corpo_grande_demais` | corpo acima do limite do Fastify (1 MiB) |
| 415 | `tipo_nao_suportado` | `Content-Type` que não é JSON nem `text/plain` (corpo `text/plain` dá 400 `dados_invalidos`) |
| 429 | `muitas_requisicoes` | rate limit de cadastro ou entrada (por IP ou, na entrada, por e-mail e IP ou pelo teto da conta, D31) ou limite por conta nas rotas autenticadas (D29) |
| 500 | `interno` | falha inesperada (o detalhe fica só no log, sem dado pessoal) |
| 503 | `servico_ocupado` | a fila do scrypt ou da exportação não liberou vaga em 10 s (D42); traz `retry-after: 10` |

### Endpoints

Contas (públicas, exceto `DELETE /sessoes` e as de `/contas/eu`):

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /contas` | `{email, senha}` | 201 `{token}` | 400; 409 `email_em_uso`; 429; 503 `servico_ocupado` |
| `POST /sessoes` | `{email, senha}` | 200 `{token}` | 400; 401 `credenciais_invalidas` (genérico); 429; 503 `servico_ocupado` |
| `DELETE /sessoes` | — | 204 | 401 |
| `POST /contas/eu/exclusao` | `{senha}` | 204 | 400; 401; 403 `senha_incorreta`; 404 conta inexistente; 429; 503 `servico_ocupado` |
| `POST /contas/eu/exportacao` | `{senha}` | 200, JSON `trampo-ja.exportacao.v1` (abaixo) | 400; 401; 403 `senha_incorreta`; 404 conta inexistente; 409 `exportacao_grande`; 429; 503 `servico_ocupado` |

As duas rotas de `/contas/eu` respondem sempre com `Cache-Control: no-store`, inclusive nos erros. O corpo só aceita
a chave `senha` (outra chave dá 400). Senha errada, ausente, vazia ou acima de 128 caracteres dá 403
`senha_incorreta`, e acima do teto nem roda o scrypt. É 403, e não 401, para o app não tratar como sessão expirada.
No máximo duas derivações scrypt rodam ao mesmo tempo por processo (CA23); as demais esperam numa fila.

- **Fila com espera máxima (D42):** quem espera mais de 10 s na fila do scrypt (cadastro, entrada, exclusão e
  exportação) ou na da exportação recebe 503 `servico_ocupado` com `retry-after: 10` e o corpo só com o código. O
  segundo é fixo, nunca o tamanho da fila. O pedido cuja conexão caiu enquanto esperava sai da fila sem derivar nem
  coletar nada; depois que pegou a vaga, a tarefa termina.
- **Senha em NFC (L3, S8):** a senha é normalizada em NFC (`String.prototype.normalize('NFC')`) no cadastro, no
  login, na exclusão e na exportação, então quem se cadastrou digitando "é" decomposto (NFD) entra com o composto, e o
  contrário. O hash novo é sempre da forma NFC. Contas com hash gravado sobre a forma crua ainda entram com ela. O
  teto de 128 caracteres vale para o texto como veio, antes de normalizar. E-mail inexistente roda o mesmo número de
  derivações que senha errada, para o tempo não revelar se a conta existe.
- **Cadastro numa transação (L3):** `POST /contas` grava a conta e a primeira sessão na mesma transação. Se a
  sessão falhar, nenhuma conta fica gravada, e repetir o cadastro é seguro.

- **Exclusão (D25, CA17):** apaga na hora, numa só transação, a conta, as sessões de todos os aparelhos, o perfil,
  os trampos (com as candidaturas recebidas), os serviços, as candidaturas da conta, as conversas inteiras de que
  ela participa, as avaliações feitas e recebidas e os favoritos dos dois lados (os da conta e os que a têm como
  favorita). O que os outros veem está em "Dados pessoais (LGPD) e logs".
- **Exportação (D26, D41, CA19):** o teto é 10 MiB (`TETO_DA_EXPORTACAO_BYTES`), medido no banco antes de coletar
  (soma dos bytes dos textos exportados mais 256 bytes por linha): acima disso, 409 `exportacao_grande` e nada é
  coletado nem serializado. O app orienta a pedir os dados pelo e-mail de contato da política, com resposta manual
  em até 15 dias (LGPD, art. 19, II). A medida e a serialização rodam dentro da vaga da fila. Só os dados da própria conta, com o schema da resposta fechado em todos os níveis. É
  a única rota que devolve o e-mail da conta. Ficam fora o hash da senha, o hash do token, as colunas derivadas
  (`cidade_normalizada`, `texto_busca`) e textos de terceiros; da outra pessoa de cada conversa, só o id.

```jsonc
{ "formato": "trampo-ja.exportacao.v1", "geradoEm": "ISO",
  "conta": { "id", "email", "criadaEm" }, "sessoes": [{ "criadaEm", "expiraEm" }],
  "perfil": { "nome", "cidade", "descricao", "habilidades", "atualizadoEm" } | null,
  "trampos": [{ "id", "titulo", "descricao", "categoria", "cidade", "valorCentavos", "prazo", "status", "criadoEm", "candidaturasRecebidas" }],
  "servicos": [{ "id", "titulo", "descricao", "categoria", "cidade", "precoBaseCentavos", "status", "criadoEm" }],
  "candidaturas": [{ "id", "trampoId", "mensagem", "valorPropostoCentavos", "status", "criadaEm" }],
  "conversas": [{ "id", "outroUsuarioId", "criadaEm", "minhasMensagens": [{ "id", "texto", "enviadaEm" }] }],
  "avaliacoesFeitas": [{ "trampoId", "nota", "destaques", "comentario", "criadaEm" }],
  "avaliacoesRecebidas": [{ "nota", "destaques", "criadaEm" }],
  "favoritos": [{ "contaId", "criadoEm" }] }
```

Das avaliações recebidas saem só a nota, os destaques e a data: o comentário e o avaliador são de terceiros
(CA93). `favoritos` traz só os ids da equipe favorita da conta, nunca quem a favoritou.

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
| `GET /trampos/meus` | `?limite&antesDeCriadoEm&antesDeId` | 200 página de trampos, em qualquer status, com `versao` e `candidaturasRecebidas` (abaixo) | 400 `dados_invalidos` |
| `GET /trampos/:id` | — | 200 trampo (com `autorId` e `status`; `versao` e `candidaturasRecebidas` só para o autor) | 404 |
| `PUT /trampos/:id` | `{titulo, descricao, categoria, cidade, valorCentavos, prazo?, versao}` | 204 | 400; 404; 409 `trampo_nao_editavel`, `conflito_de_versao` |
| `POST /trampos/:id/encerrar` | — | 204, também se já estava encerrado | 404 |
| `DELETE /trampos/:id` | — | 204 | 404; 409 `trampo_nao_aberto` |
| `POST /trampos/:id/candidaturas` | `{mensagem, valorPropostoCentavos}` | 201 `{id, status:"pendente"}` | 400; 404; 409 (abaixo) |
| `GET /trampos/:id/candidaturas` | — | 200 lista (só o autor) | 404 para quem não é o autor |
| `POST /trampos/:id/candidaturas/:cid/aceitar` | — | 200 `{status:"aceita"}` | 404; 409 (abaixo) |
| `GET /candidaturas/minhas` | — | 200 lista com `trampoId` e `status` | — |
| `DELETE /candidaturas/:id` | — | 204 | 404; 409 `candidatura_nao_pendente` |

Códigos 409 de trampos: `perfil_incompleto`, `autor_nao_pode_candidatar`, `candidatura_duplicada`,
`trampo_nao_aberto`, `candidatura_nao_pendente`, `trampo_nao_editavel` e `conflito_de_versao`. Aceitar põe o
trampo `em_andamento` e recusa as demais candidaturas pendentes. Candidaturas e aceites simultâneos no mesmo trampo
não dão erro: quem perde a trava otimista relê o trampo e tenta de novo (até 10 vezes), então candidaturas de
freelancers diferentes são todas gravadas, o segundo toque do mesmo freelancer vira `candidatura_duplicada` e o
aceite que perde para outro aceite vira `trampo_nao_aberto`. `conflito_de_versao` só sai se o trampo mudar a cada
uma das 10 tentativas (mais de 10 gravações simultâneas no mesmo trampo); o app pode repetir a ação. Os ids na URL
não distinguem maiúsculas.

Anúncios (L2, D30, D33 a D35; concorrência no ADR-006 de `docs/produto/planos/pre-lancamento-l2.md`):

- **Status do trampo:** `aberto`, `em_andamento` ou `encerrado`. Encerrado é final: não reabre, não é editado nem
  excluído, sai da busca e continua em `GET /trampos/meus`.
- **Editar (`PUT`):** só o autor, só trampo aberto e sem candidaturas, e substitui todos os campos (`prazo` ausente
  ou `null` tira o prazo). A `versao` é a lida em `GET /trampos/:id` ou `GET /trampos/meus`; se o trampo mudou
  desde então, 409 `conflito_de_versao` e nada muda. `criadoEm` e a posição na
  busca não mudam. O corpo é fechado: não troca autor, status nem data.
- **Encerrar:** trampo aberto ou em andamento. As candidaturas pendentes viram recusadas; candidatar-se e aceitar
  passam a dar 409 `trampo_nao_aberto`; as conversas continuam. É assim que o autor resolve o trampo em andamento
  cuja contratada excluiu a conta. Uma candidatura que chega ao mesmo tempo é recusada junto ou leva
  `trampo_nao_aberto`.
- **Excluir:** só trampo aberto. Apaga o trampo com as candidaturas; o detalhe passa a dar 404 e as conversas
  continuam. Uma candidatura que chega ao mesmo tempo termina em 201 (e é apagada junto) ou 404.
- **Retirar candidatura:** só a pendente, e só por quem se candidatou. A linha é apagada, e a pessoa pode se
  candidatar de novo. A conversa já aberta continua.
- **Visão do autor (D33):** `versao` e `candidaturasRecebidas` só saem para quem publicou; para os demais, as
  respostas não mudam. Encerrar, excluir e retirar não levam versão. Encerrar, excluir e retirar travam o trampo
  (`for update`, depois as candidaturas, nessa ordem) e aplicam a regra sobre o estado atual, então nunca dão
  `conflito_de_versao`, nem sob uma rajada de candidaturas (L4, D49, CA65). Retirar com a candidatura já respondida
  dá 409 `candidatura_nao_pendente`, e com o trampo excluído, 404.
- **Meus trampos paginados (L4, D47, CA66):** `GET /trampos/meus` devolve os mais recentes primeiro (`criadoEm`
  decrescente, desempate por `id`). `limite` é inteiro de 1 a 50, com padrão 20. A página seguinte usa o cursor
  `antesDeCriadoEm` (ISO 8601 em UTC) mais `antesDeId` (uuid), **os dois juntos e com o `criadoEm` exatamente como veio**
  no último item da página anterior, nunca só um deles. A lista acaba quando a página volta com menos itens que o
  `limite`. Cursor pela metade, `limite` fora de 1 a 50, valor malformado ou chave de consulta desconhecida dão 400
  `dados_invalidos` com o nome do campo. Sem parâmetros vem a primeira página (20), o que muda o contrato anterior,
  que listava tudo; `/servicos/meus` e `/candidaturas/minhas` continuam completas. Só trampos do autor da sessão
  aparecem. O detalhe `GET /trampos/:id` já devolve a visão do autor só para o autor, e é por ela que o app o
  reconhece (D46), inclusive em trampo fora da primeira página.
- Recurso inexistente, de outra conta ou com id fora do formato uuid recebe o mesmo 404.

Serviços:

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /servicos` | `{titulo, descricao, categoria, cidade?, precoBaseCentavos}` | 201 `{id, status:"ativo"}` | 400; 409 `perfil_incompleto` |
| `GET /servicos/meus` | — | 200 lista, com `versao` | — |
| `GET /servicos/:id` | — | 200 serviço (`cidade` pode ser `null`; `versao` só para o autor) | 404 |
| `PUT /servicos/:id` | `{titulo, descricao, categoria, cidade?, precoBaseCentavos, versao}` | 204 | 400; 404; 409 `conflito_de_versao` |
| `DELETE /servicos/:id` | — | 204 | 404 |

Só o autor edita ou exclui o serviço; para os demais, 404. Na edição, `cidade` ausente ou `null` deixa o serviço sem
cidade (D7), e a `versao` funciona como a do trampo. O serviço excluído some da busca e o detalhe dele dá 404.

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
| `POST /conversas` | `{outroUsuarioId}` | 201 `{conversaId}` (nova) ou 200 (já existia, mesmo sem vínculo restante, D35) | 400; 403 `sem_vinculo` (sem conversa e sem vínculo); 409 `conversa_consigo_mesmo` |
| `GET /conversas` | — | 200 `[{conversaId, outroUsuarioId, criadaEm, ultimaMensagem}]` | — |
| `GET /conversas/:id/mensagens` | `?depoisDe=<id da mensagem>` | 200 até 50, na ordem de envio | 400; 404 |
| `POST /conversas/:id/mensagens` | `{texto}` | 201 `{id, enviadaEm}` | 400 texto vazio; 404 |

Só abre conversa quem tem candidatura em comum, em qualquer estado (CA13). Quem não participa da conversa recebe
404, não 403, para não confirmar que ela existe.

Avaliações e equipe favorita (V2b, ADR-011 em `docs/produto/planos/visual-v2.md`):

| Rota | Corpo ou consulta | Sucesso | Erros |
|---|---|---|---|
| `POST /avaliacoes` | `{trampoId, nota, destaques?, comentario?}` | 201 `{id}` | 400; 404 (não é parte, trampo inexistente ou sem candidatura aceita); 409 `trampo_nao_encerrado`, `avaliacao_ja_feita` |
| `GET /avaliacoes` | `?contaId&papel&antesDe&limite` | 200 `{itens: [{nota, destaques, comentario, avaliadorId, criadaEm}], proximoCursor}` | 400 |
| `GET /avaliacoes/resumos` | `?contas=<id>,<id>…` (até 50) | 200 `[{contaId, comoFreela, comoContratante}]`, cada papel com `{media, total, destaques}` | 400 |
| `GET /avaliacoes/feitas` | `?trampos=<id>,<id>…` (até 50) | 200 `[{trampoId, nota, criadaEm}]`, só as da conta da sessão | 400 |
| `GET /favoritos` | — | 200 `[{contaId, criadoEm}]`, mais recentes primeiro | — |
| `PUT /favoritos/:contaId` | — | 204, também se já era favorito | 404 (sem vínculo ou id fora do formato); 409 `favorito_invalido`, `limite_de_favoritos` |
| `DELETE /favoritos/:contaId` | — | 204, também se não era favorito | 404 (id fora do formato) |

- **Quem avalia (CA87):** só as duas partes de um trampo `encerrado` com candidatura `aceita`. O autor avalia o
  freela aceito (papel `freela`) e o freela avalia o autor (papel `contratante`). Para qualquer outra pessoa, o mesmo
  404, sem dizer se o trampo existe. Cada conta avalia uma vez por trampo: a unicidade é da constraint
  `(trampo_id, avaliador_id)`, e numa rajada só um pedido grava; os outros recebem `avaliacao_ja_feita`. A avaliação
  não se edita nem se apaga.
- **Campos (CA88):** `nota` é inteiro de 1 a 5. `destaques` (opcional, até 5, sem repetição) vêm da lista do papel
  avaliado: freela `pontual`, `organizado`, `rapido`, `educado`, `proativo`; contratante `pagamento_em_dia`,
  `ambiente_organizado`, `instrucoes_claras`, `respeitoso`, `pontual`. `comentario` é opcional, aparado, com 1 a
  500 caracteres e sem o caractere nulo; é dado pessoal. O 400 lista os campos e nunca devolve o valor.
- **Lista (CA90):** `contaId` (uuid) e `papel` (`freela` ou `contratante`) são obrigatórios. Vêm as mais recentes
  primeiro, 20 por página (`limite` de 1 a 50); a próxima página usa `antesDe=<proximoCursor>`, que é `null` na
  última. Conta sem avaliação dá lista vazia, sem dizer se a conta existe.
- **Resumos e feitas (CA89, CA91):** os ids vão separados por vírgula ou com a chave repetida. Mais de 50 ou a chave
  ausente dão 400; id fora do formato uuid é ignorado. A `media` tem uma casa decimal (`null` sem avaliação), e os
  `destaques` do resumo são os até 3 mais frequentes. `feitas` nunca devolve avaliação de outra conta.
- **Favoritos (CA92):** favoritar exige candidatura em comum, em qualquer estado (como a conversa, D4); sem ela,
  404. Favoritar a si mesmo dá 409 `favorito_invalido`, e o teto é de 200 por conta (409 `limite_de_favoritos`). A
  lista é privada: a pessoa favoritada não é avisada nem vê quem a favoritou.

### Rate limit (D2, D29)

`POST /contas` e `POST /sessoes` aceitam até 10 requisições por minuto por IP, com contador separado por rota
(constante `LIMITE_PADRAO_DAS_ROTAS_PUBLICAS` em `apps/api/src/composicao.ts`). O contador por IP de `POST /sessoes`
guarda até 100 000 IPs (`CHAVES_DO_LIMITE_POR_IP_NA_ENTRADA`), acima dos 65 536 prefixos /64 de um /48, para que
trocar de prefixo não apague o contador de quem ataca. `POST /sessoes` tem ainda dois limites da D31, conferidos
nesta ordem:

- **10 tentativas a cada 15 minutos por e-mail+IP** (`LIMITE_PADRAO_POR_EMAIL_E_IP`, em memória, em
  `apps/api/src/compartilhado/http/limite-de-entrada.ts`);
- **teto de 100 tentativas por hora por conta**, venham de quantos IPs vierem (`TETO_PADRAO_POR_EMAIL`, em
  `apps/api/src/modulos/contas/aplicacao/casos-de-uso.ts`). Fica no banco, na tabela `tentativas_de_entrada`
  (migração `0008`): uma linha por conta, com o início da janela e a contagem, sem e-mail nem IP. O caso de uso
  `entrar` soma a tentativa depois de achar a conta e antes do scrypt, num `insert … on conflict … returning`
  atômico; a janela é fixa, começa na primeira tentativa e recomeça quando vence. Acima de 100, 429 sem rodar o
  scrypt, mesmo com a senha certa. E-mail sem conta não grava nada (e segue rodando o scrypt contra o hash fictício).
  A limpeza periódica apaga as janelas vencidas, e a exclusão da conta apaga a linha junto (cascade).

A tentativa recusada pelo primeiro limite não chega ao caso de uso, então não gasta o teto. O teto fica no banco, e
não num contador em memória, porque um contador em memória guarda um número limitado de chaves: pedidos com e-mails
de lixo (que nem chegam ao banco) despejariam o contador da vítima. Antes da D31 o limite era só por e-mail (10 a
cada 15 minutos, de qualquer IP), o que deixava qualquer pessoa trancar a conta de outra; agora quem erra de um IP
não tranca o e-mail para os demais. No IPv6, o IP contado é o prefixo /64 (quem tem um /64 troca de endereço à
vontade), e o IPv4 mapeado em IPv6 conta como IPv4. O contador por e-mail+IP guarda só o SHA-256 do e-mail
normalizado (aparado e em minúsculas), nunca o e-mail; corpo sem e-mail conta pelo IP normalizado. Acima de
qualquer limite, 429 `muitas_requisicoes` genérico, com `retry-after` (o que falta para a janela vencer) e sem o
e-mail, o hash nem o id da conta na resposta ou no log. O 429 do teto, para conta que existe, contra o 401 de
e-mail sem conta, só revela o que o 409 `email_em_uso` do cadastro já revela.

As rotas autenticadas têm limite por conta (D29, CA20): cada rota pertence a um grupo, e cada grupo tem um contador
próprio por conta (`LIMITES_PADRAO_POR_CONTA`, `grupoDaRota` e `gruposDaRota` em
`apps/api/src/compartilhado/http/limite-por-conta.ts`):

| Grupo | Rotas | Limite |
|---|---|---|
| `leitura` | todo `GET` autenticado | 600 por minuto |
| `mensagens` | `POST /conversas/:id/mensagens` | 30 por minuto |
| `mensagens_dia` | `POST /conversas/:id/mensagens` (teto diário, somado a `mensagens`) | 1000 a cada 24 h |
| `publicacao` | `POST /trampos`, `POST /servicos`, `POST /trampos/:id/candidaturas`, `PUT /trampos/:id`, `PUT /servicos/:id` (D36), `POST /avaliacoes` (CA94) | 30 por hora |
| `senha` | `POST /contas/eu/exclusao`, `POST /contas/eu/exportacao` | 5 a cada 15 minutos |
| `escrita` | os demais `POST`, `PUT` e `DELETE` autenticados, como `PUT /perfis/eu`, `POST /trampos/:id/encerrar`, `DELETE /trampos/:id`, `DELETE /servicos/:id`, `DELETE /candidaturas/:id` (D36), `PUT` e `DELETE /favoritos/:contaId` (CA94; rota nova sem grupo cai aqui) | 60 por minuto |

`DELETE /sessoes` (sair) fica fora do limite por conta: o logout nunca recebe 429 nem gasta o contador de `escrita`.

Enviar mensagem consome dois contadores, conferidos nesta ordem: os 30 por minuto e o teto de 1000 a cada 24 h (nota
de 2026-10-23 na D29; sem ele, uma conta incharia a própria exportação). A mensagem recusada pelo limite por minuto
não gasta o teto diário. Acima do teto, 429 `muitas_requisicoes` com `retry-after` de até 86 400 s (o que falta para
fechar as 24 h contadas da primeira mensagem da janela). O teto não vale para ler nem abrir conversa.

A chave é o `contaId` (`conta:<grupo>:<contaId>`), contada depois da autenticação: outra conta atrás do mesmo IP não
é afetada. Acima do limite, 429 `muitas_requisicoes` com o cabeçalho `retry-after` (segundos até a janela abrir). O
contador fica em memória, por processo, como na D2. Os números são constantes, não variáveis de ambiente: mudar um
limite é decisão de produto. Além dos limites, a exportação tem uma fila por processo (uma coletando por vez; ver
"Exportação" em "Dados pessoais (LGPD) e logs").

Nos testes, `montarAplicacao({ limitesPorConta })` troca os números e `limitesPorConta: false` desliga só o limite
por conta; `rateLimit: false` desliga todos os limites (o dos testes que não são sobre limites).

O IP vem da conexão, a menos que `TRUST_PROXY` (em `apps/api/.env`) diga quais proxies são confiáveis. Atrás de
proxy reverso ou balanceador, sem isso todos os clientes chegam com o IP do proxy e dividem o mesmo limite: liste
os IPs/CIDRs do proxy separados por vírgula (ex.: `TRUST_PROXY=10.0.0.1,10.0.1.0/24`). `TRUST_PROXY=true` confia em
qualquer `X-Forwarded-For` e só é seguro quando nada além do proxy alcança a porta da API; com a API exposta
direto, qualquer cliente forjaria o IP e escaparia do limite.

## Dados pessoais (LGPD) e logs

Dado pessoal fica em `contas.email`, em `perfis` (nome, cidade, descrição, habilidades), em `mensagens.texto`, em
`candidaturas.mensagem`, em `avaliacoes.comentario` e nos textos livres de `trampos` e `servicos`. O telefone não é
coletado. A senha só existe
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
Também exporta e exclui uma conta com a senha (403, 200 e 204): nem a senha nem os textos do JSON exportado podem
aparecer no log (CA24). E edita trampo e serviço com sentinelas no corpo dos `PUT` (204, 400, 404, 409 e uma falha
de banco com os textos no `detail`): nenhum deles pode aparecer no log (CA35).

Exclusão da conta (D25, CA17): imediata e definitiva, sem prazo de carência, confirmada com a senha. Tudo numa
transação; se falhar, nada é apagado e repetir é seguro. Para quem interagiu com a conta (CA18):

| O que some | O que o outro participante vê |
|---|---|
| perfil | 404 e "Perfil indisponível" |
| trampos da conta, com as candidaturas recebidas | o candidato perde a candidatura em "Minhas candidaturas"; o detalhe dá 404 |
| serviços da conta | some da busca; o detalhe dá 404 |
| candidaturas da conta | some das recebidas; se era a aceita, o trampo fica em andamento sem contratado, e o autor o resolve encerrando (D34) |
| conversas inteiras, com as mensagens dos dois lados | some da lista; com a conversa aberta, a próxima consulta dá 404 (nunca o 400 do cursor) e a tela mostra "indisponível" |
| sessões de todos os aparelhos | outro aparelho da conta recebe 401 no próximo pedido e vai ao login com "sessão expirada" |
| avaliações feitas e recebidas | a avaliação que a conta deu some da lista e do resumo de quem a recebeu; a que a conta recebeu some junto |
| favoritos dos dois lados | a conta some da equipe favorita de quem a tinha favoritado |

A transação da exclusão grava também a lápide `contas_excluidas` (só o id e a data, sem dado pessoal; D40). A limpeza
periódica (ver "Rodar a API") refaz a exclusão das lápides com mais de 10 min e as apaga, para varrer o que uma
escrita em voo tenha deixado com o id da conta (ADR-007). Módulo novo com dado de conta entra no `excluirTudo`
(ADR-005) e passa a ser varrido também, e implementa `medirExportacao` (a medida que a exportação confere contra o
teto de 10 MiB, D41). O log da limpeza registra só contagens e códigos de erro, nunca o id.

**Medida da exclusão no volume de referência (L4, CA69).** Comando (precisa do banco de teste migrado; só dado
fictício, e o arquivo é pulado sem a variável):

```bash
TRAMPOJA_MEDIR=1 pnpm --filter api exec vitest run --config vitest.integracao.config.ts \
  test/medidas/exclusao-grande.integracao.test.ts --silent=false
```

Volume: uma conta com 200 conversas e 100 000 mensagens, 5 000 trampos com 20 000 candidaturas recebidas, 2 000
candidaturas feitas, 1 000 serviços e o perfil. Resultado (Postgres 16 local em Docker, cache quente,
`statement_timeout` de 10 s, várias rodadas):

| O que | Tempo |
|---|---|
| `POST /contas/eu/exclusao` inteiro | mediana 434 ms (422 a 462), dos quais cerca de 273 ms antes da transação (scrypt da senha) |
| transação (da trava da conta até a resposta, com o commit) | 161 ms (151 a 193) |
| por módulo | conversas 75 ms, trampos 71 ms, serviços 1 ms, contas 1,5 ms, perfis 0,5 ms |
| consulta mais lenta | 58 ms (o `delete` de trampos, quase todo conferindo a FK de candidaturas) |

Com cerca de 1 milhão de linhas de outras contas no banco, a transação foi a cerca de 645 ms, o `POST` a cerca de 930 ms
e a pior consulta a cerca de 200 ms (varredura sequencial em `mensagens` e `candidaturas`). **Conclusão:** a D50
(`set local statement_timeout = '60s'` na exclusão) não foi necessária: o `POST` fica muito abaixo do limite de 5 s
e o `statement_timeout` é por consulta, cuja pior ficou em 0,2 s. Para uma migração futura, a medida recomenda dois
índices: `trampos (autor_id, criado_em desc, id desc)`, que também serve à listagem paginada de Meus trampos, e
`candidaturas (freelancer_id)`. Nenhuma migração foi criada na L4.

Os logs (com IP e sem `contaId`) não mudam: ficam fora do banco. Escritas de terceiros que chegam durante a exclusão
esperam as travas e nunca dão 500 nem deixam linha com o id da conta excluída: enviar mensagem e se candidatar ao
trampo dela terminam em 201 (antes da exclusão, que depois apaga tudo) ou 404; ler a conversa com cursor dá 404, não o
400 do cursor. Abrir conversa com ela (`POST /conversas`) termina em 201 ou 200 (antes; a exclusão espera e apaga a
conversa junto) ou em 403 `sem_vinculo` (depois): a exclusão pega uma trava consultiva exclusiva da conta no início da
transação, e a abertura pega a compartilhada das duas contas e só então confere o vínculo, na mesma transação do
insert (`apps/api/src/compartilhado/banco/travas-de-conta.ts`).

Exportação (D26, CA19): o JSON `trampo-ja.exportacao.v1` (ver "Endpoints"), pedido com a senha. A API monta o JSON
em memória, então só uma exportação coleta por vez em cada processo (`EXPORTACOES_SIMULTANEAS` em
`apps/api/src/modulos/contas/aplicacao/casos-de-uso.ts`); as outras esperam numa fila, depois de conferir a senha, por no máximo 10 s (depois, 503 `servico_ocupado`, D42). O
teto de 10 MiB (D41) é medido no banco antes de coletar; acima dele, 409 `exportacao_grande`. No
app, o arquivo temporário fica só no cache do app e é apagado depois que a folha de compartilhamento fecha; o que
sobrar (o app morreu com a folha aberta) é apagado na próxima abertura do app (ver "Dados pessoais no app").

Textos legais (D27, D28): a política de privacidade e os termos de uso são RASCUNHO em `docs/produto/legal/`, com
marcadores para a identidade do controlador até a revisão jurídica. O app empacota uma cópia em
`apps/mobile/src/textos/legal.ts` (um teste confere versões e títulos com os `.md`). O aceite é só pelo texto do
cadastro, sem registro na API. Ficam fora do código: hospedar a política e a página de pedido de exclusão na web
(exigência das lojas) e o prazo de guarda dos registros de acesso.

### Remover uma avaliação a pedido do titular

A avaliação é imutável pela API (D59) e só some com a exclusão da conta de um dos lados. Se quem avaliou ou quem foi
avaliado pedir a remoção de uma avaliação específica (LGPD, art. 18), o operador a apaga à mão pelo id, com o roteiro
abaixo. Regras:

- Nunca rode `select *` nem selecione `comentario`: o texto é dado pessoal e não deve aparecer no terminal, em
  histórico nem em anexo do pedido. As consultas abaixo mostram só se há comentário.
- Rode no `psql` com `-v ON_ERROR_STOP=1`, para um erro (id fora do formato, por exemplo) parar o roteiro com a
  transação desfeita. A URL do banco vem do ambiente; não a cole na linha de comando.
- Registre o pedido (data, quem pediu e o id da avaliação) fora do banco, sem o comentário.

1. Ache o id. A API não expõe o id da avaliação; procure pelas duas contas (os ids vêm de `contas`, pelo e-mail de
   quem pediu, sem imprimir o e-mail):

   ```sql
   \set avaliador 'uuid-de-quem-avaliou'
   \set avaliado 'uuid-de-quem-foi-avaliado'
   select id, trampo_id, papel_do_avaliado, nota, criada_em,
          comentario is not null as tem_comentario
     from avaliacoes
    where avaliador_id = :'avaliador' and avaliado_id = :'avaliado'
    order by criada_em desc;
   ```

2. Confira e apague numa transação. A primeira consulta trava a linha e tem de devolver exatamente uma; a segunda tem
   de devolver `apagadas = 1`. Qualquer outro resultado: `rollback`.

   ```sql
   \set id 'uuid-da-avaliacao'
   begin;
   select id, trampo_id, avaliador_id, avaliado_id, papel_do_avaliado, nota, criada_em,
          comentario is not null as tem_comentario
     from avaliacoes
    where id = :'id'
      for update;
   with apagada as (delete from avaliacoes where id = :'id' returning id)
   select count(*) as apagadas from apagada;
   ```

3. Só depois de ver `apagadas = 1`, num passo separado (não cole junto com o bloco acima):

   ```sql
   commit;
   ```

   Se algo não bateu, rode `rollback;` no lugar.

O resumo e a lista de avaliações são calculados na hora: a avaliação some deles no pedido seguinte. Depois de apagada,
quem avaliou pode avaliar o mesmo trampo de novo, porque a regra de uma por avaliador e trampo é a própria linha.

## Documentos de produto

Em `docs/produto/`:

- `visao.md`: visão do produto;
- `decisoes.md`: decisões do dono (D1 a D51), que não se reabrem sem fato novo;
- `briefs/mvp-trampo-ja.md`: brief do MVP com os critérios de aceite (CA1 a CA16);
- `planos/mvp-trampo-ja.md`: plano técnico da entrega 1 (backend), com etapas, contratos e ADR;
- `specs/mvp-trampo-ja.md`: spec das telas do app (entrega 2);
- `planos/mvp-trampo-ja-app.md`: plano técnico da entrega 2a (app mobile);
- `planos/mvp-trampo-ja-app-2b.md`: plano técnico da entrega 2b (publicação, candidaturas e meus anúncios);
- `planos/mvp-trampo-ja-app-2c.md`: plano técnico da entrega 2c (conversas);
- `planos/pre-lancamento-lojas.md` e `specs/pre-lancamento-lojas.md`: plano e spec do pré-lançamento nas lojas
  (entrega L1: conta, privacidade e limites);
- `planos/pre-lancamento-l2.md`: plano técnico da entrega L2 (editar, encerrar e excluir anúncios e retirar
  candidatura), com o ADR-006;
- `planos/pre-lancamento-l3.md`: plano técnico da entrega L3 (endurecimento de segurança: banco remoto e TLS, limites
  de login, fila com espera máxima, NFC, limpeza periódica e teto da exportação), com o ADR-007;
- `planos/pre-lancamento-l4.md` e `specs/pre-lancamento-l4.md`: plano e spec da entrega L4 (qualidade: limite dos
  campos por ponto de código, faixa única sem conexão, ordem das mensagens, Meus trampos paginado, retirar sob trava,
  espera da lápide e medida da exclusão), com o ADR-008 e o roteiro manual do aparelho;
- `legal/politica-de-privacidade.md` e `legal/termos-de-uso.md`: rascunhos dos textos legais (D28).
