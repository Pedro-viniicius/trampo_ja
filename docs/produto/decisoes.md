# Decisões do dono

Registro de decisões de produto e técnicas. Decisão registrada não se reabre sem fato novo.

## 2026-10-20 — MVP, entrega 1 (fundação e backend)

Aprovado pelo dono o plano `docs/produto/planos/mvp-trampo-ja.md` e a spec `docs/produto/specs/mvp-trampo-ja.md`, com as premissas abaixo.

1. **Stack:** monorepo pnpm, Node 22, TypeScript estrito. API com Fastify, Kysely + pg, PostgreSQL 16 em Docker, Vitest e Biome. App com Expo (React Native) + Expo Router. Ver ADR-001 no plano.
2. **Rate limit:** `@fastify/rate-limit` no cadastro (`POST /contas`) e no login (`POST /sessoes`).
3. **BDD:** Vitest com cenários nomeados pelo CA (`it('CA4 — Dado…, quando…, então…')`). Sem cucumber.
4. **CA13 literal:** só há conversa entre quem tem candidatura ou contratação. Quem acha um serviço na busca não conversa com o freelancer no MVP.
5. **Categorias:** lista fechada com 10 itens: Reformas e reparos, Design, Aulas e reforço, Entregas e transporte, Tecnologia (TI), Eventos, Limpeza e serviços domésticos, Beleza e bem-estar, Fotografia e vídeo, Outros.
6. **Valor do trampo:** valor único em centavos; prazo é data limite opcional. Faixa de valor fica fora do MVP.
7. **Cidade do serviço:** opcional; o app preenche com a cidade do perfil. Filtro por cidade não traz serviço sem cidade.
8. **Acesso sem login:** busca e detalhes exigem conta.
9. **Perfil completo:** publicar trampo, ofertar serviço e candidatar-se exigem perfil completo (nome, cidade e ao menos uma habilidade). A regra fica na API, não só no app.
10. **LGPD:** exclusão e exportação de conta ficam fora do MVP e entram antes da publicação nas lojas.
11. **Entregas:** o MVP é dividido em entrega 1 (backend, CA1–CA15) e entrega 2 (app mobile, CA16), planejada em `docs/produto/planos/mvp-trampo-ja-app.md`.

## 2026-10-20 — Identidade visual

- **Cores do app:** gradiente `linear-gradient(90deg, #1A7FF6 0%, #AF6FF1 100%)`, extraído da logo. Azul `#1A7FF6` e roxo `#AF6FF1` são as cores primárias.
- **Logo:** `logo.svg` na raiz do projeto (na entrega 2 vai para os assets do app). Atenção: o arquivo é um SVG que embute uma imagem JPEG de 1254×1254 px, não um vetor; serve para ícone e splash, mas não escala sem perda. Pedir ao dono o vetor original se houver.
- **Fonte:** não definida; o app usa a fonte do sistema até o dono informar a do protótipo.

## 2026-10-20 — MVP, entrega 2a (app mobile)

Aprovado pelo dono o plano `docs/produto/planos/mvp-trampo-ja-app.md` (entrega 2a: fundação, conta, perfil, início, busca e detalhes), com as premissas abaixo. A entrega 2b (publicação, candidaturas, conversas) será planejada em `docs/produto/planos/mvp-trampo-ja-app-2b.md`.

12. **Estado de servidor no app:** `@tanstack/react-query` aprovado como única biblioteca fora do Expo.
13. **Contagem de resultados da busca:** "{n} resultados" conta só o que já carregou, com "+" quando há mais; a API não devolve total.
14. **Fonte e ícones:** fonte do sistema e Ionicons (`@expo/vector-icons`) até o dono informar a fonte e o estilo de ícones do protótipo.
15. **Fronteira no app:** rotas em `apps/mobile/src/app/` são contêineres do dev; telas e componentes em `src/telas/` e `src/componentes/` são apresentacionais do designer; `src/api/` e `src/estado/` são regra de negócio.

## 2026-10-21 — App no Expo SDK 57

16. **Versão do Expo (D16):** App no Expo SDK 57 até o Expo Go da loja suportar o 58; subir depois. O Expo Go da App Store no iPhone do dono ainda abre só o SDK 57 e recusava o projeto no 58.

## 2026-10-21 — MVP, entrega 2b (publicação, candidaturas e meus anúncios)

Aprovado pelo dono o plano `docs/produto/planos/mvp-trampo-ja-app-2b.md`.

17. **Corte 2b/2c:** a 2b cobre publicar, ofertar, candidatar-se, candidaturas (minhas, recebidas e aceite), meus trampos e meus serviços; a 2c (`docs/produto/planos/mvp-trampo-ja-app-2c.md`) cobre as conversas, CA12, CA13 e o fechamento do CA16.
18. **Prazo do trampo** como campo de texto `dd/mm/aaaa` no MVP, sem seletor de data nativo (evita dependência nova).
19. **Sem mudança na API na 2b:** o app deriva o papel (autor ou candidato) das listas `/trampos/meus`, `/servicos/meus` e `/candidaturas/minhas` (ADR-003 no plano); nomes de terceiros por `GET /perfis/:id` com cache.

## 2026-10-21 — MVP, entrega 2c (conversas)

Aprovado pelo dono o plano `docs/produto/planos/mvp-trampo-ja-app-2c.md` (ADR-004: polling incremental no cache, com mensagens pendentes locais).

20. **Conversas sem mudança na API:** atualização por polling a cada 5 s na conversa (dobra a cada falha de rede ou 5xx, até 60 s) e a cada 30 s na lista, só com a tela focada e o app ativo. SSE ou push ficam para depois do MVP.
21. **Sem id de idempotência no envio:** antes de reenviar uma mensagem que falhou, o app consulta as mensagens novas e só reenvia se a dela não chegou. O risco residual de duplicata (mesma conta em dois aparelhos, mesmo texto, durante uma falha) é aceito; um `idCliente` na API só entra se houver duplicata relatada.
22. **"Conversar" no detalhe do serviço por tentativa:** o botão aparece para quem não é o autor; sem vínculo, a API responde 403 e o app mostra o texto literal do CA13 e desabilita o botão. Esconder antes exigiria um endpoint de vínculo.
23. **"Conversar" em toda candidatura recebida** (pendente, aceita e recusada), como a API permite e como o lado do freelancer já faz.
24. **Risco aceito (S1 da 2c, MÉDIA):** a API continua sem limite de volume por conta em `POST /conversas/:id/mensagens` e `POST /conversas` até o release externo (junto com a S3 da entrega 1). No app, o cache de mensagens ganha um teto de mensagens mantidas por conversa.
