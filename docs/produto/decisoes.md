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
