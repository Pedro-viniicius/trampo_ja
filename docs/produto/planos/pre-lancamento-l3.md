# Plano técnico: pré-lançamento nas lojas, entrega L3 (endurecimento de segurança)
- Brief: sem brief próprio. Escopo aprovado no corte D32: `docs/produto/planos/pre-lancamento-lojas.md`, "Entregas seguintes" > L3 e "Resíduos da revisão da L1 para a L3". Pendências descritas nas memórias do `seguranca` (`.claude/agent-memory/seguranca/`).
- Data: 2026-10-23. Linha de base: commit `1d2f0dd` (API 814 unidade + 369 integração; app 1945 em 60 suítes).
- **Ordem com a L2:** a L3 é implementada **depois do commit da L2**. Os arquivos em comum estão em "Coordenação com a L2". A migração `0007` precisa da `0006` já aplicada.

## Objetivo e critérios de aceite
Fechar as pendências de segurança abertas nas revisões da entrega 1, da 2a e da L1 antes do release externo. Nenhuma tela nova. A numeração começa em CA40, porque a L2 usa a faixa a partir de CA25.
- CA40 (S4): sem `--permitir-banco-remoto`, o `semear` recusa um banco que não seja local e sai com código 2 antes de conectar. A saída nunca traz a URL.
- CA41 (S10): o pool usa `connectionTimeoutMillis` 5 s, `statement_timeout` 10 s e `idle_in_transaction_session_timeout` 30 s. O `migrar` roda sem `statement_timeout`. Uma URL com host remoto e sem `sslmode=verify-full` é recusada na partida com `ErroDeConfiguracao`, que traz o nome da variável e nunca o valor.
- CA42 (D31): o `POST /sessoes` aceita 10 tentativas por e-mail+IP a cada 15 min e 100 por e-mail a cada hora. A tentativa recusada pelo primeiro limite não gasta o segundo. No IPv6, o IP é o prefixo /64. O 429 é genérico, sem o e-mail nem o hash dele, na resposta e no log.
- CA43 (S8): a senha é normalizada em NFC no cadastro, no login, na exclusão e na exportação. Quem se cadastrou com NFD entra digitando NFC, e o contrário também. Uma conta com hash gravado sobre a forma crua entra com essa forma. Um e-mail inexistente roda o mesmo número de derivações que uma senha errada.
- CA44 (S7): o `criarConta` grava a conta e a primeira sessão na mesma transação. Se a sessão falhar, a conta não fica gravada.
- CA45 (S3): quem espera mais de 10 s pela vaga do scrypt ou da exportação recebe 503 `servico_ocupado` com `retry-after`. Um pedido cuja conexão caiu sai da fila sem derivar nem coletar.
- CA46 (S5): a limpeza periódica apaga as sessões expiradas, em lotes, e deixa as válidas intactas.
- CA47 (S5): um registro gravado por escrita em voo depois da exclusão da conta é apagado na primeira limpeza depois de 10 min. A lápide da conta (só o id e a data) é apagada logo em seguida.
- CA48 (S1-R): a exportação mede o tamanho no banco antes de carregar os dados. Acima de 10 MiB, responde 409 `exportacao_grande` sem coletar nada. Até esse limite, coleta e serializa dentro da vaga do semáforo. No app, o 409 mostra como pedir os dados pelo e-mail de contato, e a política de privacidade explica esse caminho.
- CA49 (app S2): se o marcador de instalação não existir em `Paths.document`, o token e a impressão da conta saem do keychain e o app abre anônimo. Com o marcador, a sessão continua.
- CA50 (app S5): depois de um 401, a rota de retorno só vale se o novo login for da mesma conta, comparada pela impressão do e-mail. Com outra conta, a pessoa vai para o Início.
- CA51 (app S6): o "Sair" passa a anônimo e apaga o token e o cache sem esperar a rede. O `DELETE /sessoes` sai em segundo plano com o token capturado antes, e uma falha nele não aparece em lugar nenhum.
- CA52 (app S7): um teste percorre a árvore transitiva de produção do app e falha se algum pacote tiver nome de telemetria. Exceção só para ferramenta de build, listada com o motivo.
- CA53 (app S8): o `pnpm --filter mobile build:producao` falha com URL sem `https://`, com mensagem sem o valor, e passa com `https://`.
- CA54 (transversal): nenhum log, erro ou saída de script traz senha, e-mail, token, URL do banco ou o id da conta excluída. A suíte de integração inteira passa.

