# Plano técnico: Visual V2 (redesign do app, dois modos, avaliações e equipe favorita)
- Brief: não há brief próprio. Valem as decisões D52 a D56 (`docs/produto/decisoes.md:110-118`), com o brief do MVP (`docs/produto/briefs/mvp-trampo-ja.md`) para o resto.
- Spec de UI: `docs/produto/specs/visual-v2.md` (designer). Referências: `docs/produto/design/v2/`.
- Data: 2026-11-13. Linha de base: typecheck e lint passam; API 1229 testes em 42 arquivos; app com 1 falha consistente (ver "Débito pré-existente").

**Corte proposto (o plano passa de 250 linhas):** são duas entregas.
- **V2a:** fundação visual, dois modos, telas redesenhadas e as quatro telas novas. Só app, sem API.
- **V2b:** avaliações e equipe favorita (API e app).

A V2b no backend pode começar junto com a V2a: os apps não dividem arquivo. A numeração de CA continua a da L4.

## Objetivo e critérios de aceite
Aplicar o V2 em todo o app, com navegação por modo (freela ou contratante) e as telas novas de D56 (V2a). Depois, avaliações mútuas e equipe favorita (V2b). Pagamento continua fora (D55).

**V2a**
- CA71 — O teste do `CampoDeTexto` (L4/CA55, "anuncia o corte uma vez") passa em 3 rodadas seguidas do arquivo, antes de qualquer mudança visual.
- CA72 — Fontes: a splash fica até as fontes Bricolage Grotesque e Figtree carregarem. Se a carga falhar, o app abre mesmo assim, nunca em tela branca. Teste com `useFonts` falso nos estados carregando, ok e erro.
- CA73 — Ícones: nenhum arquivo do app importa `Ionicons`, e todo ícone vem do `Feather` (teste de fronteira). `fontFamily` só aparece em `src/tema/`.
- CA74 — Tokens: cada par texto/fundo da tabela de contraste da spec passa 4,5:1, e cada par componente/fundo passa 3:1 (`tokens.test.ts`). As cores da marca continuam `#1A7FF6` e `#AF6FF1`. As telas só usam cores dos tokens (`marca-qa`). Toda família de `tipografia` existe em `FONTES`.
- CA75 — Modo: sem modo gravado, a conta abre no modo freela. O Cadastro grava o modo escolhido ("Quero contratar" ou "Quero trampar"). A troca pelo cartão de modo no Perfil muda as abas na hora, vai ao Início do outro modo e persiste depois de reabrir o app. Nenhuma troca chama a API.
- CA76 — Abas: o freela vê Início, Meus trampos, Conversas e Perfil. O contratante vê Início, Demandas, Buscar, Mensagens e Perfil. Não há aba Publicar. Cada aba tem nome acessível e alvo de toque de pelo menos 48.
- CA77 — Links: `/trampos/:id`, `/servicos/:id`, `/conversas/:id`, `/perfis/:id` e `/candidaturas/:trampoId` abrem em qualquer modo, sem trocar o modo. Uma aba exclusiva do outro modo (`/demandas`, `/meus-trampos`, `/buscar`) troca o modo e abre a aba. `/publicar` leva a `/trampos/novo`, `/candidaturas` leva a `/meus-trampos` e `/meus-anuncios` sem `tipo` leva a `/demandas`. `redirectSystemPath` não muda.
- CA78 — Meus trampos: cada candidatura cai em exatamente um segmento. Em análise = `pendente`. Confirmados = `aceita` com trampo `em_andamento`. Encerrados = `recusada`, ou `aceita` com trampo `encerrado`. Os dados vêm de `/candidaturas/minhas` e `GET /trampos/:id`, que já têm cache. O nome do autor vem de `GET /perfis/:id`, também com cache.
- CA79 — Demandas: as abas Abertas, Em andamento e Encerradas filtram as páginas já carregadas de `/trampos/meus` pelo `status`. "Carregar mais" fica visível em toda aba enquanto houver página. O botão "+" abre `/trampos/novo`. Meus serviços continua em `/meus-anuncios?tipo=servico`.
- CA80 — Candidatura enviada: depois do 201 do `POST /trampos/:id/candidaturas`, o app abre `/candidatura-enviada?trampoId=` com título, autor, prazo e valor (do cache), em vez do toast. "Ver em Meus trampos" e "Buscar mais trampos" levam a `/meus-trampos` e `/buscar-trampos`. Voltar leva ao detalhe. Se o cache não tiver os dados, a tela mostra só o título e os passos.
- CA81 — Dicas & minicursos: a lista, o filtro por categoria e a leitura abrem sem rede, com zero requisições. O conteúdo fica em `src/textos/dicas.ts`.
- CA82 — Início do contratante: o destaque com "+" abre `/trampos/novo`. "Demandas abertas" mostra até 3 trampos `aberto` de `/trampos/meus`, com "{n} interessados" vindo de `candidaturasRecebidas`. Tem vazio, esqueleto e erro. Não há Aceitar nem Recusar no Início.
- CA83 — Perfil: o freela vê o cartão de modo, Editar perfil, Meus serviços, Dicas, Conta e privacidade e Sair. Os números "{n} candidaturas enviadas" e "{n} confirmadas" vêm de `/candidaturas/minhas`, a mesma chave de cache de Meus trampos. O Perfil da empresa (contratante) vê nome, cidade, sobre, o cartão de modo, Editar, Conta e privacidade e Sair. Nenhum dos dois mostra ganhos, faturamento, CNPJ ou o selo de verificado.
- CA84 — Buscar: a aba do contratante busca serviços (`tipo` fixo). O freela busca trampos em `/buscar-trampos`, com voltar, aberto pelo "Ver todos" do Início.
- CA85 — Fora do escopo verificável: `textos/pt-BR.ts` não tem chave de ganhos, extrato, faturamento, distância, notificação, convite nem "Esqueceu sua senha". Não existe selo de não lidas.
- CA86 — Regressão: as suítes da API e do app passam. Os testes existentes só mudam onde a navegação mudou ou onde o texto mudou de valor; a chave em `textos` se mantém.

