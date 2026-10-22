# Plano técnico: MVP do Trampo Já, entrega 2c (app: conversas)
- Brief: docs/produto/briefs/mvp-trampo-ja.md
- Spec: docs/produto/specs/mvp-trampo-ja.md (tela 12, "Estados" > Conversas, "Textos da interface" > Conversas, Acessibilidade)
- Plano anterior: docs/produto/planos/mvp-trampo-ja-app-2b.md (seção "Entrega 2c" e ADR-003)
- Data: 2026-10-21. Última entrega do MVP; fecha o CA16.

## Objetivo e critérios de aceite
Conversas no app contra a API real, sem mudar a API (D19 e ADR-003): aba Conversas, lista, tela da conversa com envio e atualização por polling, e "Conversar" no rodapé do candidatado, no cartão de candidatura recebida e no detalhe do serviço.
- CA12: com candidatura ou contratação entre os dois, a mensagem de texto não vazia aparece na conversa dos dois em ordem cronológica.
- CA13: sem relação, abrir conversa é recusado com o texto literal (D4) "Você só pode conversar com quem tem uma candidatura ou contratação com você."
- CA15: nenhum `console`; mensagem, nome e texto livre nunca em erro, aviso, `testID`, chave de lista ou snapshot.
- CA16: fecha com as telas Conversas (lista) e Conversa.

## Contexto atual
- **API** (`apps/api/src/modulos/conversas/adaptadores/http/rotas.ts`):
  - `POST /conversas {outroUsuarioId}`: 201 se nova, 200 se o par já tinha (idempotente, `:165-171`); 403 `sem_vinculo`, 409 `conversa_consigo_mesmo`; chave extra dá 400 (`:25-32`).
  - `GET /conversas`: `{conversaId, outroUsuarioId, criadaEm, ultimaMensagem: {texto, enviadaEm}|null}`, última atividade primeiro (`:64-87`, `aplicacao/casos-de-uso.ts:150-166`). A prévia não traz o autor.
  - `GET /conversas/:id/mensagens?depoisDe=`: até 50 por página, em ordem de envio (`casos-de-uso.ts:17-18`, `:196-207`). `depoisDe` alheio dá 400; conversa alheia ou inexistente, 404 (`:78-87`).
  - `POST /conversas/:id/mensagens {texto}`: 201 `{id, enviadaEm}` (`rotas.ts:206-225`). O servidor apara o texto, 1 a 2000 pontos de código, sem caractere nulo (`dominio/mensagem.ts:42-60`).
  - Sem id de idempotência. Rotas autenticadas sem rate limit (`README.md`, "Rate limit (D2)").
- **App, padrões que a 2c estende:**
  - `useMutacaoComInvalidacao`: `networkMode: 'always'`, `retry: 0`, `gcTime: 0`, guarda de `geracao()` e `{essenciais, demais}` com teto de 5 s (`src/estado/consultas/anuncios.ts:212-256`).
  - Leituras: `useConsultasPorIds` e `usePerfisPublicos` (`anuncios.ts:135-160`, `consultas/perfil.ts:91-100`).
  - Gerenciadores: o `focusManager` está ligado ao `AppState` (`src/estado/cliente-de-consultas.ts:86-94`), com consultas a 1 nova tentativa, `staleTime` de 30 s e `gcTime` de 5 min (`:32-43`).
  - Erros e telas: `chaveDoErro` trata 403 como `erro_servidor` hoje (`src/estado/erros.ts:181-204`); `estadoDeConsulta` faz o 404 virar `vazio` (`estado-de-bloco.ts:18-38`).
  - Cliente HTTP: timeout de 15 s (`src/api/cliente.ts:82`); `ErroDeRede` com motivo `tempo_esgotado|falha` (`src/api/erros.ts:28-34`).
- **Ganchos já reservados:**
  - `PropsDoRodapeDoTrampo.onConversar?` (`src/telas/tipos.ts:315-316`), que só aparece para quem é candidatado (`RodapeDoTrampo.tsx:73-90`).
  - `PropsDasCandidaturasRecebidas.onConversar?` (`tipos.ts:344-345`), que a tela mostra só na candidatura `aceita` (`CandidaturasRecebidas.tsx:138-141`, fixado em `telas/candidaturas.test.tsx:372`).
  - O detalhe do serviço tem só o slot `rodape` (`tipos.ts:164-171`); a rota não o usa (`src/app/(app)/servicos/[id].tsx:85-94`).
  - Textos: `detalheServico.conversar` e `semRelacao` (CA13 literal) existem (`src/textos/pt-BR.ts:121-123`).