## Contexto atual
- **`semear`:** usa `DATABASE_URL` sem trava de host (`apps/api/scripts/semear.ts:406-420`), e a senha pública está em `:42` e no `README.md:67`. O `lerUrlDoBanco` só valida o formato (`apps/api/src/config.ts:58-83`).
- **Pool:** `new pg.Pool` só recebe `connectionString` e `max` (`apps/api/src/compartilhado/banco/conexao.ts:21-37`). O `pg` 8.23.1 trata `require` e `verify-ca` como `verify-full` e emite um aviso (`node_modules/.pnpm/pg-connection-string*/index.js:139-151`).
- **Login:** o limite por e-mail (10 a cada 15 min, de qualquer IP) está em `apps/api/src/composicao.ts:91-94`, `:108-122` e `:305-323` e é ligado no `onRoute` (`:418-426`). O fallback de IP usa `requisicao.ip` cru (`:121`). O `@fastify/rate-limit` exporta `normalizeIP` (/64 no IPv6) (`node_modules/@fastify/rate-limit/index.js:32-48`, `:385`).
- **Senha:** `Senha.criar` guarda o texto como veio (`contas/dominio/senha.ts:46-65`). O `entrar` confere o texto cru contra o hash, ou contra o hash fictício quando o e-mail não existe (`contas/aplicacao/casos-de-uso.ts:215-236`). A exclusão e a exportação conferem em `:259-274`.
- **Cadastro:** `contas.salvar` e depois `abrirSessao`, sem transação (`casos-de-uso.ts:198-212`, `:169-174`).
- **Semáforos:** o `Semaforo` tem fila FIFO sem teto, sem timeout e sem cancelamento (`contas/dominio/semaforo.ts:11-46`). O do scrypt é único por processo (`hasher.ts:117-120`). O da exportação cobre só a coleta, e a serialização roda fora da vaga (`casos-de-uso.ts:44-48`, `:281-314`).
- **Exportação:** o JSON inteiro é montado em memória. O `reply.getSerializationFunction(200)` devolve o serializador compilado do schema da rota (`node_modules/fastify/lib/reply.js:361-375`).
- **Sessões:** `sessoes` não tem índice em `expira_em` e nunca é limpa (`migracoes/0001_contas.ts:24-44`). `excluirRegistrosDaConta(trx, contaId)` apaga sessões e conta (`contas/adaptadores/postgres/repositorios-postgres.ts:187-201`). A composição o chama por último em `excluirTudo` (`composicao.ts:240-263`).
- **Erros:** o tratador mapeia 4xx e cai em 500 para o resto. Não existe 503 (`compartilhado/http/erros.ts:44-102`).
- **Entrypoint:** o `servidor.ts` monta, escuta e fecha no sinal (`src/servidor.ts:24-71`). Não há tarefa periódica.
- **App, sessão:** o `sair` espera o `DELETE /sessoes`, com timeout de 15 s, antes de limpar (`apps/mobile/src/estado/sessao.tsx:282-292`). O `expirar` guarda só a rota e o aviso, sem a conta (`:172-187`). O login consome o retorno ao montar e navega depois do sucesso (`app/(publico)/entrar.tsx:24-57`). O app não conhece o id da própria conta: `MeuPerfil` não tem id (`api/tipos.ts:27-33`).
- **App, token:** o `expo-secure-store` usa `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, e não há marcador de instalação (`estado/armazenamento-token.ts:38-68`). O cliente lê o token da porta a cada requisição (`api/cliente.ts:199-207`).
- **App, https:** checado só em runtime (`api/config.ts:39-43`). O `app.json` é estático e o `build` é `expo export` (`apps/mobile/package.json:11`).
- **App, dependências:** a barreira olha só as dependências diretas (`testes/sem-dado-pessoal.test.tsx:2231-2260`). Hoje nenhum pacote do store do pnpm tem nome de telemetria (conferido com `ls node_modules/.pnpm`). O `expo` traz o `@expo/cli` como dependência de produção.

## Abordagens consideradas
| Tema | A (recomendada) | B | Por que A |
|---|---|---|---|
| Órfãos de escrita em voo | Lápide `contas_excluidas` gravada na transação da exclusão. A limpeza roda o mesmo `excluirTudo` depois de 10 min e apaga a lápide | Varredura por anti-join: cada módulo lista os ids que referencia, e `contas` filtra os inexistentes | B custa O(todas as contas) a cada rodada e cria funções novas em 4 módulos. A reaproveita o ADR-005 e é limitada pelas exclusões recentes |
| Onde roda a limpeza | Tarefa periódica no processo da API (`unref`, sem sobreposição), idempotente com várias réplicas | Script `pnpm --filter api limpar` mais cron externo | Ainda não há infraestrutura de produção. B depende de alguém configurar o cron |
| Exportação grande | Medir em SQL antes de carregar. Acima do teto, 409, e a pessoa pede por e-mail | Streaming ou partes | B perde o schema de resposta fechado (CA19) ou muda o contrato e o app. Uso legítimo não chega perto de 10 MiB |
| Mesma conta no retorno | Impressão (hash não criptográfico) do e-mail normalizado, gravada no secure-store junto com o token | Devolver `contaId` no login (muda o contrato da API) | B exige mudar a API e ainda não resolve a sessão restaurada. A cobre também a sessão restaurada |
| https no build | `app.config.ts` confere a URL quando `TRAMPOJA_BUILD=producao` (script `build:producao`) | Conferir sempre que `NODE_ENV=production` | Com B, o `build` de verificação quebraria com o `.env` local em http |

## Decisão
- **Limite de login (D31):** arquivo novo `compartilhado/http/limite-de-entrada.ts` com dois contadores, conferidos em ordem no mesmo `preValidation`: primeiro e-mail+IP, depois só e-mail. O `chaveDoLimitePorEmail` sai da composição. As chaves usam o SHA-256 do e-mail normalizado e o `normalizeIP`. O LRU usa `cache: 20_000`, como o `limite-por-conta.ts:142`.
- **NFC (S8):** o hash novo é sempre da forma NFC. No login, na exclusão e na exportação, `formasDaSenha` devolve `[nfc]`, ou `[nfc, crua]` quando as duas diferem, e as formas são conferidas em sequência. Com e-mail inexistente, o código percorre as mesmas formas contra o hash fictício. O teto de 128 é conferido na forma crua, antes de normalizar.
- **Fila (S3):** `Semaforo.executar(tarefa, {esperaMaximaMs, sinal})`. Quando a espera esgota, a tarefa sai da fila com `EsperaEsgotada`. Quando o sinal aborta na fila, sai com `EsperaCancelada`. Um abort depois de pegar a vaga não interrompe a tarefa. Os casos de uso convertem `EsperaEsgotada` em `ErroIndisponivel('servico_ocupado', 10)`, que vira 503 com `retry-after: 10`. O sinal vem de `sinalDaConexao(requisicao)`, que aborta quando o socket fecha antes de a resposta sair.
- **Exportação (S1-R):** dentro da vaga, na ordem: medir, recusar acima de `TETO_DA_EXPORTACAO_BYTES = 10 * 1024 * 1024`, coletar e serializar com o serializador da rota. A rota envia a string com `application/json`.
- **Limpeza (S5):** `limparRegistrosVencidos()` em `contas`. Apaga sessões com `expira_em <= agora` em lotes de 1000, até 20 lotes. Para cada lápide com mais de 10 min (até 100 por rodada), roda `dadosDaConta.excluirTudo(id)` e apaga a lápide. O `servidor.ts` agenda a primeira rodada 1 min depois de subir e as seguintes a cada 1 h. Uma falha registra só o código.
- **Banco (S4, S10):** "local" quer dizer host `localhost`, `127.0.0.0/8`, `::1` ou socket Unix. Banco remoto exige `sslmode=verify-full`, com `sslrootcert` quando a CA for privada.
- **App:** marcador `trampoja.instalacao` (conteúdo fixo, sem dado) conferido uma vez por execução, antes do primeiro `ler`/`gravar`. O `sair` captura o token, limpa o local e só então dispara o `DELETE` com `token` explícito. O 401 dele é ignorado pelo `expirarSeForAtual`, porque a porta já está vazia.

## Esquema e contratos
**Migração `0007_contas_excluidas.ts`** (módulo `contas`): `contas_excluidas (id uuid primary key, excluida_em timestamptz not null)`, sem FK. O `down` usa `removerTabelaSeVazia`.

**API (`A` = `apps/api`):**
- `compartilhado/dominio/erros.ts`: `class ErroIndisponivel extends ErroDeDominio { codigo; tentarDeNovoEmS }`. Em `http/erros.ts`, ele vira 503 `{erro: codigo}` mais o cabeçalho `retry-after`.
- `contas/dominio/semaforo.ts`: `executar<T>(tarefa, opcoes?: { esperaMaximaMs?: number; sinal?: AbortSignal }): Promise<T>`, `class EsperaEsgotada`, `class EsperaCancelada`.
- `contas/dominio/senha.ts`: `formasDaSenha(texto: string): readonly string[]`. `Senha.revelar()` devolve a forma NFC.
- `contas/dominio/portas.ts`:
  - `HasherDeSenha.gerarHash(senha, fila?)` e `verificar(senha, hash, fila?)`, com `fila: {esperaMaximaMs?, sinal?}`: quem chama decide a espera, e o `hashFicticio` fica sem ela (ajuste da etapa 14);
  - `RepositorioDeContas.salvar(conta, sessaoInicial?: { tokenHash; expiraEm })`, com as duas gravações numa transação;
  - `RepositorioDeSessoes.apagarExpiradas(agora, lote): Promise<number>`;
  - `RepositorioDeContasExcluidas { listarAntesDe(limite: Date, lote): Promise<ContaId[]>; esquecer(id): Promise<void> }`;
  - `DadosDaConta.medirDosOutrosModulos(contaId): Promise<number>`.
- Casos de uso:
  - `exportarDados(contaId, senha, { serializar: (e: ExportacaoV1) => string; sinal? }): Promise<string>`;
  - `limparRegistrosVencidos(): Promise<{ sessoes: number; contasRevarridas: number }>`;
  - `criarConta(credenciais, sinal?)` e `entrar(credenciais, sinal?)`.
- Fachadas:
  - `contas` expõe `limparRegistrosVencidos`. `excluirRegistrosDaConta(trx, contaId, agora)` grava a lápide com `on conflict do nothing`;
  - `conversas`, `trampos` e `servicos` ganham `medirExportacao(contaId): Promise<number>`: soma de `octet_length` dos textos exportados mais 256 bytes por linha; um id que não seja uuid dá 0;
  - `Aplicacao` ganha `limparRegistrosVencidos()`.
- `compartilhado/http/limite-de-entrada.ts`: exporta `LIMITE_PADRAO_POR_EMAIL_E_IP` (10/15 min), `TETO_PADRAO_POR_EMAIL` (100/60 min) e `criarLimiteDeEntrada(app, { porEmailEIp, porEmail }): preValidationHookHandler`. Em `OpcoesDaAplicacao`, o `limitePorEmail` passa a ser o teto, e entra `limitePorEmailEIp`.
- `compartilhado/http/sinal-da-conexao.ts`: `sinalDaConexao(resposta: FastifyReply): AbortSignal`. Ouve o `close` do `ServerResponse` e só aborta se a resposta não terminou. O `request.signal` do Fastify 5 aborta assim que o corpo é lido, então não serve (verificado na etapa 14).
- `compartilhado/agendar-tarefa.ts`: `agendarTarefa({ executar, intervaloMs, atrasoInicialMs, aoFalhar }): { parar(): Promise<void> }`.
- `config.ts`: `ehBancoLocal(url: string): boolean`. `compartilhado/banco/conexao.ts`: `opcoesDoPool(url, opcoes): pg.PoolConfig`, função pura, e `OpcoesDaConexao.tempoMaximoDeConsultaMs?` (0 desliga).

**App (`M` = `apps/mobile/src`):**
- `estado/armazenamento-token.ts`:
  - `ArmazenamentoDeToken` ganha `lerConta?(): Promise<string | null>` e `gravar(token, conta?)`, e o `apagar` apaga os dois. O método é opcional porque `estado/sessao.test.tsx:70`, `:91` e outros montam a porta como objeto literal, e a etapa 8 não pode quebrar o typecheck. A sessão trata a ausência como `null`;
  - `MarcadorDeInstalacao { existe(): boolean; criar(): void }`;
  - `criarArmazenamentoSeguro(marcador = marcadorEmDocumentos())`;
  - o fake em memória aceita `(inicial, conta?)`.
- `api/cliente.ts`: `OpcoesDaRequisicao.token?: string`, que tem prioridade sobre `obterToken`. `api/contas.ts`: `sair(cliente, token)`.
- `estado/sessao.tsx`:
  - `entrar(token, email?)`;
  - `RetornoDaSessao.conta?: string`;
  - `impressaoDaConta(email): string`, sobre o e-mail aparado e em minúsculas;
  - `rotaParaAConta(retorno, email): string | undefined`. Com `conta` ausente, devolve a rota: são sessões anteriores à L3, que a S2 derruba na atualização.
- Erro novo `exportacao_grande` em `textos.erros`. Em `estado/erros.ts`, o 409 `exportacao_grande` vira `geral: 'exportacao_grande'`.
- `apps/mobile/app.config.ts`: devolve o `app.json`. Com `TRAMPOJA_BUILD=producao`, chama `urlDaApi({EXPO_PUBLIC_API_URL}, false)`. Script novo: `"build:producao": "TRAMPOJA_BUILD=producao expo export --platform android --output-dir dist"`.

## Etapas
- **Base de verificação:**
  - API: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api exec vitest run <arquivos>`. Integração de um arquivo: `pnpm --filter api exec vitest run --config vitest.integracao.config.ts <arquivo>`, com o banco no ar e `migrar` rodado.
  - App: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <arquivos>`.
- Cada grupo tem no máximo uma etapa com integração: 7, 14, 17 e 18.

| # | Etapa | Arquivos | Verificação | Resp. | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Semáforo com espera máxima e cancelamento. Testes: a espera esgotada rejeita sem consumir vaga; a tarefa cancelada na fila nunca roda; o FIFO se mantém; `naFila` volta a 0; abortar depois de pegar a vaga não interrompe | `A/src/modulos/contas/dominio/semaforo{,.test}.ts` | base API + `vitest run src/modulos/contas/dominio/semaforo.test.ts` | dev | A | **sim** (concorrência) | 45 |
| 2 | `ErroIndisponivel` → 503 com `retry-after` e corpo só com o código | `A/src/compartilhado/dominio/erros{,.test}.ts`, `A/src/compartilhado/http/erros{,.test}.ts` | base API + `vitest run src/compartilhado` | dev | A | **sim** (entrada pública) | 45 |
| 3 | NFC: `Senha.criar` guarda NFC e `formasDaSenha`. Testes com "é" em NFD e NFC; o teto é conferido na forma crua | `A/src/modulos/contas/dominio/senha{,.test}.ts` | base API + `vitest run src/modulos/contas/dominio/senha.test.ts` | dev | A | **sim** (senha) | 43 |
| 4 | Banco: `ehBancoLocal`; `lerUrlDoBanco` exige `verify-full` em host remoto; `opcoesDoPool` com os tempos do CA41; `migrar` sem `statement_timeout`; `semear` com `--permitir-banco-remoto`, conferido antes de conectar; `.env.example` explica `sslmode` e `sslrootcert` | `A/src/config{,.test}.ts`, `A/src/compartilhado/banco/conexao{,.test}.ts`, `A/scripts/{semear,migrar}.ts`, `A/.env.example` | base API + `vitest run src/config.test.ts src/compartilhado/banco/conexao.test.ts`; `DATABASE_URL='postgres://u:x@db.exemplo.com/x?sslmode=verify-full' pnpm --filter api semear` sai com 2, sem a URL na saída | dev | A | **sim** (segredo, TLS) | 40, 41, 54 |
| 5 | Limite de entrada (D31). Testes com Fastify mínimo: a 11ª tentativa do mesmo e-mail+IP dá 429; outro IP passa; a 101ª do e-mail, vinda de IPs variados, dá 429; a recusa no 1º contador não gasta o teto; o mesmo /64 conta junto; corpo sem e-mail cai no IP normalizado; o log não traz o e-mail nem o hash | `A/src/compartilhado/http/limite-de-entrada{,.test}.ts` | base API + `vitest run src/compartilhado/http/limite-de-entrada.test.ts` | dev | A | **sim** (autenticação) | 42 |
| 6 | Agendador. Testes com fake timers: sem sobreposição; `parar` espera a execução corrente; a falha chama `aoFalhar` e a tarefa segue agendada; timers com `unref` | `A/src/compartilhado/agendar-tarefa{,.test}.ts` | base API + `vitest run src/compartilhado/agendar-tarefa.test.ts` | dev | A | **sim** (concorrência) | 46, 47 |
| 7 | `medirExportacao` em conversas (só as mensagens da conta), trampos (trampos e candidaturas da conta) e serviços. Testes: a medida cresce com o texto e ignora o texto de terceiros; id que não é uuid dá 0. **Depois do commit da L2** | `A/src/modulos/{conversas,trampos,servicos}/index.ts`, `A/src/modulos/{conversas,trampos,servicos}/adaptadores/postgres/repositorio-postgres{,.integracao.test}.ts` | base API + integração dos 3 repositórios | dev | A | **sim** (dado pessoal) | 48 |
| 8 | App S2: marcador e impressão da conta na porta. Testes com `jest.mock` de `expo-secure-store` e `expo-file-system`: sem marcador, apaga o token e a conta, cria o marcador e devolve `null`; com marcador, lê; se apagar falhar, dá `ErroDoArmazenamento('ler')` e não cria o marcador; a conferência roda uma vez por execução | `M/estado/armazenamento-token{,.test}.ts` | base app + `jest src/estado/armazenamento-token` | dev | A | **sim** (token) | 49 |
| 9 | App S6, cliente: `token` explícito por requisição e `sair(cliente, token)`. Testes: o cabeçalho usa o token explícito; o 401 chama `aoExpirar` com ele | `M/api/{cliente,contas}.ts`, `M/api/{cliente,contas}.test.ts` | base app + `jest src/api` | dev | A | **sim** (token) | 51 |
| 10 | App S8: `app.config.ts` e o script `build:producao`. Teste: com a variável ligada, a URL em http lança e em https passa; sem a variável, nada é conferido | `apps/mobile/app.config.ts`, `apps/mobile/package.json` (só o script), `M/testes/app-config.test.ts` | base app + `jest src/testes/app-config`; `EXPO_PUBLIC_API_URL=http://10.0.0.2:3000 pnpm --filter mobile build:producao` falha; com `https://api.exemplo.com`, passa | dev | A | **sim** (transporte) | 53 |
| 11 | App S7: percorre `dependencies` e `optionalDependencies` a partir do `package.json` do app, resolvendo cada pacote pelo `node_modules` real (caminho real, subindo diretórios); nomes contra a lista de proibidas atual mais `crashlytics`, `datadog`, `newrelic`, `appcenter`, `posthog`, `rudder` e `telemetry`; exceções com motivo; o teste também confere que a árvore tem mais de 100 pacotes | `M/testes/dependencias-de-producao.test.ts` | base app + `jest src/testes/dependencias-de-producao` | dev | A | **sim** (telemetria) | 52 |
| 12 | Texto do erro `exportacao_grande`: os dados passaram do tamanho que o app entrega, e a pessoa pede a cópia pelo e-mail de contato da política. **Depois do commit da L2** | `M/textos/pt-BR.ts` | base app + `jest src/textos` | designer | A | não | 48 |
| 13 | Política: em "Exportar", o caminho por e-mail acima de 10 MB (resposta em até 15 dias, art. 19, II); sessões expiradas apagadas em até 1 h. Versão nova no `.md` e no `legal.ts`. **Depois do commit da L2** | `docs/produto/legal/politica-de-privacidade.md`, `M/textos/legal{,.test}.ts` | base app + `jest src/textos/legal` | dev | A | não | 48 |
| 14 | `contas`, parte 1 (S8, S3, S7): o hasher repassa `{esperaMaximaMs: 10_000, sinal}`; os casos de uso convertem para 503; NFC no cadastro, no login e na senha conferida; `salvar(conta, sessaoInicial)` numa transação; as 4 rotas com senha passam `sinalDaConexao`. Testes: BDD de NFC, contando as derivações no caminho do e-mail inexistente; falha na sessão deixa zero contas (integração); fila cheia dá 503 com `retry-after` (semáforo injetado); o socket fechado na fila não deriva (servidor real em porta 0) | `A/src/modulos/contas/dominio/{hasher,hasher.test,portas}.ts`, `A/src/modulos/contas/aplicacao/{casos-de-uso,contas.bdd.test}.ts`, `A/src/modulos/contas/adaptadores/memoria/repositorios-memoria.ts`, `A/src/modulos/contas/adaptadores/postgres/repositorios-postgres{,.integracao.test}.ts`, `A/src/modulos/contas/adaptadores/http/rotas{,.test}.ts`, `A/src/compartilhado/http/sinal-da-conexao{,.test}.ts` | base API + `vitest run src/modulos/contas src/compartilhado/http/sinal-da-conexao.test.ts` + integração de `repositorios-postgres.integracao.test.ts` | dev | B | **sim** (senha, sessão, concorrência) | 43–45 |
| 15 | App, sessão (S5, S6): `entrar(token, email)` grava a impressão; o `expirar` guarda a conta; `rotaParaAConta` no login; o `sair` não espera a rede. Testes: login de outra conta vai ao Início e o da mesma conta volta à rota; sessão sem impressão volta à rota; com o `fetch` pendurado, o `sair` termina, deixa token e cache vazios e o `DELETE` levou o token antigo; o 401 desse `DELETE` não derruba um login feito depois | `M/estado/sessao{.tsx,.test.tsx}`, `M/estado/consultas/conta{.ts,.test.tsx}`, `M/app/(publico)/entrar.tsx`, `M/testes/rotas/conta.test.tsx` | base app + `jest src/estado src/testes/rotas/conta` | dev | B | **sim** (sessão, token) | 50, 51 |
| 16 | App: 409 `exportacao_grande` → `geral: 'exportacao_grande'` (depende da 12) | `M/estado/erros{,.test}.ts` | base app + `jest src/estado/erros` | dev | B | **sim** (dado pessoal) | 48 |
| 17 | `contas`, parte 2 (S5, S1-R) e a porta na composição: migração `0007`; lápide em `excluirRegistrosDaConta`; `apagarExpiradas`; repositório de lápides; `limparRegistrosVencidos`; teto e serialização dentro da vaga; a rota usa `getSerializationFunction(200)`; a composição liga `medirDosOutrosModulos` (3 módulos mais 8 KiB do perfil), o `agora` e `Aplicacao.limparRegistrosVencidos`. Testes: BDD do teto sem coletar, da limpeza com relógio fixo e da serialização dentro da vaga; integração das sessões e das lápides; o schema fechado continua descartando chave extra | `A/migracoes/0007_contas_excluidas.ts`, `A/src/modulos/contas/{index.ts,dominio/portas.ts,aplicacao/casos-de-uso.ts,aplicacao/contas.bdd.test.ts}`, `A/src/modulos/contas/adaptadores/memoria/repositorios-memoria.ts`, `A/src/modulos/contas/adaptadores/postgres/{repositorios-postgres,repositorios-postgres.integracao.test,tabelas}.ts`, `A/src/modulos/contas/adaptadores/http/rotas{,.test}.ts`, `A/src/composicao.ts` | base API + `vitest run src/modulos/contas` + `migrar -- --teste` + integração de `repositorios-postgres.integracao.test.ts` | dev | C | **sim** (migração, exclusão, dado pessoal) | 46–48 |
| 18 | Composição D31 e servidor: troca o limite por e-mail por `criarLimiteDeEntrada`; o `servidor.ts` agenda a limpeza e a para antes do `db.destroy()`. Atualiza só o bloco "S1" de `composicao.test.ts`. E2e: D31 por HTTP; órfão (trampo, serviço e perfil gravados direto no banco com o id excluído) apagado depois de 10 min de relógio; sessão expirada apagada; `current_setting('statement_timeout') = '10s'`; exportação normal igual ao contrato v1; logs sem e-mail, senha nem id excluído | `A/src/composicao{,.test}.ts`, `A/src/servidor.ts`, `A/test/e2e/endurecimento-l3.integracao.test.ts` | `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:integracao` (suíte inteira) | dev | D | **sim** (autenticação, limpeza, logs) | 42, 46, 47, 54 |
| 19 | Docs: `README.md` (semente com a flag, banco remoto e TLS, limites D31, 503, limpeza e lápide, teto da exportação, `build:producao`) e `.env.example` do app | `README.md`, `apps/mobile/.env.example` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | E | não | 54 |