**V2b**
- CA87 — `POST /avaliacoes`: só quem participou de um trampo `encerrado` com candidatura `aceita` pode avaliar. O autor avalia o freela aceito, e o freela aceito avalia o autor. Quem não participou ou não é parte recebe 404. Trampo ainda não encerrado responde 409 `trampo_nao_encerrado`. Repetir responde 409 `avaliacao_ja_feita`. Numa rajada de 20 pedidos iguais no Postgres, só 1 grava.
- CA88 — Validação: `nota` é inteiro de 1 a 5. `destaques` vêm da lista fechada do papel avaliado, sem repetição, no máximo 5. `comentario` é opcional, aparado, com 1 a 500 pontos de código e sem caractere nulo. O 400 lista os campos inválidos e nunca devolve o valor recebido.
- CA89 — `GET /avaliacoes/resumos?contas=` (até 50 ids) devolve, por papel (`comoFreela`, `comoContratante`), a `media` com 1 casa (`null` sem avaliação), o `total` e até 3 destaques mais frequentes.
- CA90 — `GET /avaliacoes?contaId=&papel=` pagina 20 por vez (no máximo 50), das mais recentes para as mais antigas, com cursor `(criadaEm, id)`. Cada item traz `nota`, `destaques`, `comentario`, `avaliadorId` e `criadaEm`, e nada mais.
- CA91 — `GET /avaliacoes/feitas?trampos=` (até 50 ids) devolve só as avaliações da própria conta: `trampoId`, `nota` e `criadaEm`.
- CA92 — Favoritos:
  - `PUT /favoritos/:contaId` responde 204, também quando o favorito já existe. Exige vínculo (`existeVinculoEntre`, D4); sem vínculo, 404. Favoritar a si mesmo responde 409 `favorito_invalido`. O teto é de 200 favoritos (409 `limite_de_favoritos`).
  - `DELETE /favoritos/:contaId` responde 204, idempotente.
  - `GET /favoritos` devolve a lista da própria conta, dos mais recentes para os mais antigos.
  - A pessoa favoritada não é avisada nem vê a lista.
- CA93 — LGPD:
  - Excluir a conta apaga as avaliações feitas e recebidas e os favoritos dos dois lados, na transação da D25.
  - A exportação ganha `avaliacoesFeitas` (com comentário), `avaliacoesRecebidas` (nota, destaques e data, sem comentário e sem avaliador) e `favoritos` (ids), e `medirExportacao` soma essas partes.
  - Nenhum comentário aparece em log ou em mensagem de erro.
- CA94 — Limites: `POST /avaliacoes` conta em `publicacao` (30/h). `PUT` e `DELETE /favoritos/:contaId` contam em `escrita`. Os `GET` contam em `leitura`.
- CA95 — A migração `0009_avaliacoes` cria `avaliacoes` e `favoritos` com as checks. O `down` aborta se alguma das duas tiver linhas.
- CA96 — Tela Avaliar:
  - As estrelas formam um `radiogroup` acessível; há destaques e comentário com contador (CA55).
  - O interruptor "Favoritar" só aparece quando o contratante avalia um freela.
  - Enviar fica desabilitado sem nota e manda um só pedido. O 409 `avaliacao_ja_feita` mostra "Você já avaliou este trampo".
  - "Avaliar" só aparece em Demandas › Encerradas e em Meus trampos › Encerrados enquanto a conta não avaliou. Depois, aparece "Avaliado com N ★" (via `feitas`).
- CA97 — A nota (média e total) aparece no perfil público, no Perfil, no Perfil da empresa, no detalhe do trampo (autor), nos cartões de candidato e nos cartões da Busca. Cada lista faz uma requisição de resumos, e nunca uma por item.
- CA98 — Equipe favorita: a seção aparece no Início do contratante (só com favoritos) e o favorito pode ser marcado e desmarcado no perfil público. A mudança aparece na hora e volta atrás se der erro. "Recontratar" abre a conversa (`useConversarPorConta`).

