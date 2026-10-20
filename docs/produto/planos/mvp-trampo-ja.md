# Plano técnico: MVP do Trampo Já, entrega 1 (fundação e backend)
- Brief: docs/produto/briefs/mvp-trampo-ja.md
- Visão: docs/produto/visao.md
- Data: 2026-10-20
- Corte: o MVP inteiro passaria de 250 linhas. Esta **entrega 1** cobre a stack, a fundação e o backend (CA1–CA15 via API). A **entrega 2**, o app mobile (CA16 e as telas dos fluxos CA1–CA13), será planejada em `docs/produto/planos/mvp-trampo-ja-app.md` depois da spec `docs/produto/specs/mvp-trampo-ja.md`.

## Objetivo e critérios de aceite
Entregar a API do Trampo Já num monólito modular hexagonal com núcleo DDD, testada e rodando offline, pronta para o app consumir. Valem os CAs do brief, com os mesmos números: CA1–CA15 nesta entrega e CA16 na entrega 2. Neles, "aparece/vê" significa que a API retorna o item; a tela vem na entrega 2.

Regra adicional **D9** (`docs/produto/decisoes.md:17`): publicar trampo, ofertar serviço e candidatar-se exigem perfil completo, com nome, cidade e ao menos uma habilidade. A API recusa com `409 {"erro":"perfil_incompleto"}`.

## Contexto atual
- Quando o plano foi escrito, o repositório estava vazio: só `CLAUDE.md`, `docs/produto/visao.md` e `docs/produto/briefs/mvp-trampo-ja.md`. Desde então o dono aprovou o plano: as decisões estão em `docs/produto/decisoes.md` e o CLAUDE.md foi preenchido.
- Na máquina, conferido em 2026-10-20: Node v22.23.0, pnpm 12.4.1, Docker 29.8.0 e OpenJDK 21. Não há psql local.
- Restrições da visão (`docs/produto/visao.md:39-44`): mobile first, pt-BR, LGPD (coletar o mínimo, nada em log), DDD, BDD, TDD e hexagonal em monólito modular.
- Fora do escopo do brief: pagamento, avaliações, push, login social, upload de foto e GPS.

## Abordagens consideradas
Stack do backend:

| Abordagem | Prós | Contras | Risco |
|---|---|---|---|
| **TypeScript + Fastify + Kysely + PostgreSQL** | Uma linguagem só com o app (Expo); Fastify é leve e traz pino e validação JSON; Kysely é query builder tipado, não ORM, então o domínio fica livre de framework; tem migrador próprio | O time monta a injeção de dependência à mão (composition root) | Baixo |
| TypeScript + NestJS + Prisma | Estrutura modular pronta | Decorators e a DI do Nest invadem o domínio; o Prisma gera código e baixa engine (atrito offline) | Médio |
| Kotlin/Java + Spring Boot | Maduro; JDK 21 já instalado | Segunda linguagem para um time pequeno, já que o app é JS/TS | Médio |

Stack do app (decisão adiantada aqui para o CLAUDE.md): **Expo (React Native) + TypeScript + Expo Router**. Flutter traria o Dart como segunda linguagem; nativo exigiria duas bases de código.

BDD:

| Abordagem | Prós | Contras |
|---|---|---|
| **Vitest com cenários `it('CA4 — Dado…, quando…, então…')` sobre os casos de uso** | Zero dependência e um só runner; o CA aparece no nome do teste | O dono não lê um arquivo `.feature` |
| `@cucumber/cucumber` com `.feature` em pt | Gherkin executável e legível | Segundo runner; os passos são globais e colidem entre módulos |

Para o resto, há um caminho claramente melhor:
- **Token:** opaco, guardado como hash na tabela `sessoes`. Revoga no logout e não exige lib JWT.
- **Hash de senha:** `node:crypto` scrypt, sem dependência.
- **Validação:** JSON schema nativo do Fastify para o formato e o domínio para as regras. Sem zod.
- **Lint e formatação:** Biome, uma ferramenta só.
- **Fronteira entre módulos:** um teste que varre os imports. Sem plugin de lint.

