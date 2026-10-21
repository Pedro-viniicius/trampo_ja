# Plano técnico: MVP do Trampo Já, entrega 2b (app: publicação, candidaturas e meus anúncios)
- Brief: docs/produto/briefs/mvp-trampo-ja.md
- Spec: docs/produto/specs/mvp-trampo-ja.md (telas 8 a 11 e 13)
- Plano anterior: docs/produto/planos/mvp-trampo-ja-app.md (2a, seção "Entrega 2b")
- Data: 2026-10-21
- **Corte:** com as conversas, o plano passaria de 250 linhas, e elas são a parte mais sensível (polling, texto livre de terceiros). Esta **2b** cobre publicar, ofertar, candidatar-se, as candidaturas (minhas, recebidas e aceite), meus trampos e meus serviços, a aba Publicar e os atalhos. A **2c** (`docs/produto/planos/mvp-trampo-ja-app-2c.md`, a escrever) cobre as conversas e a aba Conversas e fecha o CA16. O escopo dela está no fim deste plano.

## Objetivo e critérios de aceite
Fechar no app, contra a API real, o ciclo de publicar, candidatar-se e aceitar. Numeração do brief:
- CA4: Publicar trampo (título de 5 a 80, descrição, categoria, cidade, valor > 0) chama `POST /trampos`. O trampo fica aberto e aparece no Início, na Buscar e em Meus trampos.
- CA5: campo faltando ou valor ≤ 0 é recusado apontando o campo, tanto na validação local quanto nos `campos` do 400.
- CA6: Ofertar serviço (título, descrição, categoria, preço base > 0; cidade opcional, preenchida com a do perfil, D7) chama `POST /servicos`. O serviço fica ativo e aparece na busca.
- CA8: a folha Candidatar-se (mensagem, valor proposto > 0) chama `POST /trampos/:id/candidaturas`. A candidatura fica pendente e o autor a vê em Candidaturas recebidas.
- CA9: o autor vê "Ver candidaturas (n)" no lugar de "Candidatar-se". Quem já se candidatou vê o selo "Candidatura enviada". `candidatura_duplicada` e `autor_nao_pode_candidatar` viram os textos da spec.
- CA10: aceitar, depois do diálogo de confirmação, chama `POST /trampos/:id/candidaturas/:cid/aceitar`. Nas telas, o trampo fica "Em andamento", a candidatura escolhida "Aceita" e as demais "Recusada".
- CA11: com o trampo não aberto, o botão fica desabilitado com "Este trampo não recebe mais candidaturas.", e o 409 `trampo_nao_aberto` é traduzido.
- CA14 e CA15 (cliente): continuam valendo nas telas novas. Um 401 leva ao login; nada vai para o `console`; o token só no secure-store.
- D9: o 409 `perfil_incompleto` (ou o perfil ainda inexistente) em publicar, ofertar e candidatar mostra "Complete seu perfil para publicar e se candidatar. Falta: …", com "Completar perfil" e "Agora não".
- CA16 (parcial): telas de publicação e candidaturas. Fica para a 2c: CA12, CA13, a tela Conversas e o fechamento do CA16.