- **Navegação e testes:**
  - Abas: Início, Buscar, Publicar e Perfil (`(abas)/_layout.tsx:16-37`, `componentes/navegacao.ts:9-17`). O `expo-router` exporta `useIsFocused` e `useFocusEffect` (`node_modules/expo-router/build/exports.d.ts:19-20`).
  - Mapas com `(abas)/_layout`: `testes/qa/apoio-qa.tsx:26-42` (`ROTAS_REAIS`), `testes/rotas/inicio-e-busca.test.tsx:61-71`, `testes/rotas/publicacao.test.tsx:67-79`, `testes/sem-dado-pessoal.test.tsx:235-243`.
  - O fetch falso aceita resposta por função, `demoraMs` e `falhaDeRede` (`testes/fetch-falso.ts:8-18`, `:167-172`).
  - O README do app é o da raiz (`README.md:137-200`); `apps/mobile/README.md` não existe.
- **TanStack 5.104.5:** `refetchInterval` aceita função `(query) => number|false|undefined`, e `refetchIntervalInBackground` vem `false` por padrão (`hydration-*.d.ts:2615-2619`).

## Abordagens consideradas
| Tema | A (recomendada) | B | Por que A |
|---|---|---|---|
| Atualização das mensagens | `useQuery` em `chaves.mensagens(id)` com `queryFn` incremental: lê o que está no cache, pede `depoisDe=<último id>` até vir página com menos de 50 e acrescenta. `refetchInterval` por função, `enabled` só com a tela focada | `useInfiniteQuery` (recarrega todas as páginas a cada ciclo) ou `setInterval` próprio (refaz pausa offline, foco do app, limpeza no logout) | Reaproveita o `focusManager`, o `onlineManager` e o `queryClient.clear()` da sessão; um só lugar escreve no cache |
| Pendentes | Estado do componente da tela, com reconciliação pura em `estado/conversa.ts` | `setQueryData` otimista em `mensagens(id)` | Com B, a `queryFn` incremental e o envio escrevem na mesma chave, e o cursor pode pular mensagem do outro. Em A, o cursor vem só do GET |
| Abrir conversa | Hook `useAbrirConversa` nos três contêineres; o erro aparece no próprio botão | Rota intermediária `conversas/com/[contaId]` que faz o POST ao montar | Com B, o detalhe do serviço não teria como desabilitar o botão depois do 403, que é o pedido da spec (tela 7) |
| Mudança na API | Nenhuma (ver gatilhos em Riscos) | `idCliente` no envio, `antesDe`, SSE | D19; o MVP cabe sem elas |

## Decisão
- **Rotas novas:**
  - `(app)/(abas)/conversas.tsx`: aba entre Publicar e Perfil, ícone `chatbubbles`.
  - `(app)/conversas/[id].tsx`: fica na pilha, então a barra de abas some. O parâmetro é só o `conversaId`.
- **Lista (`useConversas({ativa})`):**
  - `staleTime` de 5 s. Com a aba focada, recarrega a cada 30 s; ao voltar a ela, recarrega se o dado estiver velho.
  - O nome vem de `usePerfisPublicos(outroUsuarioId[])`; o 404 vira "Perfil indisponível". Prévia de uma linha; sem mensagem, "Nenhuma mensagem ainda".
- **Conversa:**
  - O `outroUsuarioId` vem de `useConversas` pela `conversaId`. Lista carregada sem a conversa, ou mensagens com 404: tela de aviso com `nao_encontrado` e "Voltar".
  - Minha mensagem é a que tem `autorId !== outroUsuarioId` (ADR-003). O título é o nome do outro.
