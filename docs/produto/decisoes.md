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

## 2026-10-22 — Pré-lançamento nas lojas

Aprovado pelo dono o plano `docs/produto/planos/pre-lancamento-lojas.md` (entrega L1 completa; L2 a L4 em escopo resumido; ADR-005: exclusão orquestrada pela composição numa transação, sem FK entre módulos) e a spec `docs/produto/specs/pre-lancamento-lojas.md`, com as divergências resolvidas pelo plano.

25. **Exclusão de conta:** imediata, definitiva, sem prazo de carência e confirmada com a senha. Numa só transação, apaga conta, sessões (todos os aparelhos), perfil, trampos (com as candidaturas recebidas), serviços, candidaturas da conta e as conversas inteiras de que ela participa (as mensagens dos dois lados). Senha errada responde 403 `senha_incorreta`.
26. **Exportação de dados:** JSON `trampo-ja.exportacao.v1`, pedido com a senha, só com dados da própria conta (sem hash, token ou texto de terceiros). O app grava um arquivo temporário, abre a folha de compartilhamento do sistema e apaga o arquivo. Dependência nova aprovada: `expo-sharing` (plano B, se o Expo Go do SDK 57 não trouxer: compartilhar como texto).
27. **Aceite dos termos:** só pelo texto "Ao criar a conta, você concorda com…" no cadastro, com links, sem caixa de seleção e sem registro na API; vale a versão vigente na data de criação da conta.
28. **Textos legais:** política de privacidade e termos de uso como RASCUNHO em `docs/produto/legal/`, com marcadores para a identidade do controlador (nome, CPF/CNPJ, e-mail de contato, foro e hospedagem) até a revisão jurídica. Idade mínima adotada: 18 anos (recomendação aceita na aprovação do plano; o dono pode mudar).
29. **Limite de volume por conta na API** (chave `contaId`): leituras 600/min; mensagens 30/min; publicação de trampo, serviço e candidatura 30/h; exclusão e exportação 5 a cada 15 min; demais escritas 60/min. Acima, 429 com `retry-after`. Fecha a D24 e a S3 da entrega 1. Ajuste técnico na revisão (S8): `DELETE /sessoes` (sair) fica fora do limite por conta, para o logout nunca receber 429; a exportação roda uma por vez por processo. Em 2026-10-23 o dono aprovou também um teto diário de 1000 mensagens por conta a cada 24 h em `POST /conversas/:id/mensagens`, somado aos 30/min (fecha a parte MÉDIA da S1 da L1: a exportação passa a crescer devagar e em linha reta; o resíduo BAIXA, exportação sem teto de tamanho, fica para a L3 com gatilho).
30. **Anúncios (L2):** trampo editável só enquanto aberto e sem candidaturas; "encerrar" vale para trampo aberto ou em andamento, recusa as pendentes, tira da busca e mantém as conversas; excluir só trampo aberto; serviço pode ser editado ou excluído, sem pausa; só candidatura pendente pode ser retirada.
31. **Bloqueio de login (L3):** o limite por e-mail passa a ser por e-mail+IP (10 a cada 15 min), com teto de 100 por hora por e-mail.
32. **Corte:** L1 (conta, privacidade e limites), L2 (anúncios e candidaturas), L3 (endurecimento de segurança), L4 (qualidade).

Pendências fora do código: hospedar na web a política de privacidade e a página de pedido de exclusão (exigências da Apple e do Google Play), revisão jurídica dos textos e prazo de guarda dos registros de acesso (Marco Civil, 6 meses).

## 2026-10-23 — Pré-lançamento L2 (anúncios e candidaturas)

Aprovado pelo dono o plano `docs/produto/planos/pre-lancamento-l2.md` (ADR-006: concorrência nas escritas de anúncio), com as divergências da spec resolvidas pelo plano: encerrar vale para trampo aberto ou em andamento; o motivo de não poder excluir é "Só trampo aberto pode ser excluído."; o trampo é editável por inteiro ou não é; sem "Pausar serviço".

