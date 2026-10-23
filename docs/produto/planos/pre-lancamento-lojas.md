# Plano técnico: pré-lançamento nas lojas, entrega L1 (conta, privacidade e limites)
- Brief: sem brief próprio. Pedido do lead (2026-10-22) a partir da D10, da D24 e de `docs/produto/briefs/mvp-trampo-ja.md:72-75`, mais as pendências nas memórias do `seguranca`.
- Spec: `docs/produto/specs/pre-lancamento-lojas.md`, escrita em paralelo. Nesta entrega entram as seções 1 a 5 e a 8 (só a parte das conversas e do mapeamento de 429). As divergências estão em "Perguntas".
- Data: 2026-10-22. Linha de base: commit `5032526`.

## Corte em entregas
| Entrega | Escopo | Por que nessa ordem |
|---|---|---|
| **L1** (este plano) | Itens A1, A2, A4 e A5. Também entram a S2 da API (semáforo no scrypt), porque a L1 cria duas rotas que chamam o hasher, e o 429 no app | É o que Apple, Google e LGPD exigem para publicar, e a D24 vence no release |
| L2 | A3: editar, encerrar e excluir anúncio; retirar candidatura | Depende da D30; usa a migração `0006` |
| L3 | B: endurecimento da API e do app, mais o bloqueio dirigido de login (D31) | Pode ser planejada em paralelo com a L2, porque as áreas são outras |
| L4 | C: qualidade registrada nas revisões | Não bloqueia loja |

## Objetivo e critérios de aceite
A pessoa controla a própria conta: exclui, exporta e lê os termos antes de se cadastrar. A API passa a limitar o volume por conta. A numeração continua a do MVP, para não colidir com os nomes dos testes BDD.
- CA17: com a senha certa, a conta e os dados dela são apagados na hora, conforme a D25, e todas as sessões caem. O app volta ao login com "Sua conta foi excluída.". Com a senha errada, a API responde 403 `senha_incorreta` e nada muda.
- CA18: depois da exclusão, para quem interagiu com a conta: o perfil dá 404; a conversa some da lista e, se estava aberta, dá 404 (nunca o 400 de cursor); os anúncios saem da busca e o detalhe dá 404; as candidaturas da conta saem das recebidas.
- CA19: com a senha, a exportação devolve o JSON `trampo-ja.exportacao.v1` (ver "Contratos"), sem hash, token ou texto de terceiros. O app grava um arquivo temporário, abre a folha de compartilhamento e apaga o arquivo depois.
- CA20 (D29): cada rota autenticada pertence a um grupo; acima do limite, 429 `muitas_requisicoes` com `retry-after`. A chave é o `contaId`, então outra conta no mesmo IP não é afetada. No app, fora do login e do cadastro, o 429 mostra o texto de "muitas ações", e o polling da conversa trata o 429 como backoff, sem parar.
- CA21: os rascunhos da política e dos termos ficam em `docs/produto/legal/`. As telas dos dois documentos abrem sem login (a partir da Entrada e do Cadastro) e com login (a partir de Conta e privacidade), e não dependem de rede.
- CA22: o cadastro mostra o texto de aceite com links para os dois documentos e o aviso de que o perfil é público e o e-mail nunca aparece.
- CA23: cada processo roda no máximo 2 derivações scrypt ao mesmo tempo; as demais esperam numa fila.
- CA24 (estende o CA15): a senha digitada na exclusão ou na exportação e o conteúdo exportado nunca vão para log, erro, cache de consultas ou de mutações, URL nem `console`.