Ordem: A (1–13) → B (14–16) → C (17) → D (18) → E (19).
- **Dependências:**
  - a 14 depende da 1, 2 e 3; a 15, da 8 e da 9; a 16, da 12;
  - a 17 depende da 7 e da 14; a 18, da 4, 5, 6 e 17.
- **Arquivos repetidos:** `composicao.ts` aparece na 17 e na 18, e os arquivos de `contas` na 14 e na 17. Estão sempre em grupos diferentes e em sequência.
- **Docs:** o lead registra D40 a D44 em `docs/produto/decisoes.md` depois da aprovação.

## Coordenação com a L2
| Arquivo em comum | Etapa da L3 | Regra |
|---|---|---|
| `A/src/modulos/{trampos,servicos}/index.ts` e `.../repositorio-postgres{,.integracao.test}.ts` | 7 | Só depois do commit da L2. A L3 só acrescenta `medirExportacao` |
| `A/src/composicao.test.ts` | 18 | A L2 mexe na tabela de rotas, e a L3 só no bloco "S1" (limite de login) |
| `A/src/composicao.ts` | 17, 18 | A L2 não deveria mexer. Se mexer, a L3 parte do commit dela |
| `A/migracoes/` | 17 | A `0007` exige a `0006` aplicada (o migrador do Kysely recusa migração fora de ordem) |
| `M/textos/pt-BR.ts`, `M/estado/erros{,.test}.ts` | 12, 16 | A L2 acrescenta erros 409 de anúncio. A L3 entra depois, só com um acréscimo |
| `docs/produto/legal/politica-de-privacidade.md`, `M/textos/legal.ts` | 13 | Se a L2 mudar os termos ou a política, a L3 parte da versão dela |
| `README.md` | 19 | Depois da L2 |
| `limite-por-conta.ts`, `sem-dado-pessoal.test.tsx` | — | A L3 não toca. A barreira nova fica em arquivo próprio (etapa 11) |
| Banco de teste | todas | É um só: a integração da L2 e a da L3 nunca rodam ao mesmo tempo |

