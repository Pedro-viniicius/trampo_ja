# Especificação de UI/UX: Visual V2 (redesign do app mobile)

Decisões do dono: D52 a D56 em `docs/produto/decisoes.md`. Referências: `docs/produto/design/v2/` (`capturas/`, `fonte/` com os valores exatos e `README.md` com o mapa quadro → tela). Onde esta spec diz "quadro NN", vale o quadro `NN-*.png` e o `NN-*.html`. Plano técnico (rotas, estado do modo, API, dependências): `docs/produto/planos/visual-v2.md`, do arquiteto; esta spec só aponta o que a UI precisa dele.

## Objetivo e usuário

Trocar o visual de todo o app pelo V2 (cor, fontes Bricolage Grotesque e Figtree, ícones Feather, cantos grandes, sombras suaves, barra de abas flutuante), com navegação em dois modos (freela e contratante) sobre a mesma conta. Quem usa: freelancers e pequenos empregadores no celular, com pressa e conexão instável (`docs/produto/visao.md`). O visual é mais expressivo, mas as telas seguem simples: uma ação principal por tela, texto curto, toque grande.

Regra de escopo: o redesign mostra dados que a API não tem (ganhos, extrato, faturamento, "pago", distância em km, horário do turno, quantidade de vagas, experiência, compatibilidade, "disponível agora", verificado). Esta spec **desenha só o que tem dado hoje ou tem API planejada (avaliações e equipe favorita)**. O que sai ou é trocado está em cada tela, e a lista completa em "Fora do escopo desta entrega".

## Fluxo

- **Sem sessão:** Entrada → Entrar / Cadastro (quadros 02 e 03). Depois de entrar, abre no modo escolhido no cadastro (padrão: freela, ver Perguntas em aberto) ou no último modo usado.
- **Freela:** Início → detalhe do trampo → "Quero me candidatar" (folha) → **Candidatura enviada** → Meus trampos. Meus trampos → conversa. Perfil → trocar de modo, Meus serviços, Dicas & minicursos, Conta e privacidade.
- **Contratante:** Início → Nova demanda → Demandas → Lista de candidatos → aceitar → conversar → (encerrar) → **Avaliar profissional**. Buscar → detalhe do serviço → conversar (só com vínculo, regra D4 inalterada).
- **Troca de modo:** só pelo cartão de modo no Perfil. Trocar leva à aba Início do outro modo, com a animação de tela (280 ms), sem recarregar a sessão.

## Tokens V2 (`apps/mobile/src/tema/tokens.ts`)

Compatibilidade: os nomes atuais (`cores.primaria`, `texto`, `fundo`, `espaco`, `raio`, `tipografia`...) continuam existindo como **apelidos** dos novos valores, para o dev migrar tela a tela sem quebrar o app; depois da migração, os apelidos sem uso saem. Mudar `tokens.ts` afeta o app inteiro (todos os componentes e telas importam dele).

### Cores

| Grupo | Chaves (hex) |
|---|---|
| `azul` | 50 `#EEF5FF`, 100 `#D9E9FE`, 200 `#B3D3FD`, 300 `#7DB4FB`, 400 `#4797F8`, **500 `#1A7FF6` (marca)**, **600 `#0F6AD8` (botão, link, foco)**, 700 `#0B54AD`, 800 `#0C4588`, 900 `#0E3866`, 950 `#0A2342` |
| `roxo` | 50 `#F8F2FE`, 100 `#EFE2FD`, 200 `#DFC6FB`, 300 `#CBA0F7`, 400 `#BC85F4`, **500 `#AF6FF1` (marca)**, 600 `#9550E0`, **700 `#7A3BBF` (texto e ícone em roxo)**, 800 `#632F9A`, 900 `#4F2A78`, 950 `#331650` |
| `tinta` | 0 `#FFFFFF` (superfície), 50 `#F6F7FA` (fundo do app), 100 `#EEF0F5`, 200 `#E1E4EC` (divisor), 300 `#C4C8D5`, 400 `#9AA0B4`, 500 `#687189` (apoio), 600 `#555B73` (legenda), 700 `#3A4057`, 900 `#161A2B` (texto), 950 `#0D0F1A` |
| `sucesso` | fundo `#DDF5E6`, base `#16A34A`, texto `#0B7A3D` |
| `erro` | fundo `#FEE4E2`, base `#F04438`, texto `#B42318` |
| `alerta` | fundo `#FEF0C7`, base `#F79009`, texto `#93370D` |
| `informacao` | fundo `#EEF5FF`, base `#1A7FF6`, texto `#0B54AD` |
| `bordaDeCampo` (novo) | `#7E869C`: borda de campo e de controle em repouso (a `tinta.200` do redesign dá 1,27:1 e **não** serve de borda de controle) |

Apelidos: `fundo` = `tinta.50` (tela) e `superficie` = `tinta.0` (card, campo). Atenção: hoje `fundo` é branco e `superficie` é cinza; a inversão vale só no V2, então o dev renomeia por uso, sem manter o valor antigo. `texto` = `tinta.900`; `textoSecundario` = `tinta.600`; `primaria` = `azul.600`; `primariaPressionada` = `azul.700`; `acento` = `roxo.700`; `erro` = `erro.texto`; `sucesso` = `sucesso.texto`; `foco` = `azul.500` (anel de 2 px, 2 px de afastamento; 3,62:1 sobre `tinta.50`).

**Gradientes** (`expo-linear-gradient`, ângulo 135°): `gradienteMarca` = azul.500 → roxo.500, só com texto branco ≥ 24 px, ícones e fundos decorativos; `gradienteAcao` = azul.600 → roxo.600, botão principal, cartão de destaque, bolha enviada, avatar grande. Sobre o gradiente de ação, texto branco passa AA em toda a extensão (5,16:1 no azul e 4,66:1 no roxo). Gradiente de urgência (opcional, `roxo.700` → `roxo.800`) para o botão Urgente.

### Tipografia

Famílias: `Bricolage Grotesque` (600, 700, 800) só em título; `Figtree` (400, 500, 600, 700) em todo o resto. Enquanto a fonte não carrega, a splash continua (arquiteto). Tamanho e altura de linha em pontos (mobile); `letterSpacing` já convertido de % em pt.

| Estilo | Fonte, peso | Tamanho/linha | Espaçamento | Uso |
|---|---|---|---|---|
| `display` | Bricolage 800 | 40/44 | −1,2 | só Entrada e Candidatura enviada |
| `h1` | Bricolage 700 | 32/38 | −0,64 | título de aba |
| `h2` | Bricolage 700 | 24/30 | −0,24 | título de tela interna, seção |
| `h3` | Bricolage 600 | 20/26 | 0 | título de card |
| `corpoG` | Figtree 400 | 17/26 | 0 | texto de apoio de destaque |
| `corpo` | Figtree 400/500 | 15/22 | 0 | texto corrido |
| `legenda` | Figtree 500 | 13/18 | 0 | metadado, ajuda, erro de campo |
| `sobretitulo` | Figtree 700 | 12/16 | +0,96, caixa alta | etiqueta de seção, selo |
| `botao` | Figtree 600 | 16/20 | 0 | todo botão |

Substitui `tipografia.tamanho` e `lineHeight` (o piso do corpo passa de 16 para 15; a escala do sistema e o "tamanho de fonte maior" continuam valendo: `allowFontScaling` ligado e nenhum contêiner com altura fixa em texto, só `minHeight`). Nunca abaixo de 12 pt, e 12 só em sobretítulo, selo e rótulo de aba.

### Espaço, forma, sombra, movimento

- **Espaço** (grid de 8): `xs` 4 (só ajuste fino), `s` 8, `m` 16, `l` 24, `xl` 32, `2xl` 48, `3xl` 64, `4xl` 96. Margem lateral das telas: 24 (`l`). Toque mínimo: **48** (`toqueMinimo` passa de 44 para 48; rótulos e ícones menores têm área de toque ampliada com `hitSlop`).
- **Raios:** `chip` 8, `campo` 16, `card` 24, `folha` 32, `pill` 999 (botão, aba segmentada, chip de filtro), `circulo` 50%. Raio interno = raio externo − padding.
- **Sombras** (cor `tinta.900` = `#161A2B`, nunca preto; em RN, `shadowColor` + `shadowOffset` + `shadowOpacity` + `shadowRadius` ≈ blur/2, e `elevation` no Android, que não aceita cor, então no Android a sombra é mais neutra: aceitável):

| Token | Valor de origem | Uso |
|---|---|---|
| `sombra.sm` | `0 1px 2px` + `0 1px 3px`, 6% | card em repouso |
| `sombra.md` | `0 6px 16px -4px`, 10% | card pressionado/destaque, toast |
| `sombra.lg` | `0 16px 40px -8px`, 18% | barra de abas, folha, diálogo |
| `sombra.marca` | `0 10px 24px -8px` em `#1A7FF6` a 55% | botão primário, cartão de destaque |

  Profundidade vem mais do fundo `tinta.50` que da sombra: card sem borda, sobre `tinta.50`.