## Contexto atual
- **Contas:** só existem `POST /contas`, `POST /sessoes` e `DELETE /sessoes`; a rota autenticada fica num escopo próprio (`apps/api/src/modulos/contas/adaptadores/http/rotas.ts:97-111`). O corpo é fechado com `propertyNames` (`:22-31`). Os repositórios não têm `buscarPorId` nem exclusão (`dominio/portas.ts:20-38`). `sessoes` tem FK `on delete cascade` para `contas` (`migracoes/0001_contas.ts:27-29`).
- **Hasher:** scrypt com N=2^17, cerca de 128 MiB por hash, e sem limite de concorrência (`contas/dominio/hasher.ts`, `PARAMETROS_SCRYPT_PADRAO`).
- **Sem FK entre módulos:** cada módulo recebe uma visão `Kysely<TabelasDoModulo>`, e o cast fica só em `composicao.ts:155-159`. A transação só existe dentro do módulo (`trampos/adaptadores/postgres/repositorio-postgres.ts:242-256`).
- **FKs internas sem cascade:** `candidaturas.trampo_id` (`0002_trampos.ts:46`) e `mensagens.conversa_id` (`0005_conversas.ts:44-46`).
- **Trampos:** um `UPDATE … WHERE versao` que não afeta linha vira `conflito_de_versao`; o caso de uso relê e, se o trampo sumiu, dá 404 (`trampos/aplicacao/casos-de-uso.ts:205-225`). A busca só lista `aberto` (`repositorio-postgres.ts:311`) e serviços `ativo` (`servicos/.../repositorio-postgres.ts:112`).
- **Conversas:** a participação (404) é checada antes do cursor (400) (`conversas/aplicacao/casos-de-uso.ts:201-202`). `abrirConversa` lança `Error` (500) se a conversa some depois do 23505 (`:141-146`), o que a exclusão torna alcançável. `salvarMensagem` não trata 23503 (`repositorio-postgres.ts:175-186`).
- **Rate limit:** hoje só por IP nas públicas e por e-mail no login, com `createRateLimit` + `preValidation` postos no `onRoute` (`composicao.ts:63-76`, `:184-202`, `:255-277`). `rateLimit: false` desliga nos testes de QA (`test/qa/apoio.ts:40`). `test/e2e/autenticacao.integracao.test.ts` varre toda rota registrada.
- **App, sessão:** o 401 fora de `/sessoes` e `/contas` (comparação exata) expira a sessão, e o 429 vira `muitas_requisicoes` (`apps/mobile/src/api/cliente.ts:89`, `:254-267`). `chaveDoErro` recebe o `Formulario` e mapeia todo 429 para `muitas_tentativas` (`estado/erros.ts:8-15`, `:174-216`). `sair` chama `DELETE /sessoes` e depois `limparLocal` (`estado/sessao.tsx:150-161`, `:273-282`). Toda perda de sessão leva a `/entrar` (`app/_layout.tsx:42-47`), onde o login mostra o `aviso` (`(publico)/entrar.tsx:29-32`).
- **App, rotas e polling:** `(publico)` fica atrás de `Stack.Protected guard={status === 'anonimo'}` (`app/_layout.tsx:59-61`), então quem está logado não alcança. O polling para em qualquer 4xx, inclusive o 429 (`estado/consultas/conversas.ts:86-93`).
- **App, dependências e testes:** `expo-file-system` 57.0.7 já é transitiva do `expo` (`node_modules/.pnpm/expo@57.0.30*/node_modules/expo/package.json:85`); `expo-sharing` não está instalado. Mapas de rota: `testes/rotas/apoio.tsx:65-71` e `testes/qa/apoio-qa.tsx:28-46`. Aviso atual do cadastro: `telas/Cadastro.tsx:72`.

## Abordagens consideradas
| Tema | A (recomendada) | B | C | Por que A |
|---|---|---|---|---|
| Orquestrar a exclusão | Caso de uso em `contas` (senha) + porta `DadosDaConta`, ligada na composição, que abre **uma transação** e chama `excluirDadosDaConta(trx, id)` de cada fachada | Módulo novo `privacidade`, como o `busca` | FK com `on delete cascade` entre módulos | C quebra a regra de não ter FK entre módulos. B cria um módulo para duas rotas e ainda precisa da transação vinda da composição |
| Conversas do excluído | Apagar a conversa inteira (as mensagens dos dois) | Apagar só as mensagens da conta | Anonimizar o autor | A não deixa conversa "fantasma" e reaproveita o 404 que o app já trata; o 400 de cursor e o ponto fraco do `reconciliar` continuam inalcançáveis. Contra: o outro perde as próprias mensagens |
| Entregar a exportação | Arquivo JSON no cache + `expo-sharing` | `Share.share` do RN com o JSON como texto | Envio por e-mail | B esbarra no limite de transação do Android, perto de 1 MB (não verificado), com conversas longas. C exige serviço externo |
| Aceite dos termos | Texto no cadastro, sem registro; a versão vale pela data | Caixa de seleção + versão gravada em `contas` (migração `0006`) | — | As lojas não pedem caixa de seleção. A data de criação e o histórico do git identificam a versão. B só se o jurídico exigir |
| Limite por conta | `preHandler` com `createRateLimit` por grupo, posto no `onRoute` (mesmo padrão do limite por e-mail) | `global: true` com `keyGenerator` | — | B roda no `onRequest`, antes de existir `contaId` |

## Decisão
**Exclusão (D25):** imediata, sem carência e com senha. Tudo roda numa transação, na ordem conversas → trampos → serviços → perfis → contas.

| Tabela | Na exclusão | O que o outro participante vê |
|---|---|---|
| `contas`, `sessoes` | apaga; as sessões caem pelo cascade | Outro aparelho da conta: 401 no próximo pedido, e o login mostra "sessão expirada" |
| `perfis` | apaga | 404 e "Perfil indisponível" (já existe) |
| `trampos` do autor | apaga, com as candidaturas recebidas | O candidato perde a candidatura em "Minhas candidaturas"; o detalhe dá 404 |
| `servicos` | apaga | Some da busca; o detalhe dá 404 |
| `candidaturas` da conta | apaga | Some das recebidas. Se era a aceita, o trampo fica `em_andamento` sem contratado até a L2 trazer "encerrar" |
| `conversas` e `mensagens` | apaga a conversa inteira | Some da lista. Com a conversa aberta, o polling recebe 404 e mostra "indisponível" (já existe) |
| Logs (IP, sem `contaId`) | não mudam; ficam fora do banco | — |

