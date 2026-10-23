# Plano técnico: pré-lançamento nas lojas, entrega L2 (anúncios e candidaturas)
- Brief: sem brief próprio. Escopo em `docs/produto/planos/pre-lancamento-lojas.md` ("Entregas seguintes" > L2) e na D30 (`docs/produto/decisoes.md:67`).
- Spec: `docs/produto/specs/pre-lancamento-lojas.md`, seções 6 e 7 e os estados e textos ligados a elas. Os "[conforme o plano]" estão resolvidos em "Divergências com a spec".
- Data: 2026-10-23. Linha de base: commit `1d2f0dd`. Typecheck e lint ok; `pnpm test` com API 814 e app 1945 (60 suítes); integração com 369 testes em 28 arquivos.

## Objetivo e critérios de aceite
Quem publica corrige, encerra e apaga o próprio anúncio, e quem se candidatou desiste enquanto a candidatura está pendente. A numeração continua a da L1.
- CA25 (editar trampo): o autor substitui todos os campos de um trampo `aberto` e sem candidaturas, com as validações do CA5 e mandando a `versao` lida. `criadoEm` e a posição na busca não mudam. Com candidatura, em andamento ou encerrado, a API responde 409 `trampo_nao_editavel`. Com `versao` velha, responde 409 `conflito_de_versao` e nada muda. Trampo de outra conta ou inexistente dá 404.
- CA26 (serviço): o autor edita o serviço, com as validações do CA6 e da D7 e com `versao`, e pode excluí-lo. O serviço excluído some da busca e o detalhe dele dá 404. Serviço de outra conta dá 404.
- CA27 (encerrar): trampo `aberto` ou `em_andamento` passa a `encerrado`. As candidaturas pendentes viram recusadas, o trampo sai da busca, nova candidatura e aceite dão 409 `trampo_nao_aberto`, e as conversas continuam. Encerrar de novo responde 204 e não muda nada. É assim que o autor resolve o trampo em andamento cuja contratada excluiu a conta (D25).
- CA28 (excluir trampo): só trampo `aberto`. Apaga o trampo e as candidaturas; o detalhe passa a dar 404 e as conversas continuam. Em andamento ou encerrado, a API responde 409 `trampo_nao_aberto`. Se uma candidatura chegar ao mesmo tempo, o candidato recebe 201 (e a candidatura é apagada junto) ou 404, nunca 500 nem candidatura órfã.
- CA29 (retirar): só a candidatura `pendente` do próprio freelancer. A linha é apagada e ele pode se candidatar de novo. Candidatura aceita ou recusada dá 409 `candidatura_nao_pendente`; de outra conta, 404. A conversa já aberta continua. Uma gravação concorrente do trampo nunca traz de volta uma candidatura apagada, seja por retirada, seja por exclusão de conta.
- CA30 (migração e conta): a `0006` aceita `encerrado` e cria `servicos.versao`, com 1 nas linhas atuais. O `down` aborta se houver trampo encerrado e não apaga nada. Exclusão e exportação de conta (ADR-005) continuam completas com trampos encerrados e serviços editados.
- CA31 (contrato e limites): `versao` e `candidaturasRecebidas` só aparecem para o autor; para os demais, as respostas não mudam. Os `PUT` contam em `publicacao`; os `DELETE` e o encerrar, em `escrita`. Toda rota nova exige sessão.
- CA32 (app, editar): o formulário abre preenchido e o botão diz "Salvar alterações". No sucesso, volta ao detalhe com "Alterações salvas.". Erro de campo, falta de conexão e 429 mantêm o rascunho. O 409 de conflito mostra um aviso com "Ver versão atual", que recarrega a base e mantém o que a pessoa mexeu. Anúncio que não pode ser editado mostra o aviso e os campos desabilitados. Sair com alterações não salvas pergunta "Descartar alterações?".
- CA33 (app, mais opções): o botão "Mais opções" aparece em Meus anúncios e, para o autor, no detalhe. A folha traz Editar, Encerrar (só para trampo aberto ou em andamento) e Excluir; a ação indisponível aparece desabilitada com o motivo. Os diálogos dizem o efeito e o sucesso mostra um toast. Um 404 é tratado como "já removido". O selo "Encerrado" aparece em Meus anúncios, no detalhe e em Candidaturas recebidas.
- CA34 (app, retirar): "Retirar candidatura" aparece em Minhas candidaturas e no rodapé do trampo, só para candidatura pendente e sempre com diálogo. No sucesso, a candidatura sai da lista e o rodapé volta a "Candidatar-se". O 409 avisa que ela já foi respondida e recarrega; o 404 tira da lista. Duplo toque faz um `DELETE` só. Em trampo encerrado, a folha de candidatura mostra "fechado" e traduz `trampo_nao_aberto`.
- CA35 (estende o CA15 e o CA24): os textos enviados no `PUT` e o rascunho da edição nunca vão para log, erro, URL, cache de mutações nem `console`. O aviso de retorno guarda só a chave do texto.