- **Polling (`useMensagens(id, {ativa})`):**
  - `ativa = useIsFocused()` na rota; `enabled` exige `ativa` e sessão autenticada.
  - Ciclo de 5 s. Depois de `n` falhas seguidas de rede ou 5xx, `min(5 s × 2^n, 60 s)`; o contador zera no sucesso.
  - Para nestes casos:
    - o app vai para segundo plano (`focusManager`, padrão do TanStack);
    - a rede cai (`onlineManager`; volta com `refetchOnReconnect`);
    - a tela perde o foco;
    - a API responde 404 ou outro 4xx;
    - a sessão sai (401 → `aoExpirar`).
  - `retry: 0` (o backoff é o do intervalo), `staleTime: 0` e `refetchOnWindowFocus` (ao voltar ao app, busca na hora).
  - Carga inicial: até 20 páginas por busca; o que faltar vem nos ciclos seguintes.
  - 400 em `depoisDe` (cursor inválido): refaz a carga do zero uma vez.
- **Envio (`useEnviarMensagem(id)`):**
  - `Enviar` só fica habilitado com `textoEnviavel(rascunho) !== null` e conexão.
  - No toque: cria a pendente (`enviando`, relógio), limpa o campo e chama `mutateAsync`. O campo vazio é a trava do duplo toque, e um `ref` cobre o mesmo tick.
  - Usa `mutateAsync` porque os callbacks de `mutate` só disparam na última chamada, e há envios concorrentes.
  - No sucesso, a pendente recebe `id`/`enviadaEm` (`enviada`) e `mensagens(id)` é invalidada (`demais`), o que puxa um ciclo na hora.
  - Na falha:
    - rede ou 5xx: `falhou`, "Não enviada. Toque para tentar de novo.";
    - 404: tela de aviso;
    - 401: login.
- **Reconciliação e duplicata (sem idempotência na API):**
  - Cada pendente guarda a `ancora`: o id da última confirmada quando foi criada (`null` se não havia; na revisão, trocado de posição para id, porque o teto do cache de 500 mensagens desloca posições). Uma âncora que o teto já cortou conta como anterior a todas. `reconciliar()` roda a cada resposta, em duas passadas (primeiro as pendentes em `enviando`, depois as em `falhou`, cada uma na ordem de criação; R3/S2 da revisão):
    1. sai a pendente cujo `id` já veio no GET;
    2. a pendente sem `id` (envio no ar ou falho) sai se, depois da `ancora`, houver uma confirmada minha com o mesmo texto aparado, que não seja `id` de outra pendente e não tenha sido casada antes. Cada confirmada casa uma pendente só, na ordem de criação.
  - Tentar de novo: a pendente volta a `enviando` (a trava do duplo toque), e o app primeiro espera `recarregar()`. Se ela sumiu na reconciliação, o envio tinha chegado e nada é reenviado; senão, sai um POST.
  - O cursor do polling vem só do GET, nunca do `id` do 201: senão pularia mensagens do outro enviadas no meio.
  - As pendentes aparecem depois das confirmadas, na ordem de criação, com chave local `local-<n>`.
- **Abrir conversa (`useAbrirConversa`):**
  - POST e espera `conversas()` (essencial, teto de 5 s); depois, `router.push('/conversas/[id]')`.
  - O 403 `sem_vinculo` mostra o texto do CA13 e desabilita o botão naquela tela. O 409 `conversa_consigo_mesmo` mostra o texto novo e também desabilita. Sem conexão: desabilitado com o motivo.
  - Uma abertura por vez (`abrindo`: "Abrindo…").
- **Onde aparece "Conversar":**
  - Detalhe do serviço: para quem não é o autor (`useMeusServicos`; se a lista falhar, conta como "não é meu" e a API decide).
  - Rodapé do candidatado: com `trampo.autorId`.
  - Recebidas: em todas as candidaturas, com o `freelancerId` (premissa, D23).

## Esquema e contratos
Sem migração e sem mudança na API.

**`src/api` (etapa 2):** em `tipos.ts`, `ConversaAberta {conversaId}`, `UltimaMensagem {texto, enviadaEm}`, `ResumoDeConversa {conversaId, outroUsuarioId, criadaEm, ultimaMensagem: UltimaMensagem|null}`, `Mensagem {id, autorId, texto, enviadaEm}` e `MensagemEnviada {id, enviadaEm}`. Em `conversas.ts` (novo):
- `abrirConversa(c, outroUsuarioId)`: corpo só com `{outroUsuarioId}`.
- `listarConversas(c)`.
- `listarMensagens(c, conversaId, depoisDe?)`: sem `depoisDe` na primeira página.
- `enviarMensagem(c, conversaId, texto)`: corpo só com `{texto}`.
- Os ids passam por `segmentoDaUrl`.