## Decisão
- **Monorepo pnpm:** `apps/api` (Node 22, TS estrito, Fastify, Kysely + `pg`, PostgreSQL 16 em Docker) e, na entrega 2, `apps/mobile` (Expo).
- **Módulos (bounded contexts) em `apps/api/src/modulos/`:**
  - `contas`: conta, credencial e sessão.
  - `perfis`.
  - `trampos`: agregado `Trampo` com as `Candidatura`s, porque CA10 é invariante do agregado.
  - `servicos`.
  - `conversas`.
  - `busca`: só leitura; compõe as fachadas de trampos e serviços.
- **Camadas de cada módulo:**
  - `dominio/`: entidades, objetos de valor, erros e portas de saída. Sem import de framework.
  - `aplicacao/`: casos de uso e testes BDD.
  - `adaptadores/{http,postgres,memoria}/`.
  - `index.ts`: a fachada pública, único ponto que outro módulo pode importar.
- **Banco:** cada módulo é dono das suas tabelas. **Sem FK entre módulos**, com referência só por id; FK só dentro do módulo. Cada módulo recebe uma visão `Kysely<TabelasDoModulo>` e não enxerga tabela alheia.
- **Erros:** a API devolve códigos, nunca texto com valor do usuário. O app traduz os códigos para pt-BR na entrega 2.
- **Concorrência (CA9, CA10, CA11):**
  - Trava otimista: coluna `trampos.versao`. Candidatar e aceitar incrementam a versão na mesma transação.
  - Índice único `(trampo_id, freelancer_id)` em `candidaturas`.
- **Busca (CA7):**
  - Colunas normalizadas `texto_busca` e `cidade_normalizada` (minúsculas, sem acento, espaços colapsados), filtradas com `LIKE` parametrizado e curingas escapados.
  - Ordenação `criado_em DESC, id DESC`.
  - Paginação por cursor `antesDe`: o módulo `busca` junta as duas listas e corta em 20.
  - Sem extensão do Postgres. O `pg_trgm` só entra se o volume pedir.

## Esquema e contratos
Migrações versionadas em `apps/api/migracoes/`, usando o `Migrator` do Kysely. O `down` só remove tabela vazia e aborta se houver linhas. Valores em centavos (`integer`), ids `uuid` (`crypto.randomUUID`) e datas `timestamptz`.

| Migração | Tabelas e restrições |
|---|---|
| `0001_contas.ts` | `contas(id pk, email text unique` (minúsculo)`, senha_hash text, criada_em)`; `sessoes(token_hash text pk, conta_id fk contas, expira_em, criada_em)` |
| `0002_trampos.ts` | `trampos(id, autor_id, titulo, descricao, categoria, cidade, cidade_normalizada, texto_busca, valor_centavos check>0, prazo date null, status check in ('aberto','em_andamento'), versao int, criado_em)` + índice `(status, criado_em desc)`; `candidaturas(id, trampo_id fk, freelancer_id, mensagem, valor_proposto_centavos check>0, status check in ('pendente','aceita','recusada'), criada_em, unique(trampo_id, freelancer_id))` |
| `0003_servicos.ts` | `servicos(id, autor_id, titulo, descricao, categoria, cidade null, cidade_normalizada null, texto_busca, preco_base_centavos check>0, status check in ('ativo'), criado_em)` |
| `0004_perfis.ts` | `perfis(conta_id pk, nome, cidade, cidade_normalizada, descricao null, habilidades text[], atualizado_em)` |
| `0005_conversas.ts` | `conversas(id, usuario_a_id, usuario_b_id, criada_em, unique(usuario_a_id, usuario_b_id), check(usuario_a_id < usuario_b_id))`; `mensagens(id, conversa_id fk, autor_id, texto, enviada_em)` + índice `(conversa_id, enviada_em)` |