- **Travas:** antes de apagar, `select … for update` nas conversas da conta e nos trampos de que ela é autora. Uma mensagem concorrente espera a trava e cai no 23503, que o repositório converte em 404; uma candidatura concorrente relê o trampo e recebe 404. `abrirConversa` (`:145`) passa a lançar `ErroProibido('sem_vinculo')`.
- **Senha:** confere com o hasher. Errada, ausente ou com mais de 128 caracteres dá 403 `senha_incorreta`; acima de 128, nem roda o scrypt. Não é 401 porque o app trataria como sessão expirada. Um segundo pedido concorrente encontra tudo vazio e responde 204.
- **Depois da exclusão, no app:** nova `sessao.encerrarPorExclusao()` guarda o aviso `conta_excluida`, sobe a geração, passa a anônimo e limpa token e cache, sem `DELETE /sessoes`. A `NavegacaoRaiz` leva ao login, como em toda perda de sessão. Um 401 atrasado do polling é ignorado, porque o token já saiu da porta (`expirarSeForAtual`).

**Exportação (D26):** `POST /contas/eu/exportacao {senha}` devolve 200 com o JSON abaixo e `Cache-Control: no-store`. O app grava `trampo-ja-meus-dados-AAAA-MM-DD.json` em `Paths.cache`, chama `Sharing.shareAsync` com `application/json` e apaga o arquivo no `finally`. O JSON não fica no TanStack: a mutação não devolve `data` e tem `gcTime: 0`.

**Limite por conta (D29):** grupos e números em "Contratos". No app, todo formulário que não seja `entrar` nem `cadastro` mostra `muitas_tentativas_acao` e mantém o rascunho; o polling trata o 429 como falha passageira.

**Legal (D27, D28):** rascunhos em `docs/produto/legal/`, com espelho empacotado em `apps/mobile/src/textos/legal.ts`. As rotas ficam na **raiz** (`app/politica-de-privacidade.tsx` e `app/termos-de-uso.tsx`), fora dos `Stack.Protected`, para abrir com e sem login. Aceite por texto no Cadastro.

## Esquema e contratos
Nesta entrega não há migração.

**API**

| Rota | Corpo | Sucesso | Erros |
|---|---|---|---|
| `POST /contas/eu/exclusao` | `{senha}` | 204 | 400; 401; 403 `senha_incorreta`; 429 |
| `POST /contas/eu/exportacao` | `{senha}` | 200, JSON abaixo | 400; 401; 403 `senha_incorreta`; 429 |

```jsonc
{ "formato": "trampo-ja.exportacao.v1", "geradoEm": "ISO",
  "conta": { "id", "email", "criadaEm" }, "sessoes": [{ "criadaEm", "expiraEm" }],
  "perfil": { "nome", "cidade", "descricao", "habilidades", "atualizadoEm" } | null,
  "trampos": [{ "id", "titulo", "descricao", "categoria", "cidade", "valorCentavos", "prazo", "status", "criadoEm", "candidaturasRecebidas": 0 }],
  "servicos": [{ "id", "titulo", "descricao", "categoria", "cidade", "precoBaseCentavos", "status", "criadoEm" }],
  "candidaturas": [{ "id", "trampoId", "mensagem", "valorPropostoCentavos", "status", "criadaEm" }],
  "conversas": [{ "id", "outroUsuarioId", "criadaEm", "minhasMensagens": [{ "id", "texto", "enviadaEm" }] }] }
```
Ficam fora: `senha_hash`, `token_hash`, `cidade_normalizada`, `texto_busca` e mensagens e candidaturas de terceiros. O schema da resposta tem `additionalProperties: false` em todos os níveis.

**Fachadas:**
- `perfis`, `servicos`, `trampos` e `conversas` (`index.ts`) ganham `excluirDadosDaConta(trx: Kysely<TabelasDoModulo>, contaId): Promise<void>` e `exportarDadosDaConta(contaId): Promise<ParteDoModulo>`. `contas` ganha `excluirRegistrosDaConta(trx, contaId)`, que apaga `sessoes` e depois `contas`.
- Os repositórios não abrem `transaction()` aninhada (o `trx` já é a transação), lançam erro com `contaId` que não seja uuid e nunca fazem `delete` sem `where`.
- Porta em `contas/dominio/portas.ts`: `DadosDaConta { excluirTudo(contaId): Promise<void>; coletarDosOutrosModulos(contaId): Promise<PartesExportadas> }`, com os tipos `ExportacaoV1` e `PartesExportadas`.

**Limites (`apps/api/src/compartilhado/http/limite-por-conta.ts`):** exporta `grupoDaRota(metodo, urlModelo)`, `LIMITES_PADRAO_POR_CONTA` e `criarLimitePorConta(app, limites): preHandlerHookHandler`. A chave é `conta:<grupo>:<contaId>`; com `contaId` vazio (rota pública), o hook não faz nada. Se o `createRateLimit` aceitar a opção `cache`, usar mais que 5000 (não verificado; o dev confere no `.d.ts`).