## Contexto atual
(`M` = `apps/mobile/src`, `A` = `apps/api`)
- **Raiz:** a splash fica presa por `preventAutoHideAsync` (`M/app/_layout.tsx:21`) e só sai quando a sessão deixa de carregar (`:54-59`). `LayoutRaiz` (`:104-125`) monta os provedores e a `NavegacaoRaiz`. Os testes de rota montam só a `NavegacaoRaiz` (`M/testes/rotas/apoio.tsx:3`), então uma trava em `LayoutRaiz` não chega neles.
- **Abas:** são cinco fixas (`M/app/(app)/(abas)/_layout.tsx:16-41`), entre elas `publicar` (`(abas)/publicar.tsx`). Os ícones são Ionicons cheio/contorno (`M/componentes/navegacao.ts:17-23`, `:46-57`), e `NomeDeIcone` vem do Ionicons (`M/componentes/utilitarios.ts:13`). Os rótulos ficam em `M/textos/pt-BR.ts:12-18`.
- **Ionicons** aparece em 17 arquivos de `componentes/` e `telas/`. O mock do jest troca o ícone por um `View` com `testID` `icone-*` (`M/testes/setup-jest.ts:3-10`). Nenhum teste consulta esse `testID`.
- **Fronteiras:** `fronteiras-qa.test.ts:132-142` exige "nenhum fontFamily nem expo-font" e precisa ser invertido. `sem-dado-pessoal.test.tsx:2686-2714` e `dependencias-de-producao.test.ts:37-52` proíbem `async-storage` e telemetria, e nenhum nome dos pacotes novos esbarra nessas listas.
- **Tokens:** `M/tema/tokens.ts:7-31` usa a fonte do sistema (D14). `tokens.test.ts` testa os pares AA. O V2 inverte fundo e superfície (fundo `#F6F7FA`, superfície `#FFFFFF`), e a borda decorativa `#E1E4EC` não passa 3:1. Por isso a borda de campo vira um token próprio (ver Decisão).
- **expo-font:** o Expo 57 traz `expo-font ~57.0.4` (`bundledNativeModules.json`). O `@expo/vector-icons@15.1.1` resolve hoje `expo-font@58.0.9` (`pnpm-lock.yaml:210`, `:2684`): há duas versões na árvore.
- **Estilos:** são inline, sem `StyleSheet.create`. Há 37 `fontWeight` em 35 arquivos.
- **Meus anúncios:** um só contêiner por `tipo` (`M/app/(app)/meus-anuncios.tsx:37-45`). A lista "meus" é paginada (D47). Minhas candidaturas lê os trampos por id (`M/app/(app)/candidaturas/index.tsx:49`), e `/candidaturas/minhas` não é paginada (`A/src/modulos/trampos/adaptadores/http/rotas.ts:408-421`). Os nomes de terceiros vêm por `usePerfisPublicos` (`M/estado/consultas/perfil.ts:96`).
- **Trampos:** aceitar escolhe uma candidatura e recusa as outras pendentes (`A/src/modulos/trampos/dominio/trampo.ts:366-391`). Encerrar é estado final (`:426-440`, D34). Não existe coluna `encerrado_em` (`A/migracoes/0002_trampos.ts`). `existeVinculoEntre` está na fachada (`A/src/modulos/trampos/index.ts:47-51`).
- **Conversas:** não guardam leitura (`A/migracoes/0005_conversas.ts`, sem "lida").
- **LGPD:** `criarDadosDaConta` em `A/src/composicao.ts:255-318` chama cada módulo. A exportação v1 tem schema fechado (`A/src/modulos/contas/adaptadores/http/rotas.ts:78`) e tipos em `A/src/modulos/contas/dominio/portas.ts:155-237`. Os limites por rota ficam em `A/src/compartilhado/http/limite-por-conta.ts:74-79`.
- **Testes do app:** 1802 `it`. Os de rota usam mapas de rotas (`ROTAS_REAIS` em `M/testes/qa/apoio-qa.tsx:33`). Há 44 referências a `'(app)/(abas)/…'` em 9 arquivos.

## Abordagens consideradas
| Tema | Abordagem | Prós | Contras | Risco |
|---|---|---|---|---|
| Fontes | **`@expo-google-fonts/*` + `useFonts` na raiz** | Funciona no Expo Go (D16); só os pesos importados entram no bundle | 2 pacotes novos | Baixo |
| | Plugin `expo-font` (embutir na build) | Sem carga em tempo de execução | Exige dev build; não roda no Expo Go 57 | Alto |
| | TTF copiado para `assets/` | Sem pacote | Licença e atualização feitas à mão | Baixo |
| Modo | **Uma `Tabs` com abas escondidas por modo (`href: null`)** | URLs estáveis; links e testes quase intactos | O layout de abas ganha lógica de modo | Baixo |
| | Dois grupos `(freela)` e `(contratante)` | Separação limpa | URLs repetidas (`/conversas`) e links ambíguos; quebra 44 referências de teste | Médio |
| Nota no perfil | **Resumos em lote no módulo `avaliacoes`** | Uma requisição por lista; `perfis` não muda | O app junta perfil e resumo | Baixo |
| | `GET /perfis/:id` com a nota | Uma chamada no detalhe | `perfis` passa a depender de `avaliacoes`; N chamadas nas listas | Médio |