- **Movimento:** pressão = escala 0,97 em 120 ms; entrada de tela = 280 ms com `cubic-bezier(.2,.8,.2,1)`; folha sobe em 320 ms com leve mola `(.2,.8,.2,1.2)`; aparecer/sumir = opacidade 200 ms; brilho do esqueleto 1,4 s em laço. **Reduzir movimento** (hook `useReduzirMovimento` já existe): sem escala, sem deslizamento, sem mola e sem brilho (esqueleto fica estático em `tinta.100`); troca de tela e folha viram opacidade em 120 ms; confirmações animadas (círculo de sucesso, coração) aparecem prontas. O indicador de carregamento do botão continua (é estado, não enfeite).

### Contraste (o que `tokens.test.ts` passa a garantir)

Substituir/estender a tabela atual. Texto normal ≥ 4,5:1; texto grande (≥ 24 pt, ou ≥ 19 pt negrito) e componente/foco ≥ 3:1. Valores calculados pelo designer:

| Par | Razão | Mínimo |
|---|---|---|
| branco / `azul.600` (botão), / `azul.700` (pressionado) | 5,16; 7,28 | 4,5 |
| branco / `roxo.700` (urgente), / início e fim do gradiente de ação (`azul.600`, `roxo.600`) | 6,55; 5,16; 4,66 | 4,5 |
| `azul.600` / branco, / `tinta.50`, / `azul.50` (link, chip ativo) | 5,16; 4,81; 4,7 | 4,5 |
| `azul.700` / `azul.50` (texto de selo info) | 6,63 | 4,5 |
| `roxo.700` / branco, / `roxo.50` (texto roxo) | 6,55; 5,97 | 4,5 |
| `tinta.900` / branco e `tinta.50`; `tinta.600` / branco e `tinta.50`; `tinta.500` / branco e `tinta.50` | 17,3 e 16,1; 6,7 e 6,3; 4,87 e 4,55 | 4,5 |
| `sucesso.texto` / `sucesso.fundo` e branco; `erro.texto` / `erro.fundo` e branco; `alerta.texto` / `alerta.fundo` | 4,73 e 5,43; 5,45 e 6,57; 6,62 | 4,5 |
| branco / `tinta.900` (botão secundário, cartão de modo) | 17,3 | 4,5 |
| `bordaDeCampo` / branco e `tinta.50` | 3,63 e 3,39 | 3 |
| `foco` (`azul.500`) / `tinta.50` e branco | 3,62 e 3,88 | 3 |
| branco / `azul.500` e `roxo.500` (gradiente de marca, só texto grande) | 3,88 e 3,3 | 3 (e o teste prova que **não** chega a 4,5, como lembrete) |
| `tinta.400` / branco | 2,61 | só decorativo: o teste não deve usá-lo em texto |

Estrelas de nota (`#F79009`, 2,35:1) são decorativas: a nota sempre vem também em número e em texto falado.

## Ícones

`@expo/vector-icons/Feather` (traço 2 px, 24 pt; 20 pt dentro de chip e linha). O tipo `NomeDeIcone` (hoje derivado do Ionicons em `componentes/utilitarios.ts`) passa a ser o conjunto do Feather, e todo `icone` das props muda. **Feather não tem versão preenchida**: o "ícone preenchido no ativo" do redesign (nav e favorito) é refeito assim: item ativo = pílula `azul.50` + ícone e rótulo `azul.600` em negrito; favorito ativo = ícone `roxo.700` com fundo `roxo.50` no botão. Se o dono quiser o preenchido mesmo, é preciso `react-native-svg` (pergunta aberta). Equivalências:

| Uso | Feather | Uso | Feather |
|---|---|---|---|
| Início | `home` | Voltar / avançar | `chevron-left` / `chevron-right` |
| Meus trampos, Empresa | `briefcase` | Local | `map-pin` |
| Demandas | `check-square` | Prazo, data | `calendar` |
| Buscar | `search` | Hora | `clock` |
| Conversas, Mensagens | `message-circle` | Urgente, destaque | `zap` |
| Perfil | `user` | Nota | `star` |
| Filtro | `sliders` | Favorito | `heart` |
| Mais opções | `more-vertical` | Aviso, erro, info | `alert-triangle`, `alert-circle`, `info` |
| Dicas | `book-open` | Sucesso, marcado | `check`, `check-circle` |
| Enviar | `send` | Fechar | `x` |
| Trocar de modo | `repeat` | Mostrar/ocultar senha | `eye` / `eye-off` |
| Ajustes da conta | `settings` | Sem conexão | `wifi-off` |

## Componentes

Todos em `apps/mobile/src/componentes/`, só por props. Estados comuns a todo elemento tocável: padrão, **pressionado** (escala 0,97 em 120 ms + cor de pressão), **foco** (anel `foco`), **desabilitado** (ver cada um; nunca só por cor), **carregando** onde houver envio. Alvo ≥ 48.