Endpoints. Todos exigem `Authorization: Bearer <token>`, exceto `POST /contas` e `POST /sessoes`; sem token, ou com token inválido, a resposta é `401 {"erro":"nao_autenticado"}` (CA14). Formato de erro: `{"erro":"<codigo>","campos":[{"campo":"titulo","motivo":"obrigatorio|tamanho|invalido"}]}`.

| Método e rota | Sucesso | Erros | CA |
|---|---|---|---|
| `POST /contas {email,senha}` | 201 `{token}` | 400 campos; 409 `email_em_uso` (sem nenhum dado da conta) | 1, 2 |
| `POST /sessoes {email,senha}` / `DELETE /sessoes` | 200 `{token}` / 204 | 401 `credenciais_invalidas` (genérico) | 1, 14 |
| `GET` e `PUT /perfis/eu` · `GET /perfis/:contaId` | 200 `{nome,cidade,descricao,habilidades,completo}` (o público omite e-mail) | 400; 404 se o perfil estiver incompleto | 3 |
| `POST /trampos` · `GET /trampos/:id` · `GET /trampos/meus` | 201 `{id,status:"aberto"}` | 400 campos; 409 `perfil_incompleto` | 4, 5, D9 |
| `POST /trampos/:id/candidaturas {mensagem,valorPropostoCentavos}` | 201 `{status:"pendente"}` | 409 `perfil_incompleto`, `autor_nao_pode_candidatar`, `candidatura_duplicada`, `trampo_nao_aberto` | 8, 9, 11, D9 |
| `GET /trampos/:id/candidaturas` (só o autor) · `GET /candidaturas/minhas` | 200 lista | 404 para quem não é o autor | 8 |
| `POST /trampos/:id/candidaturas/:cid/aceitar` | 200 | 409 `conflito_de_versao`, `trampo_nao_aberto` | 10 |
| `POST /servicos` · `GET /servicos/:id` · `GET /servicos/meus` | 201 `{id,status:"ativo"}` | 400 campos; 409 `perfil_incompleto` | 6, D9 |
| `GET /busca?texto&categoria&cidade&tipo&antesDe` · `GET /categorias` | 200 `{itens,proximoCursor}` / 200 `[{id,rotulo}]` | 400 | 7 |
| `POST /conversas {outroUsuarioId}` · `GET /conversas` | 201/200 `{conversaId}` | 403 `sem_vinculo` | 12, 13 |
| `GET` e `POST /conversas/:id/mensagens {texto}` | 200 em ordem cronológica / 201 | 400 texto vazio; 404 para quem não participa | 12 |

Limites de domínio:

| Campo | Regra |
|---|---|
| e-mail | formato válido, até 254 caracteres |
| senha | 8 a 128 caracteres |
| título | 5 a 80 caracteres (CA4) |
| descrição | 1 a 2000 caracteres |
| nome e cidade | 2 a 80 caracteres |
| habilidades | 1 a 10 itens, cada um com 2 a 30 caracteres |
| mensagens | 1 a 2000 caracteres, sem contar espaços nas pontas |

Contrato entre módulos:
- `trampos` expõe `existeVinculoEntre(a, b): Promise<boolean>`, que é verdadeiro se houver candidatura em qualquer estado entre os dois, e `buscarTrampos(filtros)`.
- `servicos` expõe `buscarServicos(filtros)`.
- `contas` expõe `validarSessao(token): Promise<ContaId | null>`.
- `perfis` expõe `perfilEstaCompleto(contaId): Promise<boolean>` (D9).
- **Porta da D9 nos módulos consumidores.** `trampos` e `servicos` declaram, cada um no seu `dominio/portas.ts`, a interface `VerificadorDePerfil { perfilEstaCompleto(contaId: string): Promise<boolean> }`. Cada módulo tem a sua cópia, então nenhum importa `perfis`.
- **Ordem das checagens.** `publicarTrampo`, `ofertarServico` e `candidatar` consultam a porta antes de qualquer outra regra e recusam com `ErroDeRegra('perfil_incompleto')`. O tratador da etapa 3 converte `ErroDeRegra` em 409, como faz com as outras regras.
- **Por que 409 e não 403:** 403 fica para "sem permissão sobre o recurso". Aqui o usuário tem permissão; falta um pré-requisito de estado que ele mesmo resolve completando o perfil.
- **Testes e ligação real.** Nos testes, a porta usa um fake em memória do próprio módulo. A fachada real de `perfis` só é ligada em `composicao.ts`, na etapa 13.