## Decisão
- **Fontes (ADR-009):**
  - Adicionar `expo-font@57.0.4` (versão do SDK, fixa), `@expo-google-fonts/bricolage-grotesque@0.4.1` e `@expo-google-fonts/figtree@0.4.1`, todos sem `^`.
  - `M/tema/fontes.ts` exporta `FONTES`, um mapa nome→asset só com os pesos da spec. `LayoutRaiz` chama `useFonts(FONTES)` e devolve `null` enquanto `!carregadas && !erro`, com a splash ainda presa.
  - Em erro, renderiza assim mesmo; o RN cai na fonte do sistema (não verificado no RN 0.86 com família ausente: conferir no roteiro de aparelho).
  - Os tokens guardam o nome da família por peso (`fontWeight` não escolhe arquivo no Android).
  - Na etapa 1, rodar `npx expo install --check`. Se as duas versões de `expo-font` derem conflito, pôr um `pnpm.overrides` para `57.0.4`.
- **Ícones:** usar `Feather` de `@expo/vector-icons`, que já está instalado. O mock do jest ganha `Feather` igual ao `Ionicons`, e `Ionicons` sai do mock no fim da troca.
- **Modo (ADR-010):**
  - `M/estado/modo.tsx` tem o `ModoProvider` e `useModo(): { modo: 'freela'|'contratante', definirModo }`.
  - A persistência fica atrás da porta `ArmazenamentoDoModo` (`ler`/`gravar`): a real usa `expo-secure-store`, chave `trampoja.modo` (sem dependência nova; AsyncStorage é proibido); o fake fica em memória.
  - Sem valor gravado, ou com valor inválido, o modo é `freela`. O modo não sai ao sair da conta (é preferência do aparelho, premissa P3).
  - `Provedores` recebe `armazenamentoDoModo` obrigatório, e os apoios de teste passam o fake com `modo` configurável (padrão `freela`).
  - Em `(abas)/_layout.tsx`, a `Tabs` declara as sete abas e esconde as do outro modo com `href: null`: `index`, `meus-trampos` (freela), `demandas` e `buscar` (contratante), `conversas`, `perfil`. O rótulo de `conversas` vira "Mensagens" no contratante.
  - Um efeito troca o modo quando a aba focada é exclusiva do outro modo: o link vence (CA77).
- **Rotas:**
  - `index.tsx` e `perfil.tsx` escolhem a tela pelo modo.
  - `meus-trampos.tsx` e `demandas.tsx` são abas novas. `demandas.tsx` reaproveita o contêiner `MeusTrampos`, exportado de `meus-anuncios.tsx`.
  - Viram redirecionamentos: `(abas)/publicar.tsx` sai e entra `(app)/publicar.tsx` com `<Redirect href="/trampos/novo"/>`; `candidaturas/index.tsx` vai a `/meus-trampos`; `meus-anuncios` sem `tipo=servico` vai a `/demandas`.
  - Rotas novas na pilha: `(app)/buscar-trampos.tsx` (Buscar com `tipo` fixo), `(app)/candidatura-enviada.tsx` (com `presentation: 'fullScreenModal'` em `(app)/_layout.tsx`), `(app)/dicas/index.tsx` e `(app)/dicas/[id].tsx`.
  - `EscolhaDePublicacao` sai.
- **Tokens:** as chaves atuais ficam, com valores novos (`primaria` = azul.600 `#0F6AD8`, `acento` = roxo.700, `texto` = tinta.900 e assim por diante, conforme a spec). As escalas entram como objetos novos. `borda` continua sendo a borda de campo, que passa 3:1, e `divisor` (`#E1E4EC`) fica só para decoração. Assim os componentes antigos continuam compilando durante a migração.
- **Testes:** as consultas são por texto e papel, via chaves de `textos`, e a regra é mudar o valor e manter a chave. As props novas das telas são opcionais até a rota passar a usá-las, então rota e tela migram em etapas separadas sem quebrar o build.
- **Dependências da spec (perguntas 8 a 14):**
  - Não lidas: ficam fora (P8).
  - Total de trampos abertos na cidade: fica fora, porque a busca não devolve total (D13) e o chip some.
  - Contagens do Perfil: entram, vindas de `/candidaturas/minhas` (mesma chave de cache).
  - Lista agregada de pendentes, Recusar e a pilha de avatares: ficam fora. O Início mostra "Demandas abertas" e a pilha só aparece em Lista de candidatos.
  - Nome do autor: `usePerfisPublicos` com cache, sem mudar a API.
  - Modo e links: como acima.
  - Meus serviços e busca de trampos: como acima.
- **Avaliações e favoritos (ADR-011):**
  - Módulo novo `A/src/modulos/avaliacoes` com as duas tabelas. A elegibilidade vem pela porta `VinculoDeAvaliacao`, ligada na composição à fachada de `trampos`.
  - O vínculo do favorito usa `existeVinculoEntre`.
  - A gravação pega a trava compartilhada das duas contas (`travarContasEmModoCompartilhado`, `A/src/compartilhado/banco/travas-de-conta.ts:73`), como a abertura de conversa, para não deixar avaliação órfã durante uma exclusão.
  - A avaliação não se edita nem se apaga no V2 (P5).