## Contexto atual
- **Trampo:** `StatusDoTrampo` só tem `aberto | em_andamento` (`apps/api/src/modulos/trampos/dominio/trampo.ts:23`). A validação mora dentro de `Trampo.criar` (`:109-188`). `candidatar` e `aceitar` recusam o que não está `aberto` (`:263`, `:280`). A check do banco é `trampos_status_valido` (`apps/api/migracoes/0002_trampos.ts:33-36`).
- **Gravação do trampo:**
  - `atualizarTrampo` só regrava `status` e `versao` (`trampos/adaptadores/postgres/repositorio-postgres.ts:169-182`).
  - `sincronizarCandidaturas` insere toda candidatura do agregado que não está no banco e nunca apaga nenhuma (`:185-221`, em especial `:196`).
  - **Achado:** se a conta X é excluída entre a leitura e a gravação de um aceite no trampo de Y, a candidatura de X, com a mensagem dela, é inserida de novo. A exclusão não mexe na linha do trampo de Y (`:443-483`). Raciocinado a partir do código, sem teste.
- **Caso de uso:** `alterarTrampo` relê e reaplica a regra quando perde a trava (`trampos/aplicacao/casos-de-uso.ts:205-225`). O corpo é fechado com `propertyNames` (`trampos/adaptadores/http/rotas.ts:40-52`). `TRAMPO_PUBLICO` não traz `versao` (`:83-110`).
- **Serviço:** não há `versao` (`migracoes/0003_servicos.ts:10-33`). `salvar` só insere (`servicos/adaptadores/postgres/repositorio-postgres.ts:69-71`). O status só pode ser `ativo` (`0003:28`, `servicos/dominio/servico.ts:23`).
- **Conta (ADR-005):**
  - A exclusão apaga trampos e serviços pelo autor, sem olhar o status (`trampos/.../repositorio-postgres.ts:443-483`, `servicos/.../repositorio-postgres.ts:177-188`), e a exportação manda o `status` como texto (`:384-403`).
  - O teste que lê o `information_schema` só procura colunas de dono (`test/e2e/exclusao-e-exportacao.integracao.test.ts:265-300`). A `0006` não cria tabela nem coluna de dono, então nada muda.
- **Vínculo de conversa:** é conferido só na abertura (`conversas/adaptadores/postgres/repositorio-postgres.ts:79-89`, `trampos/.../repositorio-postgres.ts:341-364`). Depois de aberta, a conversa sobrevive à candidatura.
- **Limites e rotas:**
  - Só `POST` tem grupo próprio (`compartilhado/http/limite-por-conta.ts:64-72`, `:98-113`).
  - Há tabelas explícitas de rotas e grupos (`src/composicao.test.ts:95-118`, `:129-151`).
  - `test/e2e/autenticacao.integracao.test.ts` varre toda rota registrada.
  - O `down` segue `removerTabelaSeVazia` (`compartilhado/banco/migrador.ts:91-111`).
- **App, dados e estado:**
  - O cliente já tem `put` e `delete` (`apps/mobile/src/api/cliente.ts:60-80`). O status está em `api/tipos.ts:105`.
  - O formulário guarda só o que a pessoa mexeu em `edicao`, por cima da base (`estado/formulario-de-anuncio.ts:122-137`).
  - `useMutacaoComInvalidacao` usa chaves fixas por hook (`estado/consultas/anuncios.ts:230-256`).
  - O papel sai das listas "minhas" (`estado/rodape-do-trampo.ts:41-63`).
  - A folha de candidatura já trata `trampo_nao_aberto` e `conflito_de_versao` (`app/(app)/trampos/[id].tsx:269-293`); a L2 só cobre o caso do trampo encerrado.
- **App, telas e navegação:**
  - `Selo` não tem `encerrado` (`componentes/Selo.tsx:7-13`). Três telas decidem o texto pelo status (`telas/DetalheDoTrampo.tsx:39-45`, `telas/CandidaturasRecebidas.tsx:74-97`, `telas/MeusAnuncios.tsx:8-12`).
  - O `Rolavel` não tem espaço à direita no cabeçalho (`telas/base.tsx:123-152`).
  - O `expo-router` 57 exporta `useNavigation` (`node_modules/.pnpm/expo-router@57.0.28_*/…/build/exports.d.ts:18`). O `beforeRemove` não foi verificado.

