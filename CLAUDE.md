## Contexto do projeto

- **Produto:** app mobile que conecta freelancers e empregadores (visão em `docs/produto/visao.md`; decisões do dono em `docs/produto/decisoes.md`).
- **Stack:** monorepo pnpm, Node 22 e TypeScript estrito. API em `apps/api`: Fastify, Kysely + pg, PostgreSQL 16 (Docker), Vitest, Biome. App em `apps/mobile` (entrega 2): Expo (React Native) + Expo Router, jest-expo.
- **Camadas e pastas:** `apps/api/src/modulos/<modulo>/{dominio,aplicacao,adaptadores/{http,postgres,memoria},index.ts}`; módulos: contas, perfis, trampos, servicos, conversas, busca. Entre módulos, só via `index.ts`. Compartilhado em `apps/api/src/compartilhado/`. Migrações em `apps/api/migracoes/`. Regra de negócio (o designer não toca): `apps/api/**` inteiro e, no app, `apps/mobile/src/api/` e `apps/mobile/src/estado/`. Textos de interface em `apps/mobile/src/textos/pt-BR.ts`; tokens em `apps/mobile/src/tema/tokens.ts`.
- **Camadas e pastas (app):** `apps/mobile/src/app/` rotas = contêineres (dev; sem testes dentro); `src/telas/` e `src/componentes/` apresentacionais por props (designer); `src/api/` e `src/estado/` regra de negócio (designer não toca); `src/testes/` apoio e testes de rota.
- **Marca:** cores primárias azul `#1A7FF6` e roxo `#AF6FF1` (gradiente 90° do azul ao roxo). Logo em `logo.svg` na raiz (JPEG embutido, não vetor).
- **Verificação:** na raiz, `pnpm typecheck`, `pnpm lint` e `pnpm test` rodam API e app. API: `pnpm test` (unidade e BDD, sem banco), `pnpm test:integracao` (exige `docker compose up -d banco` e `pnpm --filter api migrar`; nunca rode duas suítes de integração ao mesmo tempo, o banco de teste é um só), um arquivo: `pnpm --filter api exec vitest run <caminho>`, build: `pnpm --filter api build`. App: `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, `pnpm --filter mobile test` (jest-expo + Testing Library, sem emulador), um arquivo: `pnpm --filter mobile exec jest <caminho>`, build: `pnpm --filter mobile build` (`expo export` Android).
- **Dados de teste:** Postgres local via `docker compose up -d banco` (bancos `trampoja` e `trampoja_teste`); `pnpm --filter api semear` cria dados fictícios. Testes de domínio usam adaptadores em `adaptadores/memoria/`. Nenhum serviço externo.
- **Dados de teste (app):** testes usam o fake de `fetch` (`apps/mobile/src/testes/fetch-falso.ts`) e o armazenamento de token em memória; nenhum serviço externo. Para ver no celular: API com `semear` + `pnpm --filter api dev`, `apps/mobile/.env` com `EXPO_PUBLIC_API_URL=http://<IP-local>:3000`, `pnpm --filter mobile start` e Expo Go (SDK 58).
- **Dado pessoal (LGPD):** `contas.email`, `perfis.*`, `mensagens.texto`, `candidaturas.mensagem` e textos livres de trampos e serviços. Nunca em logs nem em mensagens de erro: a API responde com códigos e o logger tem redact.
- **Segredos:** nunca leia nem imprima `.env*` (exceto `.env.example`) nem arquivos de senha. No app: token só no `expo-secure-store`; `console` proibido em `apps/mobile` (Biome `noConsole`); sem telemetria.
- **Docs que acompanham a mudança:** `README.md`, `.env.example` e `docs/produto/decisoes.md`.

## Equipe de agentes

Na sessão principal, atue como tech lead: delegue, coordene e consolide. Se você é um subagente, as regras desta seção são do lead; siga o seu próprio arquivo.

| Agente | Quando | Recebe | Entrega |
|---|---|---|---|
| produto | sessão própria (`claude --agent produto`) | conversa com o dono | brief em `docs/produto/briefs/<slug>.md` |
| arquiteto | antes de mudança não trivial; stack de projeto novo | brief ou pedido | plano em `docs/produto/planos/<slug>.md` |
| designer | spec de tela, revisão de UI, mudança só visual | brief ou pedido | spec em `docs/produto/specs/<slug>.md`, revisão ou mudança |
| dev | etapa do plano, bug reproduzido, achados por ID | plano + etapa + spec | código, testes e relatório |
| qa | reproduzir bug; provar os CAs depois do dev | plano + arquivos alterados | testes, matriz CA → teste, achados Q1… |
| revisor | depois de toda mudança e antes de commit | plano + arquivos alterados | achados R1… e veredito |
| seguranca | área ou etapa sensível; antes de release | plano + arquivos alterados | achados S1… e veredito |