## Esquema e contratos
`A/migracoes/0009_avaliacoes.ts` (sem FK entre módulos; down com `removerTabelaSeVazia` nas duas):
```
avaliacoes(id uuid pk, trampo_id uuid not null, avaliador_id uuid not null, avaliado_id uuid not null,
  papel_do_avaliado text not null check in ('freela','contratante'), nota smallint not null check between 1 and 5,
  destaques text[] not null default '{}' check (array_ndims(destaques) is null or array_ndims(destaques)=1) and cardinality(destaques)<=5,
  comentario text null check (comentario is null or char_length(comentario) between 1 and 500),
  criada_em timestamptz not null, check (avaliador_id <> avaliado_id),
  unique (trampo_id, avaliador_id))
index avaliacoes_avaliado_idx (avaliado_id, papel_do_avaliado, criada_em desc, id); index (avaliador_id)
favoritos(dono_id uuid, favorito_id uuid, criado_em timestamptz not null, primary key (dono_id, favorito_id),
  check (dono_id <> favorito_id)); index (favorito_id)
```
- **Porta** (`avaliacoes/dominio/portas.ts`): `VinculoDeAvaliacao.obter(trampoId, contaId, trx?) → { avaliadoId, papelDoAvaliado } | 'nao_encerrado' | null`.
- **Fachada de `trampos`:** ganha `vinculoParaAvaliacao` com a mesma assinatura. A leitura é `trampos` + `candidaturas` com `status='aceita'`, sem trava, porque o encerrado é estado final.
- **Destaques:**
  - Freela avaliado: `pontual, organizado, rapido, educado, proativo`.
  - Contratante avaliado: `pagamento_em_dia, ambiente_organizado, instrucoes_claras, respeitoso, pontual`. É proposta (P6).
  - O app traduz os códigos em `textos`.
- **Rotas:** `POST /avaliacoes {trampoId, nota, destaques?, comentario?}` → 201 `{id}`. `GET /avaliacoes`, `GET /avaliacoes/resumos`, `GET /avaliacoes/feitas`, `GET /favoritos` → `[{contaId, criadoEm}]`, `PUT /favoritos/:contaId` e `DELETE /favoritos/:contaId`. Contratos em CA87 a CA92. Id fora do formato uuid responde 404, como hoje.
- **Fachada de `avaliacoes`:** `rotas`, `excluirDadosDaConta(trx, contaId)`, `exportarDadosDaConta(contaId)` e `medirExportacao(contaId)`.
- **Exportação:** continua `trampo-ja.exportacao.v1`, só com campos novos (premissa P7).

## Etapas
Responsáveis: **D** = designer (só `tema/` sem `fontes.ts`, `componentes/`, `telas/`, `textos/` e os testes desses), **dev** = o resto. Cada grupo roda em paralelo internamente, e os grupos seguem em ordem numérica dentro de cada trilha.

- A trilha **API** (grupos B) não divide arquivo com o app e começa no grupo 1.
- **App V2a:** grupos 1 a 5.
- **App V2b:** grupos 6 e 7.