## Abordagens consideradas
| Tema | A (recomendada) | B | Por que A |
|---|---|---|---|
| Trava de versão | O `PUT` leva a `versao` do app. Encerrar, excluir e retirar usam a trava só no servidor e reaplicam a regra | Toda ação leva `versao` (no corpo ou em `If-Match`) | Toda candidatura sobe a versão do trampo, então em B encerrar ou excluir daria 409 só porque alguém se candidatou. Além disso, o cliente não lê cabeçalhos |
| Expor a versão | Só na visão do autor | Em todo `GET` | Em B, quem não é autor deduz pela versão quantas candidaturas o trampo recebeu |
| Retirar | Apaga a linha | Status `retirada`, que exige mudar a check | A D30 permite candidatar de novo, e o índice único barraria. Sem histórico, há menos estado |
| Conflito no app | Recarrega a base e mantém os campos mexidos | Área "Suas alterações", ou só recarregar | O formulário já separa o que mudou (`edicao`). B dobra a tela ou perde o texto digitado |
| Toast depois de voltar | Aviso pendente em `estado/`, consumido pela tela de destino (mesmo padrão do aviso do login) | Parâmetro de rota | `router.back()` não leva parâmetro |

## Decisão
- **Ordem das checagens na API:**
  1. O schema (400) vem antes de tudo e não revela se o recurso existe.
  2. Depois, 404: recurso inexistente, de outra conta ou com id fora do formato uuid.
  3. Depois, a regra (409).
  4. Depois, a versão (409).
  5. Por fim, os campos (400).
- **Concorrência:** todas as escritas de trampo travam primeiro a linha de `trampos` (pelo `UPDATE … WHERE versao` ou pelo `select … for update`) e só depois as candidaturas. É a mesma ordem da exclusão de conta, então não há deadlock.
- **Excluir e encerrar trampo:** o caso de uso usa `alterarSobTrava` (trava pessimista da linha do trampo, sem versão; ajuste da rodada 1, S1). Se o trampo sumiu, responde 404.
- **Correção do achado:** o agregado guarda os ids das candidaturas lidas em `reconstituir`. O repositório insere só as candidaturas que a operação criou e apaga só as que ela removeu. Um `UPDATE` de status numa linha já apagada não afeta nada.
- **Encerrado é estado final:** o trampo não reabre, não é editado nem excluído (D30) e continua em Meus anúncios.
- **App:**
  - Uma função pura, `acoesDoAnuncio`, decide quais ações aparecem, quais ficam disponíveis e o motivo de cada bloqueio. O hook `useAcoesDoAnuncio` cuida da folha, dos diálogos, do toast e dos erros, e é usado por três rotas.
  - A edição usa duas rotas novas, `trampos/editar/[id]` e `servicos/editar/[id]`, com o mesmo `useFormularioDeAnuncio`.

## Esquema e contratos
**Migração `apps/api/migracoes/0006_anuncios.ts`**
- `up`: troca `trampos_status_valido` por `status in ('aberto','em_andamento','encerrado')`. Cria `servicos.versao integer not null default 1` com a check `servicos_versao_positiva (versao >= 1)`.
- `down`:
  - Primeiro, `lock table trampos in access exclusive mode`. Se existir linha `encerrado`, lança `Error('0006: há trampos encerrados; o down não apaga nem converte dados')`, sem nenhum valor na mensagem, e nada muda.
  - Senão, restaura a check antiga e remove `servicos.versao`, que é só um contador e não guarda dado de pessoa.

**API (todas exigem sessão; 401 e 429 valem para todas)**
| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `PUT /trampos/:id` | `{titulo, descricao, categoria, cidade, valorCentavos, prazo?, versao}`. `prazo` ausente ou `null` remove o prazo | 204 | 400 `dados_invalidos`; 404; 409 `trampo_nao_editavel`, `conflito_de_versao` |
| `POST /trampos/:id/encerrar` | sem corpo | 204, inclusive se o trampo já estava encerrado | 404 |
| `DELETE /trampos/:id` | — | 204 | 404; 409 `trampo_nao_aberto` |
| `DELETE /candidaturas/:id` | — | 204 | 404; 409 `candidatura_nao_pendente` |
| `PUT /servicos/:id` | `{titulo, descricao, categoria, cidade?, precoBaseCentavos, versao}`. `cidade` ausente ou `null` fica sem cidade (D7) | 204 | 400; 404; 409 `conflito_de_versao` |
| `DELETE /servicos/:id` | — | 204 | 404 |

- **Corpo:** `versao` é `integer` com `minimum: 1` e é obrigatória. O corpo continua fechado com `propertyNames`, então não há como mudar autor, status nem data.
- **Visão do autor:**
  - `GET /trampos/meus` ganha `versao` e `candidaturasRecebidas`; `GET /trampos/:id` também, mas só quando `autorId === contaId`.
  - `GET /servicos/meus` ganha `versao`; `GET /servicos/:id` também, só para o autor.
  - Nos schemas, os dois campos são opcionais.
- **Limites:** `PUT /trampos/:id` e `PUT /servicos/:id` vão para `publicacao`, num mapa por `MÉTODO url`. `PUT /perfis/eu` continua em `escrita`, e as demais rotas novas também ficam em `escrita`.