| Componente | Situação | O que muda |
|---|---|---|
| `Botao` | muda e ganha variantes | Pílula, altura Grande 56 / Médio 48 (padrão) / Pequeno 40 (área de toque 48 via `hitSlop`, só em linha), texto `botao`. `variante`: `primario` (gradiente de ação + `sombra.marca`; pressionado `azul.800`→`roxo.800`; **uma por tela**), `secundario` (`tinta.900`, texto branco; pressionado `tinta.950`), `tonal` (`azul.50`, texto `azul.700`; pressionado `azul.100`), `contorno` (branco, borda `tinta.200` 1,5 px, texto `tinta.900`; pressionado fundo `tinta.50`, borda e texto `azul.600`), `urgente` (`roxo.700`, ícone `zap`, texto branco; pressionado `roxo.800`), `texto` (mantém: sem fundo, texto `azul.600`), `destrutivo` (mantém a função: fundo `erro.fundo`, texto `erro.texto`, como "Cancelar pedido" do quadro 01; o botão final do diálogo usa o estilo do `DialogoDeConfirmacao`). Desabilitado: fundo `tinta.100`, texto `tinta.500` (conta como inativo, isento de contraste) e `accessibilityState.disabled`; a causa aparece em texto ao lado ou abaixo, como hoje. Carregando: spinner + `textoCarregando`, mesma largura, sem novo toque. Mantém `larguraCheia`, `rotuloDeAcessibilidade`. Botão redondo de ícone (`BotaoDeIcone`, novo, 48): voltar, compartilhar, mais opções, filtro, + de Nova demanda; fundo branco + `sombra.sm` (sobre faixa gradiente) ou `tinta.900` (filtro), sempre com `accessibilityLabel`. |
| `CampoDeTexto` | muda | Rótulo acima (`legenda` 700, `tinta.900`), campo branco, altura 56, raio `campo` 16, borda 1,5 px `bordaDeCampo`; foco: borda `azul.600` 2 px + anel; sem estado "válido" por enquanto (o app não valida dado a ponto de confirmar com ✓); erro: borda `erro.base` 2 px + fundo `erro.fundo` leve + ícone `alert-circle` + mensagem `erro.texto` (cor nunca sozinha); desabilitado: fundo `tinta.100`, texto `tinta.500`. Ajuda e contador em `legenda`. Mantém limite em pontos de código (D45), mostrar/ocultar senha com `eye`. Campo multilinha: altura mínima 120, raio 16. Novo `CampoDeBusca`: pílula branca 56, ícone `search`, botão de filtro redondo `tinta.900` à direita (com selo de contagem quando há filtro). |
| `Chip` | muda | Altura 40 (toque 48), raio pill. Filtro: repouso branco + borda `tinta.200` + texto `tinta.700`; selecionado `azul.600` + texto branco + ícone `check` (o ícone garante que não é só cor); desabilitado texto `tinta.500`. Chip de habilidade removível mantém o `x` (48). Chips de rolagem horizontal têm `scrollIndicator` oculto, a última peça cortada na borda sugere continuação e a lista é acessível por leitor de tela como lista. |
| `Selo` (e `SeloDeCandidatura`) | muda | Altura 26, raio 8, `sobretitulo` sem caixa alta forçada (12/700), padding 10. Variantes e cores (fundo/texto, sempre com ícone Feather de 14): aberto `sucesso`, em andamento `informacao`, pendente/em análise `roxo.50`/`roxo.700`, aceita/confirmado `sucesso`, recusada `erro`, encerrado `tinta.100`/`tinta.700`, alerta (ex.: "Responda") `alerta`, neutro `tinta.100`. Novas: `urgente` e `nova` (só quando houver dado; ver Início). |
| `Avatar` | muda | Quadrado arredondado (raio 16 em 48; 32 em 96), iniciais em Bricolage 700, par fundo/texto por hash do nome: `azul.100/azul.700`, `roxo.100/roxo.700`, `sucesso.fundo/sucesso.texto`, `alerta.fundo/alerta.texto`. Tamanhos 40, 48, 64, 96. Perfil grande: fundo `gradienteAcao`, iniciais brancas, `sombra.marca`, leve rotação estática de −4° (não é animação, vale sempre). Empresa: `tinta.900` com iniciais brancas. `neutro` (perfil indisponível) mantém "?". Pilha de avatares (`PilhaDeAvatares`, novo): até 3 sobrepostos −8 + "+N" em `tinta.100`; decorativa quando o texto "N interessados" está ao lado. |
| `Cabecalho` | muda | Sem barra branca: fundo transparente sobre `tinta.50`; botão voltar redondo branco 48 + `sombra.sm`; título `h2`; subtítulo opcional `legenda` `tinta.600`; ações à direita como `BotaoDeIcone`. Margens seguras mantidas. Abas-raiz: título `h1` à esquerda e ação opcional (ex.: + gradiente 48) à direita, sem botão voltar. |
| `CabecalhoGradiente` | muda | Vira `FaixaDeDestaque`/topo do detalhe: faixa 188 px de `gradienteMarca` com círculo `roxo.300` decorativo (cortado) atrás, só para os detalhes (quadro 05) e a Entrada; título sobre ela só em `display`/`h1` brancos ≥ 24 pt. Botões redondos brancos sobre a faixa. |
| `CartaoDeDestaque` | novo | Raio 24, `gradienteAcao`, `sombra.marca`, padding 24, forma decorativa translúcida (círculo e pílula brancos a 12%) escondida do leitor de tela. Conteúdo: sobretítulo branco, `h2` branco, `corpo` branco, uma ação (botão branco com texto `azul.700`, ou botão redondo +). Usos: Início do freela, Início do contratante, Dicas. Pressionado: escala 0,98. |
| `CartaoDeAnuncio` (vaga/trampo) | muda | Card branco, raio 24, `sombra.sm`, padding 16. Linha 1: `Selo` de categoria à esquerda e local (`map-pin` + cidade) à direita; `h3` título; `legenda` autor (se a lista trouxer); divisor `tinta.200`; rodapé: `calendar` + prazo à esquerda, valor (`h3` "R$ 120") à direita e botão redondo `azul.600` com `chevron-right` (decorativo: o card inteiro é o botão). Anúncio de serviço usa o mesmo card com "A partir de R$ X" e `Selo` "Serviço". `accessibilityLabel` continua juntando tipo, título, categoria, cidade, valor e prazo. Hover/pressionado: `sombra.md` e −2 px. Longo: título até 2 linhas com reticências, valor nunca quebra. |
| `CartaoDeFreelancer` | novo | Para a Busca do contratante (quadro 16), alimentado por **serviço** + perfil do autor (única fonte hoje). `Avatar` 56, `h3` nome do autor, `corpo` "título do serviço", nota `star` + número só quando existir, linha de `Selo`s (categoria, cidade, "A partir de R$ X"), botão `tonal` Médio "Ver serviço" à direita. Favorito (`heart`) só com equipe favorita (API). O botão "Convidar" do redesign **não** entra (sem API de convite). |
| `CartaoDeCandidatura` | muda | Card 24: `Avatar` 48, nome `h3`, nota (futura), `Selo` de status, valor proposto em destaque, mensagem em até 3 linhas ("Ler mais" mantido), data em `legenda`. Ações recebidas (autor): `Aceitar` (primário Médio, só se `podeAceitar`), `Ver perfil` (contorno), `Conversar` (tonal). Mantém `aceitando`, `aceiteDesabilitado`, `motivoDoAceite`, `motivoDaConversa`. Versão "minha candidatura" (`CartaoDeMinhaCandidatura`, novo, quadro 07): selo de status no topo, valor à direita, `Avatar` + `h3` título + autor, prazo; ações: `Mensagem` (tonal, só aceita) e `Retirar` (texto `erro.texto`, só pendente). |
| `BolhaDeMensagem` | muda | Minha: `gradienteAcao`, texto branco, raio 20 com canto inferior direito 6. Do outro: branco, texto `tinta.900`, `sombra.sm`, canto inferior esquerdo 6. Hora em `legenda` dentro da bolha, em branco pleno na minha (transparência derrubaria o contraste sobre o roxo 600). Estados `enviando` (opacidade 0,6 + "Enviando…"), `falhou` (borda `erro.base`, ícone `alert-circle`, toque para tentar de novo, texto falado mantido). Separador de dia em pílula `tinta.100`. |
| `CampoDeMensagem` | novo | Rodapé do chat: pílula branca 56, multilinha até 4 linhas, botão enviar redondo 48 `gradienteAcao` com `send` (desabilitado `tinta.100` sem texto). Acima, fileira opcional de chips de resposta rápida (só freela; ver Conversa). |
| `FolhaInferior` | muda | Raio superior `folha` 32, alça 40×4 `tinta.300`, fundo escurecido 50% (`tinta.900`), sobe em 320 ms, arrastar para baixo fecha (já fecha por botão e voltar, mantidos), título `h2`, ícone opcional em círculo `roxo.50`. Conteúdo rolável. Foco vai ao título ao abrir e volta ao gatilho ao fechar. |
| `DialogoDeConfirmacao` | muda | Usa a `FolhaInferior` do V2 no celular (padrão do quadro 01): ícone, título, mensagem, botão principal, `texto` "Agora não". Destrutivo: botão com fundo `erro.texto` e texto branco (6,57:1), só aqui. Mantém `carregando`. |
| `Toast` | muda | Cartão `tinta.900` raio 16, ícone de sucesso em círculo `sucesso.base`, texto branco `corpo`, ação opcional `texto` (ex.: "Desfazer") em branco 700, `sombra.md`, sobe de baixo **acima da barra de abas**. Duração: mantém o mínimo de 6 s do app (o quadro mostra 4 s, mas WCAG 2.2.1/D de acessibilidade do projeto pede mais), com fechar. Anunciado por `accessibilityLiveRegion`. |
| `Aviso` | muda | Faixa raio 16 com cor de feedback (fundo + texto + ícone Feather), ação `texto` à direita. Quatro variantes: sucesso, erro, alerta, informação. |
| `FaixaSemConexao` | muda | Mesmo texto (D51); fundo `tinta.900`, ícone `wifi-off`, texto branco. Uma só, na raiz. |
| `Esqueleto` | muda | Fundo `tinta.100` com brilho `tinta.50` 90° em 1,4 s; raio igual ao do elemento real. Cada tela tem um esqueleto com a forma do conteúdo (lista: 3 cards de 120; perfil: avatar + 2 linhas + card). Estático com reduzir movimento. Anuncia "Carregando…" uma vez. |
| `EstadoVazio` | muda | Ícone Feather 32 em círculo `azul.50` 80, `h3`, `corpo` `tinta.600` centralizado (45–75 caracteres por linha), uma ação `tonal`/`primario`. Variante de erro: círculo `erro.fundo`, ação "Tentar de novo". |
| `Seletor` | muda | Gatilho = `CampoDeTexto` com `chevron-down`; lista na `FolhaInferior` com pesquisa (`CampoDeBusca`), linha ativa `azul.50` + `check`. Props e regras (modo lista/livre, "Todas...") inalteradas. |
| `LinhaDeConfiguracao` | muda | Card 24 com linhas separadas por divisor `tinta.200`; ícone em quadrado 48 raio 16 com fundo de feedback (azul, roxo, alerta, sucesso... por prop `tom`); título `corpo` 700, descrição `legenda`, `chevron-right`. Destrutiva: `erro`. |
| `AbasSegmentadas` | novo | Trilho `tinta.100` pílula 56, item ativo branco + `sombra.sm` + texto `tinta.900` 700, inativo `tinta.600`. 2 a 3 itens; `accessibilityRole="tablist"`/`tab` com `selected`; contador opcional (círculo `azul.600` 20, número branco). Uso: Meus trampos, Perfil. |
| `AbasSublinhadas` | novo | Texto + linha de 3 px; ativo `tinta.900` 700 com linha `azul.600`; divisor `tinta.200` embaixo; 3 a 4 itens, rola se não couber. Uso: Demandas. |
| `Interruptor` | novo | `Switch` nativo estilizado: ligado `azul.600`, desligado `tinta.400`+ círculo branco; linha com rótulo à esquerda (toque na linha inteira, 56 px). Usos: modo, "Favoritar". |
| `Estrelas` / `EstrelasDeAvaliacao` | novo | Exibição: `star` 16, preenchidas `alerta.base` e vazias `tinta.300`, sempre ao lado de "4,9" e com `accessibilityLabel` "Nota 4,9 de 5". Entrada: 5 botões de 48, `accessibilityRole="adjustable"` no grupo (incrementar/decrementar) ou 5 botões "1 estrela"... "5 estrelas" com `selected`; o rótulo da nota ("Ruim" a "Excelente!") aparece em texto. |
| `PassosDeCandidatura` | novo | Linha de 3 passos (Enviada, Em análise, Confirmado): feito = círculo `sucesso.base` + `check`; atual = círculo `roxo.700` 16 com halo `roxo.100`; futuro = círculo `tinta.200`; conector 2 px. Texto sob cada passo `legenda`; passo atual em 700. Recusada troca o 3º passo por "Recusada" (`erro`). Falado como "Passo 2 de 3: Em análise". |
| `CartaoDeModo` | novo | Card `tinta.900` raio 24, título `h3` branco, descrição `legenda` em `tinta.200` (≥ 4,5:1 sobre `tinta.900`), `Interruptor` à direita; ver Navegação. |
| `CartaoDeConteudo` | novo | Dicas: card 24 com ícone em quadrado `azul.50`, `h3`, resumo (2 linhas), linha tipo (`sobretitulo` `roxo.700`) + duração (`legenda`, `clock`). |
| `BarraDeAbas` (`navegacao.ts`) | muda | Ver Navegação. |
| `Logo`, `Motivo`, `FolhaDeAcoesDoAnuncio`, `BotaoMaisOpcoes` | herdam | `Motivo`: `legenda` `tinta.600` com `info`. `FolhaDeAcoesDoAnuncio` herda a folha V2; o botão ⋯ vira `BotaoDeIcone` `more-vertical`. |