| Grupo | Rotas | Limite |
|---|---|---|
| `leitura` | todo `GET` autenticado | 600/min. O pior caso legítimo é a carga de uma conversa longa: 20 páginas a cada 5 s, ou 240/min |
| `mensagens` | `POST /conversas/:id/mensagens` | 30/min |
| `publicacao` | `POST /trampos`, `POST /servicos`, `POST /trampos/:id/candidaturas` | 30/h |
| `senha` | `POST /contas/eu/exclusao`, `POST /contas/eu/exportacao` | 5 a cada 15 min |
| `escrita` | os demais `POST`/`PUT`/`DELETE` autenticados | 60/min |

**App (`M` = `apps/mobile/src`):**
- **`api/contas.ts`:** `excluirConta(c, senha): Promise<void>` e `exportarDados(c, senha): Promise<DadosExportados>`. Em `api/tipos.ts`: `DadosExportados = { readonly formato: string } & Readonly<Record<string, unknown>>`.
- **`estado/erros.ts`:** o 403 `senha_incorreta` vira `geral: 'senha_incorreta'`. O 429 vira `muitas_tentativas` com formulário `entrar` ou `cadastro` e `muitas_tentativas_acao` nos demais.
- **`estado/sessao.tsx`:** `Sessao.encerrarPorExclusao(): Promise<void>`.
- **`estado/consultas/conta.ts`:** `useExcluirConta()` é uma mutação com a senha em `variables`, `gcTime: 0`, `retry: 0`, `networkMode: 'always'` e `reset` no sucesso, que chama `encerrarPorExclusao`. `useExportarDados() → { exportar(senha): Promise<{tipo:'compartilhado'}|{tipo:'indisponivel'}|{tipo:'erro', erro}|{tipo:'descartada'}>, exportando }` captura a `geracao()` antes do POST e, se ela mudar, não compartilha.
- **`estado/exportacao.ts`:** `compartilharExportacao(dados, agora): Promise<'compartilhado'|'indisponivel'>` (usa `Sharing.isAvailableAsync()`).
- **`textos/legal.ts`:** `politicaDePrivacidade` e `termosDeUso`, cada um `{ titulo, versao: 'AAAA-MM-DD', rascunho: boolean, secoes: readonly { titulo, paragrafos: readonly string[] }[] }`.
- **Textos (etapa 1, designer, a partir da spec):** `contaEPrivacidade.*`, `excluirConta.*`, `exportarDados.*`, `documentoLegal.*`, `cadastro.aceite`, `cadastro.avisoPerfilPublico` e `perfil.contaEPrivacidade`; erros `senha_incorreta`, `muitas_tentativas_acao`, `conta_excluida` ("Sua conta foi excluída.") e `compartilhamento_indisponivel`.
- **Props (etapa 1, em `telas/tipos.ts`, só acréscimos):**
  - `DocumentoLegalParaExibir` (mesmo formato de `legal.ts`) e `PropsDoDocumentoLegal {documento, onVoltar}`;
  - `PropsDeContaEPrivacidade {onExportar, onExcluir, onPolitica, onTermos, onSair, semConexao?}`;
  - `PropsDeExcluirConta {senha, onMudarSenha, excluindo, erro?, semConexao?, onExcluir /* depois do diálogo */, onExportar, onCancelar}`;
  - `PropsDeExportarDados {situacao: 'inicial'|'gerando'|'gerado', senha, onMudarSenha, erro?, semConexao?, onGerar, onVoltar}`;
  - o Cadastro ganha `onPolitica` e `onTermos`, `PropsDaEntrada` ganha os dois como opcionais e `PropsDoPerfil` ganha `onContaEPrivacidade?`.

## Etapas
- **Siglas:** `A` = `apps/api`, `M` = `apps/mobile/src`.
- **Base de verificação:**
  - API: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api exec vitest run <arquivos>`. Integração de um arquivo: `pnpm --filter api exec vitest run --config vitest.integracao.config.ts <arquivo>`, com `docker compose up -d banco` e `migrar`.
  - App: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <arquivos>`.
- **Banco de teste:** é um só, então cada grupo tem no máximo uma etapa com integração (3, 7, 11).
- **Tipos de rota** (etapas 12 e 14): os mesmos da 2c (`expo start --no-dev` por 50 s, depois o typecheck).

| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Textos e props acima (só acréscimos) | `M/textos/pt-BR.ts`, `M/telas/tipos.ts` | base app + `jest src/telas` | designer | A | não | 17, 19–22 |
| 2 | Semáforo do scrypt (S2): até 2 derivações por processo, fila sem teto, e a vaga é liberada também quando a derivação falha. Testes: com 5 hashes simultâneos, no máximo 2 rodam ao mesmo tempo (espião na derivação); depois de um erro, a fila anda | `A/src/modulos/contas/dominio/{hasher,semaforo}.ts`, `A/src/modulos/contas/dominio/{hasher,semaforo}.test.ts` | base API + `vitest run src/modulos/contas/dominio` | dev | A | **sim** (senha) | 23 |
| 3 | `contas`: casos `excluirConta` e `exportarDados`, porta `DadosDaConta`, `buscarPorId`, `excluirRegistrosDaConta(trx)`, as duas rotas no escopo autenticado (corpo `{senha}` fechado, resposta fechada, `no-store`) e a fachada. Testes BDD: senha certa chama a porta uma vez; senha errada, ausente ou com mais de 128 caracteres dá 403 sem chamar a porta (e, acima de 128, sem hash); conta inexistente dá 404; a exportação junta conta, sessões e partes; 401 sem token | `A/src/modulos/contas/{index.ts,dominio/portas.ts,aplicacao/casos-de-uso.ts,aplicacao/contas.bdd.test.ts}`, `.../adaptadores/http/{rotas,rotas.test}.ts`, `.../adaptadores/memoria/repositorios-memoria.ts`, `.../adaptadores/postgres/repositorios-postgres{,.integracao.test}.ts` | base API + `vitest run src/modulos/contas` + integração de `repositorios-postgres.integracao.test.ts` | dev | A | **sim** (exclusão, senha, sessões) | 17, 19 |
| 4 | Limite por conta: `grupoDaRota` para cada rota atual e para as duas novas, mais `criarLimitePorConta`. Testes com um Fastify mínimo: 31ª mensagem dá 429 com `retry-after`; a chave é o `contaId`, então outra conta passa; `GET` não consome `escrita`; sem `contaId`, não limita | `A/src/compartilhado/http/limite-por-conta{,.test}.ts` | base API + `vitest run src/compartilhado/http/limite-por-conta.test.ts` | dev | A | **sim** (concorrência, abuso) | 20 |
| 5 | Endpoints de exclusão e exportação no app. Testes: método, caminho, corpo só com `{senha}`; 403, 429 e 401 sobem como `ErroDaApi`; 401 em `/contas/eu/exclusao` chama `aoExpirar` | `M/api/{contas,tipos}.ts`, `M/api/contas.test.ts` | base app + `jest src/api` | dev | A | **sim** (senha) | 17, 19 |
| 6 | Rascunhos legais (conteúdo em "Perguntas", D27 e D28) e o espelho no app. Teste: as versões e os títulos de seção de `legal.ts` batem com os `.md`, e cada `.md` diz RASCUNHO | `docs/produto/legal/{politica-de-privacidade,termos-de-uso}.md`, `M/textos/legal{,.test}.ts` | base app + `jest src/textos/legal` | dev | A | não | 21 |
| 7 | Os quatro módulos: `excluirDadosDaConta` e `exportarDadosDaConta` nas fachadas e nos repositórios Postgres, com as travas da Decisão; 23503 em `salvarMensagem` vira 404; `abrirConversa` (`:145`) vira 403. Testes de integração por módulo: só a conta-alvo é apagada (a outra fica intacta); a exportação não traz texto de terceiros nem colunas derivadas; mensagem para conversa apagada dá 404; candidatura num trampo apagado dá 404 | `A/src/modulos/{perfis,servicos,trampos,conversas}/index.ts`, `A/src/modulos/{perfis,servicos,trampos,conversas}/adaptadores/postgres/repositorio-postgres{,.integracao.test}.ts`, `A/src/modulos/conversas/aplicacao/{casos-de-uso.ts,conversas.bdd.test.ts}` | base API + `vitest run src/modulos/conversas` + integração dos 4 repositórios | dev | B | **sim** (exclusão, concorrência) | 17–19 |
| 8 | `LinhaDeConfiguracao` e as telas `ContaEPrivacidade`, `ExcluirConta`, `ExportarDados` e `DocumentoLegal` (spec, seções 1 a 4). Testes: estados de cada tela, diálogo destrutivo com "Cancelar" como padrão, botão desabilitado com `Motivo`, versão e seções do documento | `M/componentes/{LinhaDeConfiguracao.tsx,index.ts}`, `M/telas/{ContaEPrivacidade,ExcluirConta,ExportarDados,DocumentoLegal}.tsx`, `M/telas/index.ts`, `M/telas/conta-e-privacidade.test.tsx` | base app + `jest src/telas/conta-e-privacidade` | designer | B | não | 17, 19, 21 |
| 9 | Cadastro com texto de aceite, os dois links e o aviso de perfil público; Entrada com os links; Perfil com a linha "Conta e privacidade" ("Sair" continua) | `M/telas/{Cadastro,Entrada,Perfil}.tsx`, `M/telas/telas.test.tsx` | base app + `jest src/telas/telas` | designer | B | não | 21, 22 |
| 10 | Estado: `erros`, `encerrarPorExclusao`, os dois hooks e `exportacao.ts`; dependências via `pnpm --filter mobile exec expo install expo-file-system expo-sharing`. Testes com `jest.mock` dos dois módulos: arquivo gravado e apagado também quando a folha falha; `indisponivel`; geração trocada não compartilha; a mutação fica sem `data` e sem `variables` depois do sucesso; `encerrarPorExclusao` não chama a rede e deixa o aviso | `M/estado/{erros.ts,sessao.tsx,exportacao.ts}`, `M/estado/consultas/conta.ts`, `M/estado/{erros.test.ts,sessao.test.tsx,exportacao.test.ts}`, `M/estado/consultas/conta.test.tsx`, `apps/mobile/package.json`, `pnpm-lock.yaml` | base app + jest dos 4 testes + `pnpm --filter mobile list --prod --depth Infinity` sem nome de telemetria (S7 da 2a) | dev | B | **sim** (senha, sessão, arquivo com dado pessoal) | 17, 19, 20, 24 |
| 11 | Composição: `DadosDaConta` (transação nas fachadas, na ordem da Decisão), exportação, e limite por conta no `onRoute` (`limitesPorConta?: … \| false`; `rateLimit: false` também desliga). Testes: toda rota registrada tem grupo; rota pública fica sem limite por conta; e2e com duas contas cobre CA17 e CA18 (incluindo 404, e não 400, com `depoisDe`, e 401 na outra sessão), o contrato exato da exportação, os limites e os logs sem a senha e sem sentinelas do JSON | `A/src/composicao{,.test}.ts`, `A/test/e2e/{exclusao-e-exportacao,limite-por-conta}.integracao.test.ts`, `A/test/e2e/logs-sem-dado-pessoal.integracao.test.ts` | `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:integracao` (suíte inteira, para provar que os limites padrão não quebram os testes atuais) | dev | C | **sim** (exclusão, limites, logs) | 17–20, 24 |
| 12 | Rotas legais na raiz e links no Cadastro e na Entrada. As duas rotas entram nas rotas padrão do apoio. Testes: abre anônimo e volta ao Cadastro com o rascunho mantido; abre logado pela URL; nenhuma requisição. Se o login só aceitar `sessao_expirada`, a etapa ajusta `(publico)/entrar.tsx` | `M/app/{politica-de-privacidade,termos-de-uso}.tsx`, `M/app/(publico)/{cadastro,entrada}.tsx`, `M/testes/rotas/apoio.tsx`, `M/testes/rotas/documentos-legais.test.tsx` | base app + `jest src/testes/rotas` + tipos de rota | dev | C | não (sem dado, sem rede) | 21, 22 |
| 13 | 429 nas conversas: o polling trata 429 como falha passageira (backoff até 60 s); o envio com 429 fica "Não enviada", mostra o aviso de ação e mantém o rascunho | `M/estado/consultas/conversas{.ts,.test.tsx}`, `M/app/(app)/conversas/[id].tsx`, `M/testes/rotas/conversa.test.tsx` | base app + `jest src/estado/consultas/conversas src/testes/rotas/conversa` | dev | C | **sim** (polling) | 20 |
| 14 | Rotas logadas `perfil/{conta,excluir,exportar}` e o Perfil com o atalho. Testes: senha errada mostra o aviso; senha certa passa pelo diálogo, faz o POST e cai no login com "Sua conta foi excluída.", com token e cache vazios e nenhum `DELETE /sessoes`; duplo toque faz um POST só; offline mostra o motivo; 429 mostra o aviso de ação; a exportação chama `compartilharExportacao`; sair durante a exportação não compartilha | `M/app/(app)/perfil/{conta,excluir,exportar}.tsx`, `M/app/(app)/(abas)/perfil.tsx`, `M/testes/rotas/conta-e-privacidade.test.tsx`, `M/testes/qa/apoio-qa.tsx` | base app + `jest src/testes/rotas src/testes/qa` + tipos de rota | dev | D | **sim** (exclusão, senha) | 17, 19, 20 |
| 15 | CA24: jornada de exclusão e de exportação com a senha e sentinelas do JSON (console, cache, URL, `testID`). `README.md`: endpoints de contas, "Rate limit" por conta, "Dados pessoais" (exclusão, exportação, arquivo temporário) e "Rotas e telas" | `M/testes/sem-dado-pessoal.test.tsx`, `README.md` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | E | **sim** (dado pessoal) | 24 |