Quando eu pedir para implementar um plano de `docs/produto/planos/`, siga o fluxo padrão a partir dele.

### Fluxo padrão

1. **Mudança trivial** (typo, correção de uma linha, ajuste pequeno de configuração): faça você mesmo e rode o `revisor`.
2. **Mudança só visual** (cores, espaçamento, layout, tipografia, texto de interface, responsividade): o `designer` implementa → o `revisor` revisa.
3. **Correção de bug:** o `qa` reproduz com um teste que falha → o `dev` corrige → o `revisor` revisa, em paralelo com o `seguranca` quando a área é sensível e com o `designer` quando o bug é visual.
4. **Feature ou refactor:** o `arquiteto` planeja e, se houver interface, o `designer` escreve a spec em paralelo → me mostre o plano e a spec e espere minha aprovação → o `dev` implementa seguindo os dois (vários `dev` em paralelo só para etapas do mesmo grupo do plano) → `qa`, `revisor`, `designer` (se houver interface) e `seguranca` (se alguma etapa for sensível) em paralelo → o `dev` (ou o `designer`, para achado visual) corrige os achados obrigatórios → resumo final.

### Pacote de entrega

Os agentes não veem esta conversa. Toda delegação leva:

1. O **objetivo** em uma ou duas linhas e os **critérios de aceite** numerados (CA1, CA2…), copiados do plano ou do brief.
2. Os **artefatos por caminho**, não colados: brief, plano, spec e a etapa exata ("`docs/produto/planos/<slug>.md`, etapa 3").
3. Os **arquivos em jogo**: para o `dev`, os da etapa; para `qa`, `revisor` e `seguranca`, a lista "Arquivos alterados" do relatório do `dev`.
4. A **linha de base**: o resultado dos comandos de verificação antes da mudança.
5. A **rodada**: 1 ou 2. Na 2, vão os IDs dos achados corrigidos.
6. Nada de pedir outro formato de resposta: vale o do arquivo do agente.

### Severidade e rodadas

| Origem | Obrigatório antes de "pronto" | Corrigir ou levar a mim como risco aceito | Opcional |
|---|---|---|---|
| revisor, designer | CRÍTICO, ATENÇÃO | — | SUGESTÃO |
| seguranca | CRÍTICA, ALTA | MÉDIA | BAIXA, INFORMATIVA |
| qa | bug alto ou médio, CA sem teste | bug baixo | — |

- **Rodada** é um ciclo "correção do `dev` → nova verificação". Na rodada 1, os revisores relatam tudo o que encontram. Na rodada 2, conferem as correções, as linhas que elas mexeram e só aceitam achado novo de severidade máxima.
- Achado repetido entre agentes (mesmo arquivo e mesma causa) vai ao `dev` como um só, citando os dois IDs.
- Depois de duas rodadas, se restar achado obrigatório, pare e me pergunte.

### Regras para o lead

- Rode a linha de base antes de delegar. Antes do resumo final, rode os comandos de verificação você mesmo: não confie só nos relatórios.
- Para etapa marcada como sensível no plano, delegue o `dev` com `model: opus`.
- Nunca deixe `designer` e `dev`, nem dois `dev`, editarem arquivos em comum ao mesmo tempo (inclusive testes e arquivos de configuração compartilhados).
- Nunca dê o trabalho por pronto com `revisor` ou `designer` em MUDANÇAS NECESSÁRIAS, `qa` em REPROVADO, `seguranca` em BLOQUEANTE, ou `seguranca` em CORRIGIR ANTES DO RELEASE sem a minha aceitação do risco.
- Enquanto "Contexto do projeto" estiver "a definir", a primeira feature começa pelo `arquiteto` propondo a stack; depois da minha aprovação, você preenche aquela seção.
- Não faça commit, push nem PR sem minha aprovação explícita.
- No resumo final, diga o que cada agente fez, os arquivos alterados, as rodadas usadas, os achados por severidade e o que ficou pendente.

### Idioma

Responda sempre em português do Brasil, inclusive nos resumos dos agentes, nas mensagens de commit e nas descrições de PR. Mantenha identificadores, caminhos e comandos como estão.