| # | Etapa | Arquivos | Verificação | Resp. | Grupo | Sens. | CAs |
|---|---|---|---|---|---|---|---|
| 0 | `qa` reproduz e `dev` corrige o anúncio repetido do corte no `CampoDeTexto`. Depois, rodar a suíte inteira 3 vezes com `--maxWorkers=50%`; se o timeout intermitente voltar, abrir a etapa 0b (`testTimeout` dos testes de rota) | `M/componentes/CampoDeTexto.tsx`, `M/componentes/componentes.test.tsx` | `pnpm --filter mobile exec jest src/componentes/componentes.test.tsx` 3× | qa→dev | 0 | não | CA71 |
| 1 | Dependências e carga das fontes. Mock `Feather` no jest (junto do `Ionicons`) e fronteira de fonte invertida (`fontFamily` só em `tema/`). Teste do `LayoutRaiz` com `useFonts` falso | `apps/mobile/package.json`, `pnpm-lock.yaml`, `M/tema/fontes.ts`, `M/tema/fontes.test.ts`, `M/app/_layout.tsx`, `M/testes/setup-jest.ts`, `M/testes/qa/fronteiras-qa.test.ts`, `M/testes/raiz-fontes.test.tsx` | `npx expo install --check`; `pnpm --filter mobile typecheck`; jest nos 3 testes; `pnpm --filter mobile build` | dev | 1 | não | CA72, CA73 |
| 2 | Tokens V2 (escalas, gradientes, `tipografia.familia` com os nomes de `FONTES` da ADR-009, sombras, `divisor`) e testes de contraste da tabela da spec | `M/tema/tokens.ts`, `M/tema/tokens.test.ts` | `pnpm --filter mobile exec jest src/tema` | D | 1 | não | CA74 |
| 3 | Componentes V2: Feather em todas as props, `NomeDeIcone`, os componentes novos da spec e `navegacao.ts` (`opcoesDaAba(rota, titulo)` com as rotas novas `meus-trampos`, `demandas` e `mensagens`, mais a barra flutuante). Também **todos** os textos novos da V2a e da V2b em `pt-BR.ts`, com as mesmas chaves para os textos que já existem | `M/componentes/**`, `M/textos/pt-BR.ts`, `M/telas/base.tsx`, `M/telas/EscolhaDePublicacao.tsx` (ícones), `M/testes/qa/marca-qa.test.tsx`, `M/testes/qa/fronteiras-qa.test.ts` (sem `Ionicons`), `M/testes/setup-jest.ts` (tira o `Ionicons` do mock) | `pnpm --filter mobile exec jest src/componentes src/testes/qa/marca-qa.test.tsx`; typecheck | D | 2 | não | CA73, CA76, CA85 |
| 4 | Estado do modo: porta, fake, real (secure-store) e provider. `Provedores` e `LayoutRaiz` passam o real; os apoios de teste aceitam `modo` | `M/estado/modo.tsx`, `M/estado/modo.test.tsx`, `M/estado/provedores.tsx`, `M/app/_layout.tsx`, `M/testes/rotas/apoio.tsx`, `M/testes/qa/apoio-qa.tsx`, `M/testes/renderizar.tsx` | `pnpm --filter mobile exec jest src/estado/modo.test.tsx`; typecheck | dev | 2 | não | CA75 |
| 5 | Telas novas e props novas, todas opcionais: `CandidaturaEnviada`, `Dicas`, `LeituraDeDica`, `InicioDoContratante`, `PerfilDaEmpresa`. Segmentos em `MinhasCandidaturas` e `MeusAnuncios`; `onTrocarModo` e contagens no `Perfil`; `tipo` fixo e voltar no `Buscar`. Escolha de objetivo no `Cadastro`. Conteúdo em `textos/dicas.ts` | `M/telas/{CandidaturaEnviada,Dicas,LeituraDeDica,InicioDoContratante,PerfilDaEmpresa}.tsx`, `M/telas/{MinhasCandidaturas,MeusAnuncios,Perfil,Buscar,Cadastro}.tsx`, `M/telas/tipos.ts`, `M/telas/index.ts`, `M/textos/dicas.ts`, `M/telas/telas-v2.test.tsx` | `pnpm --filter mobile exec jest src/telas`; typecheck | D | 3 | não | CA78–CA84 |
| 6 | Navegação por modo: abas dinâmicas, troca pelo link, `meus-trampos`, `demandas`, `buscar-trampos` e os redirecionamentos. `publicar` removida. Testes de rota ajustados às abas | `M/app/(app)/(abas)/{_layout,index,perfil,buscar,meus-trampos,demandas}.tsx`, `(abas)/publicar.tsx` (remover), `M/app/(app)/{publicar,buscar-trampos,meus-anuncios}.tsx`, `M/app/(app)/candidaturas/index.tsx`, `M/app/(publico)/cadastro.tsx`, `M/testes/rotas/*.test.tsx`, `M/testes/qa/*.test.tsx` (só os 9 que citam `(abas)`), `M/testes/rotas/modos.test.tsx` | `pnpm --filter mobile test` | dev | 4 | não | CA75–CA79, CA83, CA84, CA86 |
| 7 | Ligar as telas novas: rota `candidatura-enviada` (substitui o toast em `trampos/[id].tsx`), `dicas/index` e `dicas/[id]`, Início e Perfil do contratante | `M/app/(app)/{candidatura-enviada.tsx,dicas/index.tsx,dicas/[id].tsx,_layout.tsx,trampos/[id].tsx}`, `M/testes/rotas/telas-novas-v2.test.tsx` | `pnpm --filter mobile exec jest src/testes/rotas/telas-novas-v2.test.tsx` | dev | 5 | não | CA80–CA83 |
| 8 | Redesenho das telas existentes (quadros 02–05, 07–10, 13–16 e "fora dos quadros") e testes de tela | `M/telas/*.tsx` menos as da etapa 5 já feitas, `M/telas/*.test.tsx` | `pnpm --filter mobile exec jest src/telas`; typecheck; lint | D | 5 | não | CA74, CA86 |
| B1 | Migração `0009` e tipos das tabelas | `A/migracoes/0009_avaliacoes.ts`, `A/src/modulos/avaliacoes/adaptadores/postgres/tabelas.ts`, `A/src/modulos/avaliacoes/adaptadores/postgres/migracao.integracao.test.ts` | `pnpm --filter api migrar -- --teste`; o teste de integração; `migrar -- --baixar` com e sem linhas | dev | B1 | **sim** | CA95 |
| B2 | Domínio (avaliação, destaques, favorito), casos de uso, adaptadores em memória e BDD com os CAs | `A/src/modulos/avaliacoes/{dominio,aplicacao,adaptadores/memoria}/**` | `pnpm --filter api exec vitest run src/modulos/avaliacoes` | dev | B1 | **sim** | CA87–CA92 |
| B3 | `trampos.vinculoParaAvaliacao` (Postgres e memória) e testes de cada estado | `A/src/modulos/trampos/index.ts`, `.../adaptadores/postgres/repositorio-postgres.ts`, `.../repositorio-postgres.integracao.test.ts`, `.../adaptadores/memoria/repositorio-memoria.ts` | `pnpm --filter api exec vitest run src/modulos/trampos`; `pnpm test:integracao` | dev | B1 | **sim** | CA87 |
| B4 | Repositório Postgres (trava compartilhada, `on conflict` → `avaliacao_ja_feita`, teto de favoritos), rotas HTTP com schema fechado, fachada, `excluir`/`exportar`/`medir` e rajada de 20 | `A/src/modulos/avaliacoes/{index.ts,adaptadores/http/**,adaptadores/postgres/repositorio-postgres.ts,adaptadores/postgres/*.integracao.test.ts}` | `pnpm --filter api exec vitest run src/modulos/avaliacoes`; `pnpm test:integracao` | dev | B2 | **sim** | CA87–CA93, CA95 |
| B5 | Composição: módulo, porta, `DadosDaConta` (excluir/exportar/medir), schema e tipos da exportação, limites por rota | `A/src/composicao.ts`, `A/src/composicao.test.ts`, `A/src/modulos/contas/dominio/portas.ts`, `A/src/modulos/contas/adaptadores/http/rotas.ts` (+teste), `A/src/compartilhado/http/limite-por-conta.ts` (+teste) | `pnpm --filter api test`; `pnpm test:integracao`; `pnpm typecheck` | dev | B3 | **sim** | CA92–CA94 |
| B6 | `semear` com avaliações e favoritos; README (rotas novas) | `A/scripts/semear.ts`, `README.md` | `pnpm --filter api semear` em banco local | dev | B4 | não | — |
| 9 | Cliente e consultas do app: tipos, `api/avaliacoes.ts`, hooks (resumos em lote, feitas, avaliar, favoritos otimistas), chaves | `M/api/{avaliacoes.ts,tipos.ts,endpoints.test.ts}`, `M/estado/consultas/{avaliacoes.ts,avaliacoes.test.tsx,chaves.ts}` | `pnpm --filter mobile exec jest src/api src/estado/consultas/avaliacoes.test.tsx` | dev | 6 | não | CA96–CA98 |
| 10 | Telas da V2b: `Avaliar` (as duas variantes de papel), lista de avaliações, nota nos cartões e perfis, seção da equipe e favoritar no perfil público | `M/telas/{Avaliar,ListaDeAvaliacoes}.tsx`, `M/telas/{Perfil,PerfilDaEmpresa,InicioDoContratante,CandidaturasRecebidas,Buscar,DetalheDoTrampo,MeusAnuncios,MinhasCandidaturas}.tsx`, `M/telas/{tipos,index}.ts`, `M/telas/avaliacoes.test.tsx` | `pnpm --filter mobile exec jest src/telas` | D | 6 | não | CA96–CA98 |
| 11 | Rotas da V2b: `avaliar/[trampoId]`, `avaliacoes/[contaId]` e ligação nas listas e perfis | `M/app/(app)/{avaliar/[trampoId].tsx,avaliacoes/[contaId].tsx,perfis/[contaId].tsx,meus-anuncios.tsx}`, `M/app/(app)/(abas)/{index,perfil,meus-trampos,buscar}.tsx`, `M/app/(app)/candidaturas/[trampoId].tsx`, `M/app/(app)/trampos/[id].tsx`, `M/testes/rotas/avaliacoes.test.tsx` | `pnpm --filter mobile test` | dev | 7 | não | CA96–CA98 |
| 12 | Roteiro manual no Expo Go SDK 57 (Android; o iPhone ficou para o SDK 58, ver `sdk-58.md` e a decisão 75): fontes, fonte de reserva (asset renomeado em build local), ícones, troca de modo, links, leitor de tela nas abas e estrelas | — (resultado no relatório) | roteiro | lead + dono | 7 | não | CA72, CA75–CA77, CA96 |