## Etapas
Caminhos relativos a `apps/api/` nas etapas 2 em diante. `M` = `src/modulos`. Verificação base: `pnpm typecheck && pnpm lint && pnpm test`. Etapas com `*.integracao.test.ts` também rodam `pnpm test:integracao`, que exige `docker compose up -d banco`.

| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Fundação do monorepo: `git init`, workspace pnpm, TS estrito, Biome, Vitest (unidade e integração em configs separadas), scripts da raiz | `package.json`, `pnpm-workspace.yaml`, `biome.json`, `.gitignore`, `apps/api/{package.json,tsconfig.json,vitest.config.ts,vitest.integracao.config.ts}`, `apps/api/src/sanidade.test.ts` | `pnpm install && pnpm typecheck && pnpm lint && pnpm test` | dev | A | não | — |
| 2 | Núcleo compartilhado e banco: erros de domínio (`ErroDeValidacao` com campos e `ErroDeRegra` com código, sem valores), `normalizarTexto`, `Relogio`, lista fechada de categorias (D5) como `CATEGORIAS: readonly {id, rotulo}[]` com `ehCategoriaValida(id)`, usando os pares `reformas`/"Reformas e reparos", `design`/"Design", `aulas`/"Aulas e reforço", `entregas`/"Entregas e transporte", `ti`/"Tecnologia (TI)", `eventos`/"Eventos", `limpeza`/"Limpeza e serviços domésticos", `beleza`/"Beleza e bem-estar", `fotografia`/"Fotografia e vídeo" e `outros`/"Outros"; Postgres no compose com banco de teste; conexão Kysely; script `migrar`; setup de integração que migra e trunca | `src/compartilhado/dominio/{erros,texto,relogio,categorias}.ts` + `.test.ts`, `src/compartilhado/banco/{conexao,migrador}.ts`, `scripts/migrar.ts`, `test/setup-integracao.ts`, `docker-compose.yml`, `infra/postgres/init.sql`, `.env.example`, `src/config.ts` | base + `docker compose up -d banco && pnpm --filter api migrar && pnpm test:integracao` | dev | B | sim (migração, segredo) | 5, 15 |
| 3 | HTTP compartilhado: `criarServidor` (Fastify), logger pino com `redact` de `authorization`, `senha`, `email`, `nome`, `telefone` e serializer de erro que descarta `message`/`detail`/`where` de erros do `pg`; tratador de erros (domínio → 400/403/404/409, desconhecido → 500 `{"erro":"interno"}`); hook `exigirAutenticacao(validarSessao)` | `src/compartilhado/http/{servidor,logger,erros,autenticacao}.ts`, `src/compartilhado/http/{logger,erros,autenticacao}.test.ts`, `src/compartilhado/arquitetura.test.ts` (domínio sem import de fastify/kysely/pg; módulo só importa outro via `index.ts`) | base | dev | C | sim (logs, auth) | 14, 15 |
| 4 | `contas` domínio e aplicação: `Email`, `Senha` (8 a 128), hash scrypt (N=2^17, r=8, p=1, salt de 16 bytes, formato `scrypt$N$r$p$salt$hash`, `timingSafeEqual`), `criarConta`, `entrar` (hash fictício quando o e-mail não existe, para igualar o tempo), `sair`, `validarSessao` (token de 32 bytes, guarda o SHA-256, expira em 30 dias); BDD CA1/CA2 | `M/contas/dominio/{email,senha,hasher,conta,portas}.ts` + `.test.ts`, `M/contas/aplicacao/{casos-de-uso.ts,contas.bdd.test.ts}`, `M/contas/adaptadores/memoria/repositorios-memoria.ts` | base + `pnpm --filter api exec vitest run src/modulos/contas` | dev | D | sim (senha, sessão) | 1, 2 |
| 5 | `trampos` domínio e aplicação: agregado `Trampo` (validações do CA4/5, `candidatar`, `aceitar` recusando as demais, transições de status), `publicarTrampo` e `candidatar` (ambos recebem a porta `VerificadorDePerfil` e recusam com `perfil_incompleto`), `listarCandidaturas` (só o autor), `aceitarCandidatura`, `buscarTrampos`, `existeVinculoEntre`; BDD CA4, CA5, CA8–CA11 e D9 (publicar e candidatar com perfil incompleto) | `M/trampos/dominio/{trampo,candidatura,portas}.ts` + `.test.ts`, `M/trampos/aplicacao/{casos-de-uso.ts,trampos.bdd.test.ts}`, `M/trampos/adaptadores/memoria/{repositorio-memoria,verificador-perfil-memoria}.ts` | base + `pnpm --filter api exec vitest run src/modulos/trampos` | dev | D | não | 4, 5, 8, 9, 10, 11, D9 |
| 6 | `servicos` domínio e aplicação: `Servico` (título, descrição, categoria, preço base > 0, cidade opcional), `ofertarServico` (recebe a porta `VerificadorDePerfil` e recusa com `perfil_incompleto`), `buscarServicos`; BDD CA6 e D9 | `M/servicos/dominio/{servico,portas}.ts` + `.test.ts`, `M/servicos/aplicacao/{casos-de-uso.ts,servicos.bdd.test.ts}`, `M/servicos/adaptadores/memoria/{repositorio-memoria,verificador-perfil-memoria}.ts` | base + `pnpm --filter api exec vitest run src/modulos/servicos` | dev | D | não | 6, D9 |
| 7 | `contas` adaptadores: migração 0001; repositórios Postgres (o 23505 em `contas_email_key` vira `email_em_uso` sem detalhe); rotas `/contas` e `/sessoes`; fachada `index.ts` | `migracoes/0001_contas.ts`, `M/contas/adaptadores/postgres/repositorios-postgres.ts` + `.integracao.test.ts`, `M/contas/adaptadores/http/{rotas.ts,rotas.test.ts}`, `M/contas/index.ts` | base + integração | dev | E | sim (migração, senha, token, entrada pública) | 1, 2, 14, 15 |
| 8 | `trampos` adaptadores: migração 0002; repositório com transação e trava otimista (`UPDATE … WHERE versao = $n`; nenhuma linha afetada vira `conflito_de_versao`); busca com `LIKE` escapado; rotas (o teste HTTP cobre 409 `perfil_incompleto` com o fake); fachada; teste de integração de dois aceites concorrentes (só um vence) | `migracoes/0002_trampos.ts`, `M/trampos/adaptadores/postgres/repositorio-postgres.ts` + `.integracao.test.ts`, `M/trampos/adaptadores/http/{rotas.ts,rotas.test.ts}`, `M/trampos/index.ts` | base + integração | dev | E | sim (migração, concorrência) | 4, 5, 7, 8, 9, 10, 11, 14, D9 |
| 9 | `servicos` adaptadores: migração 0003, repositório com busca, rotas (o teste HTTP cobre 409 `perfil_incompleto` com o fake), fachada | `migracoes/0003_servicos.ts`, `M/servicos/adaptadores/postgres/repositorio-postgres.ts` + `.integracao.test.ts`, `M/servicos/adaptadores/http/{rotas.ts,rotas.test.ts}`, `M/servicos/index.ts` | base + integração | dev | E | sim (migração) | 6, 7, 14, D9 |
| 10 | `perfis` completo: `Perfil` (completo = nome + cidade + ao menos uma habilidade), migração 0004, repositório, rotas; o perfil público omite qualquer dado de conta; caso de uso `perfilEstaCompleto(contaId)` exposto na fachada `index.ts` (falso quando não existe perfil); BDD CA3 e D9 (completo e incompleto) | `migracoes/0004_perfis.ts`, `M/perfis/dominio/{perfil,portas}.ts` + `.test.ts`, `M/perfis/aplicacao/{casos-de-uso.ts,perfis.bdd.test.ts}`, `M/perfis/adaptadores/{memoria/repositorio-memoria.ts,postgres/repositorio-postgres.ts,postgres/repositorio-postgres.integracao.test.ts,http/rotas.ts,http/rotas.test.ts}`, `M/perfis/index.ts` | base + integração | dev | F | sim (dado pessoal, migração) | 3, 14, 15, D9 |
| 11 | `conversas` completo: `abrirConversa` exige `existeVinculoEntre` (porta implementada pela fachada de trampos), par ordenado único, `enviarMensagem` com texto não vazio, listagem cronológica só para participantes, migração 0005; BDD CA12/CA13 | `migracoes/0005_conversas.ts`, `M/conversas/dominio/{conversa,mensagem,portas}.ts` + `.test.ts`, `M/conversas/aplicacao/{casos-de-uso.ts,conversas.bdd.test.ts}`, `M/conversas/adaptadores/{memoria/repositorio-memoria.ts,postgres/repositorio-postgres.ts,postgres/repositorio-postgres.integracao.test.ts,http/rotas.ts,http/rotas.test.ts}`, `M/conversas/index.ts` | base + integração | dev | F | sim (dado pessoal, migração) | 12, 13, 14 |
| 12 | `busca`: junta as fachadas de trampos e serviços (filtros com E lógico, mais recentes primeiro, cursor), rota `/busca` e `/categorias`; BDD CA7 com fachadas em memória | `M/busca/aplicacao/{buscar.ts,busca.bdd.test.ts}`, `M/busca/adaptadores/http/{rotas.ts,rotas.test.ts}`, `M/busca/index.ts` | base + `pnpm --filter api exec vitest run src/modulos/busca` | dev | F | não | 7, 14 |
| 13 | Composição e ponta a ponta: composition root, que liga `perfis.perfilEstaCompleto` como `VerificadorDePerfil` de `trampos` e `servicos`; entrypoint; `@fastify/rate-limit` em `POST /contas` e `/sessoes` (D2); teste e2e do fluxo cadastro → tentativa de publicar sem perfil (409 `perfil_incompleto`) → perfil → trampo → candidatura (o freelancer também com perfil completo) → aceite → conversa; teste de 401 em todas as rotas protegidas | `src/composicao.ts`, `src/servidor.ts`, `test/e2e/fluxo-completo.integracao.test.ts`, `test/e2e/autenticacao.integracao.test.ts` | base + integração + `pnpm --filter api build` | dev | G | sim (auth, entrada pública) | 1–14, D9 |
| 14 | Varredura do CA15, semente e docs: teste que captura o stream do pino durante erros forçados (e-mail duplicado, falha de banco simulada, senha errada) e garante que não aparecem o e-mail, a senha, o nome nem o token; script `semear` com dados fictícios, cujos usuários têm perfil completo (D9); README com os comandos | `test/e2e/logs-sem-dado-pessoal.integracao.test.ts`, `scripts/semear.ts`, `README.md` | base + integração + `pnpm --filter api semear` | dev | H | sim (logs) | 15 |