Ordem: A (1–6) → B (7–10) → C (11–13) → D (14) → E (15).
- **Nenhum arquivo se repete dentro de um grupo.** `contas/dominio/hasher.ts` fica só na 2; `telas/index.ts` e `componentes/index.ts`, só na 8; `package.json` e o lockfile, só na 10.
- **Dependências:**
  - a 8 e a 9 dependem da 1; a 10, da 1 e da 5; a 11, da 2, 3, 4 e 7;
  - a 12 depende da 6, 8 e 9; a 13, da 10;
  - a 14 depende da 8, 9, 10 e 12 (tipos de rota).
- **Docs:** o lead registra D25 a D32 em `docs/produto/decisoes.md` depois da aprovação.

## Pontos para o seguranca
- **Exclusão:** nenhum `delete` sem `where` por id validado como uuid, e os testes com duas contas provam que a outra fica intacta. Tudo numa transação: deadlock ou falha dá 500 sem nada apagado, e repetir é seguro. Com a ordem das travas da Decisão, escritas concorrentes de terceiros viram 404 ou 403, nunca 500.
- **Senha:** só no corpo do POST. Usa 403 e não 401, para o app não expirar a sessão. O teto de 128 vem antes do scrypt; o grupo `senha` limita a 5 a cada 15 min; o semáforo (CA23) limita a memória.
- **Exportação:** exige senha porque é a única rota que devolve o e-mail. Schema de resposta fechado e `no-store`. De terceiros, só sai o `outroUsuarioId`, que a pessoa já vê em `GET /conversas`. No app, o arquivo fica só no cache e é apagado no `finally`; o JSON não fica no TanStack.
- **Sessões:** o cascade derruba as sessões de todos os aparelhos no commit. Um 401 que chega atrasado é ignorado pela porta.
- **Limites:** a chave é por conta e por grupo, contada depois da autenticação (`preHandler`). O store fica em memória por processo, como na D2.
- **Dependências novas:** `expo-sharing` e `expo-file-system` (já transitiva). Conferir a árvore de produção.