## Navegação em dois modos

**Barra inferior flutuante** (`opcoesDaBarraDeAbas`, quadro 01 "Barra inferior"): cartão branco, raio 32, `sombra.lg`, margem de 8 do lado e da base (+ margem segura), altura 72, itens iguais. Item ativo: pílula `azul.50` raio 24 atrás de ícone 24 + rótulo, ícone e rótulo `azul.600`, rótulo 700; inativo: ícone e rótulo `tinta.600`; rótulo `sobretitulo` sem caixa alta (12/16, 600), uma linha (não quebra: nomes curtos; com fonte grande, rótulo corta com reticências e o ícone segue com `accessibilityLabel`). Toque 48 de altura × largura da fatia. Troca de aba: pílula desliza 200 ms (instantâneo com reduzir movimento). **Selo de não lidas** (Conversas/Mensagens): círculo `roxo.700` mín. 20, número branco `sobretitulo` (99+), sobre o canto do ícone; o rótulo falado vira "Conversas, 2 não lidas"; some em 0. Depende de a API trazer contagem de não lidas (Perguntas em aberto); sem ela, não aparece selo (nunca um selo falso).

| Modo | Abas (ícone) | Rotas-raiz |
|---|---|---|
| Freela | Início (`home`), Meus trampos (`briefcase`), Conversas (`message-circle`), Perfil (`user`) | 4 |
| Contratante | Início (`home`), Demandas (`check-square`), Buscar (`search`), Mensagens (`message-circle`), Perfil (`user`) | 5 |

- A barra só aparece nas telas-raiz das abas. Detalhe de trampo/serviço, Candidatura enviada, Nova demanda, Lista de candidatos, Avaliar, chat, Dicas, formulários e conta cobrem a tela inteira, com botão voltar e rodapé fixo próprio quando precisam (a barra não disputa com o rodapé de ação).
- Conteúdo das abas termina com folga de `altura da barra + margem segura + 16` (sem texto escondido atrás da barra; toast sobe acima dela).
- **Troca de modo:** `CartaoDeModo` no Perfil dos dois modos (mesmo lugar, logo abaixo do cabeçalho do perfil). No Perfil freela: "Modo contratante / Quero contratar também". No Perfil da empresa: "Modo freela / Quero trabalhar como freela também" (texto do quadro 18). O interruptor aparece **desligado** (o modo atual é o outro) e, ao ligar, anima até ligado e troca de modo; para leitor de tela é um botão com rótulo "Trocar para o modo contratante". Desvio do quadro 10, que usa uma pílula no topo: o cartão é mais claro e igual nos dois modos (consistência). Primeira troca leva à aba Início do novo modo; o último modo é lembrado (estado, arquiteto). Perfil incompleto continua bloqueando publicar e candidatar-se (avisos mantidos).
- **Quem publica o quê:** "Publicar" deixa de ser aba. Contratante cria demanda pelo botão **+** do Início e do topo de Demandas. Freela oferta serviço em Perfil → Meus serviços → "Ofertar serviço". A tela `EscolhaDePublicacao` perde a razão de existir (o arquiteto decide remover a rota).

## Layout das telas

Convenções: topo com margem segura + `Cabecalho`; margem lateral 24; cards 24 com `sombra.sm` sobre `tinta.50`; espaçamento vertical entre cards 16, entre seções 32; título de seção `h2` com ação "Ver todos" (`texto`, `azul.600` 700) à direita; rodapé fixo (detalhe, formulário) = faixa branca raio superior 32, `sombra.lg`, padding 16/24, botão primário ocupando o resto da largura. Estados comuns a toda lista: **carregando** (esqueleto da forma), **vazio** (`EstadoVazio`), **erro** (`EstadoVazio` de erro com "Tentar de novo"; em seção de Início, `Aviso` de erro na própria seção sem derrubar a tela), **sem conexão** (faixa global; dado em cache continua à mostra, ações que precisam de rede ficam desabilitadas com o motivo; D51), **conteúdo longo** (título 2 linhas + reticências; descrição com "Ler mais"; nomes longos quebram sem empurrar o valor), **paginação** ("Carregar mais" como `contorno`, mantido). Puxar para atualizar mantido.

### 02 Entrar (`Entrar.tsx`) e Entrada (`Entrada.tsx`)
- Quadro 02: logo grande sobre círculo `roxo.50` com formas decorativas (`imagens/`), `h1` "Bora pro próximo trampo?", `corpoG` de apoio, campos E-mail e Senha (com `eye`), link "Esqueceu sua senha?" **fora** (não há recuperação de senha na API; ver Perguntas), botão primário Grande "Entrar", rodapé "Ainda não tem conta? **Cadastre-se**" (`azul.600`/`roxo.700` 700, toque 48). Os botões "Prévia do protótipo: entrar como" **não entram**.
- Erros: mantém a lógica atual (erro geral em `Aviso` erro acima do botão, foco no primeiro campo com erro, sessão expirada em `Aviso` info). Carregando: botão "Entrando…". Sem conexão: botão desabilitado + motivo.
- `Entrada`: mesma ilustração, `display` "Ache trampo. Ache quem faça." em `tinta.900`, botões Grande primário "Criar conta" e `contorno` "Já tenho conta", links de termos/política em `legenda`.

### 03 Cadastro (`Cadastro.tsx`)
- `h1` "Cadastre-se!", pergunta "Qual é o seu objetivo principal?" com **dois cartões de escolha** (raio 20→24, altura 88, ícone + "Quero contratar" / "Quero trampar"; selecionado: borda 2 px `roxo.700` + fundo `roxo.50` + `check`; `accessibilityRole="radio"`). A escolha define só o **modo inicial** e mostra a dica "Você pode alternar para trabalhador/contratante no seu perfil." Campos: E-mail, Senha (ajuda "Mínimo de 8 caracteres"). Textos de privacidade e aceite (D27) mantidos abaixo do botão, com links.
- **Não entram** (sem API e contra "coletar o mínimo", LGPD): nome da empresa, CPF/CNPJ, WhatsApp, "Em quais áreas deseja atuar?" (o nome, cidade e habilidades continuam no Editar perfil e no aviso de perfil incompleto). Botão "Criar conta" desabilitado até escolher o objetivo, com a dica "Escolha um objetivo para continuar" visível (não só a cor).