## Contexto atual
- **API, trampos** (`apps/api/src/modulos/trampos/adaptadores/http/rotas.ts`): candidatura com `id, freelancerId, mensagem, valorPropostoCentavos, status, criadaEm` (`:112-126`); `/candidaturas/minhas` acrescenta `trampoId` (`:128-133`); `/trampos/meus` traz trampos completos (`:209-220`); a lista de candidaturas é só do autor, 404 para os demais (`:251-266`); o aceite devolve `{status:"aceita"}` (`:269-280`); a criação, `{id, status}` (`:69-74`).
- **API, serviços:** `GET /servicos/meus` (`servicos/adaptadores/http/rotas.ts:149-160`); chave extra no corpo dá 400 (`:28-44`).
- **Limites:** trampo com título 5–80, descrição 1–2000, cidade 2–80 (`trampos/dominio/trampo.ts:25-27`) e prazo de 1900 a 9999 (`:71-90`); candidatura com mensagem 1–2000 e valor até 2.147.483.647 centavos (`trampos/dominio/candidatura.ts:30-32`); serviço com os mesmos limites (`servicos/dominio/servico.ts:15-21`).
- **409 e concorrência** (`README.md:261-268`): o aceite que perde a disputa sai `trampo_nao_aberto`; `conflito_de_versao` pode ser repetido. A API não devolve o id da conta (`perfis/adaptadores/http/rotas.ts:52-63`).
- **Slots da 2a:** `PropsDoInicio` tem `onPublicarTrampo`, `onOfertarServico` e `onMinhasCandidaturas` opcionais (`src/telas/tipos.ts:90-93`); `PropsDoPerfil` tem os três atalhos (`:185-188`); os detalhes têm `rodape?: ReactNode` (`:151-152`, `:161`); os textos do rodapé já existem (`src/textos/pt-BR.ts:100-105`, `:114-116`).
- **Padrões:** guarda de `sessao.geracao()` (`src/estado/consultas/perfil.ts:87-102`); `usePerfilPublico` em `chaves.perfil(id)` (`:105-117`, `chaves.ts:27-36`); `estadoDeConsulta` faz 404 virar `vazio` (`src/estado/estado-de-bloco.ts:226-246`); `chaveDoErro` por `Formulario` (`src/estado/erros.ts:8`, `:17-22`), com todo 409 que não é `email_em_uso` virando `erro_servidor` hoje (`:133-136`); mutações com `retry: 0` (`src/estado/cliente-de-consultas.ts:30-41`).
- **Navegação:** três abas (`src/app/(app)/(abas)/_layout.tsx:115-131`, `src/componentes/navegacao.ts:318-325`); o Editar perfil volta à origem ao salvar (`src/app/(app)/perfil/editar.tsx:118-121`); o `expo-router` 57 exporta `useIsFocused` (`node_modules/expo-router/build/exports.d.ts:20`); as rotas tipadas vêm de `.expo/types/router.d.ts`, gerado e ignorado pelo git.
- **D15** é vigiada por `src/testes/qa/fronteiras-qa.test.ts:46-90`: componentes não importam `api` nem `estado`, nem como tipo; telas só importam tipos.

## Abordagens consideradas
Lacunas da API. A recomendação é **não mudar a API na 2b**.

| Lacuna | Opção A (recomendada) | Opção B | Por que A |
|---|---|---|---|
| (a) Nomes nas candidaturas recebidas | `useQueries` com `GET /perfis/:id` por item, na mesma chave `chaves.perfil(id)` do `usePerfilPublico` (o cache é compartilhado) | `GET /perfis?ids=` em lote na API (etapa sensível nova, com teste de vazamento) | A lista de um trampo é curta no MVP, o cache reaproveita o que o detalhe e o perfil já buscaram, e a API fica intocada. Gatilho para B: trampos com mais de 20 candidaturas ou a 2c precisar disso na lista de conversas |
| (b) "Quem sou eu" | Papel derivado das listas "minhas": autor se `GET /trampos/meus` contém o id; candidatado se `GET /candidaturas/minhas` tem o `trampoId` | `GET /contas/eu` → `{contaId}` em `contas` | O rodapé precisa das duas listas de qualquer jeito (status da minha candidatura e "n"), e a API continua sendo a autoridade (409 `autor_nao_pode_candidatar`). B só se a 2c precisar e `autorId !== outroUsuarioId` não bastar |
| (c) Mensagens "últimas N" | Fica para a 2c (ver fim) | — | — |

Valor em reais: há um caminho claro. É **digitação livre com teclado decimal, convertida para centavos por função pura e reformatada ao sair do campo**. A máscara que formata a cada tecla (dígitos entrando pela direita) muda o valor sob o cursor: o leitor de tela anuncia números que a pessoa não digitou, e colar "150" vira R$ 1,50. A spec exige "máscara sem bloquear leitor".

## Decisão
- **Rotas novas (contêineres, dev):**
  - `(app)/(abas)/publicar.tsx`: aba Publicar, abre `EscolhaDePublicacao`.
  - `(app)/trampos/novo.tsx` e `(app)/servicos/novo.tsx`: `FormularioDeAnuncio`. A confirmação "publicado" é um estado da própria tela, não uma rota.
  - `(app)/candidaturas/index.tsx`: Minhas candidaturas.
  - `(app)/candidaturas/[trampoId].tsx`: Candidaturas recebidas de um trampo.
  - `(app)/meus-anuncios.tsx?tipo=trampo|servico`: Meus trampos e Meus serviços, numa só tela.
  - Os formulários ficam na pilha `(app)`, então a barra de abas some.
  - Seguem a spec ("Fluxo"): Minhas candidaturas fica no Perfil e no Início; Recebidas, no detalhe do trampo do autor.