## Pontos para o seguranca
- **Login (D31):** confira a ordem dos contadores, para que a recusa por e-mail+IP não gaste o teto. O LRU de 20 000 pode descartar um contador quando enche: isso afrouxa o limite (falha aberta), nunca bloqueia ninguém. O bloqueio dirigido custa 100 tentativas e dura no máximo 1 h (D31). O `normalizeIP` também passa a valer no fallback sem e-mail.
- **NFC:** uma entrada fora de NFC custa duas derivações, também com e-mail inexistente, e isso iguala o tempo. O teto de 128 vem antes da normalização. Os limites por IP e por e-mail e o semáforo seguram o custo dobrado.
- **503:** só o código e o `retry-after` fixo, sem o tamanho da fila. O pedido cancelado não deriva. O `hashFicticio` da partida não tem sinal nem espera máxima, e precisa continuar assim.
- **Exportação:** a medida em SQL soma bytes crus, e a serialização pode chegar a 6× com caracteres de controle (`\u00XX`), ou cerca de 60 MiB no pior caso, dentro da vaga única. A medida e a coleta precisam continuar só da própria conta. O 409 não revela o tamanho.
- **Lápide:** guarda só o uuid e a data, por 10 a 70 min. Ela não entra na exportação nem em log. A releitura usa a mesma transação e a mesma trava exclusiva do ADR-005. Uma escrita em voo que demore mais de 10 min ainda deixa órfão, mas o `statement_timeout` de 10 s torna isso inalcançável na prática.
- **Banco:** só `verify-full` em host remoto. A mensagem de erro cita a variável, nunca o valor. O `semear` recusa antes de abrir conexão.
- **App:**
  - a impressão do e-mail fica no secure-store, ao lado do token (quem lê uma lê a outra) e nunca em log;
  - a sessão sem impressão volta à rota de retorno, e na produção isso não acontece, porque a S2 derruba as sessões anteriores à atualização;
  - o `DELETE /sessoes` em segundo plano engole o erro sem `console`;
  - o marcador não guarda nenhum dado.