### 04 Freela · Início (`Inicio.tsx`, modo freela)
Topo: "Olá, {nome}" (`corpo` `tinta.600`) + `h1` "Encontre seu próximo trampo". Chip verde "{N} trampos abertos" só se a API der o total (ver Perguntas); senão omitido. `CartaoDeDestaque` gradiente com "Suas candidaturas": número grande (`display`) "{n} em análise" e botão branco "Ver meus trampos" (vai a Meus trampos); dentro, sub-card branco raio 16 com `map-pin` + cidade do perfil + "Mostrando trampos nesta cidade" + `chevron-down` abre o `Seletor` de cidade. **Substitui** "Você recebeu este mês / Ver extrato" e "raio de 3 km" (sem pagamento nem geolocalização). Sem candidaturas: "Você ainda não se candidatou" + "Ver trampos abertos". Fileira de chips de categoria ("Todas" + categorias) filtra a lista abaixo. Seção: sobretítulo "PARA COMEÇAR AGORA" não existe sem urgência; usa `h2` "Trampos recentes" + "Ver todos" (abre Buscar de trampos). Lista de `CartaoDeAnuncio` (5 mais recentes). Fim da tela: card `CartaoDeConteudo` "Dicas & minicursos" (destaque do primeiro conteúdo) que abre a tela 11. Perfil incompleto: `Aviso` alerta com "Completar perfil" no topo (mantido). Estados: esqueleto (título + destaque + 3 cards), vazio ("Ainda não há trampos" + texto atual), erro por seção, offline com cache.

### 05 Freela · Detalhe do trampo (`DetalheDoTrampo.tsx`, `RodapeDoTrampo.tsx`)
`FaixaDeDestaque` com voltar (e ⋯ para o autor). Card sobreposto: `Avatar` do autor 64, `h2` título, `legenda` "autor · cidade"; três **tiles** (raio 16, fundo `tinta.50`, ícone `azul.600`, rótulo `legenda`, valor `h3`): Prazo (`calendar`, "Sem prazo definido" se não houver), Valor, Local (cidade). **Fora:** "Compatibilidade 95%", distância em km, salvar e compartilhar (sem dado/API; compartilhar pode voltar depois). Card "Descrição" (substitui "Requisitos do contratante"; texto + "Ler mais"). Card do autor: nome, nota e traços **só quando existirem** (avaliações), `chevron-right` abre o perfil público. Rodapé: esquerda `legenda` "Valor" + `h3` "R$ 120,00"; direita primário "Quero me candidatar" com `zap`. Estados do rodapé (mantém a lógica): candidatura enviada = selo + botão desabilitado "Candidatura enviada"; trampo fechado = `Motivo` "Este trampo não recebe mais candidaturas."; autor = "Ver candidaturas (n)" + ⋯ (folha de ações); sem conexão e perfil incompleto = desabilitado com motivo. A folha **Candidatar-se** (mensagem + valor proposto) segue a mesma, com o V2; ao enviar com sucesso navega para a tela 06 (em vez do toast "Candidatura enviada!").

### 06 Freela · Candidatura enviada (nova)
Tela cheia, sem barra de abas. Círculo `sucesso.base` 96 com `check` branco e halo `sucesso.fundo` (pulso 280 ms; estático com reduzir movimento), `h1` "Candidatura enviada!", `corpoG` "{autor} vai analisar seu perfil. Você recebe um aviso assim que responderem." (o "aviso" é a mudança de status em Meus trampos; **não promete push**, que o app não tem: texto final "Acompanhe em Meus trampos."). Card resumo (`Avatar` + `h3` título + autor + prazo + valor) e `PassosDeCandidatura` com o passo 2 ativo. Ações: primário "Ver em Meus trampos", `contorno` "Buscar mais trampos". Voltar do sistema leva ao detalhe do trampo (já com "Candidatura enviada"). Estados: se os dados do resumo não chegarem, mostra só o título e os passos. Foco inicial no `h1`, que é anunciado ao abrir.

### 07 Freela · Meus trampos (`MinhasCandidaturas.tsx`)
`h1` "Meus trampos" + `legenda` "Acompanhe candidaturas e trabalhos". `AbasSegmentadas` "Em análise" (pendentes), "Confirmados" (aceitas, com contador), "Encerrados" (recusadas e de trampo encerrado). Lista de `CartaoDeMinhaCandidatura`. **Fora:** "Pagamento recebido", "Como chegar" (sem endereço), nota recebida (volta com avaliações). Vazio por aba: "Nenhuma candidatura em análise" + "Ver trampos abertos"; confirmados: "Quando um contratante aceitar, aparece aqui."; encerrados: "Nada por aqui ainda." Retirar candidatura mantém o diálogo atual. Esqueleto: 3 cards. Erro: `EstadoVazio` de erro. Toque no card abre o detalhe do trampo.

### 08 Freela · Conversas (`ListaDeConversas.tsx`) e aba Mensagens do contratante
`h1` "Mensagens" (rótulo da aba do freela é "Conversas"), `legenda` "Converse com seus contratantes" / "com os profissionais" no contratante, `CampoDeBusca` "Buscar conversa" (filtra a lista carregada, no aparelho). Linha em card: `Avatar` 48, nome 700, hora à direita (`legenda`), prévia 1 linha `tinta.600` ("Você: ..." quando é minha), selo de não lida (círculo `roxo.700`) e nome em 700 quando houver. Sem conversas: "Nenhuma conversa ainda" + como começar (candidatar-se/aceitar). Busca sem resultado: "Nenhuma conversa com esse nome." Esqueleto: 4 linhas.

### 09 Chat (`Conversa.tsx`)
Cabeçalho: voltar, `Avatar` 40, nome `h3`, `legenda` com o contexto ("Candidato a {título}" quando houver; **sem** "Disponível agora"). Faixa de contexto (card compacto): título do trampo + `Selo` de status da candidatura (Confirmado, Em análise...) + valor; toque abre o trampo. Mensagens em `BolhaDeMensagem` com separador de dia ("Hoje", "Ontem", data). `CampoDeMensagem` no rodapé, sobe com o teclado. **Respostas rápidas** (freela, só com candidatura confirmada): chips "Estou a caminho", "Cheguei!", "Vou atrasar 10 min" que **preenchem o campo** (a pessoa revisa e envia; não enviam sozinhos). Estados mantidos: enviando, falhou, ordem (D48), sem conexão (campo habilitado para digitar, envio desabilitado com motivo), conversa vazia ("Diga olá para combinar os detalhes"), carregando (bolhas de esqueleto), conversa indisponível. Mensagem longa quebra linha, largura máxima da bolha 80%.

### 10 Freela · Perfil (`Perfil.tsx`, `perfis/[contaId]`)
Topo: botão ajustes (`settings`, leva a Conta e privacidade) à direita. `Avatar` 96 gradiente, nome `h1`, `map-pin` cidade. `CartaoDeModo`. **Cartões de número** no lugar de "R$ 540 recebidos no mês" e "1.280 trampinhos": dois cards lado a lado, um gradiente com "{n} candidaturas enviadas" e um `roxo.50` com "{n} confirmadas" (se as contagens vierem sem chamada nova; senão ficam de fora). `AbasSegmentadas` "Sobre" | "Avaliações {nota}" (a aba Avaliações só existe com a API; o selo verificado azul **não** entra). Sobre: card com "Habilidades" (`Chip`s não interativos `azul.50`) e "Resumo" (descrição; vazio "Sem descrição."). Botão secundário (`tinta.900`) "Editar perfil". Lista `LinhaDeConfiguracao`: Meus serviços, Dicas & minicursos, Conta e privacidade, Sair (destrutiva leve com confirmação mantida). Avaliações (quando houver): bloco "4,9 ★★★★★ · 8 avaliações recebidas" e lista de cards (autor, estrelas, citação em `corpo`). Perfil público (de outra pessoa): sem `CartaoDeModo`, sem Editar, sem lista; mesmo topo e abas. Esqueleto, erro e "Perfil indisponível" mantidos.

### 11 Freela · Dicas & minicursos (nova, conteúdo estático)
Voltar + `h2` "Dicas & minicursos" + `legenda` "Aprenda e chegue preparada no trampo" (o quadro diz "chegue preparada"; usamos "Aprenda e chegue bem no trampo", neutro de gênero). `CartaoDeDestaque` "SEU PRÓXIMO PASSO / Prepare-se para novas oportunidades / Aprenda algo novo em poucos minutos." com botão branco "Explorar conteúdos" (rola até a lista). "Categorias · 7 conteúdos" (contador = conteúdos do filtro) com chips: Todos, Conseguir trabalho, Atendimento ao cliente, Garçom e cozinha, Eventos, Comércio e estoque, Segurança no trabalho. Lista de `CartaoDeConteudo`. Toque abre a **leitura** (tela simples, não está no redesign): `h2` título, tipo e tempo, corpo em parágrafos curtos + lista "Para lembrar" (marcadores com `check`), botão `tonal` "Voltar às dicas". Conteúdo em arquivo estático (`apps/mobile/src/conteudo/dicas.ts`, o arquiteto confirma o local), cada item: `id`, `categoria`, `tipo` (Dica rápida | Minicurso), `minutos`, `titulo`, `resumo`, `paragrafos[]`, `lembrar[]`. Os dois títulos do quadro: "Como mandar bem na entrevista?" (Dica rápida, 3 min) e "Como se apresentar para um contratante" (Minicurso, 4 min); os outros 5 (e o corpo de todos) precisam ser escritos pelo produto/dono. Sem rede: funciona (é local). Categoria sem itens: vazio "Nenhum conteúdo nesta categoria ainda."