- **Rodapé do detalhe do trampo:** `situacaoDoRodape()` pura em `src/estado/rodape-do-trampo.ts`, avaliada nesta ordem:
  - **carregando:** o trampo, `meusTrampos` ou `minhasCandidaturas` ainda sem dado. Se uma das listas falhar, ela conta como vazia, e a API decide.
  - **autor:** "Ver candidaturas (n)". O `n` vem de `GET /trampos/:id/candidaturas`, que só é pedido nessa situação; enquanto não chega, `null`.
  - **candidatado:** o selo com o status da minha candidatura. "Conversar" chega na 2c pelo callback opcional.
  - **fechado:** o status não é `aberto`.
  - **candidatar:** nenhum dos casos acima.
- **Folha Candidatar-se:** fica dentro do `RodapeDoTrampo`. Com perfil inexistente (`useMeuPerfil().semPerfil`), mostra o aviso D9 no lugar do formulário. O 409 `perfil_incompleto` mostra o mesmo aviso. No sucesso, a folha fecha, aparece o toast e o selo muda.
- **Mutações novas:** `usePublicarTrampo`, `useOfertarServico`, `useCandidatar` e `useAceitarCandidatura`.
  - Todas com `networkMode: 'always'` e o guarda de `geracao()`. O `'always'` impede que uma ação irreversível fique pausada offline e rode sozinha depois: sem rede, ela falha na hora com `sem_conexao` e o rascunho fica na tela.
  - No `onSuccess`, se a geração for a mesma, `await invalidateQueries(..., { refetchType: 'all' })` nas listas "minhas" e nas chaves afetadas (tabela abaixo). Assim, "Ver trampo" logo depois de publicar já reconhece o autor, e o selo muda antes de a folha fechar.
- **Aceite:**
  - O diálogo "Aceitar {nome}?" confirma, e os botões "Aceitar" ficam desabilitados enquanto houver um aceite no ar.
  - `trampo_nao_aberto`, `candidatura_nao_pendente` e `conflito_de_versao` mostram o texto e recarregam a lista e o trampo. Não há nova tentativa automática.
- **Validação:** local, ao enviar e ao sair do campo, com os limites da API. O foco vai ao primeiro erro (`useFocarPrimeiroErro` em `src/telas/base.tsx:178`). Os erros do 400 vêm por campo.
  - `maxLength`: título 80, descrição e mensagem 2000, cidade 80, valor 15, prazo 10.
- **Prazo:** campo de texto `dd/mm/aaaa`, opcional (pergunta 2). Aceita também os 8 dígitos sem barra e é reformatado ao sair do campo.
- **Cidade:** vem preenchida com a do perfil, no trampo e no serviço (D7). No serviço, se a pessoa apagar, vai sem cidade.

## Esquema e contratos
Sem migração e sem mudança na API.

**`src/api` (etapa 2):**
- Tipos novos: `StatusDaCandidatura = 'pendente'|'aceita'|'recusada'`, `Criado {id, status}`, `EntradaDeTrampo {titulo, descricao, categoria, cidade, valorCentavos, prazo?: string|null}`, `EntradaDeServico {titulo, descricao, categoria, cidade?: string|null, precoBaseCentavos}`, `EntradaDeCandidatura {mensagem, valorPropostoCentavos}`, `CandidaturaRecebida {id, freelancerId, mensagem, valorPropostoCentavos, status, criadaEm}` e `MinhaCandidatura = CandidaturaRecebida & {trampoId}`.
- `trampos.ts`: `publicarTrampo`, `listarMeusTrampos`, `candidatar(c, trampoId, e)`, `listarCandidaturasDoTrampo`, `aceitarCandidatura(c, trampoId, cid)` e `listarMinhasCandidaturas`.
- `servicos.ts`: `ofertarServico`, `listarMeusServicos`.
- Os ids passam por `segmentoDaUrl`. O corpo leva só as chaves aceitas (chave extra dá 400).

**`src/estado` (etapas 3 e 4):**