**Domínio e portas (API)**
- Trampo:
  - `StatusDoTrampo` ganha `'encerrado'`. A validação sai de `criar` para uma função `lerCamposDoTrampo(entrada)`, que `criar` e `editar` usam.
  - `editar(quem, versaoLida, entrada)` recalcula `cidadeNormalizada` e `textoBusca`.
  - `encerrar(quem): boolean` devolve `false` se o trampo já estava encerrado, e aí nada é gravado.
  - Também ganha `conferirExclusao(quem)`, `retirar(candidaturaId, quem)` e `alteracoesDasCandidaturas(): {inseridas, removidas}`.
- `RepositorioDeTrampos`:
  - `salvar` passa a gravar todos os campos editáveis.
  - `alterarSobTrava(id, decidir)`: numa transação, `select … for update` no trampo sem filtro de versão, lê as candidaturas, aplica `decidir` (`salvar`, `excluir` ou `nada`) e grava; ao excluir, trava as candidaturas em ordem de id e apaga as candidaturas e o trampo. Substituiu o `excluir(trampo)` com versão lida (rodada 1, S1).
  - `trampoDaCandidatura(id): Promise<string|null>`.
  - `listarDoAutor` passa a devolver `TrampoDoAutor = TrampoResumo & {versao, candidaturasRecebidas}`.
- Casos de uso de trampos: `editarTrampo`, `encerrarTrampo`, `excluirTrampo`, `retirarCandidatura` e `obterTrampo(id, quem)`.
- Serviço:
  - `Servico` ganha `versao`, e `editarServico(atual, entrada): Servico` usa a mesma validação de `criarServico`.
  - `RepositorioDeServicos` ganha `atualizar(servico): Promise<boolean>`, com `WHERE id, autor_id e versao = lida` e versão nova igual à lida mais 1, e `excluir(id, autorId): Promise<boolean>`.
  - Se `atualizar` não afetar linha, o caso de uso relê: se o serviço sumiu, 404; senão, conflito.

**App (`M` = `apps/mobile/src`)**
- `api/`:
  - Funções novas: `editarTrampo(c, id, entrada & {versao})`, `encerrarTrampo(c, id)` (sem corpo), `excluirTrampo`, `retirarCandidatura(c, candidaturaId)`, `editarServico` e `excluirServico`, todas `Promise<void>`.
  - `StatusDoTrampo` ganha `'encerrado'`. `Trampo` ganha `versao?` e `candidaturasRecebidas?`; `Servico` ganha `versao?`.
- `estado/consultas/`:
  - Hooks novos: `useEditarTrampo(id)`, `useEditarServico(id)`, `useEncerrarTrampo()`, `useExcluirAnuncio(tipo)` e `useRetirarCandidatura()`.
  - `ChavesDaMutacao` ganha `remover?`, e as chaves podem ser uma função da entrada. A exclusão remove `trampo(id)` do cache em vez de recarregar o que daria 404.
- `estado/acoes-do-anuncio.ts`:
  - `acoesDoAnuncio({tipo, status, candidaturasRecebidas}, online)` devolve `{editar, encerrar?, excluir, efeitoDoEncerrar, efeitoDoExcluir}`.
  - `useAcoesDoAnuncio({aoExcluir?})` devolve `{folha, abrir(anuncio), toast, fecharToast}`. Tem `useRef` contra duplo toque e trata o 404 como "já removido".
- `estado/formulario-de-anuncio.ts`:
  - A configuração ganha `inicial?: {valores, versao, editavel} | null`, `carregamento?` e `recarregar?`. O retorno ganha `salvo` e `alterado`.
  - O 409 é lido direto do `ErroDaApi`, como `codigoDoConflito` em `trampos/[id].tsx`.
- `estado/aviso-de-retorno.ts`: `avisarAoVoltar(chave, geracao)` e `useAvisoDeRetorno(ativa) → {texto, limpar}`. O aviso vale por 10 s e só para a mesma `geracao`.
- `telas/tipos.ts` (etapa 1; só acréscimos opcionais e alargamentos):
  - `StatusDoTrampoParaExibir = StatusDoTrampo | 'encerrado'`, aplicado em `TrampoParaExibir`, `MeuAnuncioParaExibir` e no trampo de `PropsDasCandidaturasRecebidas`.
  - `AcaoDoAnuncio {disponivel, motivo?}`; quando a ação não existe para o anúncio, o campo fica ausente e a ação não aparece.
  - `PropsDaFolhaDeAcoes {visivel, titulo, tipo, editar, encerrar?, excluir, efeitoDoEncerrar, efeitoDoExcluir, processando: 'encerrar'|'excluir'|null, erro?, onEditar, onEncerrar, onExcluir, onFechar}`. `onEncerrar` e `onExcluir` só são chamados depois do diálogo, que fica na folha.
  - Meus anúncios ganha `folha?`, `onMaisOpcoes?(item)`, `toast?` e `onFecharToast?`. Os dois detalhes ganham `onMaisOpcoes?` e `folha?`; o do serviço também ganha `sobreposicao?`.
  - O formulário ganha `edicao?: {situacao: 'carregando'|'erro'|'nao_encontrado'|'pronta', naoEditavel, conflito, descartarVisivel, onTentarDeNovo, onVerVersaoAtual, onDispensarConflito, onDescartar, onContinuarEditando}`.
  - `MinhaCandidaturaParaExibir` ganha `podeRetirar?`. Minhas candidaturas ganha `retirando?`, `aviso?`, `toast?`, `onRetirar?(id)` e `onFecharToast?`. O rodapé do trampo ganha `retirar?: {retirando, motivo: string|null, onRetirar}`.