**`src/estado` (etapas 3 e 4):**

| Item | Contrato |
|---|---|
| `conversa.ts` (novo, puro) | `textoEnviavel(t): string\|null` (apara; nulo se vazio, acima de 2000 pontos de código ou com `\0`); `Pendente {chave, texto, situacao: 'enviando'\|'enviada'\|'falhou', id: string\|null, enviadaEm: string\|null, ancora: string\|null}`; `reconciliar(confirmadas, pendentes, outroId)`; `mensagensParaExibir(confirmadas, pendentes, outroId, agora): MensagemParaExibir[]`; `conversaParaExibir(resumo, perfis: MapaPorId<PerfilPublico>, agora): ConversaParaExibir` |
| `formatacao.ts` | `formatarHoraDaMensagem(iso, agora)`: hoje `14:32`; mesmo ano `20/10 14:32`; outro ano `20/10/2025` |
| `erros.ts` | 403 com código `sem_vinculo` → `sem_vinculo`; `CONFLITOS` ganha `conversa_consigo_mesmo` |
| `consultas/chaves.ts` | `conversas()`, `mensagens(conversaId)` |
| `consultas/conversas.ts` (novo) | `INTERVALO_DO_POLLING_MS = 5_000`, `TETO_DO_POLLING_MS = 60_000`, `INTERVALO_DA_LISTA_MS = 30_000`; `intervaloDoPolling(falhas)`; `mesclarPagina(atuais, novas)` (ignora id repetido); `useConversas({ativa})`; `useMensagens(id, {ativa}) → {mensagens, carregando, erro, indisponivel, falhasSeguidas, recarregar(): Promise<Mensagem[]\|null>}`; `useAbrirConversa() → {abrir(contaId): Promise<{tipo:'aberta', conversaId}\|{tipo:'erro', erro}\|{tipo:'descartada'}>, abrindo}`; `useEnviarMensagem(id) → {enviar(texto): Promise<{tipo:'enviada', id, enviadaEm}\|{tipo:'falhou', erro}\|{tipo:'descartada'}>}`. `descartada` quer dizer que a `geracao()` capturada antes do POST mudou: a rota não toca estado nem navega |

**Textos (etapa 1, designer):**
- `abas.conversas`.
- `conversas.*`: título; o vazio da spec; "Escreva uma mensagem"; "Enviar"; "Não enviada. Toque para tentar de novo.".
- Textos novos, com redação final do designer:
  - "Nenhuma mensagem ainda. Que tal começar?";
  - prévia vazia "Nenhuma mensagem ainda";
  - "Perfil indisponível";
  - motivo sem conexão no campo ("Sem conexão. Sua mensagem fica aqui até a conexão voltar.");
  - aviso de atualização falhando (3 falhas seguidas);
  - "Abrindo…";
  - "Sem conexão. Conecte-se para conversar.";
  - rótulos de acessibilidade das bolhas (`deNome(nome, hora)`, `minha(hora)`, "Enviando", "Não enviada") e `abrirConversaCom(nome)`.
- `erros.sem_vinculo`: o texto literal do CA13 (D4), igual a `detalheServico.semRelacao`.
- `erros.conversa_consigo_mesmo`: "Este anúncio é seu. Não dá para conversar com você mesmo."

**Props (etapa 1 em `src/telas/tipos.ts`; só acréscimos, nada existente muda):**
```ts
export interface ConversaParaExibir { id: string; nome: string | null; previa: string | null; horaFormatada: string }
export interface PropsDaListaDeConversas { lista: Estado<readonly ConversaParaExibir[]>; semConexao?: boolean; onAbrir(id: string): void }
export type SituacaoDaMensagem = 'enviada' | 'enviando' | 'falhou';
export interface MensagemParaExibir { chave: string; minha: boolean; texto: string; horaFormatada: string | null; situacao: SituacaoDaMensagem }
export interface PropsDaConversa {
  titulo: string; mensagens: Estado<readonly MensagemParaExibir[]>;  // vazio: "Nenhuma mensagem ainda…"
  indisponivel: boolean;                      // aviso nao_encontrado + "Voltar"
  rascunho: string; podeEnviar: boolean; semConexao?: boolean; atualizacaoFalhando?: boolean;
  onMudarRascunho(t: string): void; onEnviar(): void; onTentarDeNovo(chave: string): void; onVoltar(): void;
}
export interface EstadoDoConversar { abrindo: boolean; motivo: string | null }  // motivo: botão desabilitado + texto
export interface PropsDoRodapeDoServico { conversar: EstadoDoConversar; onConversar(): void }
// PropsDoRodapeDoTrampo ganha `estadoDoConversar?: EstadoDoConversar`.
// PropsDasCandidaturasRecebidas ganha `abrindoConversaCom?: string | null` e `erroDaConversa?: string` (Aviso).
```
- Lista **não invertida**, rolando ao fim na carga e quando chega mensagem com a pessoa perto do fim: a ordem de leitura fica igual à visual (spec, Acessibilidade).
- Campo multilinha com rótulo e `maxLength={2000}`. O `KeyboardAvoidingView` segue `telas/base.tsx:215`.
- A chave da lista é `chave`, nunca o texto.