| Item | Contrato |
|---|---|
| `chaves.ts` | `meusTrampos()`, `meusServicos()`, `minhasCandidaturas()`, `candidaturasRecebidas(trampoId)` |
| `consultas/anuncios.ts` | `useMeusTrampos`, `useMeusServicos`, `useTramposPorIds(ids)` (useQueries em `chaves.trampo`), `usePublicarTrampo` (invalida `meusTrampos`, `recentes('trampos')`, `['busca']`), `useOfertarServico` (o mesmo, com serviços) |
| `consultas/candidaturas.ts` (novo) | `useMinhasCandidaturas`, `useCandidaturasRecebidas(trampoId, {habilitada})`, `useCandidatar(trampoId)` (invalida `minhasCandidaturas`), `useAceitarCandidatura(trampoId)` (invalida `trampo(id)`, `candidaturasRecebidas(id)`, `meusTrampos`, `recentes('trampos')`, `['busca']`) |
| `consultas/perfil.ts` | `usePerfisPublicos(ids): Map<id, PerfilPublico \| null>`, com `null` para o 404, sobre `chaves.perfil(id)` |
| `validacao.ts` | `LIMITES` ganha `titulo`, `descricaoDoAnuncio`, `mensagem` e `centavos {min:1, max:2147483647}`. `validarTrampo`, `validarServico` e `validarCandidatura` devolvem `Partial<Record<campo da API, ChaveDeErro>>` |
| `formatacao.ts` | `lerValorEmCentavos(texto): number\|null`: a vírgula é o decimal; o ponto é milhar só antes de grupos de 3 dígitos, senão é decimal; no máximo 2 casas; aceita "R$". `centavosParaCampo(n)` → `"1.500,00"`. `lerData('31/12/2026'\|'31122026')` → `'2026-12-31'\|null`. `dataParaCampo(iso)` |
| `erros.ts` | `Formulario` ganha `'trampo' \| 'servico' \| 'candidatura'`. Os 409 da tabela abaixo viram `geral` |
| `rodape-do-trampo.ts` (novo) | `situacaoDoRodape({trampo, meusTrampos, minhasCandidaturas, recebidas}): SituacaoDoRodape` |
| `perfil-incompleto.ts` (novo) | `CAMPOS_DO_PERFIL_NOVO` (rótulos de nome, cidade e habilidades), para os contêineres novos |
| `item-para-exibir.ts` | `meuAnuncioParaExibir(trampo \| servico, categorias): MeuAnuncioParaExibir` |

**Chaves novas de `textos.erros`** (etapa 1, designer). Campos: `titulo_tamanho` (qualquer motivo); `descricao_trampo_obrigatoria` ("Descreva o que você precisa.") e `descricao_servico_obrigatoria` (texto novo); `descricao_anuncio_tamanho` (até 2.000); `categoria_obrigatoria`; `cidade_anuncio_obrigatoria` ("Informe a cidade.", e o `tamanho` reaproveita `cidade_tamanho`); `valor_invalido` (`valorCentavos` e `precoBaseCentavos`); `valor_proposto_invalido`; `valor_alto` (só local, acima do teto); `prazo_invalido`; `mensagem_obrigatoria`; `mensagem_tamanho`.
- Os 409: `perfil_incompleto`, `autor_nao_pode_candidatar`, `candidatura_duplicada`, `trampo_nao_aberto`, `candidatura_nao_pendente` e `conflito_de_versao` (os dois últimos são textos novos: "atualizamos a lista" e "tente de novo").

Os textos de tela seguem a spec (`specs/mvp-trampo-ja.md:144-154`). São textos novos os rótulos `abas.publicar`, "Meus trampos" e "Meus serviços" vazios, e os fallbacks "Perfil indisponível" e "Trampo indisponível".