33. **Trava de versão:** só a edição (`PUT`) leva a `versao` lida pelo app e recebe 409 `conflito_de_versao`. Encerrar, excluir e retirar reaplicam a regra no servidor. `versao` e a contagem de candidaturas aparecem só para o autor. O serviço ganha `versao` na migração `0006`.
34. **Encerrado é estado final:** o trampo encerrado não reabre, não é editado nem excluído e continua em Meus anúncios. Encerrar de novo responde 204 sem mudança. O trampo em andamento cuja contratada excluiu a conta (D25) se resolve encerrando.
35. **Retirar candidatura** apaga a candidatura, que some de Minhas candidaturas. Retirar ou excluir trampo não mexe na conversa já aberta; uma conversa nova depende de outro vínculo (D4). Quem tinha candidatura num trampo excluído só a vê sumir, sem aviso.
36. **Limites:** os `PUT` de anúncio contam em `publicacao` (30/h); excluir, encerrar e retirar contam em `escrita` (60/min).
37. **Conflito na edição:** "Ver versão atual" recarrega o anúncio e mantém os campos que a pessoa já mexeu, sem área "Suas alterações".

## 2026-10-23 — Pré-lançamento L3 (endurecimento de segurança)

Aprovado pelo dono o plano `docs/produto/planos/pre-lancamento-l3.md` (ADR-007: limpeza periódica no processo da API, com lápide de conta excluída), a implementar depois da L2. Premissas aceitas: na atualização com a correção do iOS (S2) todos os aparelhos saem da conta uma vez; o 503 aparece no app como o erro genérico de servidor; órfãos anteriores à L3 não são varridos.

40. **Limpeza periódica** dentro do processo da API, a cada 1 h: apaga as sessões expiradas e, pela lápide `contas_excluidas` (migração `0007`, só id e data), refaz a exclusão de cada conta excluída há mais de 10 min.
41. **Teto da exportação:** 10 MiB, medido no banco. Acima disso, a API responde 409 `exportacao_grande` e o app orienta pedir os dados pelo e-mail de contato, com resposta manual em até 15 dias (LGPD, art. 19, II).
42. **Tempos fixos:** espera máxima de 10 s na fila do scrypt e na da exportação, com 503 `servico_ocupado` e `retry-after` de 10 s. No banco, `statement_timeout` de 10 s, conexão em 5 s e transação ociosa em 30 s.
43. **Retorno depois de "sessão expirada"** só vale para a mesma conta, comparada por uma impressão do e-mail guardada no secure-store junto com o token.
44. **Banco fora da máquina** só com `sslmode=verify-full`. O `semear` só roda em banco local, a não ser com `--permitir-banco-remoto`.

Riscos da L3 aceitos pelo dono em 2026-10-26:
- reverter a `0008` apaga os contadores de tentativas, que vencem em 1 h;
- toda tentativa de login de uma conta existente conta para o teto de 100/h, inclusive a com senha certa;
- depois de 100 tentativas, o 429 de uma conta existente, contra o 401 de uma inexistente, revela que a conta existe. É o mesmo que o 409 `email_em_uso` do cadastro já revela.

## 2026-10-26 — Pré-lançamento L4 (qualidade)

Aprovados pelo dono o plano `docs/produto/planos/pre-lancamento-l4.md` (ADR-008) e a spec `docs/produto/specs/pre-lancamento-l4.md`, com as recomendações.

45. **Limite dos campos de texto** contado em pontos de código, como na API. Ao passar do limite, o texto é cortado e o leitor de tela anuncia.
46. **Autor do trampo** reconhecido pelo detalhe (visão do autor no `GET /trampos/:id`), não mais pela lista "meus". Revê a D19 só para o trampo.
47. **"Meus anúncios" paginado:** 20 por página, até 50, dos mais recentes para os mais antigos, com cursor `(criadoEm, id)`.
48. **Ordem das mensagens (R2)** corrigida no app: a cada ciclo, ele relê os últimos 60 s. A API não muda.
49. **Retirar candidatura** trava o trampo, como encerrar e excluir, e nunca responde `conflito_de_versao`.
50. **Exclusão de conta grande** (condicional): se a medida passar de 5 s, a transação da exclusão ganha `statement_timeout` próprio de 60 s, como exceção à D42.
51. **Faixa sem conexão:** uma só, na raiz, com o texto "Sem conexão. Ações que precisam de internet ficam indisponíveis."