## Riscos e como reverter
- **Migração `0007`:** só cria uma tabela. Para reverter: volte o código pelo git, rode a limpeza uma última vez (ou espere a lápide mais nova passar dos 10 min) e use `migrar -- --baixar`. O `down` aborta se ainda houver lápide.
- **`statement_timeout` de 10 s:** uma consulta pesada ou uma espera de trava longa vira 500, em vez de travar. Os valores são constantes em `conexao.ts`, e reverter é trocar uma linha. O `migrar` fica sem limite.
- **NFC:** não dá para reverter sozinho. Uma conta criada depois da L3 com senha fora de NFC só entra com a conferência NFC. Para voltar o código, mantenha `formasDaSenha`.
- **S2 na atualização:** quem já tem o app instalado (Expo Go do dono e testadores) perde a sessão uma vez. Como ainda não há usuários reais, o risco é aceitável. Não verificado: o comportamento de `Paths.document` no Expo Go. Plano B: o marcador fica no próprio secure-store, sem `THIS_DEVICE_ONLY`, o que só funciona no iOS e deve ser discutido com o seguranca.
- **Não verificados:**
  - se o Expo CLI carrega o `.env` antes de avaliar o `app.config.ts` (a etapa 10 confere com a variável no shell);
  - se o `app.config.ts` consegue importar `src/api/config.ts`. Plano B: repetir a regra e testar que as duas concordam;
  - se o Fastify envia a string com `application/json` sem serializar de novo (a etapa 17 confere o corpo e o `content-type`);
  - se o socket fechado dispara o abort no Fastify 5 (a etapa 14 testa com um servidor real).