- **Textos (etapa 1):** os das seções 6 e 7 da spec, com as trocas abaixo, mais:
  - `selos.encerrado` ("Encerrado");
  - o erro `trampo_nao_editavel`;
  - os motivos: editar com candidaturas, editar em andamento, editar encerrado, excluir quando não está aberto, e sem conexão;
  - a mensagem de encerrar em duas versões, para trampo aberto e em andamento;
  - "Este anúncio já não existe.".

## Etapas
- **Siglas:** `A` = `apps/api`, `M` = `apps/mobile/src`.
- **Base de verificação:**
  - API: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api exec vitest run <arquivos>`. Integração de um arquivo: `pnpm --filter api exec vitest run --config vitest.integracao.config.ts <arquivo>`, com `docker compose up -d banco` e `pnpm --filter api migrar -- --teste`.
  - App: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <arquivos>`.
- **Banco de teste:** é um só, então cada grupo tem no máximo uma etapa com integração (2, 4, 9 e 12).
- **Tipos de rota** (etapas 13 e 15): em `apps/mobile`, rode `CI=1 EXPO_NO_TELEMETRY=1 timeout 50 pnpm exec expo start --port 8099 --no-dev` e depois o typecheck.

| # | Etapa | Arquivos | Verificação | Resp. | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Textos e props acima. `Selo` ganha `encerrado`, e as três telas que mostram status passam a mostrar "Encerrado". Teste: selo e texto nas três telas | `M/textos/pt-BR.ts`, `M/telas/tipos.ts`, `M/componentes/Selo.tsx`, `M/telas/{DetalheDoTrampo,CandidaturasRecebidas,MeusAnuncios}.tsx`, `M/telas/encerrado.test.tsx` | base app + `jest src/telas/encerrado` | designer | A | não | 32–34 |
| 2 | Migração `0006`. Testes: `encerrado` aceito e `fechado` recusado; `versao` igual a 1 numa linha antiga de serviço; `down` com trampo encerrado aborta e deixa tudo como estava; sem encerrado, desce e sobe de novo | `A/migracoes/0006_anuncios.ts`, `A/test/migracao-0006.integracao.test.ts` | base API + integração do arquivo | dev | A | **sim** (migração) | 30 |
| 3 | Limite: os dois `PUT` em `publicacao`; `PUT /perfis/eu`, os `DELETE` e o encerrar em `escrita`. Testes de `grupoDaRota` e `gruposDaRota` | `A/src/compartilhado/http/limite-por-conta{,.test}.ts` | base API + vitest do arquivo | dev | A | **sim** (abuso) | 31 |
| 4 | Módulo `servicos`: `versao` no domínio e nas tabelas, `editarServico`, `atualizar`, `excluir`, as duas rotas, `versao` na visão do autor, a fachada e as linhas novas em `composicao.test.ts` (lista de rotas e grupos). Testes BDD e de rota: 404 para outra conta e para id inválido; conflito com versão velha; 400 com chave extra (`autorId`, `status`); sem cidade (D7); `versao` ausente no `GET` de terceiro. Integração: a edição muda `texto_busca` e a busca acha o texto novo; `UPDATE` concorrente com a mesma versão faz um vencer e o outro levar 409 | `A/src/modulos/servicos/{index.ts,dominio/{servico,servico.test,portas}.ts,aplicacao/{casos-de-uso.ts,servicos.bdd.test.ts}}`, `.../adaptadores/{memoria/repositorio-memoria.ts,postgres/{tabelas,repositorio-postgres,repositorio-postgres.integracao.test}.ts,http/{rotas,rotas.test}.ts}`, `A/src/composicao.test.ts` | base API + `vitest run src/modulos/servicos src/composicao.test.ts` + integração do repositório | dev | B | **sim** (autorização, concorrência) | 26, 31 |
| 5 | Endpoints e tipos no app. Testes: método, caminho e corpo de cada função (o `PUT` leva `versao`; o encerrar vai sem corpo e sem `Content-Type`); 404 e 409 sobem como `ErroDaApi` | `M/api/{trampos,servicos,tipos}.ts`, `M/api/anuncios-e-candidaturas.test.ts` | base app + `jest src/api` | dev | B | não | 32–34 |
| 6 | `FolhaDeAcoesDoAnuncio` (folha com diálogo próprio; "Cancelar" é o padrão), "Mais opções" de 44×44 ao lado de cada cartão em Meus anúncios, o mesmo botão no cabeçalho dos dois detalhes, e `direita` no `Rolavel`. Testes: ação oculta, desabilitada com motivo, diálogo destrutivo, "Encerrando…" e "Excluindo…", erro na folha | `M/componentes/{FolhaDeAcoesDoAnuncio.tsx,index.ts}`, `M/telas/{MeusAnuncios,DetalheDoTrampo,DetalheDoServico,base}.tsx`, `M/telas/acoes-do-anuncio.test.tsx` | base app + `jest src/telas/acoes-do-anuncio src/telas/telas` | designer | B | não | 33 |
| 7 | `FormularioDeAnuncio` com `edicao`: título "Editar…", "Salvar alterações" e "Salvando…", esqueleto, erro com "Tentar de novo", `NaoEncontrado`, aviso de conflito com dois botões, aviso de "não editável" com campos desabilitados e o diálogo de descarte. Testes desses estados | `M/telas/FormularioDeAnuncio.tsx`, `M/telas/editar-anuncio.test.tsx` | base app + `jest src/telas/editar-anuncio src/telas/publicacao` | designer | B | não | 32 |
| 8 | "Retirar candidatura" na linha da Minha candidatura pendente e no rodapé do candidatado, com o diálogo "Manter candidatura" e "Retirar candidatura", "Retirando…", aviso e toast. Testes desses estados | `M/telas/{MinhasCandidaturas,RodapeDoTrampo}.tsx`, `M/telas/retirar-candidatura.test.tsx` | base app + `jest src/telas/retirar-candidatura src/telas/candidaturas` | designer | B | não | 34 |
| 9 | Módulo `trampos`: domínio, portas e casos de uso dos "Contratos", a correção do achado, as 4 rotas, a visão do autor, a fachada e as linhas de `composicao.test.ts`. Testes BDD: cada CA25 a CA29 com o autor, um terceiro e o candidato; o encerrar recusa as pendentes; candidatar a trampo encerrado dá 409. Integração: o achado (apagar a linha de uma candidatura entre a leitura e o aceite não a recria); excluir em corrida com 10 candidaturas (só 201 ou 404, sem órfã); retirar e candidatar de novo; a contagem em `listarDoAutor` | `A/src/modulos/trampos/{index.ts,dominio/{trampo,trampo.test,portas}.ts,aplicacao/{casos-de-uso.ts,trampos.bdd.test.ts}}`, `.../adaptadores/{memoria/repositorio-memoria.ts,postgres/{tabelas,repositorio-postgres,repositorio-postgres.integracao.test}.ts,http/{rotas,rotas.test}.ts}`, `A/src/composicao.test.ts` | base API + `vitest run src/modulos/trampos src/composicao.test.ts` + integração do repositório | dev | C | **sim** (autorização, concorrência, dado de terceiro) | 25, 27–29, 31 |
| 10 | Estado: os hooks de mutação (com as chaves que invalidam e removem), `trampo_nao_editavel` em `erros.ts` e `acoes-do-anuncio.ts`. Testes: a tabela completa de `acoesDoAnuncio` (status × candidaturas × online); a exclusão remove `trampo(id)` do cache; 404 tratado como removido; duplo toque faz uma requisição só; geração trocada não invalida nada | `M/estado/consultas/{anuncios,candidaturas}.ts`, `M/estado/{erros,acoes-do-anuncio}.ts`, `M/estado/consultas/anuncios-e-candidaturas.test.tsx`, `M/estado/{erros,acoes-do-anuncio}.test.ts` | base app + jest dos 3 testes | dev | C | não | 32–34 |
| 11 | Modo editar em `useFormularioDeAnuncio` e `aviso-de-retorno.ts`. Testes: a base vem de `inicial`; `alterado` só depois de mexer; "Ver versão atual" chama `recarregar`, mantém `edicao` e passa a usar a versão nova; `trampo_nao_editavel` vira `naoEditavel`; o aviso expira e não atravessa a troca de geração | `M/estado/{formulario-de-anuncio,aviso-de-retorno}.ts`, `M/estado/{formulario-de-anuncio,aviso-de-retorno}.test.ts(x)` | base app + jest dos 2 testes | dev | C | não | 32, 35 |
| 12 | e2e com duas contas, de ponta a ponta, para CA25 a CA31: D25 mais encerrar resolve o trampo sem contratado; exclusão e exportação de conta com trampo encerrado e serviço editado (`status: "encerrado"` no JSON v1); 404 para terceiros. Nos logs, sentinelas no corpo dos `PUT` | `A/test/e2e/anuncios.integracao.test.ts`, `A/test/e2e/logs-sem-dado-pessoal.integracao.test.ts` | `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:integracao` | dev | D | **sim** (autorização, logs) | 25–31, 35 |
| 13 | Rotas `(app)/trampos/editar/[id]` e `(app)/servicos/editar/[id]`: carregam com `useTrampo`/`useServico`, montam a entrada com `versao`, salvam, chamam `avisarAoVoltar('alteracoes_salvas')` e voltam. O "Descartar alterações?" usa `useNavigation().addListener('beforeRemove')`. As duas rotas entram em `ROTAS_REAIS`. Testes: CA32 inteiro com o fetch falso, 429 com o rascunho mantido, voltar com alteração pergunta antes | `M/app/(app)/{trampos,servicos}/editar/[id].tsx`, `M/testes/qa/apoio-qa.tsx`, `M/testes/rotas/editar-anuncio.test.tsx` | base app + `jest src/testes/rotas/editar-anuncio` + tipos de rota | dev | D | **sim** (rascunho com dado pessoal) | 32, 35 |
| 14 | Retirar nas rotas de Minhas candidaturas e do detalhe do trampo (rodapé). Testes: CA34 inteiro; trampo encerrado leva o rodapé a "fechado" e o 409 `trampo_nao_aberto` aparece na folha | `M/app/(app)/candidaturas/index.tsx`, `M/app/(app)/trampos/[id].tsx`, `M/testes/rotas/retirar-candidatura.test.tsx` | base app + `jest src/testes/rotas/retirar-candidatura src/testes/rotas/candidatura-e-aceite` | dev | D | não | 34 |
| 15 | "Mais opções" nas rotas de Meus anúncios e dos dois detalhes (só para o autor, pelas listas "minhas"). Editar navega para `/…/editar/[id]`; excluir pelo detalhe chama `avisarAoVoltar` e volta. As três rotas mostram o aviso de retorno. Testes: CA33 inteiro, inclusive o 404 de "já removido" e "Alterações salvas." no detalhe | `M/app/(app)/{meus-anuncios.tsx,servicos/[id].tsx}`, `M/app/(app)/trampos/[id].tsx`, `M/testes/rotas/acoes-do-anuncio.test.tsx` | base app + `jest src/testes/rotas` + tipos de rota | dev | E | não | 33 |
| 16 | CA35: sentinelas no rascunho da edição (console, cache de mutações, URL, `testID`, aviso de retorno). No `README.md`: endpoints, a visão do autor, o limite, a migração `0006` e "Rotas e telas" | `M/testes/sem-dado-pessoal.test.tsx`, `README.md` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | F | **sim** (dado pessoal) | 35 |