Grupos: A → B → C → D (4, 5 e 6 em paralelo) → E (7, 8 e 9 em paralelo) → F (10, 11 e 12 em paralelo) → G → H. Nenhum grupo compartilha arquivo dentro de si: cada etapa escreve só no próprio módulo e na própria migração, e `composicao.ts` e `servidor.ts` só são tocados na etapa 13. Todas as dependências e todos os scripts (`dev`, `build`, `start`, `migrar`, `semear`, `test`, `test:integracao`, `typecheck`, `lint`) entram no `package.json` na etapa 1, apontando para arquivos que as etapas seguintes criam. Assim nenhuma etapa paralela edita o `package.json`. No paralelo, cada `dev` roda só os testes do seu módulo. A D9 não cria arquivo compartilhado: no grupo D, a porta e o fake de `VerificadorDePerfil` ficam dentro de cada módulo. No grupo E, as rotas das etapas 8 e 9 usam o fake do próprio módulo nos testes HTTP. A ligação com a fachada real de `perfis` (etapa 10, grupo F) só acontece em `composicao.ts`, na etapa 13. A etapa 14 roda depois da 13 porque precisa do servidor montado.

## Pontos para o seguranca
- Senha: parâmetros do scrypt, comparação em tempo constante, limite máximo de 128 caracteres (evita DoS no hash) e tempo igual entre e-mail existente e inexistente no login.
- Token: 32 bytes de `crypto.randomBytes`, só o SHA-256 no banco, expiração, revogação no logout e hook aplicado em todas as rotas, exceto as duas públicas (o teste da etapa 13 cobre isso).
- CA2 versus enumeração: o 409 `email_em_uso` revela que o e-mail existe, como o CA exige. A mitigação é o rate limit; o login responde de forma genérica.
- Logs (CA15): o `detail` do driver `pg` traz o valor na violação de unicidade (`Key (email)=(...)`). O serializer precisa descartar esse campo. Fastify não loga o corpo da requisição: manter assim.
- Autorização por recurso: candidaturas visíveis só ao autor do trampo, conversa só aos participantes (404, não 403, para não confirmar existência) e aceite só pelo autor.
- Busca: `LIKE` parametrizado com `%`, `_` e `\` escapados; tamanho máximo do texto de busca (100 caracteres).
- Concorrência: aceite duplo (trava otimista) e candidatura duplicada (índice único).
- Dado pessoal (LGPD) fica em: `contas.email`, `perfis.*`, `mensagens.texto`, `candidaturas.mensagem` e os textos livres de trampos e serviços. O telefone não é coletado.

## Riscos e como reverter
- **Migração:** só cria tabela, nada destrutivo. O `down` remove a tabela apenas se estiver vazia e aborta se houver dados. Reverte com `pnpm --filter api migrar -- --baixar` no ambiente local.
- **Sem FK entre módulos:** pode sobrar referência órfã (ex.: `trampos.autor_id`). Não há exclusão de conta no MVP, então o risco é baixo. Reverter é uma migração nova que adiciona a FK.
- **Busca com `LIKE`:** lenta com volume alto. Trocar por `pg_trgm` é uma migração aditiva que não muda o contrato.
- **scrypt N=2^17:** cerca de 128 MB de RAM por hash. Sob carga, o rate limit segura. Os parâmetros ficam no próprio hash, então dá para mudar sem invalidar senhas.
- **Paralelismo dos `dev`:** todos usam o mesmo banco de teste. Cada teste de integração trunca só as tabelas do próprio módulo.

## Perguntas em aberto e premissas adotadas
Todas as 9 perguntas foram **decididas** pelo dono em 2026-10-20. Os detalhes estão em `docs/produto/decisoes.md` (D1 a D11).
1. Stack e dependências: aprovadas (D1).
2. Rate limit no cadastro e no login: sim (D2).
3. BDD com Vitest e cenários nomeados pelo CA, sem cucumber (D3).
4. CA13 literal: quem acha um serviço não conversa com o freelancer no MVP (D4).
5. Categorias: lista fechada de 10 itens (D5), com os ids e rótulos definidos na etapa 2.
6. Valor único em centavos e prazo opcional; sem faixa (D6).
7. Cidade do serviço opcional (D7).
8. Busca e detalhes exigem conta (D8).
9. Exclusão e exportação de conta (LGPD) ficam fora do MVP e entram antes das lojas (D10).

Decisão nova que entrou no plano: perfil completo obrigatório para publicar, ofertar e candidatar (D9).

Para a entrega 2 (`docs/produto/planos/mvp-trampo-ja-app.md`, D11), a marca já está definida (`docs/produto/decisoes.md:23-25`):
- **Cores:** azul `#1A7FF6` e roxo `#AF6FF1`, em gradiente de 90°.
- **Logo:** `logo.svg` na raiz. É um SVG com um JPEG de 1254×1254 embutido, não um vetor: serve para ícone e splash, mas não escala sem perda.
- **Fonte:** a do sistema, até o dono informar outra.