- **Réplicas:** a limpeza roda em cada uma. É idempotente, porque a exclusão é travada por conta. Os limites continuam por processo (D2, D29).

## Perguntas em aberto e premissas adotadas
**Decisões para o dono (recomendação minha em cada uma):**
- **D40:** limpeza periódica dentro do processo da API, a cada 1 h. Apaga as sessões expiradas e, com a lápide `contas_excluidas` (migração `0007`), relê os dados de cada conta excluída há mais de 10 min.
  - Alternativa: script e cron externo.
- **D41:** a exportação tem teto de 10 MiB, medido no banco. Acima disso, o app orienta a pedir os dados pelo e-mail de contato, com resposta manual em até 15 dias (LGPD, art. 19, II).
  - Alternativa: exportação em partes, mais trabalho na API e no app.
- **D42:** tempos fixos.
  - Espera máxima de 10 s na fila do scrypt e na da exportação, com 503 e `retry-after` de 10 s.
  - Banco: `statement_timeout` de 10 s, conexão em 5 s e transação ociosa em 30 s.
- **D43:** a rota de retorno só vale para a mesma conta, comparada por uma impressão do e-mail guardada no secure-store junto com o token.
- **D44:** banco fora da máquina só com `sslmode=verify-full`. O `semear` só roda em banco local, a não ser com `--permitir-banco-remoto`.