Notas de paralelismo:
- `textos/pt-BR.ts`, `telas/tipos.ts` e `telas/index.ts` só são editados pelo designer, um grupo por vez.
- `M/app/_layout.tsx` está nas etapas 1 e 4, em grupos diferentes.
- A etapa 10 precisa do grupo 5 pronto, e as etapas 9 e 10 rodam juntas.
- Na trilha da API, `pnpm test:integracao` roda uma vez por vez, porque o banco de teste é um só. O lead põe em fila as verificações de integração de B1 e B3.

## Pontos para o seguranca
- **Avaliação, quem pode:** autorização pela porta de `trampos`, com 404 uniforme para quem não é parte. Não pode haver oráculo que diferencie "trampo existe" para terceiros.
- **Avaliação, unicidade e concorrência:** a unicidade vem da constraint `(trampo_id, avaliador_id)`, e não de um "ler e depois gravar". A trava compartilhada das contas impede avaliação órfã durante uma exclusão.
- **Texto livre:** `comentario` é dado pessoal. Não pode ir para log nem ser ecoado no 400. O schema fechado nas respostas evita vazar `avaliado_id` ou e-mail.
- **Lotes:** `resumos` e `feitas` aceitam no máximo 50 ids, e ids inválidos são ignorados ou recusados sem 500. `feitas` filtra pela conta da sessão.
- **Favoritos:** a lista é privada, e o vínculo é exigido, para ninguém favoritar estranhos em massa. O teto de 200 conta como acima. A pessoa favoritada não recebe nenhum sinal.
- **LGPD:** a exclusão apaga os dois lados na mesma transação, e a limpeza pela lápide (ADR-007) passa a cobrir o módulo novo. A exportação leva só os dados da própria conta: os comentários recebidos são de terceiros e não vão.
- **App:** o modo fica no secure-store e não é segredo. Mesmo assim, não pode ir para log nem para URL.