Para o lead: rodar `git init` na etapa 1, já que o `revisor` depende de `git diff`. Isso não é commit.

## ADR
**ADR-001: stack e arquitetura do Trampo Já** (aprovado: D1 em `docs/produto/decisoes.md`)
- **Contexto:** time pequeno; app mobile; DDD e hexagonal pedidos pela visão; tudo offline.
- **Decisão:**
  - TypeScript no backend e no app.
  - Backend: Fastify + Kysely + PostgreSQL 16.
  - App: Expo.
  - Monólito modular com um módulo por bounded context, fachada `index.ts` como única porta entre módulos e sem FK entre módulos.
  - Token opaco com hash em banco e senha com scrypt nativo.
  - Erros por código.
- **Consequências:** os testes de domínio e BDD rodam sem banco, com adaptadores em memória. Os testes de integração exigem Docker. Trocar o ORM ou o framework HTTP mexe só em `adaptadores/`.

## Texto para o CLAUDE.md (lead preenche após aprovação)
```
- **Produto:** app mobile que conecta freelancers e empregadores (visão em `docs/produto/visao.md`).
- **Stack:** monorepo pnpm, Node 22 e TypeScript estrito. API em `apps/api`: Fastify, Kysely + pg, PostgreSQL 16 (Docker), Vitest, Biome. App em `apps/mobile`: Expo (React Native) + Expo Router, jest-expo.
- **Camadas e pastas:** `apps/api/src/modulos/<modulo>/{dominio,aplicacao,adaptadores/{http,postgres,memoria},index.ts}`; módulos: contas, perfis, trampos, servicos, conversas, busca. Entre módulos, só via `index.ts`. Compartilhado em `apps/api/src/compartilhado/`. Migrações em `apps/api/migracoes/`. Regra de negócio (o designer não toca): `apps/api/**` inteiro e, no app, `apps/mobile/src/api/` e `apps/mobile/src/estado/`. Textos de interface em `apps/mobile/src/textos/pt-BR.ts`; tokens em `apps/mobile/src/tema/tokens.ts`.
- **Verificação:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (unidade e BDD, sem banco), `pnpm test:integracao` (exige `docker compose up -d banco` e `pnpm --filter api migrar`), um arquivo: `pnpm --filter api exec vitest run <caminho>`, build: `pnpm --filter api build`.
- **Dados de teste:** Postgres local via `docker compose up -d banco` (bancos `trampoja` e `trampoja_teste`); `pnpm --filter api semear` cria dados fictícios. Testes de domínio usam adaptadores em `adaptadores/memoria/`. Nenhum serviço externo.
- **Dado pessoal (LGPD):** `contas.email`, `perfis.*`, `mensagens.texto`, `candidaturas.mensagem` e textos livres de trampos e serviços. Nunca em logs nem em mensagens de erro: a API responde com códigos e o logger tem redact.
- **Docs que acompanham a mudança:** `README.md`, `.env.example` e `docs/produto/decisoes.md`.
```