**Premissas:**
- Não há contas reais. Mesmo assim, a conferência da forma crua (CA43) fica, como aprovado.
- Órfãos anteriores à L3 não são varridos, porque não há lápide para eles.
- O 503 no app cai em `erro_servidor` ("Algo deu errado… tente de novo"), sem texto novo.
- A tabela `sessoes` não ganha índice em `expira_em`. Gatilho para criar: limpeza acima de 1 s.

**Cortes:** com 19 etapas, a L3 fica perto do limite. Se a revisão pedir para dividir, o corte natural é L3a (API: etapas 1–7, 14, 17, 18) e L3b (app: etapas 8–13, 15, 16), com a 19 nas duas.

## ADR
**ADR-007: limpeza periódica no processo da API, com lápide de conta excluída** (proposto)
- **Contexto:** sem FK entre módulos (ADR-001), uma escrita em voo durante a exclusão (ADR-005) pode deixar órfão público. As sessões expiradas nunca eram apagadas.
- **Decisão:**
  - a transação da exclusão grava `contas_excluidas(id, excluida_em)`;
  - `contas.limparRegistrosVencidos` apaga as sessões vencidas e, para cada lápide com mais de 10 min, roda de novo o `excluirTudo` e apaga a lápide;
  - o `servidor.ts` agenda a tarefa com `agendarTarefa`, sem cron.