## Etapas
`M` = `apps/mobile`. A **base** é `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <arquivos da etapa>`. O lead roda o `pnpm --filter mobile test` inteiro no fim de cada grupo. **Tipos de rota** (etapas 7 e 8): em `apps/mobile`, `CI=1 EXPO_NO_TELEMETRY=1 timeout 50 pnpm exec expo start --port 8099 --no-dev`, depois o typecheck de novo.

| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Textos e contratos acima (só acréscimos) | `M/src/textos/pt-BR.ts`, `M/src/telas/tipos.ts` | base + `jest src/telas src/estado/erros.test.ts` | designer | A | não | 13, 16 |
| 2 | Endpoints e tipos de conversas. Testes: método, caminho, id codificado, `depoisDe` só quando há, corpo só com as chaves aceitas, 403/409/404/400 sobem como `ErroDaApi` com código, 201 e 200 da abertura iguais | `M/src/api/{tipos,conversas}.ts`, `M/src/api/conversas.test.ts` | base + `jest src/api` | dev | A | **sim** (texto de mensagem, abertura) | 12, 13, 15 |
| 3 | Estado puro. Testes em tabela de `reconciliar`: id já no GET; pendente sem id casada depois da âncora; duas pendentes de texto igual casam duas confirmadas, não uma; mensagem do outro com o mesmo texto não casa; confirmada com id de outra pendente não casa. Também: `textoEnviavel` (espaços, 2000 e 2001 pontos de código com emoji, `\0`), hora (hoje, ano, outro ano, com `agora` fixo), 403 `sem_vinculo` → chave, 403 de outro código → `erro_servidor` | `M/src/estado/{conversa,erros,formatacao}.ts`, `M/src/estado/conversa.test.ts`, `M/src/estado/{erros,formatacao}.test.ts` | base + `jest src/estado/conversa src/estado/erros src/estado/formatacao` | dev | B | **sim** (decide reenvio e duplicata) | 12, 13, 15 |
| 4 | Consultas e mutações (tabela acima). Testes com timers falsos: carga em 2 páginas (50 + 3) e depois só `depoisDe`; ciclo de 5 s; nada com `ativa: false` nem com `focusManager.setFocused(false)`; backoff de 10 s e 20 s, que zera no sucesso; 404 para o ciclo e marca `indisponivel`; 400 de cursor refaz do zero; `queryClient.clear()` com busca no ar não deixa mensagem no cache novo; geração trocada → `descartada` sem invalidar; offline falha na hora (`networkMode: 'always'`); abertura espera `conversas()` | `M/src/estado/consultas/{chaves,conversas}.ts`, `M/src/estado/consultas/conversas.test.tsx` | base + `jest src/estado/consultas/conversas` | dev | B | **sim** (polling, envio, geração) | 12, 13, 15 |
| 5 | Componente `BolhaDeMensagem`: minha ou do outro; relógio; falha com ícone, texto e toque; hora; rótulo de acessibilidade sem `testID` com texto. Telas `ListaDeConversas` (vazio, esqueleto, erro, itens com `Avatar` decorativo), `Conversa` (estados acima, campo fixo, aviso de falha de atualização, tela de aviso) e `RodapeDoServico`. `RotaDeAba` ganha `conversas` | `M/src/componentes/{BolhaDeMensagem.tsx,index.ts,navegacao.ts}`, `M/src/componentes/bolha-de-mensagem.test.tsx`, `M/src/telas/{ListaDeConversas,Conversa,RodapeDoServico}.tsx`, `M/src/telas/index.ts`, `M/src/telas/conversas.test.tsx` | base + `jest src/componentes/bolha-de-mensagem src/telas/conversas` | designer | B | não (só props) | 12, 13, 16 |
| 6 | "Conversar" nas telas da 2b. `RodapeDoTrampo` usa `estadoDoConversar` ("Abrindo…", motivo e botão desabilitado). `CandidaturasRecebidas` mostra "Conversar" em todo status (D23), desabilita o do `abrindoConversaCom` e mostra o `erroDaConversa` num `Aviso`. Atualizar o teste "só candidatura aceita" | `M/src/telas/{RodapeDoTrampo,CandidaturasRecebidas}.tsx`, `M/src/telas/candidaturas.test.tsx` | base + `jest src/telas/candidaturas` | designer | B | não | 12, 13 |
| 7 | Rota da conversa (Decisão: Conversa, Polling, Envio, Reconciliação). Testes de rota: CA12 em ordem com bolhas minhas e do outro; envio com relógio → enviada → some quando o GET traz o id, sem duplicata; duplo toque e "Enviar" só com espaços não geram POST; queda de rede → "Não enviada…" → toque: GET antes e nenhum POST se a mensagem já chegou, um POST se não chegou; polling para ao abrir outra rota por cima e volta ao retornar; 404 → aviso e "Voltar"; offline com motivo e rascunho mantido; 401 → login | `M/src/app/(app)/conversas/[id].tsx`, `M/src/testes/rotas/conversa.test.tsx` | base + `jest src/testes/rotas/conversa` + tipos de rota | dev | C | **sim** (polling, envio, texto de terceiros) | 12, 15, 16 |
| 8 | Aba Conversas e a lista. `(abas)/_layout` ganha a aba. `ROTAS_REAIS` ganha `(abas)/conversas` e `conversas/[id]`; os outros mapas com `(abas)/_layout` ganham o stub da aba. Testes: vazio com o texto da spec; nome, prévia e hora; "Perfil indisponível" no 404; o toque abre a conversa; recarga a cada 30 s só com a aba focada e ao voltar a ela; erro com "Tentar de novo" | `M/src/app/(app)/(abas)/{_layout,conversas}.tsx`, `M/src/testes/rotas/lista-de-conversas.test.tsx`, `M/src/testes/qa/apoio-qa.tsx`, `M/src/testes/rotas/{inicio-e-busca,publicacao}.test.tsx` | base + `jest src/testes/rotas/lista-de-conversas src/testes/rotas/inicio-e-busca src/testes/rotas/publicacao src/testes/qa` + tipos de rota | dev | D | **sim** (polling da lista, prévia de terceiros) | 12, 16 |
| 9 | "Conversar" nos três contêineres com `useAbrirConversa`. Testes de rota: o candidatado manda POST com o `autorId` do trampo e cai em `/conversas/c1`; recebidas com candidatura pendente manda o `freelancerId`; no serviço, quem não é o autor vê o botão e o autor não vê. 403 → texto literal do CA13 e botão desabilitado, sem segundo POST; 409 consigo mesmo → texto; offline → motivo; duplo toque → um POST; "Abrindo…" | `M/src/app/(app)/trampos/[id].tsx`, `M/src/app/(app)/candidaturas/[trampoId].tsx`, `M/src/app/(app)/servicos/[id].tsx`, `M/src/testes/rotas/conversar.test.tsx`, `M/src/testes/rotas/detalhes-e-perfil.test.tsx` (só se a leitura nova de `/servicos/meus` mudar alguma contagem) | base + `jest src/testes/rotas/conversar src/testes/rotas/detalhes-e-perfil src/testes/rotas/candidatura-e-aceite` | dev | D | **sim** (abertura, CA13) | 12, 13 |
| 10 | Varredura do CA15 na 2c, com duas contas e sentinelas no texto enviado, no recebido, na prévia e no nome do outro. Fluxos: lista, abrir (200, 403 e 409), enviar (201, queda de rede, 404), polling com 500 e 401. `README.md`: "Rotas e telas" (aba e rota novas; abas Início, Buscar, Publicar, Conversas e Perfil) e "Dados pessoais no app" (mensagens no cache, pendentes e rascunho só na tela, polling só com a tela focada) | `M/src/testes/sem-dado-pessoal.test.tsx`, `README.md` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build` | dev | E | **sim** (logs, dado pessoal) | 15, 16 |

Ordem: A (1, 2) → B (3, 4, 5, 6) → C (7) → D (8, 9) → E (10).
- **Nenhum arquivo se repete dentro de um grupo.**
  - `pt-BR.ts` e `telas/tipos.ts` só na 1; `api/tipos.ts` só na 2.
  - `telas/index.ts`, `componentes/index.ts` e `navegacao.ts` só na 5; `telas/candidaturas.test.tsx` só na 6.
  - `apoio-qa.tsx` e os mapas de rota só na 8.
- **Dependências:**
  - a 3 depende da 1 (chaves de erro) e da 2 (tipos);
  - a 4 depende da 2 (não importa a 3: devolve o `erro` cru, e a rota traduz);
  - a 5 e a 6 dependem da 1;
  - a 7 depende de 3, 4 e 5;
  - a 8 e a 9 navegam para a rota da 7 (tipos de rota) e por isso ficam no D;
  - a 10 usa o `ROTAS_REAIS` da 8.
- **Docs:** depois da aprovação, o lead registra D20–D23 em `docs/produto/decisoes.md`. Nenhuma etapa do `dev` edita esse arquivo.

## Pontos para o seguranca
- **Geração da sessão:**
  - `abrir` e `enviar` capturam `geracao()` antes do POST; se ela mudou, devolvem `descartada` (sem navegar, sem estado, sem invalidar) e o `onSuccess` do hook não invalida nada.
  - Nas consultas, o `queryClient.clear()` da sessão descarta a busca que ainda estava no ar (teste na 4).
- **Polling limitado:**
  - Só com a tela focada e o app ativo; para no 4xx e no 401; backoff até 60 s em falha de rede ou 5xx.
  - No pior caso, 12 GET/min por conversa aberta. As rotas autenticadas não têm limite na API: ver gatilho em Riscos.
- **Sem envio offline enfileirado:** `networkMode: 'always'` e `retry: 0` no envio e na abertura. Reenvio só por toque explícito, e sempre depois de um GET.
- **Duplicata:**
  - Contra o duplo toque: o campo é limpo na hora, mais o `ref`.
  - Contra a resposta perdida: a reconciliação depois da âncora.
  - Risco residual: com a mesma conta em dois aparelhos, mandando o mesmo texto durante uma falha, a pendente pode ser tida como entregue (ver D21).
- **Dado pessoal:**
  - O texto da mensagem fica no cache de consultas, em memória (5 min sem tela, limpo ao sair), na pendente (estado do componente) e no rascunho. Nunca em parâmetro de rota, URL, `testID`, chave de lista, erro ou `console`.
  - A rota leva só `conversaId`. O `outroUsuarioId` vai só no corpo do POST.
  - Mutações com `gcTime: 0`.
- **CA13:** o app não decide vínculo; a API decide (403). O botão desabilitado é só exibição e volta a tentar ao reabrir a tela. A conversa alheia dá 404 → aviso, sem revelar se existe.
- **Leitor de tela:** o rótulo da bolha contém o texto (é a interface); nada disso vai para log.
- **CA15:** a etapa 10 estende a varredura com sentinelas nas mensagens e no nome.

## Riscos e como reverter
- **Tipos de rota:** se o comando da seção Etapas não regenerar `.expo/types/router.d.ts`, o `dev` relata e tenta `pnpm --filter mobile start` até o Metro subir.
- **`(abas)/conversas` e `conversas/[id]` juntos:** não verificado no SDK 57; o teste da 8 abre `/conversas` e `/conversas/c1`. Alternativa: `(app)/conversa/[id].tsx`.
- **Abas não preguiçosas:** se o Expo Router montar todas as abas, sai um `GET /conversas` ao abrir o app e mudam contagens de requisição nos testes QA. Não verificado (o React Navigation monta sob demanda por padrão). A 8 roda `src/testes/qa` e, se preciso, registra `GET /conversas` em `fakeComCategorias()`.
- **Timers falsos nos testes de polling:** risco de handle aberto ou teste lento. Desmontar a árvore no fim; nada de `setInterval` próprio.
- **Mensagem fora de ordem no cursor (R2 da revisão):** a API grava `enviada_em` antes do insert e ordena por `(enviada_em, ordem)`; se um envio mais antigo comitar depois de um mais novo e um GET ler entre os dois commits, o cursor incremental passa do mais antigo e ele só aparece naquele aparelho quando o cache expira (5 min sem tela) ou ao sair da conta. Raro (dois envios na mesma conversa a poucos ms). Risco documentado do ADR-004; a mitigação definitiva é na API (ordenar por sequência de commit ou expor `antesDe`). Gatilho: relato de mensagem sumida.
- **Conversa longa:** a carga inicial lê tudo (20 páginas por ciclo). Gatilho para `antesDe`/"últimas N" na API: conversa com mais de 500 mensagens.
- **Gatilhos de mudança na API** (cada um é decisão do dono e etapa sensível no módulo `conversas`):
  - `idCliente` com índice único no envio: duplicata relatada;
  - SSE ou push: atraso de 5 s percebido como problema, ou carga do polling;
  - perfis em lote: mais de 20 conversas por pessoa.
- **Reverter:** não há migração nem mudança na API. Apagar os arquivos novos e voltar os editados pelo git. As props da 2b só ganham campos opcionais; o único teste da 2b alterado é o "só candidatura aceita" (etapa 6).

## Perguntas em aberto e premissas adotadas
Para o dono (viram decisões, abaixo):
1. **D20, polling sem mudar a API:** aprova 5 s na conversa (com backoff até 60 s) e 30 s na lista, só com a tela focada?
2. **D21, duplicata sem idempotência:** aceita o risco residual da reconciliação, ou prefere `idCliente` na API (migração e etapa sensível nova; reabre a D19)?
3. **D22, "Conversar" no serviço por tentativa:** o botão aparece para quem não é o autor; sem vínculo, o toque mostra o texto do CA13 e desabilita. Esconder antes exigiria um endpoint de vínculo na API.
4. **D23, "Conversar" em toda candidatura recebida** (pendente, aceita e recusada), como a API permite e como o lado do freelancer já faz? Hoje a tela mostra só na aceita.

Premissas:
- Pendentes e rascunho vivem só enquanto a tela da conversa está aberta. Um envio no ar ao sair termina em segundo plano e aparece na próxima abertura.
- Sem indicador de não lidas: a API não tem.
- Sem "Você:" na prévia: a `ultimaMensagem` não traz o autor.
- O nome ainda carregando também aparece como "Perfil indisponível" (padrão da 2b em `candidaturas/[trampoId].tsx`).
- O CA13 aparece no próprio ponto de entrada. A "tela de aviso com Voltar" da spec é a da conversa indisponível (404).
- Sem separador por dia: a hora traz a data quando não é hoje.

## ADR
**ADR-004: conversas por polling incremental no cache, com pendentes locais** (proposto)
- **Contexto:** a API não tem tempo real nem id de idempotência, e a D19 pede para não mudá-la.
- **Decisão:**
  - `useQuery` por conversa com `queryFn` incremental (`depoisDe`), ligado ao foco da tela e ao `focusManager`, com backoff exponencial.
  - Mensagens em envio ficam no estado da tela e são reconciliadas por id ou, sem id, por texto depois da âncora.
  - Um só escritor por chave de cache.
- **Consequências:**
  - Zero mudança na API, e limpeza no logout pelo caminho que já existe.
  - Até 5 s de atraso e GET periódico enquanto a conversa está aberta.
  - Duplicata residual rara (D21). Os gatilhos para mudar a API estão em Riscos.

Decisões propostas para `docs/produto/decisoes.md` (o lead registra depois da aprovação):
- **D20:** conversas sem mudança na API: polling de 5 s na conversa (backoff até 60 s) e de 30 s na lista, só com a tela focada e o app ativo.
- **D21:** sem id de idempotência; antes de reenviar, o app consulta as novas, e o risco residual de duplicata é aceito.
- **D22:** "Conversar" no serviço por tentativa, com o texto do CA13 e o botão desabilitado no 403.
- **D23:** "Conversar" em toda candidatura recebida.

## Texto para o CLAUDE.md
Nada muda: pastas, fronteira e verificação do app seguem as da 2a.