Ordem: A (1–3) → B (4–8) → C (9–11) → D (12–14) → E (15) → F (16).
- **Nenhum arquivo se repete dentro de um grupo.**
  - `composicao.test.ts` aparece só na 4 e na 9, que ficam em grupos diferentes. Assim, a suíte fica verde ao fim de cada grupo.
  - `trampos/[id].tsx` aparece na 14 e na 15; `DetalheDoTrampo.tsx` e `MeusAnuncios.tsx`, na 1 e na 6. Sempre em grupos diferentes.
- **Dependências:**
  - a 4 depende da 2 e da 3; a 9, da 2, 3 e 4;
  - a 5 depende da 1, porque o tipo alargado em `telas/tipos.ts` é o que deixa as telas compilarem com `encerrado`;
  - a 6, a 7 e a 8 dependem da 1; a 10 e a 11, da 5;
  - a 12 depende da 9; a 13, da 7, 10 e 11; a 14, da 8 e da 10; a 15, da 6, 10, 11 e 13.
- **Maior etapa:** a 9 tem 13 arquivos. Não dá para cortar sem quebrar o typecheck no meio, porque a porta muda junto com os adaptadores. Delegue com `model: opus`.
- **Docs:** o lead registra as D33 a D37 em `docs/produto/decisoes.md` depois da aprovação.