**Props das telas** (etapa 1 em `src/telas/tipos.ts`; as telas importam deste arquivo):
```ts
export type SituacaoDoRodape =
  | { tipo: 'carregando' } | { tipo: 'fechado' } | { tipo: 'candidatar' }
  | { tipo: 'autor'; quantidade: number | null }            // null: "Ver candidaturas"
  | { tipo: 'candidatado'; status: StatusDaCandidatura };   // de ../api/tipos
export interface PropsDaEscolhaDePublicacao { onPublicarTrampo(): void; onOfertarServico(): void }
export type CampoDoAnuncio = 'titulo' | 'descricao' | 'categoria' | 'cidade' | 'valor' | 'prazo';
export interface ValoresDoAnuncio { titulo: string; descricao: string; categoria: string | null; cidade: string; valor: string; prazo: string }
export type ErrosDoAnuncio = Partial<Record<CampoDoAnuncio | 'geral', string>>;
export interface PropsDoFormularioDeAnuncio {
  tipo: TipoDeAnuncio;                 // 'servico': sem prazo, cidade opcional, "Preço base (R$)"
  valores: ValoresDoAnuncio; erros: ErrosDoAnuncio; categorias: readonly OpcaoDeCategoria[];
  enviando: boolean; semConexao?: boolean;
  perfilIncompleto: PerfilIncompleto | null;   // não nulo: aviso D9 no lugar do botão
  publicado: boolean;                          // confirmação "Trampo publicado!" / "Serviço ofertado!"
  onMudar(campo: Exclude<CampoDoAnuncio, 'categoria'>, texto: string): void;
  onMudarCategoria(id: string | null): void; onSairDoCampo(campo: CampoDoAnuncio): void;
  onEnviar(): void; onCompletarPerfil(): void; onAgoraNao(): void;
  onVerPublicado(): void; onPublicarOutro(): void; onVoltar(): void;
}
export interface FolhaDeCandidatura {
  visivel: boolean; mensagem: string; valor: string;
  erros: { mensagem?: string; valor?: string; geral?: string };
  enviando: boolean; perfilIncompleto: PerfilIncompleto | null;
  onMudarMensagem(t: string): void; onMudarValor(t: string): void; onSairDoValor(): void;
  onEnviar(): void; onFechar(): void; onCompletarPerfil(): void;
}
export interface PropsDoRodapeDoTrampo {
  situacao: SituacaoDoRodape; semConexao?: boolean; folha: FolhaDeCandidatura;
  toast: string | null; onFecharToast(): void;
  onCandidatar(): void; onVerCandidaturas(): void; onConversar?: () => void;   // 2c
}
export interface CandidaturaParaExibir {
  id: string; contaId: string; nome: string | null;   // null: "Perfil indisponível"
  valorPropostoFormatado: string; mensagem: string; dataFormatada: string;
  status: StatusDaCandidatura; podeAceitar: boolean;
}
export interface PropsDasCandidaturasRecebidas {
  trampo: Estado<{ titulo: string; status: StatusDoTrampo }>;
  lista: Estado<readonly CandidaturaParaExibir[]>;
  aceitando: string | null;                     // id em aceite: desabilita todos os "Aceitar"
  erroDoAceite?: string; toast: string | null; semConexao?: boolean;
  onAceitar(id: string): void;                  // chamado depois da confirmação do diálogo
  onAbrirPerfil(contaId: string): void; onFecharToast(): void; onVoltar(): void;
  onConversar?: (contaId: string) => void;      // 2c
}
export interface MinhaCandidaturaParaExibir {
  id: string; trampoId: string; tituloDoTrampo: string | null;   // null: "Trampo indisponível"
  valorPropostoFormatado: string; dataFormatada: string; status: StatusDaCandidatura;
}
export interface PropsDasMinhasCandidaturas {
  lista: Estado<readonly MinhaCandidaturaParaExibir[]>; semConexao?: boolean;
  onAbrirTrampo(trampoId: string): void; onBuscarTrampos(): void; onVoltar(): void;
}
export type MeuAnuncioParaExibir = ItemParaExibir & { status: StatusDoTrampo | 'ativo' };
export interface PropsDosMeusAnuncios {
  tipo: TipoDeAnuncio; lista: Estado<readonly MeuAnuncioParaExibir[]>; semConexao?: boolean;
  onAbrirItem(item: MeuAnuncioParaExibir): void; onPublicar(): void; onVoltar(): void;
}
```
O componente `CartaoDeCandidatura` (designer) recebe props próprias, com o status como literal ou `VarianteDoSelo`, porque componentes não importam `api` (D15).

## Etapas
`M` = `apps/mobile`. A **base** é `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <arquivos da etapa>`. Cada `dev` em paralelo roda só os próprios testes. O `pnpm --filter mobile test` inteiro fica no fim de cada grupo, rodado pelo lead.

| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Textos e contratos. Em `pt-BR.ts`: todas as chaves de texto da 2b (abas, escolha, formulário, candidatar, recebidas, minhas, meus anúncios, toasts e aviso D9) e as chaves novas de `erros`. Em `tipos.ts`: o bloco de props acima, sem mudar os tipos existentes | `M/src/textos/pt-BR.ts`, `M/src/telas/tipos.ts` | base + `jest src/telas src/estado/erros.test.ts` (nada quebra) | designer | A | não | 4, 5, 6, 8–11, 16 |
| 2 | Endpoints e tipos da 2b (contrato acima), com o fake de `fetch`. Testes: método, caminho, ids codificados, corpo só com as chaves aceitas (`prazo` e `cidade` omitidos quando vazios), 409 e 400 sobem como `ErroDaApi` com o código e os campos | `M/src/api/{tipos,trampos,servicos}.ts`, `M/src/api/anuncios-e-candidaturas.test.ts` | base + `jest src/api` | dev | A | **sim** (mensagem e valor da candidatura, aceite) | 4, 6, 8, 10, 14 |
| 3 | Estado puro: as validações, `lerValorEmCentavos`, `lerData` e as funções inversas, `chaveDoErro` com os formulários e os 409 novos, `situacaoDoRodape`, `CAMPOS_DO_PERFIL_NOVO` e `meuAnuncioParaExibir`. Testes com tabela: limites (4, 5, 80 e 81 caracteres; valor 0, 1, o teto e o teto + 1; "1.500", "1,5", "1.5", "abc", "1,234"), a ordem das situações do rodapé e a lista que falhou contando como vazia | `M/src/estado/{validacao,formatacao,erros,item-para-exibir}.ts` e os `.test.ts` deles, `M/src/estado/{rodape-do-trampo,perfil-incompleto}.ts`, `M/src/estado/rodape-do-trampo.test.ts` | base + `jest src/estado/validacao src/estado/formatacao src/estado/erros src/estado/item-para-exibir src/estado/rodape-do-trampo` | dev | B | não (funções puras, sem I/O) | 4, 5, 6, 8, 9, 11 |
| 4 | Consultas e mutações (tabela de `src/estado`). Testes: a geração mudou durante a mutação e nada entra no cache; `refetchType: 'all'` deixa `meusTrampos` atualizado antes do `onSuccess` do `mutate`; offline a mutação falha com `ErroDeRede` e não fica pausada; `useCandidaturasRecebidas` não chama a API com `habilitada: false`; `usePerfisPublicos` reaproveita o cache e mapeia o 404 para `null` | `M/src/estado/consultas/{chaves,anuncios,perfil,candidaturas}.ts`, `M/src/estado/consultas/anuncios-e-candidaturas.test.tsx` | base + `jest src/estado/consultas/anuncios-e-candidaturas` | dev | B | **sim** (geração, aceite, nomes de terceiros) | 4, 6, 8, 10, 14 |
| 5 | Telas de publicação: `EscolhaDePublicacao` e `FormularioDeAnuncio`, com os estados da spec (validação, foco no primeiro erro, aviso D9, confirmação, "Enviando…", offline com o botão desabilitado e o motivo, ajuda da cidade opcional no serviço) e os campos de valor e prazo com `tipo="decimal"`/`"numero"`, rótulo e `maxLength` | `M/src/telas/{EscolhaDePublicacao,FormularioDeAnuncio}.tsx`, `M/src/telas/publicacao.test.tsx` | base + `jest src/telas/publicacao` | designer | B | não | 4, 5, 6, 16 |
| 6 | Candidaturas e meus anúncios: o componente `CartaoDeCandidatura`, as telas `RodapeDoTrampo` (situações, folha, toast), `CandidaturasRecebidas` (diálogo "Aceitar {nome}?", vazio, selos), `MinhasCandidaturas` (vazio com "Buscar trampos") e `MeusAnuncios`; `RotaDeAba` ganha `publicar` (ícone `add-circle`) | `M/src/componentes/{CartaoDeCandidatura.tsx,index.ts,navegacao.ts}`, `M/src/componentes/cartao-de-candidatura.test.tsx`, `M/src/telas/{RodapeDoTrampo,CandidaturasRecebidas,MinhasCandidaturas,MeusAnuncios}.tsx`, `M/src/telas/candidaturas.test.tsx` | base + `jest src/componentes/cartao-de-candidatura src/telas/candidaturas` | designer | B | não (só props) | 8–11, 16 |
| 7 | Aba Publicar e formulários. A aba fica entre Buscar e Perfil. Os contêineres de trampo e serviço: rascunho na memória do componente, cidade pré-preenchida, valor reformatado ao sair do campo, aviso D9 antes de abrir quando não há perfil, erros por campo do 400, `perfil_incompleto`, confirmação com "Ver trampo"/"Publicar outro". Testes de rota: CA4 (corpo enviado, cache da busca invalidado), CA5 (local e 400), CA6 sem cidade, D9, 401 → login, offline | `M/src/app/(app)/(abas)/{_layout,publicar}.tsx`, `M/src/app/(app)/trampos/novo.tsx`, `M/src/app/(app)/servicos/novo.tsx`, `M/src/testes/rotas/publicacao.test.tsx` | base + `jest src/testes/rotas/publicacao` | dev | C | não | 4, 5, 6, 14, 16 |
| 8 | Detalhe do trampo com o rodapé e a folha, e a tela Candidaturas recebidas com o aceite. Testes de rota: as 4 situações (autor com n, candidatado, fechado, candidatar), CA8, CA9 (duplicada e autor), CA11 (botão desabilitado e 409 traduzido), D9 na folha, CA10 (confirmação e lista final com aceita/recusadas e trampo em andamento), aceite perdido (`trampo_nao_aberto`) recarregando, duplo toque sem segunda requisição, 401 | `M/src/app/(app)/trampos/[id].tsx`, `M/src/app/(app)/candidaturas/[trampoId].tsx`, `M/src/testes/rotas/candidatura-e-aceite.test.tsx` | base + `jest src/testes/rotas/candidatura-e-aceite` | dev | C | **sim** (mensagem e valor, aceite concorrente, nomes) | 8, 9, 10, 11, 14, 16 |
| 9 | Minhas candidaturas: lista com o título do trampo por `useTramposPorIds`, selos, vazio e erro; o toque abre o detalhe. Testes de rota com 3 status e com o trampo 404 ("Trampo indisponível") | `M/src/app/(app)/candidaturas/index.tsx`, `M/src/testes/rotas/minhas-candidaturas.test.tsx` | base + `jest src/testes/rotas/minhas-candidaturas` | dev | C | não | 8, 10, 16 |
| 10 | Atalhos e Meus anúncios. O Início passa `onPublicarTrampo`, `onOfertarServico` e `onMinhasCandidaturas`; o Perfil passa os três atalhos; `meus-anuncios.tsx` lê o `tipo` (valor inválido vira `trampo`). Testes de rota: cada atalho chega à rota certa; Meus trampos mostra o status; o vazio leva ao formulário | `M/src/app/(app)/(abas)/{index,perfil}.tsx`, `M/src/app/(app)/meus-anuncios.tsx`, `M/src/testes/rotas/atalhos-e-meus-anuncios.test.tsx` | base + `jest src/testes/rotas/atalhos-e-meus-anuncios` | dev | D | não | 4, 6, 16 |
| 11 | Varredura do CA15 estendida: publicar, ofertar, candidatar, recebidas com nome, aceite, os 409 da 2b e a queda de rede no envio, com sentinelas no título, na descrição, na mensagem, no nome do freelancer e no valor digitado. README: "Dados pessoais no app" lista os fluxos novos; os docs passam a citar D1–D16 | `M/src/testes/sem-dado-pessoal.test.tsx`, `README.md` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | D | **sim** (logs, dado pessoal) | 14, 15 |

