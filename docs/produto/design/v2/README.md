# Visual V2 — referências do redesign

Extraído de `Trampo Já — Redesign.html` (fora do repositório, entregue pelo dono em 2026-11-13). Decisões em `docs/produto/decisoes.md` (D52 a D56).

- `capturas/`: cada quadro renderizado (telas em 390×844; guias e home desktop em 1440 de largura). Telas com rolagem interna mostram só o primeiro quadro: o conteúdo completo está em `fonte/`.
- `fonte/`: o HTML de cada quadro, com os valores exatos (cores, tamanhos, raios, sombras e textos). As imagens são referenciadas por UUID e ficam em `imagens/<uuid>.png`. Trechos `{{ ... }}` são laços do template; os dados de exemplo estão no `<script>` do mesmo arquivo.
- `imagens/`: logo e ilustrações usadas nos quadros.

| Quadro | Tela no app hoje |
|---|---|
| 00 Guia — Fundamentos | `src/tema/tokens.ts` |
| 01 Guia — Componentes | `src/componentes/` |
| 02 Entrar | `telas/Entrar.tsx` |
| 03 Cadastro | `telas/Cadastro.tsx` |
| 04 Freela · Início | `telas/Inicio.tsx` |
| 05 Freela · Detalhe da vaga | `telas/DetalheDoTrampo.tsx` + `RodapeDoTrampo.tsx` |
| 06 Freela · Candidatura enviada | nova |
| 07 Freela · Meus trampos | `telas/MinhasCandidaturas.tsx` |
| 08 Freela · Conversas | `telas/ListaDeConversas.tsx` |
| 09 Freela · Chat | `telas/Conversa.tsx` |
| 10 Freela · Perfil | `telas/Perfil.tsx` |
| 11 Freela · Dicas & minicursos | nova |
| 12 Contratante · Início | nova |
| 13 Contratante · Nova demanda | `telas/FormularioDeAnuncio.tsx` |
| 14 Contratante · Minhas demandas | `telas/MeusAnuncios.tsx` |
| 15 Contratante · Lista de candidatos | `telas/CandidaturasRecebidas.tsx` |
| 16 Contratante · Buscar freelancers | `telas/Buscar.tsx` |
| 17 Contratante · Avaliar profissional | nova (depende de avaliações) |
| 18 Contratante · Perfil da empresa | nova |
| 19 Home desktop | fora do app (página web) |