### 12 Contratante · Início (nova, `Inicio.tsx` modo contratante)
Topo: `Avatar` da empresa (`tinta.900`) + "Olá," `legenda` + nome `h2` (**sem** sino de notificações: não há API). `CartaoDeDestaque` "Precisa de gente hoje?" + "Publique uma demanda em 1 minuto." e botão redondo branco `plus` 56 ("Nova demanda"; rótulo falado "Publicar nova demanda"). Seção `h2` "Demandas abertas" + "Ver demandas": até 3 cards de demanda aberta (título, prazo, `Selo` "{n} interessados", botão `tonal` "Ver candidatos"). **Substitui** "Trampos de hoje" com Recusar/Aceitar direto no início e os toasts "Desfazer" (precisaria de uma lista agregada de candidaturas e de desfazer aceite, que a API não tem; se o arquiteto planejar o agregado, o card vira o do quadro 12 com `Selo` alerta "Responda para atualizar o status", Recusar `contorno` com `erro.texto` e Aceitar `primario`). Seção "Minha equipe favorita" (cards 2 por linha rolando: `Avatar`, nome, "{serviço} · {nota} ★", botão `tonal` "Ver perfil"; **"Recontratar" fica para quando a API da equipe existir**) só aparece com favoritos (sem eles a seção some, sem estado vazio). Vazio total (nenhuma demanda): card `EstadoVazio` "Você ainda não publicou demandas" + "Publicar demanda". Esqueleto: destaque + 2 cards.

### 13 Contratante · Nova demanda (`FormularioDeAnuncio.tsx`, tipo trampo)
Voltar + `h2` "Nova demanda" (a mesma tela edita: "Editar demanda"). Card branco com os campos atuais no estilo V2: Título (a "Função/Cargo"), Categoria (`Seletor`), Cidade, Descrição, Valor (R$, prefixo "R$" no campo, ajuda mantida), Prazo (data, máscara automática mantida, `calendar` à direita). Aviso de visibilidade (`Aviso` info) abaixo. Rodapé fixo: esquerda `legenda` "Valor" + `h3` valor digitado; direita primário "Publicar demanda". **Não entram** (sem API; vão para Perguntas): "Experiência desejada", hora de início/fim, "Quantidade de profissionais" com stepper e "Total previsto" (seria cálculo de pagamento). Estados: erro por campo com foco no primeiro, conflito de versão (D37) e limites (D45) mantidos, enviando, offline com motivo. Pós-publicação: tela de sucesso atual no V2 (círculo de sucesso, "Demanda publicada! Ela já aparece na busca.", `primario` "Ver demanda", `contorno` "Publicar outra"). O fluxo "Ofertar serviço" usa o mesmo formulário com "Nome do serviço" e "Preço base".

### 14 Contratante · Demandas (`MeusAnuncios.tsx`)
`h1` "Demandas" + `BotaoDeIcone` `plus` 48 gradiente à direita ("Nova demanda"). `AbasSublinhadas` "Abertas", "Em andamento", "Encerradas" (rótulos do redesign "Candidatos/Andamento/Concluído" ficam trocados: "Candidatos" confunde com a lista, e "Concluído" não existe, o estado real é encerrado, D34). Card: `h3` título + `Selo` roxo "{n} interessados", "Criada em {data}" `legenda`, `calendar` + prazo, `PilhaDeAvatares` se a lista de candidatos vier, botão `primario` Médio "Ver candidatos" (se n > 0) ou `tonal` "Editar" (se 0), ⋯ para a folha de ações (editar, encerrar, excluir, com os motivos do estado, D30). Em andamento: card com candidata(o) confirmada(o) (Avatar, nome, `Selo` "Confirmado"), botões `tonal` "Conversar" e `contorno` "Encerrar trampo" (diálogo mantido). Encerradas: `Selo` encerrado e, com API de avaliações, `tonal` "Avaliar profissional" (ou "Avaliado com 5 ★" quando já avaliado). **Fora:** "Pago · R$", "Reportar não comparecimento", "Cancelar convite". Só trampos aqui; serviços do usuário ficam em Perfil → Meus serviços (mesma tela com `tipo` fixo). Paginação (D47), esqueleto 3 cards, vazio por aba ("Nenhuma demanda aberta" + "Publicar demanda").

### 15 Contratante · Lista de candidatos (`CandidaturasRecebidas.tsx`)
Voltar + `h2` título da demanda + `legenda` "{n} candidatos · toque para ver o perfil". Lista de `CartaoDeCandidatura` (valor proposto em destaque, mensagem, selo). **Aceite continua um por vez** (como hoje); a barra "Selecionados: 2 de 3 profissionais / Confirmar 2 selecionados" e a seleção múltipla do quadro dependem de "quantidade de profissionais" (Perguntas em aberto). Ordem e paginação mantidas. Vazio: "Ainda sem candidaturas. Quando alguém se candidatar, aparece aqui." (sem ação de compartilhar). Aceitar abre `DialogoDeConfirmacao` ("Aceitar {nome}? As outras candidaturas continuam como estão. Vocês poderão conversar.", texto final conforme a regra de negócio atual, que o dev confirma; o redesign fala em pagamento liberado, que **não** entra). Pós-aceite: toast "Candidatura aceita. Que tal combinar os detalhes na conversa?" (mantido) e botão `tonal` "Conversar".

### 16 Contratante · Buscar (`Buscar.tsx`)
`h1` "Buscar freelancers", `CampoDeBusca` "Buscar por serviço, nome ou categoria" com botão de filtro (abre `FolhaInferior` com `Seletor`s de Categoria e Cidade + "Aplicar"/"Limpar filtros"), chips de categorias frequentes, lista de `CartaoDeFreelancer` (serviços). Contagem de resultados em `legenda` (D existente). Estados: inicial ("Comece por uma categoria" mantido), sem resultados (texto atual), carregando (3 cartões de esqueleto), erro, paginação. A aba de **trampos** do Buscar atual passa a ser a tela de busca do freela, aberta de "Ver todos" no Início (`Cabecalho` com voltar, mesmo campo e filtros, `CartaoDeAnuncio`); a tela é a mesma com prop `tipo`. Sem "Disponível hoje", "anos de experiência" nem "Convidar".

### 17 Contratante · Avaliar profissional (nova; depende da API de avaliações)
Voltar + `h2` "Avaliar profissional". Card: `Avatar` 64, nome `h3`, "{trampo} · {data}". `EstrelasDeAvaliacao` 5 × 48, rótulo dinâmico (Ruim, Regular, Bom, Muito bom, Excelente!; sem nota: "Toque nas estrelas"). "O que se destacou?": chips selecionáveis múltiplos (Pontual, Organizado, Rápido, Educado, Proativo), opcionais. `CampoDeTexto` multilinha "Deixe seu comentário" (opcional, limite a definir pelo arquiteto, contador D45). `Interruptor` "Favoritar para a próxima demanda" / "Ele(a) entra na sua equipe favorita." (neutro: "Essa pessoa entra na sua equipe favorita."). Rodapé: primário "Enviar avaliação" desabilitado até escolher a nota, com o texto "Escolha uma nota" ao lado (não só cor). Sucesso: toast "Avaliação enviada." e volta à demanda (que passa a "Avaliado com N ★"). Erros: campo e geral em `Aviso`; já avaliado: `EstadoVazio` "Você já avaliou este trampo". Offline: botão desabilitado com motivo.

### 18 Contratante · Perfil da empresa (nova, `Perfil.tsx` modo contratante)
`h1` "Perfil da empresa". Card: `Avatar` empresa 96 (`tinta.900`), nome `h2`, nota "5,0 (128 avaliações)" e traços (só com a API; antes, só nome e cidade). `CartaoDeModo` "Modo freela". `LinhaDeConfiguracao`: **Informações da empresa** (cidade e sobre, hoje no Editar perfil), **Avaliações recebidas** (só com API; antes, não aparece), **Editar perfil**, Conta e privacidade, Sair. **Fora:** "Pagamentos e faturamento" e "Endereço e CNPJ" (sem dado; CNPJ fica em Perguntas).

### Telas existentes fora dos quadros
Herdam o V2 só por tokens e componentes, sem redesenho de fluxo: `Entrada`, `DetalheDoServico` (mesma estrutura do 05 com tiles Preço base e Local, botão "Conversar" e `Motivo` de sem relação), `EditarPerfil`, `ContaEPrivacidade`, `ExcluirConta`, `ExportarDados`, `DocumentoLegal` (política e termos: `h2`, texto `corpo` em coluna de até 560), `FormularioDeAnuncio` em modo serviço. Todas ganham `Cabecalho` V2, cards 24, campos V2, rodapé fixo quando o botão principal fica fora da tela.