- **Consequências:**
  - toda tarefa periódica nova usa `agendarTarefa` e precisa ser idempotente, porque roda em cada réplica;
  - módulo novo com dado de conta entra no `excluirTudo` (ADR-005) e passa a ser varrido também.

## Texto para o CLAUDE.md
- Em "Verificação", acrescentar: "Build de produção do app: `pnpm --filter mobile build:producao`, que falha se `EXPO_PUBLIC_API_URL` não for `https://`."
- Em "Segredos", acrescentar: "Banco fora da máquina só com `sslmode=verify-full`. O `semear` recusa banco não local sem `--permitir-banco-remoto`."
- Em "Dado pessoal (LGPD)", acrescentar: "A limpeza periódica (ADR-007) apaga as sessões expiradas e relê as contas excluídas pela lápide `contas_excluidas` (só id e data, até cerca de 70 min). No app, a impressão do e-mail fica no secure-store junto com o token."

## Correções da revisão (rodada 1)
Registradas pelo lead em 2026-10-23. Os números da D31 não mudam.
- **S1 (teto da D31 despejável do LRU):** o teto de 100 tentativas por hora sai da memória e vira contador por conta existente no Postgres. A tabela é `tentativas_de_entrada`, da migração `0008`, com FK `on delete cascade` e sem e-mail nem IP. O contador é conferido em `entrar`, depois de `buscarPorEmail` e antes da fila do scrypt, e responde 429 `muitas_requisicoes` (`ErroLimiteExcedido`). E-mail inexistente não conta. Em memória fica só o contador por e-mail+IP. O limite por IP de `POST /sessoes` guarda 100 000 chaves. O `down` da `0008` apaga a tabela mesmo com linhas, porque ela só guarda contadores que vencem em 1 h.
- **S2:** a partida recusa `NODE_TLS_REJECT_UNAUTHORIZED=0` com banco remoto.
- **S3:** o mínimo da senha é medido na forma NFC, e o máximo continua na forma crua.
- **R1/S4:** a política diz "em cerca de 1 hora".
- **R2:** a medida de `conversas` soma 256 bytes por conversa.
- **R3:** `medirExportacao` entra na regra da porta `DadosDaConta`, no `CLAUDE.md` e no README.
- **R4/S7:** token restaurado sem impressão vale como conta ilegível.
- **R5:** corrigido o motivo do marcador de instalação no README.
- **D1/D2:** texto novo de `exportacao_grande`.
- **Build:** o `build:producao` usa `--clear`, porque o cache do Metro reaproveitava a URL de um build anterior. Quem pegou foi o teste do qa.