## Pontos para o seguranca
- **Autorização:** recurso de outra conta, inexistente ou com id que não é uuid recebe o mesmo 404, nunca 403 nem 500. O corpo fechado impede trocar autor, status, `criadoEm` e a `versao` fora de `integer >= 1`.
- **Vazamento:** `versao` e `candidaturasRecebidas` só saem na visão do autor. Os testes da 4, da 9 e da 12 conferem a resposta para um terceiro.
- **Concorrência:**
  - A ordem das travas é sempre trampo e depois candidaturas, a mesma da exclusão de conta.
  - A correção do achado impede que um dado de conta excluída volte. A exclusão de trampo leva junto as candidaturas dos outros, o que é esperado pela D30.
- **Abuso:**
  - Editar conta em `publicacao` (30/h, contador junto com publicar). A edição substitui o texto e não acumula, então a exportação não cresce. Isso responde ao gatilho "edição de texto" do resíduo S1-R da L1.
  - Retirar e se candidatar de novo gasta `publicacao`.
- **Logs:** nenhum texto do `PUT` em log ou erro (12). No app, o rascunho fica só no estado da rota, as mutações têm `gcTime: 0` e o aviso de retorno guarda só a chave.
- **Migração:** o `up` é aditivo. O `down` aborta com trampo encerrado e só derruba o contador `servicos.versao`.