## Textos da interface (novos; vão para `textos/pt-BR.ts`)

| Chave | Texto |
|---|---|
| `abas.demandas` / `abas.mensagens` / `abas.meusTrampos` | Demandas / Mensagens / Meus trampos |
| `abas.naoLidas(n)` | `${n} não ${plural(n,'lida','lidas')}` (rótulo falado: "Conversas, 2 não lidas") |
| `modo.cartaoFreela` | Modo contratante · Quero contratar também |
| `modo.cartaoContratante` | Modo freela · Quero trabalhar como freela também |
| `modo.trocarParaContratante` / `trocarParaFreela` | Trocar para o modo contratante / Trocar para o modo freela |
| `entrar.titulo` / `subtitulo` | Bora pro próximo trampo? / Entre para ver trampos perto de você. |
| `cadastro.titulo` / `objetivo` | Cadastre-se! / Qual é o seu objetivo principal? |
| `cadastro.querContratar` / `querTrampar` | Quero contratar / Quero trampar |
| `cadastro.dicaContratar` / `dicaTrampar` | Você pode alternar para trabalhador no seu perfil. / Você pode alternar para contratante no seu perfil. |
| `cadastro.escolhaObjetivo` | Escolha um objetivo para continuar |
| `inicioFreela.titulo` | Encontre seu próximo trampo |
| `inicioFreela.abertos(n)` | `${n} ${plural(n,'trampo aberto','trampos abertos')}` |
| `inicioFreela.destaque` / `emAnalise(n)` / `verMeusTrampos` | Suas candidaturas / `${n} em análise` / Ver meus trampos |
| `inicioFreela.semCandidaturas` | Você ainda não se candidatou |
| `inicioFreela.cidade` / `mostrandoNaCidade` | Cidade / Mostrando trampos nesta cidade |
| `inicioFreela.recentes` / `todas` | Trampos recentes / Todas |
| `inicioContratante.precisa` / `publique` | Precisa de gente hoje? / Publique uma demanda em 1 minuto. |
| `inicioContratante.novaDemanda` | Publicar nova demanda |
| `inicioContratante.abertas` / `verDemandas` / `interessados(n)` | Demandas abertas / Ver demandas / `${n} ${plural(n,'interessado','interessados')}` |
| `inicioContratante.semDemandas` / `semDemandasTexto` | Você ainda não publicou demandas / Publique a primeira e receba candidaturas. |
| `inicioContratante.equipe` / `verPerfil` | Minha equipe favorita / Ver perfil |
| `detalheTrampo.queroMeCandidatar` | Quero me candidatar |
| `detalheTrampo.valorRodape` / `prazo` / `local` | Valor / Prazo / Local |
| `candidaturaEnviada.titulo` | Candidatura enviada! |
| `candidaturaEnviada.texto(autor)` | `${autor} vai analisar seu perfil. Acompanhe a resposta em Meus trampos.` |
| `candidaturaEnviada.passos` | Enviada · Em análise · Confirmado · (recusada) Recusada |
| `candidaturaEnviada.passo(n,rotulo)` | `Passo ${n} de 3: ${rotulo}` |
| `candidaturaEnviada.verMeusTrampos` / `buscarMais` | Ver em Meus trampos / Buscar mais trampos |
| `meusTrampos.titulo` / `subtitulo` | Meus trampos / Acompanhe candidaturas e trabalhos |
| `meusTrampos.abaAnalise` / `abaConfirmados` / `abaEncerrados` | Em análise / Confirmados / Encerrados |
| `meusTrampos.vazioAnalise` | Nenhuma candidatura em análise |
| `meusTrampos.vazioConfirmados` | Quando um contratante aceitar, aparece aqui. |
| `meusTrampos.vazioEncerrados` | Nada por aqui ainda. |
| `meusTrampos.mensagem` / `retirar` | Mensagem / Retirar candidatura |
| `conversas.titulo` / `subtituloFreela` / `subtituloContratante` | Mensagens / Converse com seus contratantes / Converse com os profissionais |
| `conversas.buscar` / `semResultadoDaBusca` | Buscar conversa / Nenhuma conversa com esse nome. |
| `conversas.contexto(titulo)` | `Sobre: ${titulo}` |
| `conversas.respostasRapidas` | Estou a caminho · Cheguei! · Vou atrasar 10 min |
| `conversas.diaHoje` / `diaOntem` | Hoje / Ontem |
| `perfil.modoRotulo` | Modo |
| `perfil.candidaturasEnviadas(n)` / `confirmadas(n)` | `${n} ${plural(n,'candidatura enviada','candidaturas enviadas')}` / `${n} ${plural(n,'confirmada','confirmadas')}` |
| `perfil.abaSobre` / `abaAvaliacoes(nota)` | Sobre / `Avaliações ${nota}` |
| `perfil.resumo` / `dicas` | Resumo / Dicas & minicursos |
| `perfil.tituloEmpresa` / `infoEmpresa` / `infoEmpresaTexto` | Perfil da empresa / Informações da empresa / Cidade e sobre a empresa |
| `perfil.editarTexto` | Foto, bio e nome |
| `dicas.titulo` / `subtitulo` | Dicas & minicursos / Aprenda e chegue bem no trampo |
| `dicas.sobretitulo` / `destaque` / `destaqueTexto` / `explorar` | Seu próximo passo / Prepare-se para novas oportunidades / Aprenda algo novo em poucos minutos. / Explorar conteúdos |
| `dicas.categorias` / `conteudos(n)` | Categorias / `${n} ${plural(n,'conteúdo','conteúdos')}` |
| `dicas.todos` ... | Todos · Conseguir trabalho · Atendimento ao cliente · Garçom e cozinha · Eventos · Comércio e estoque · Segurança no trabalho |
| `dicas.paraComecar` / `tipoDica` / `tipoMinicurso` / `minutos(n)` | Dicas para começar / Dica rápida / Minicurso / `${n} min` |
| `dicas.paraLembrar` / `voltar` / `vazio` | Para lembrar / Voltar às dicas / Nenhum conteúdo nesta categoria ainda. |
| `demandas.titulo` / `nova` | Demandas / Nova demanda |
| `demandas.abaAbertas` / `abaAndamento` / `abaEncerradas` | Abertas / Em andamento / Encerradas |
| `demandas.criadaEm(d)` / `verCandidatos` / `encerrarTrampo` | `Criada em ${d}` / Ver candidatos / Encerrar trampo |
| `demandas.vazioAbertas` / `vazioAndamento` / `vazioEncerradas` | Nenhuma demanda aberta / Nenhuma demanda em andamento / Nenhuma demanda encerrada |
| `demandas.publicar` / `publicada` / `publicadaTexto` | Publicar demanda / Demanda publicada! / Ela já aparece na busca. |
| `demandas.editarTitulo` | Editar demanda |
| `candidatos.subtitulo(n)` | `${n} ${plural(n,'candidato','candidatos')} · toque para ver o perfil` |
| `candidatos.vazio` | Ainda sem candidaturas. Quando alguém se candidatar, aparece aqui. |
| `buscarFreelancers.titulo` / `campo` | Buscar freelancers / Buscar por serviço, nome ou categoria |
| `buscarFreelancers.filtros` / `verServico` / `aPartirDe(v)` | Filtros / Ver serviço / `A partir de ${v}` |
| `avaliar.titulo` / `notaVazia` | Avaliar profissional / Toque nas estrelas |
| `avaliar.notas` | Ruim · Regular · Bom · Muito bom · Excelente! |
| `avaliar.destaques` / `traços` | O que se destacou? / Pontual · Organizado · Rápido · Educado · Proativo |
| `avaliar.comentario` / `favoritar` / `favoritarTexto` | Deixe seu comentário / Favoritar para a próxima demanda / Essa pessoa entra na sua equipe favorita. |
| `avaliar.enviar` / `escolhaNota` / `enviada` | Enviar avaliação / Escolha uma nota / Avaliação enviada. |
| `avaliar.jaAvaliado` / `avaliadoCom(n)` | Você já avaliou este trabalho / `Avaliado com ${n} ★` |
| `avaliar.rotuloEstrela(n)` | `${n} ${plural(n,'estrela','estrelas')}` |
| `gerais.nota(n)` | `Nota ${n} de 5` |
| `gerais.maisOpcoes` / `agoraNao` | Mais opções / Agora não |

Textos antigos que mudam de valor: `candidatar.titulo` e botão do rodapé ("Candidatar-se" → "Quero me candidatar"), `abas.conversas` (mantém "Conversas" no freela), `entrar.titulo`. Os testes que citam esses textos acompanham (dev).