## Riscos e como reverter
- **Escrita em voo da própria conta durante a exclusão:** um pedido já autenticado pode gravar um trampo órfão por milissegundos. Risco aceito como residual; a L3 pode varrer órfãos junto com a limpeza de sessões (S5).
- **Resposta perdida:** se a exclusão comitar e a resposta não chegar, o próximo pedido dá 401 e o login mostra "sessão expirada", não "conta excluída". Risco aceito.
- **Limites apertados demais:** são constantes; reverter um número é trocar uma linha. Com mais de uma instância, o limite efetivo se multiplica (Redis fica para depois).
- **Pontos não verificados:**
  - O Expo Go SDK 57 traz o `expo-sharing`. Plano B: `Share.share` com texto até cerca de 500 KB.
  - Rotas da raiz fora do `Stack.Protected` abrem nos dois estados. Plano B: um grupo `(legal)` sem guarda.
- **Exportação grande:** o JSON inteiro fica em memória, com o timeout de 15 s do cliente. Gatilho para paginar ou fazer streaming: exportação acima de 5 MB.
- **Reverter:** não há migração. Os arquivos se revertem pelo git. Os dados apagados não voltam, por desenho; cópia de segurança é pendência de infraestrutura.

## Perguntas em aberto e premissas adotadas
**Decisões para o dono (recomendação minha em cada uma):**
- **D25:** exclusão imediata, sem carência, com senha, apagando conforme a tabela. O outro perde a conversa inteira.
  - Alternativa: carência de 14 dias, que exige estado "em exclusão" e um job.
- **D26:** exportação em JSON v1, com senha, só com dados da conta, entregue por arquivo e folha de compartilhamento.
  - Exige a dependência nova `expo-sharing`, com `expo-file-system` passando a direta.
  - Alternativa: `Share.share`, sem dependência e com limite de tamanho.
- **D27:** aceite por texto, sem caixa de seleção e sem registro na API. A versão vigente sai da data de criação da conta e dos documentos datados no git; os textos ficam empacotados no app.
- **D28:** marcadores nos textos legais: `[NOME DO CONTROLADOR]`, `[CPF/CNPJ]`, `[E-MAIL DE CONTATO]`, `[FORO]`, `[IDADE MÍNIMA]` e `[HOSPEDAGEM]`.
  - A política cobre: o inventário do `README.md` ("Dados pessoais") e o IP nos logs; quem vê o quê (perfil visível a quem está logado; mensagens guardadas no servidor e vistas pelo outro participante; candidaturas vistas pelo autor do trampo); nenhum terceiro e nenhuma telemetria; bases legais (art. 7º, V e IX, e Marco Civil, art. 15, com 6 meses de registros de acesso), a confirmar com o jurídico; direitos do art. 18, com exportação e exclusão no app.
  - Os termos cobrem o objeto, as regras de conteúdo, a ausência de intermediação de pagamento e a exclusão de conta.
- **D29:** os números da tabela de limites.
- **D30 (L2):**
  - Trampo: editar todos os campos só enquanto `aberto` e sem candidaturas. Encerrar leva `aberto` ou `em_andamento` a `encerrado`, recusa as pendentes, tira da busca e mantém as conversas. Excluir só `aberto`, junto com as candidaturas.
  - Serviço: editar livremente e excluir, sem "pausar". Candidatura: retirar só a `pendente`, que é apagada; a pessoa pode se candidatar de novo.
  - Alternativa: editar com candidaturas, exceto o valor.
- **D31 (L3):** o limite de login passa a ser por e-mail+IP (10 a cada 15 min), com teto de 100 por hora por e-mail. Para travar a conta de outra pessoa, seriam precisas 100 tentativas, e o bloqueio duraria no máximo 1 h.
- **D32:** corte em L1 a L4, como na primeira tabela.