Ordem dos grupos: A (1, 2) → B (3, 4, 5, 6) → C (7, 8, 9) → D (10, 11).
- **Nenhum arquivo se repete dentro de um grupo.**
  - `pt-BR.ts` e `tipos.ts` só na etapa 1.
  - `componentes/index.ts` e `navegacao.ts` só na 6.
  - `(abas)/_layout.tsx` só na 7.
  - `(abas)/index.tsx` e `perfil.tsx` só na 10.
  - Testes em arquivos novos, por etapa. A 3 edita os `.test.ts` que já existem dos seus quatro arquivos, e só ela.
- **Dependências entre grupos:**
  - a 3 depende das chaves de erro da 1;
  - a 4 depende da 2;
  - as 5 e 6 dependem da 1;
  - o grupo C depende de todo o B;
  - a 10 navega para rotas da 7 e da 9, por isso vai no D (as rotas tipadas precisam que o arquivo exista).
- **Rotas tipadas:** depois de criar rotas, o `.expo/types/router.d.ts` precisa ser regenerado. Não verificado qual comando o regenera além do `expo start`. Ver Riscos.

## Pontos para o seguranca
- **Geração da sessão em toda mutação** (etapa 4): `onMutate` captura `geracao()` e `onSuccess` confere antes de qualquer `invalidate` ou `setQueryData`. Se a pessoa sair ou expirar com um publicar ou aceite no ar, nada da conta anterior volta ao cache.
- **`networkMode: 'always'`** nas quatro mutações: nada fica enfileirado para rodar offline sem a pessoa ver. O aceite não tem nova tentativa automática (`retry: 0`); `conflito_de_versao` pede ação explícita.
- **Aceite:** confirmação obrigatória; os botões ficam desabilitados com `aceitando`; o duplo toque não gera segunda requisição (teste na 8); a derrota na disputa é traduzida e a lista é recarregada.
- **Parâmetros de rota só com ids** (`trampoId`, `id`, `tipo`). Mensagem, valor, nome e título nunca vão em parâmetro, URL ou query. Os ids passam por `segmentoDaUrl`.
- **Nomes de terceiros:** vêm só de `GET /perfis/:id`, ficam só no cache em memória, que a sessão limpa ao sair ou expirar, e nunca em texto de erro. O 404 vira "Perfil indisponível".
- **Limites:** `maxLength` nos campos iguais aos da API, validação local com contagem por ponto de código (`tamanhoDe`) e caractere nulo recusado, como em `validacao.ts:30-45`.
- **D9 antes do formulário:** sem perfil, o aviso aparece antes de a pessoa digitar. O 409 continua tratado, porque a API é a autoridade.
- **Rascunhos:** só na memória do componente; ao expirar a sessão, se perdem de propósito, para nada de uma sessão sobrar para outra.
- **CA15:** a etapa 11 estende a varredura do `console` às telas novas, com sentinelas no texto livre e no nome do freelancer.
- O papel na tela (autor ou candidatado) é só exibição. A permissão continua na API (404 nas recebidas para quem não é autor, 409 `autor_nao_pode_candidatar`).