## Riscos e como reverter
- **Migração:**
  - Para reverter, use `pnpm --filter api migrar -- --baixar`. Com trampo encerrado no banco, o `down` aborta de propósito; converter `encerrado` em outro status seria decisão do dono, e não há script para isso.
  - O `down` zera os contadores de versão dos serviços. Um app que mande versão velha depois disso recebe 409 e recarrega.
- **Reescrita de `sincronizarCandidaturas`:** pode regredir candidatar ou aceitar. A cobertura atual (BDD, integração e `test/qa/candidaturas`) roda inteira na 12.
- **`useMutacaoComInvalidacao` generalizado:** os hooks atuais não mudam de chave. Os testes de `anuncios-e-candidaturas` cobrem.
- **Pontos não verificados:**
  - `beforeRemove` pelo `useNavigation()` do `expo-router` 57 e no `render-router` do jest. Plano B: perguntar só no "Voltar" do cabeçalho e aceitar que o gesto do sistema descarte sem perguntar. O dev registra no relatório.
  - O aviso de retorno se perde se a volta cair numa tela que não o consome, como a Busca. Risco aceito: o dado novo já aparece na tela.
- **Reverter o código:** pelo git, por etapa. A API e o app são compatíveis nos dois sentidos, porque os campos novos são opcionais.

## Perguntas em aberto e premissas adotadas
**Decisões para o dono (recomendo todas):**
- **D33, trava de versão:** só a edição leva a `versao` do app. Encerrar, excluir e retirar reaplicam a regra no servidor. `versao` e a contagem de candidaturas aparecem só para o autor. O serviço ganha `versao` na `0006`.
- **D34, encerrado é estado final:** não reabre. Encerrar de novo responde 204 sem mudança. O trampo em andamento sem contratado (D25) se resolve encerrando, e o trampo encerrado continua em Meus anúncios.
- **D35, conversas e histórico:**
  - Retirar apaga a candidatura, e ela some de Minhas candidaturas (responde a P8 da spec).
  - Retirar candidatura ou excluir trampo não mexe na conversa já aberta; uma conversa nova depende de outro vínculo (D4).
  - Quem tinha candidatura num trampo excluído só a vê sumir, sem aviso.
- **D36, limites:** os `PUT` de anúncio entram em `publicacao`; excluir, encerrar e retirar, em `escrita`.
- **D37, conflito na edição:** "Ver versão atual" recarrega e mantém os campos que a pessoa mexeu, sem a área "Suas alterações".

**Divergências com a spec (o lead alinha com o designer na etapa 1):**
- Encerrar vale para trampo aberto **e** em andamento, com uma mensagem para cada status.
- Excluir só trampo aberto. O motivo é "Só trampo aberto pode ser excluído.", e não "Encerre-o primeiro", que levaria a um beco, porque o encerrado também não pode ser excluído.
- O trampo é editável por inteiro ou não é: não há campo bloqueado sozinho. O motivo aparece na folha e no aviso do formulário.
- Conflito: o texto deixa de pedir "refaça sua alteração", porque o que a pessoa mexeu fica mantido. O designer finaliza o texto.
- Não há "Pausar serviço" (D30, P7). O 404 em encerrar ou excluir mostra "Este anúncio já não existe." e recarrega.
- O toast de edição salva e o de exclusão feita pelo detalhe aparecem na tela de destino.

**Premissas:**
- A exportação continua `trampo-ja.exportacao.v1`; `encerrado` é só um valor novo de `status`.
- O `semear` não muda.
- A L3 usa a migração `0007`.
- Se a L3 também propuser um ADR-006, o lead renumera.

## ADR
**ADR-006: concorrência nas escritas de anúncio** (proposto)
- **Contexto:** a `versao` do trampo sobe a cada candidatura (`revisor`, "trava otimista em operação comutativa"). A L2 traz escritas do autor que concorrem com as dos candidatos e com a exclusão de conta.
- **Decisão:**
  - Só a substituição do conteúdo (`PUT`) exige do cliente a `versao` lida, que aparece apenas na visão do autor.
  - As ações de estado (encerrar, excluir, retirar) reaplicam a regra no servidor. Encerrar e excluir travam a linha do trampo (`alterarSobTrava`, `select … for update` sem versão), para uma rajada de candidaturas nunca causar 409; retirar relê e repete como `alterarTrampo` (ajuste da rodada 1, achado S1).
  - O agregado grava só as candidaturas que a operação inseriu ou removeu.
- **Consequências:**
  - Não há 409 falso nas ações de estado.
  - A edição feita em dois aparelhos é detectada.
  - Uma linha apagada por outra transação não volta.
  - Recurso novo que se edite pelo app segue o mesmo padrão.

## Texto para o CLAUDE.md
Depois de "Camadas e pastas", acrescentar:

"**Concorrência em anúncios (ADR-006):** o `PUT` manda a `versao` lida (exposta só ao autor) e recebe 409 `conflito_de_versao`. Encerrar, excluir e retirar reaplicam a regra no servidor. O repositório de `trampos` grava só as candidaturas que a operação inseriu ou removeu."