## Riscos e como reverter
- **Fonte não carrega no aparelho:** o app abre com a fonte do sistema (CA72). Reverter é tirar o `useFonts` e os nomes de família dos tokens.
- **Duas versões de `expo-font`:** conferir na etapa 1. Se houver erro de módulo nativo, usar `pnpm.overrides`. Reverter é remover os três pacotes.
- **`href: null` no expo-router 57:** não verificado nesta versão; é uma API antiga. Se falhar, o plano B é renderizar `<Tabs>` com `Tabs.Screen` condicional por modo.
- **Volume de testes de rota quebrados pelas abas:** a etapa 6 concentra a adaptação, e o fake com `modo` evita reescrever as jornadas.
- **Migração 0009:** cria tabelas novas, sem destruir nada. O `down` aborta se houver linhas. Reverter a V2b é desligar o registro do módulo na composição, sem tocar no banco.
- **Média com poucas avaliações** é ruidosa. A API devolve o `total`, e a UI decide como mostrar.

## Perguntas em aberto e premissas adotadas
Para o dono:
1. **Recuperação de senha:** custo alto e área sensível. Exige token com validade (migração), rota pública com limite e sem revelar se o e-mail existe, **serviço de e-mail externo** (novo operador LGPD e segredo) e telas novas. Recomendo ficar **fora** do V2, com brief próprio. O link "Esqueceu sua senha?" some.
2. **Campos novos no trampo:**
   - Horário (início e fim): custo baixo a médio (2 colunas, validação, formulário e exportação).
   - Experiência desejada: custo baixo (1 coluna ou lista fechada).
   - Quantidade de profissionais com seleção múltipla: custo **alto**, porque muda o agregado. Aceitar hoje recusa os demais e põe o trampo em andamento (ADR-006 e D30), e isso mexe em conversas e avaliações.
   - Recomendo os três **fora** do V2. Se o dono quiser um, que seja o horário, numa entrega curta depois da V2a.
3. **Não lidas:** exigem tabela de leitura, uma rota e a contagem no `GET /conversas`, e criam dado novo de comportamento. Recomendo fora; a barra fica sem selo.
4. **Lista agregada de pendentes com Recusar no Início:** exige `GET /candidaturas/recebidas` e uma regra nova de recusa individual. Recomendo fora.
5. **Avaliação:** pode ser editada ou apagada pelo autor? Haverá prazo depois do encerramento (exigiria a coluna `encerrado_em`)? Premissa: imutável e sem prazo.
6. **Destaques do contratante avaliado:** aprovar a lista proposta, que inclui "pagamento em dia" como comportamento, não como pagamento no app.
7. **Exportação:** campos novos dentro da v1 (premissa P7) ou mudar para `v2`?
8. **Excluir a conta** apaga também as avaliações que ela deu, o que muda a média de outras pessoas. Premissa: sim, coerente com a D25.

Premissas: P3, o modo é por aparelho e não sai ao sair da conta. P5 a P8 seguem as perguntas 5 a 8. O freela avalia o contratante pela mesma tela (variante "Avaliar contratante"); a spec ainda não a desenha e o designer completa na etapa 10. O conteúdo de Dicas fica em `src/textos/dicas.ts`, junto de `legal.ts`, e não em `src/conteudo/`; os textos são escritos pelo designer e revisados pelo dono.

## ADR
- **ADR-009 — Fontes por `@expo-google-fonts` carregadas na raiz.** O app usa o Expo Go (D16, depois a decisão 75 com o SDK 58), que não carrega fonte embutida por plugin. Por isso a carga é em tempo de execução, com a splash segurada e reserva na fonte do sistema. Entram só os pesos usados. `expo-font` fica fixo na versão do SDK. Consequência: `fontFamily` passa a ser permitido, mas só em `tema/`.
- **ADR-010 — Modo de navegação local, numa `Tabs` só.** O modo é preferência do aparelho, guardada no secure-store, sem API. As abas dos dois modos convivem numa `Tabs`, com `href: null`, para as URLs ficarem estáveis. Rota de pilha nunca troca o modo. Aba exclusiva troca, porque o link vence. Alternativa rejeitada: grupos por modo, que geram URLs ambíguas.
- **ADR-011 — Módulo `avaliacoes` com avaliações mútuas e favoritos.** Uma avaliação por trampo e avaliador, só depois do encerramento com candidatura aceita, com papel do avaliado gravado. Média calculada na leitura, sem coluna desnormalizada. Resumos em lote em vez de mexer em `perfis`. Favorito privado, com vínculo exigido. Sem FK entre módulos, com a exclusão e a exportação pela porta `DadosDaConta` (ADR-005).