## Riscos e como reverter
- **Rotas tipadas desatualizadas:** o typecheck acusa a rota nova. O `dev` roda `pnpm --filter mobile start` até o Metro subir, para, repete o typecheck e relata o comando que funcionou. Não verificado se o `expo export` regenera.
- **`trampos/novo` e `servicos/novo` ao lado de `[id]`:** o Expo Router deveria preferir o segmento estático. Não verificado no SDK 57; o teste de rota da 7 abre `/trampos/novo` e confirma. Alternativa: `(app)/publicar-trampo.tsx` e `(app)/ofertar-servico.tsx`.
- **N requisições de perfil ou trampo por lista:** são aceitáveis no MVP. Gatilho para o lote na API: mais de 20 itens ou lentidão percebida pelo dono.
- **`/trampos/meus` sem paginação:** cresce com o uso. Fora do MVP.
- **Reverter:** não há migração nem mudança na API. Cada etapa é revertida apagando os arquivos novos e voltando os editados pelo git. As telas da 2a só ganham callbacks opcionais, então a 2a volta intacta.

## Perguntas em aberto e premissas adotadas
Para o dono:
1. **Aprova o corte?** A 2b fica com publicação, candidaturas e meus anúncios; a 2c, com as conversas e o fechamento do CA16.
2. **Prazo como texto `dd/mm/aaaa`?** Um seletor de data nativo exigiria `@react-native-community/datetimepicker`, dependência nova fora da D12. A recomendação é o texto no MVP.

Premissas:
- Não há mudança na API (lacunas (a) e (b) acima).
- Minhas candidaturas e Recebidas são telas separadas, como no "Fluxo" da spec.
- O valor é digitado livremente e formatado ao sair do campo.
- A cidade vem pré-preenchida também no trampo.
- O prazo não exige data futura, porque a API não exige.
- Meus anúncios é uma tela com `tipo`.

## Entrega 2c (escopo para `mvp-trampo-ja-app-2c`)
- **Escopo:** aba Conversas e a lista (nome por `usePerfisPublicos`, prévia e hora); a tela Conversa (`(app)/conversas/[id].tsx`), com a bolha e o campo fixo no rodapé; "Conversar" no rodapé do candidatado, no cartão de candidatura recebida e no detalhe do serviço (`onConversar` já está nos contratos); CA12, CA13 e o fechamento do CA16.
- **Proposta, também sem mudar a API:**
  - minhas mensagens são as com `autorId !== outroUsuarioId` (de `GET /conversas`, em cache);
  - a carga inicial percorre `depoisDe` até uma página com menos de 50;
  - o polling roda a cada 5 s com `depoisDe=<última>`, só com a tela focada (`useIsFocused`) e o app ativo (`focusManager`), e para ao sair da tela ou ir para background;
  - as mensagens pendentes ficam locais (relógio e "Não enviada. Toque para tentar de novo") até o id voltar no polling;
  - no serviço, "Conversar" é por tentativa: o 403 `sem_vinculo` mostra o texto do CA13 e desabilita o botão;
  - (c) "últimas N" com `antesDe` só entra se uma conversa passar de 500 mensagens.

## ADR
**ADR-003: o app não conhece o id da conta** (proposto)
- **Contexto:** a API não expõe o id da conta. O app precisa saber se a pessoa é autora ou candidata.
- **Decisão:** o papel é derivado das listas "minhas" (`/trampos/meus`, `/servicos/meus`, `/candidaturas/minhas`), e nas conversas, de `outroUsuarioId`. As mutações do app usam `networkMode: 'always'` e o guarda de geração.
- **Consequências:**
  - Zero mudança na API.
  - O detalhe faz até três leituras, todas em cache.
  - Se surgir uma tela que precise do id cru, entra `GET /contas/eu` (sensível, no módulo `contas`).

## Texto para o CLAUDE.md
Nada muda: pastas, fronteira e verificação do app seguem as da 2a.