**Perguntas abertas:**
- Idade mínima: recomendo 18 anos.
- Domínio para hospedar a política e a página de pedido de exclusão: o Google Play exige link na web.
- Retenção de logs.

**Divergências com a spec (o lead alinha com o designer):**
- Exportar ganha o campo de senha (D26).
- Depois da exclusão, o app vai para o login, não para a Entrada (`_layout.tsx:42-47`).
- O cancelamento da folha de compartilhamento não é detectável (não verificado), então a tela mostra sempre "Arquivo gerado…".
- As rotas legais ficam na raiz, não em `(publico)`.
- "Sair" fica também no Perfil (P6), para não reescrever os testes da 2a à 2c.
- Sem contagem regressiva no 429, porque o `ErroDaApi` não lê cabeçalhos.
- As seções 6, 7 e 9 da spec ficam para a L2 e a L4.

**Pendências fora do código:** URL pública da política e da página de exclusão; formulários Data safety (Google) e App Privacy (Apple); revisão jurídica, para publicar com `rascunho: false`; retenção de logs de 6 meses e cópias de segurança; contas de desenvolvedor nas lojas.

## Entregas seguintes (escopo resumido)
- **L2: anúncios e candidaturas (D30).**
  - API: `PUT` e `DELETE /trampos/:id`, `POST /trampos/:id/encerrar`, `PUT` e `DELETE /servicos/:id`, `DELETE /candidaturas/:id`, todos com trava `versao` e autorização por 404.
  - Migração `0006`: `trampos_status_valido` ganha `encerrado`; o `down` aborta se houver linha `encerrado`.
  - App: `FormularioDeAnuncio` com modo editar, folha "Mais opções", selo "Encerrado", "Retirar candidatura" e os erros `trampo_nao_aberto`/`conflito_de_versao` na folha de candidatura (de C).
- **L3: endurecimento.**
  - API: S4 (o `semear` recusa banco que não seja local, sem flag explícita); S5 (limpeza de sessões expiradas e de órfãos); S7 (o lead traz a descrição do relatório da entrega 1); S8 (NFC no cadastro e no login, conferindo também a forma crua nas contas antigas); S10 (`connectionTimeoutMillis`, `statement_timeout` e TLS por `sslmode`); D31.
  - App: S2 (marcador de instalação em `Paths.document`, apagado ao desinstalar; sem ele, a sessão sai do keychain); S5 (a rota de retorno só vale para a mesma conta); S6 (a saída local não espera a rede); S7 (teste da árvore transitiva); S8 (o build de produção falha com URL sem https).
- **L4: qualidade.** Contador e corte por ponto de código em `CampoDeTexto`; conversas: R10, duplicata acima de 500 mensagens e R2 (ordem do cursor, corrigida na API); paginação de `/trampos/meus`; `FaixaSemConexao` na raiz; edição de perfil só depois de carregar.
- **Resíduos da revisão da L1 para a L3:** S1-R (BAIXA): exportação sem teto de tamanho, cresce em linha reta (até ~65–375 MB em 30 dias de abuso no limite); gerar em partes ou medir antes e, acima de um teto, responder com código próprio sem perder a portabilidade; serializar dentro da vaga do semáforo. Gatilhos para voltar a MÉDIA: subir limites de `mensagens`, `mensagens_dia` ou `publicacao`, edição de texto ou anexos, processo com menos de ~1 GB. S3 (BAIXA): fila do scrypt sem timeout. Instabilidade: uma suíte do app falhou uma vez sob carga externa (`conta.test.tsx`, `minhas-candidaturas.test.tsx`), sem repetir em 5 execuções.

## ADR
**ADR-005: exclusão e exportação de conta orquestradas pela composição** (proposto)
- **Contexto:** os dados da conta estão em cinco módulos sem FK entre si (ADR-001), e a exclusão precisa ser atômica.
- **Decisão:**
  - `contas` é dona do caso de uso (senha) e da porta `DadosDaConta`.
  - A composição implementa a porta: abre uma transação Kysely e chama `excluirDadosDaConta(trx)` de cada fachada, que recebe a própria visão do `trx`.
  - A exportação junta as `exportarDadosDaConta` de cada módulo.
- **Consequências:**
  - Não há FK nova entre módulos e o hexagonal se mantém (o domínio não vê `kysely`).
  - Todo módulo novo com dado pessoal precisa implementar as duas funções da fachada e entrar na composição. O teste e2e da etapa 11 deve falhar se uma tabela com `conta_id`, `autor_id` ou `freelancer_id` ficar com linha da conta excluída.

## Texto para o CLAUDE.md
Em "Dado pessoal (LGPD)", acrescentar: "Exclusão e exportação de conta passam pela porta `DadosDaConta` (ver ADR-005): módulo novo com dado pessoal implementa `excluirDadosDaConta` e `exportarDadosDaConta` na fachada. No app, o arquivo exportado só existe no cache durante o compartilhamento."