## Acessibilidade (WCAG 2.2 AA)

- **Contraste:** tabela acima, garantida no `tokens.test.ts`. Botões e chips ativos usam `azul.600` (nunca `azul.500` com texto pequeno); texto em roxo usa `roxo.700`; texto branco sobre gradiente de marca (`azul.500`→`roxo.500`) só em ≥ 24 pt. Texto de apoio mínimo `tinta.600`; `tinta.500` só em ≥ 15 pt sobre branco/`tinta.50` (4,55 a 4,87:1).
- **Cor não é o único sinal:** selos têm ícone e texto; campo com erro tem ícone e mensagem; chip selecionado tem `check`; aba ativa tem pílula/linha e peso; passo atual tem texto "Passo 2 de 3"; nota tem número.
- **Alvo de toque:** 48 em tudo que toca (botão Pequeno 40 visual com `hitSlop`); estrelas 48; espaçamento ≥ 8 entre alvos.
- **Leitor de tela:** `accessibilityRole` e `accessibilityLabel` em todo ícone isolado; cartões inteiros são um só botão com rótulo composto; abas com `tablist`/`tab`+`selected`; selo de não lidas fala "N não lidas"; `accessibilityLiveRegion` no toast e na troca de status de envio; elementos decorativos (formas do destaque, círculo de halo, estrelas de exibição quando há número) escondidos (`accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"`). Modo trocado é anunciado ("Modo freela ativo"). Foco move para o título da tela ao abrir (Candidatura enviada, Avaliar) e volta ao gatilho ao fechar folha.
- **Teclado e foco** (web/desktop e teclado externo): ordem lógica, anel `foco` 2 px em todo tocável, nada preso na folha.
- **Movimento:** ver tokens; nada pisca; nenhuma informação só em animação.
- **Fonte maior:** testar a 200%: tile do detalhe vira coluna única; barra de abas mantém ícone e corta o rótulo com reticências; cards crescem em altura.
- **Idioma e leitura:** frases curtas, "você", sem jargão; mensagens de erro dizem o que houve e como resolver (padrão atual dos `erros`).

## Telas largas e desktop

O app (Expo, também web) continua com coluna de conteúdo de **560 px** centralizada (`larguraMaxima` mantido). Fora da coluna, fundo `tinta.100` (`#EEF0F5`); dentro, `tinta.50` com `sombra.sm` nas bordas laterais. A **barra de abas flutuante** e os **rodapés fixos** ficam presos à coluna (não à janela inteira); folhas e diálogos abrem centralizados na coluna com raio 32 em cima (e embaixo também quando a janela passa de 560, como cartão, raio 32, sem alça de arraste). Entrada, Entrar e Cadastro: bloco de 440 px centralizado verticalmente. Nada de layout em colunas múltiplas (a home desktop do quadro 19 é página web, fora do app). Verificar em 320, 375, 390 e 1280 px, sem rolagem horizontal; linhas de texto de 45 a 75 caracteres (a coluna de 560 com margem 24 dá cerca de 60).

## Fora do escopo desta entrega

Ganhos e extrato do Início do freela, "R$ recebidos" e "trampinhos" do perfil, "Pagamento aprovado/recebido", "Pago", "Pagamentos e faturamento", "você recebe" do rodapé, "Total previsto" e a mensagem "pagamento só é liberado depois de finalizar". Também sem dado ou API hoje: distância em km e "raio", compatibilidade, "Disponível agora/hoje", verificado, sino de notificações, salvar e compartilhar vaga, convidar profissional, reportar não comparecimento, desfazer aceite, "Como chegar", seleção múltipla de candidatos, "Esqueceu sua senha?", CPF/CNPJ, WhatsApp e áreas no cadastro.

## O que o dev precisa implementar

1. `tokens.ts`: novas escalas, gradientes, tipografia, espaço, raios, sombras e apelidos; `tokens.test.ts` com os pares da tabela de contraste.
2. Fontes e ícones Feather (decisões D52/D53, instalação pelo plano do arquiteto); `NomeDeIcone` e todas as props de ícone.
3. Componentes: ajustar os listados como "muda" e criar `BotaoDeIcone`, `CampoDeBusca`, `CartaoDeDestaque`, `CartaoDeFreelancer`, `CartaoDeMinhaCandidatura`, `PilhaDeAvatares`, `CampoDeMensagem`, `AbasSegmentadas`, `AbasSublinhadas`, `Interruptor`, `EstrelasDeAvaliacao`, `PassosDeCandidatura`, `CartaoDeModo`, `CartaoDeConteudo`, `FaixaDeDestaque`; exportar em `componentes/index.ts`.
4. Barra de abas dos dois modos e retirada da aba Publicar (`navegacao.ts` e rotas em `app/`, pelo plano).
5. Telas: reescrever as de 02 a 10, 13 a 16 conforme esta spec; criar Candidatura enviada, Dicas (+ leitura), Início do contratante, Perfil da empresa e, com a API, Avaliar profissional; arquivo estático de conteúdo de Dicas.
6. Todos os textos novos em `textos/pt-BR.ts`; atualizar testes que citam textos antigos.
7. Estados (carregando, vazio, erro, offline, longo) em cada tela e esqueletos com a forma do conteúdo.

## Arquivos de apresentação afetados

`apps/mobile/src/tema/tokens.ts` e `tokens.test.ts`; todos os de `src/componentes/` (incluindo `navegacao.ts`, `utilitarios.ts`, `index.ts` e novos arquivos); todos os de `src/telas/` (`Entrada`, `Entrar`, `Cadastro`, `Inicio`, `Buscar`, `DetalheDoTrampo`, `RodapeDoTrampo`, `DetalheDoServico`, `RodapeDoServico`, `MinhasCandidaturas`, `MeusAnuncios`, `CandidaturasRecebidas`, `ListaDeConversas`, `Conversa`, `Perfil`, `EditarPerfil`, `FormularioDeAnuncio`, `EscolhaDePublicacao`, `ContaEPrivacidade`, `ExcluirConta`, `ExportarDados`, `DocumentoLegal`, `base.tsx`, `item.tsx`, `tipos.ts`, `index.ts` + novas e os testes que citam textos); `src/textos/pt-BR.ts`; assets (fontes, logo e ilustrações de `docs/produto/design/v2/imagens/`). Rotas em `src/app/` e estado/API ficam com o dev/arquiteto.

## Perguntas em aberto

Para o dono:
1. **Termos:** "Demandas" (contratante) e "Trampos"/"vagas" (freela) para a mesma coisa: ok manter assim? Nesta spec: demanda no modo contratante, trampo no freela.
2. **Ícone preenchido** (nav e favorito): Feather só tem contorno. Aceita pílula + cor, ou adicionamos `react-native-svg` para preenchidos?
3. **Cadastro:** a escolha "Quero contratar/Quero trampar" só define o modo inicial; CPF/CNPJ, WhatsApp e áreas ficam fora (LGPD, mínimo de dados). Confirma? E "Esqueceu sua senha?" precisa de API de recuperação: entra no MVP ou o link some?
4. **Quantidade de profissionais, experiência desejada e horário** (Nova demanda, seleção múltipla, "pessoas já aceitas de N"): entram? Exigem campos novos no trampo e na API.
5. **Convidar profissional** e **Reportar não comparecimento**: fora; ok?
6. **Conteúdo de Dicas & minicursos:** quem escreve os 7+ conteúdos (só 2 títulos existem no quadro)? A leitura do conteúdo (tela não desenhada no redesign) pode ser como proposta?
7. **Modo de troca:** cartão com interruptor nos dois perfis (desvia do quadro 10, que usa pílula). Aprovado?

Para o arquiteto (dependências da UI):
8. Contagem de **não lidas** por conversa e total para o selo da barra.
9. Total de trampos abertos na cidade (chip "{N} trampos abertos") e contagens do Perfil (candidaturas enviadas e confirmadas) sem chamada extra.
10. **Lista agregada de candidaturas pendentes** do contratante (Início: Recusar/Aceitar direto) e candidatos por demanda para a pilha de avatares.
11. API de **avaliações** (nota, traços, comentário e limite, "já avaliado", média e contagem no perfil, lista de avaliações) e de **equipe favorita** (favoritar, listar, "recontratar" que leva a quê).
12. Autor do trampo (nome) na lista de Minhas candidaturas e na lista de trampos, para o avatar e a linha do autor.
13. Estado do modo (último usado, modo inicial do cadastro) e o que acontece com rotas profundas abertas no modo errado (link para demanda no modo freela).
14. Rota de Meus serviços (com `MeusAnuncios` por `tipo`) e de Buscar de trampos para o freela; remoção da rota `publicar`.
