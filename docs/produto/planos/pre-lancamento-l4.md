# Plano técnico: pré-lançamento nas lojas, entrega L4 (qualidade)
- Brief: sem brief próprio. Escopo aprovado no corte D32 (`docs/produto/planos/pre-lancamento-lojas.md:215`), mais as pendências da L2 mandadas pelo dono e os itens a avaliar do pedido do lead (2026-10-26).
- Spec: `docs/produto/specs/pre-lancamento-l4.md`, escrita em paralelo pelo designer (ver "Coordenação com a spec").
- Data: 2026-10-26. Linha de base: commit `11a2695` (API 1203 unidade + 802 integração em 41 arquivos; app 2477 em 77 suítes + 2 pulados).

## Objetivo e critérios de aceite
Fechar as pendências de qualidade das revisões da 2a à L3, sem regra de negócio nova. A numeração continua a da L3.
- CA55 (campo de texto): nos campos de texto livre com limite (título, descrição, cidade, mensagem da candidatura, mensagem da conversa, nome, sobre você, habilidade, texto e cidade da busca), o contador conta pontos de código, como a API. Digitar ou colar além do limite corta no limite, nunca antes (um emoji conta 1), e o leitor de tela anuncia que o limite foi atingido. Testado com emoji, bandeira, família (ZWJ) e acento composto.
- CA56 (faixa): existe uma só faixa "sem conexão", desenhada na raiz, com e sem sessão. Nenhuma tela desenha a sua. Ela some quando a rede volta e não se repete ao trocar de tela.
- CA57 (editar perfil): o formulário só aparece depois da resposta do `GET /perfis/eu`, que pode ser o 404 do perfil novo. Antes disso aparece o carregando; com erro, um aviso com "Tentar de novo". Nada é salvo com campos vazios por falta de carga.
- CA58 (envio offline): entrar, cadastrar e salvar perfil sem conexão falham na hora com `sem_conexao` e mantêm o que foi digitado. Nada é enviado sozinho quando a rede volta, e a senha não fica pendurada numa mutação pausada.
- CA59 (R2): uma mensagem gravada depois de outra mais nova aparece no ciclo seguinte do polling, na posição da API e sem duplicata.
- CA60 (mais de 500 mensagens): "Tentar de novo" de uma pendente cuja âncora saiu do teto do cache confere na API, a partir da âncora, se a mensagem chegou. Se chegou, não reenvia. Se não deu para conferir, a pendente continua "Não enviada".
- CA61 (R8): a folha "Mais opções" aberta mostra o anúncio atual. Depois de um 409 `trampo_nao_aberto`, o "Excluir" fica desabilitado com o motivo, sem fechar e reabrir a folha.
- CA62 (foco): em cadastro, entrar, editar perfil, formulário de anúncio, excluir conta e exportar dados, o primeiro campo com erro recebe o foco e a tela rola até ele.
- CA63 (aviso de retorno): o toast de "excluído", "já não existe" e "alterações salvas" também aparece quando a volta cai no Início ou na Busca.
- CA64 (selo): depois de um 409 `candidatura_nao_pendente` no rodapé, o detalhe recarrega o trampo e o selo mostra o status novo.
- CA65 (retirar): retirar candidatura nunca responde `conflito_de_versao`. Prova: rajada de 20 candidaturas no Postgres.
- CA66 (meus trampos): `GET /trampos/meus` pagina (20 por padrão, no máximo 50, mais recentes primeiro, cursor `(criadoEm, id)`). Meus anúncios carrega mais no fim da lista. O detalhe reconhece o autor pela visão do autor (D46), inclusive em trampo fora da primeira página.
- CA67 (S5): uma lápide cuja exclusão falha não segura as outras. Ela fica em espera no processo e volta a ser tentada depois; as outras seguem na mesma rodada.
- CA68 (URL do app): `urlDaApi` e o `build:producao` recusam userinfo (`https://u:p@host`) e host vazio (`https://:3000`), com mensagem sem o valor.
- CA69 (medida): fica medido o tempo da exclusão de uma conta no volume de referência ("Esquema"), com o resultado registrado no relatório e no README.
- CA70 (aparelho): o lead e o dono passam o roteiro manual da etapa 18, e o resultado fica registrado.

## Contexto atual
(`A` = `apps/api`, `M` = `apps/mobile/src`)
- **Campo de texto:** o `CampoDeTexto` repassa `maxLength` ao `TextInput` (`M/componentes/CampoDeTexto.tsx:140`), e o RN conta unidades UTF-16. O `Seletor` faz o mesmo (`M/componentes/Seletor.tsx:168`). Cada tela calcula o próprio contador com `Array.from` (`M/telas/FormularioDeAnuncio.tsx:31`, `M/telas/EditarPerfil.tsx:15`, `M/telas/Conversa.tsx:220-223`). O campo da conversa tem `maxLength` próprio (`Conversa.tsx:269`). A validação já conta pontos de código (`M/estado/validacao.ts:38-40`), e a API também (`A/src/modulos/perfis/dominio/perfil.ts:193`, `A/src/modulos/conversas/dominio/mensagem.ts:54`).
- **Faixa:** é desenhada em quatro lugares (`M/telas/base.tsx:156`, `:217`; `M/telas/Buscar.tsx:125`; `Conversa.tsx:114`). Os testes de rota montam a `NavegacaoRaiz` real (`M/testes/rotas/apoio.tsx:3`, `:114`). Os cabeçalhos aplicam a margem segura de cima via `useMargensSeguras`, que lê o `SafeAreaInsetsContext` (`M/componentes/Cabecalho.tsx:29`, `CabecalhoGradiente.tsx:27`, `utilitarios.ts:59-67`).
- **Editar perfil:** enquanto o perfil não chega, o formulário aparece vazio (`M/app/(app)/perfil/editar.tsx:98-107`). `carregando` vale o `isPending`, que também cobre a consulta pausada offline (`M/estado/consultas/perfil.ts:35`).
- **Mutações pausadas:** `useMutacaoDeSessao` (entrar e cadastrar) e `useSalvarPerfil` usam o `networkMode` padrão (`M/estado/consultas/conta.ts:51`, `perfil.ts:56`). Offline, o botão continua habilitado e só a faixa aparece (`M/app/(publico)/entrar.tsx:54`). **Na conversa, o envio já falha na hora** (`useMutacaoComInvalidacao`, `M/estado/consultas/anuncios.ts:294`). A pendência "envio pausado offline" que sobra é a destes três formulários (risco aceito na 2b, memória do revisor).
- **R2, ainda não corrigido na API:** a ordem continua `(enviada_em, ordem)`, e o `enviada_em` vem do relógio do caso de uso, antes do insert (`A/src/modulos/conversas/adaptadores/postgres/repositorio-postgres.ts:255-285`, `A/src/modulos/conversas/aplicacao/casos-de-uso.ts:209`). É o mesmo risco descrito em `mvp-trampo-ja-app-2c.md:205`. No app, o cursor é o último id (`M/estado/consultas/conversas.ts:189`), e `mesclarPagina` acrescenta no fim e corta em 500 (`:56-75`).
- **Mais de 500 mensagens:** o "Tentar de novo" reconcilia só com a lista em cache (`M/app/(app)/conversas/[id].tsx:196-219`).
- **R10:** o lead achou o texto na transcrição da revisão da 2c: "`apps/mobile/src/app/(app)/conversas/[id].tsx:151` (pré-existente): duplicata em conversa longa". É o mesmo item da "duplicata acima de 500 mensagens", coberto pelo CA60. O anúncio de nova mensagem, que só foi provado em teste, continua no roteiro manual da etapa 18.
- **R8:** a folha guarda o anúncio da última `abrir` em `useState` (`M/estado/acoes-do-anuncio.ts:199`, `:205-209`, `:331`).
- **Foco:** `useFocarPrimeiroErro` lê o contexto da rolagem (`M/telas/base.tsx:279`), mas o provider só existe dentro de `Rolavel` e `Formulario` (`:163`, `:224`). As seis telas chamam o hook no próprio corpo, fora do provider, então a rolagem nunca acontece (`FormularioDeAnuncio.tsx:64`, `EditarPerfil.tsx:49`, `Cadastro.tsx:28`, `Entrar.tsx:22`, `ExcluirConta.tsx:31`, `ExportarDados.tsx:21`).
- **Aviso de retorno:** só Meus anúncios e os dois detalhes o consomem (`M/app/(app)/meus-anuncios.tsx:87`, `trampos/[id].tsx:183`, `servicos/[id].tsx:159`). A Busca e o Início abrem detalhes (`(abas)/buscar.tsx:100`).
- **Selo:** no 409 `candidatura_nao_pendente`, só Minhas candidaturas recarrega (`trampos/[id].tsx:440-444`).
- **Retirar:** passa por `alterarTrampo`, que tenta no máximo 10 vezes (`A/src/modulos/trampos/aplicacao/casos-de-uso.ts:42`, `:251`, `:432`). Encerrar e excluir já usam `alterarSobTrava` (`:265-271`).
- **`/trampos/meus`:** a rota não aceita query (`A/src/modulos/trampos/adaptadores/http/rotas.ts:253-264`), e o repositório lista tudo (`repositorio-postgres.ts:417-436`). `trampos` não tem índice em `autor_id` (`A/migracoes/0002_trampos.ts:40`). No app, o papel de autor vem da lista (`M/estado/rodape-do-trampo.ts:50`; `trampos/[id].tsx:172-173`, `:324`). O `GET /trampos/:id` já devolve a visão do autor só para o autor, com `versao` (`casos-de-uso.ts:340-343`; `M/api/tipos.ts:125`).
- **S5:** a limpeza pega as 100 lápides mais antigas e repete a que falha a cada rodada, para sempre (`A/src/modulos/contas/aplicacao/casos-de-uso.ts:632-647`; `repositorios-postgres.ts:257-270`).
- **URL:** a regra `[^\s/?#]+` aceita `u:p@host` e `:3000` (`M/api/config.ts:7`; `apps/mobile/app.config.ts:27`).

## Abordagens consideradas
| Tema | A (recomendada) | B | Por que A |
|---|---|---|---|
| Limite do campo | Corte por ponto de código no `onChangeText` do `CampoDeTexto` (prop `limite`), com o contador no próprio componente | Sem corte: contador e borda em erro acima do limite (preferência da spec, seção 9) | É o que o D32 aprovou ("corte"). A spec aceita como alternativa. B exige erro de envio em todos os formulários, inclusive na Busca, que hoje não tem |
| R2 | No app: o polling relê a janela dos últimos 60 s (em `enviadaEm` da API) e substitui a cauda do cache pela resposta | Na API: trava consultiva por conversa e `enviada_em` lido depois da trava | A dispensa mudança na API (D20/D21) e a etapa sensível em `conversas`. Custa a releitura de poucas mensagens por ciclo |
| Autor no detalhe | Pela visão do autor no próprio `GET /trampos/:id` (`versao` presente) | Página a página em `/trampos/meus`, ou `GET /contas/eu` | Com a paginação, a lista deixa de ser completa. A dispensa uma rota nova e um GET por detalhe |
| S5 | Espera em memória do processo para a lápide que falhou (6 h). A rodada pede `lote + emEspera` e pula essas | Coluna `tentativas` (migração `0009`) | Achado INFORMATIVO. A não tem migração e já é idempotente entre réplicas |
| Faixa na raiz | Dentro da `NavegacaoRaiz`, acima do `Stack`, com a margem de cima. Enquanto aparece, o `Stack` recebe `SafeAreaInsetsContext` com `top: 0` | Faixa embaixo | A segue a spec (topo). Os cabeçalhos já leem o contexto, então nenhum componente muda |

## Decisão
- **App, sem API:** CA55–CA64, CA68. O designer cuida da apresentação (componentes e telas) e o dev, das regras, rotas e da raiz.
- **API:** retirar sob trava (CA65), paginação de `/trampos/meus` (CA66), S5 (CA67) e a medida da exclusão (CA69). Nenhuma migração.
- **Cursor da conversa (D48):**
  - `JANELA_DE_RELEITURA_MS = 60_000`. O cursor é o id da última mensagem em cache com `enviadaEm <= enviadaEm(última) − janela`; sem nenhuma assim, `null` (carga do começo).
  - A resposta substitui tudo o que vem depois do cursor (`substituirCauda`). Mensagem não some (D25 apaga a conversa inteira, e aí é 404), então a cauda nova contém a velha na ordem da API.
  - O 400 de cursor continua refazendo do zero.
- **Conferência da âncora (CA60):** no "Tentar de novo", depois do `recarregar()`, a conferência na API roda em dois casos: a âncora da pendente não está na lista, ou a âncora é `null` e a lista está no teto. A função `conferirDesde(conversaId, ancora)` pagina `depoisDe=ancora` até 20 páginas, sem gravar no cache, e passa o resultado ao `reconciliar`. Falha ou 400 deixam a pendente como "Não enviada".
- **Retirar (D49):** `alterarSobTrava(trampoId, t => { t.retirar(id, quem); return 'salvar'; })`. A ordem das travas continua trampo e depois candidaturas.
- **Fora:**
  - paginação de `/servicos/meus` e `/candidaturas/minhas`: fora do D32, mesmo padrão depois;
  - índice em `trampos.autor_id`: gatilho na medida da etapa 12 ou listagem acima de 50 ms;
  - corte por grafema (`Intl.Segmenter` no Hermes, não verificado);
  - seções 6 e 7 da spec do pré-lançamento: entregues na L2 (`pre-lancamento-l2.md:3`). O único resíduo, o aviso sem destino, entra no CA63. A seção 9 é o CA55 mais o CA56.

## Esquema e contratos
**API**
- `GET /trampos/meus?limite&antesDeCriadoEm&antesDeId`:
  - `limite` é inteiro de 1 a 50, com padrão 20, e é lido como na busca (`A/src/modulos/busca/adaptadores/http/rotas.ts:85-90`);
  - os dois `antesDe*` vêm juntos ou nenhum. `antesDeCriadoEm` é ISO 8601 em UTC, e `antesDeId`, um uuid. Fora disso, 400 `dados_invalidos` com o campo;
  - a resposta continua sendo o array de `TRAMPO_PUBLICO` na visão do autor, em `criado_em desc, id desc`, com `(criado_em, id) < cursor`;
  - sem parâmetros, vem a primeira página. Isso quebra builds antigos do app, mas ainda não há usuários (premissa).
- Porta: `listarDoAutor(autorId, pagina: { limite: number; antesDe?: CursorDeBusca })`, com o tipo que já existe em `A/src/modulos/trampos/dominio/portas.ts:6`.
- Volume de referência da medida (etapa 12): uma conta com 200 conversas e 100 000 mensagens, 5 000 trampos com 20 000 candidaturas recebidas, 2 000 candidaturas feitas e 1 000 serviços. O teste é gerado com `generate_series` e só roda com `TRAMPOJA_MEDIR=1`.

**App**
- `M/componentes/utilitarios.ts`: `contarPontosDeCodigo(t)` e `cortarEmPontosDeCodigo(t, limite)`.
- `CampoDeTexto` e `Seletor` ganham `limite?: number`. Com ele, o componente corta, mostra "n de limite" e anuncia o limite atingido; `maxLength` fica só para campos ASCII (senha, valor, prazo).
- `M/telas/base.tsx`: `<FocarPrimeiroErro campos tentativa />`, montado dentro de `Formulario`/`Rolavel`, como o `RolarAoTopo`.
- `telas/tipos.ts`:
  - `PropsDoEditarPerfil.carregamento?: { situacao: 'carregando'|'erro'|'pronta'; onTentarDeNovo }`;
  - `PropsDosMeusAnuncios.carregarMais?: { carregando; erro?: string; onCarregarMais }`;
  - `PropsDoInicio` e `PropsDaBusca` ganham `toast?` e `onFecharToast?`.
- `M/estado/consultas/anuncios.ts`: `useMeusTrampos()` passa a infinita. Devolve `trampos` (achatado, o mesmo campo de hoje), `recarregar`, `temMais`, `carregandoMais`, `erroAoCarregarMais` e `carregarMais()`. `M/api/trampos.ts`: `listarMeusTrampos(c, {limite?, antesDe?})`.
- `M/estado/rodape-do-trampo.ts`: a entrada troca `meusTrampos` por `souAutor: boolean` (`trampo.versao !== undefined`).
- `M/estado/acoes-do-anuncio.ts`: `useAcoesDoAnuncio({ …, anuncioAtual?: (aberto: AnuncioDaFolha) => AnuncioDaFolha | null })`. A cada render, a folha usa `anuncioAtual(aberto) ?? aberto`.
- `M/estado/consultas/conversas.ts`: `JANELA_DE_RELEITURA_MS`, `substituirCauda(atuais, cursorId, novas)` e `conferirDesde(cliente, conversaId, ancora)`. `useMensagens` expõe `conferirDesde(ancora)`.

## Etapas
- **Base de verificação:**
  - API: `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api exec vitest run <arquivos>`. Integração de um arquivo: `pnpm --filter api exec vitest run --config vitest.integracao.config.ts <arquivo>`, com `docker compose up -d banco` e `pnpm --filter api migrar -- --teste`.
  - App: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile exec jest <arquivos>`.
- **Grupos:** cada grupo tem no máximo uma etapa de integração (1, 2 e 4). Etapas marcadas com "spec" esperam `docs/produto/specs/pre-lancamento-l4.md`.

| # | Etapa | Arquivos | Verificação | Resp. | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 1 | Retirar sob `alterarSobTrava`. BDD: retirar não relê; candidatura aceita dá 409 `candidatura_nao_pendente`; trampo excluído dá 404. Integração: 20 candidaturas concorrentes e uma retirada no meio sempre dão 204, sem órfã nem candidatura de volta | `A/src/modulos/trampos/aplicacao/{casos-de-uso,trampos.bdd.test}.ts`, `A/src/modulos/trampos/adaptadores/postgres/repositorio-postgres.integracao.test.ts` | base API + `vitest run src/modulos/trampos` + integração do repositório | dev | A | **sim** (concorrência) | 65 |
| 2 | S5: mapa `emEspera` (id → instante) no fechamento de `criarCasosDeUsoDeContas`, com `ESPERA_APOS_FALHA_MS = 6 h`. A rodada pede `LAPIDES_POR_RODADA + emEspera.size`, pula as em espera, tira do mapa a que deu certo e limpa as vencidas. BDD: 100 lápides que sempre falham não impedem a 101ª; a que falhou volta depois de 6 h de relógio; o erro continua só com o código | `A/src/modulos/contas/aplicacao/{casos-de-uso,contas.bdd.test}.ts` | base API + `vitest run src/modulos/contas` | dev | A | **sim** (exclusão, dado pessoal) | 67 |
| 3 | URL: a regra passa a recusar `@` e host vazio (`^https?://[^\s/?#@:]+(:\d{1,5})?(/[^\s?#]*)?$`) nos dois arquivos. Testes: userinfo, `:3000`, `https://h:99999`; as duas regras concordam | `M/api/config.ts`, `apps/mobile/app.config.ts`, `M/testes/app-config.test.ts` | base app + `jest src/testes/app-config src/api` | dev | A | **sim** (transporte) | 68 |
| 4 | Mutações offline: `networkMode: 'always'` em `useMutacaoDeSessao` e `useSalvarPerfil`. Testes: offline, falha na hora com `ErroDeRede`; nada roda ao voltar a rede; `variables` some (`gcTime`) | `M/estado/consultas/{conta,perfil}.ts`, `M/estado/consultas/{conta,consultas}.test.tsx` | base app + `jest src/estado/consultas/conta src/estado/consultas/consultas` | dev | A | **sim** (senha) | 58 |
| 5 | Conversas no estado: janela de 60 s, `substituirCauda` e `conferirDesde`. Testes: a mensagem atrasada entra antes da mais nova sem duplicar; continua 1 GET por ciclo com menos de 50; o teto de 500 se mantém; `conferirDesde` pagina a partir da âncora, não toca o cache e devolve `null` em falha | `M/estado/consultas/{conversas.ts,conversas.test.tsx}` | base app + `jest src/estado/consultas/conversas` | dev | A | **sim** (polling, texto de terceiros) | 59, 60 |
| 6 | Folha viva (R8): `anuncioAtual` em `useAcoesDoAnuncio`. Testes: depois de trocar o anúncio vivo para `em_andamento`, a folha aberta mostra "Excluir" indisponível com o motivo; sem `anuncioAtual`, vale o de hoje | `M/estado/{acoes-do-anuncio,acoes-do-anuncio.test}.ts` | base app + `jest src/estado/acoes-do-anuncio` | dev | A | não | 61 |
| 7 | Textos e props (spec): anúncio de limite, carregando e erro do perfil, "Carregar mais" de Meus anúncios, os tipos acima | `M/textos/pt-BR.ts`, `M/telas/tipos.ts` | base app + `jest src/textos src/telas` | designer | A | não | 55, 57, 63, 66 |
| 8 | Paginação de `/trampos/meus` na API: porta, memória, Postgres, caso de uso e rota com `querystring` fechada. Testes de rota: 400 para cursor pela metade, `limite` 0 e 51, chave extra; terceiro nunca vê os trampos de outro. Integração: 45 trampos em 3 páginas, sem repetir nem pular, inclusive no mesmo milissegundo | `A/src/modulos/trampos/{dominio/portas.ts,aplicacao/{casos-de-uso.ts,trampos.bdd.test.ts}}`, `.../adaptadores/{memoria/repositorio-memoria.ts,postgres/{repositorio-postgres,repositorio-postgres.integracao.test}.ts,http/{rotas,rotas.test}.ts}` | base API + `vitest run src/modulos/trampos` + integração do repositório | dev | B | **sim** (autorização, entrada) | 66 |
| 9 | `useMeusTrampos` infinita e `listarMeusTrampos` com cursor. Testes: a página 2 leva `antesDeCriadoEm`/`antesDeId` do último item; `temMais` fica falso com menos de 20; a invalidação recarrega as páginas carregadas | `M/api/trampos.ts`, `M/api/anuncios-e-candidaturas.test.ts`, `M/estado/consultas/{anuncios.ts,anuncios-e-candidaturas.test.tsx}` | base app + `jest src/api src/estado/consultas/anuncios-e-candidaturas` | dev | B | não | 66 |
| 10 | Rota da conversa: "Tentar de novo" usa `conferirDesde` quando a âncora saiu do cache (regra em "Decisão"). Testes: com 600 mensagens do outro e a minha no meio, nenhum POST; sem a minha, um POST; com a conferência falhando, continua "Não enviada" | `M/app/(app)/conversas/[id].tsx`, `M/testes/rotas/conversa.test.tsx` | base app + `jest src/testes/rotas/conversa` | dev | B | **sim** (envio, D21) | 60 |
| 11 | Componentes (spec): `contarPontosDeCodigo`, `cortarEmPontosDeCodigo`, `limite` em `CampoDeTexto` e `Seletor`, `FaixaSemConexao` com a margem de cima e `<FocarPrimeiroErro>` em `base.tsx`. Testes: emoji, bandeira, família e "e"+U+0301 no corte e no contador; anúncio ao atingir o limite; foco e rolagem dentro do provider | `M/componentes/{CampoDeTexto.tsx,Seletor.tsx,FaixaSemConexao.tsx,utilitarios.ts,componentes.test.tsx}`, `M/telas/base.tsx`, `M/telas/foco-no-erro.test.tsx` | base app + `jest src/componentes src/telas/foco-no-erro` | designer | B | não | 55, 56, 62 |
| 12 | Medida da exclusão no volume de referência: o tempo do `POST /contas/eu/exclusao` e de cada `excluirDadosDaConta`, com `it.skipIf(!process.env.TRAMPOJA_MEDIR)`. O resultado vai para o relatório do dev | `A/test/medidas/exclusao-grande.integracao.test.ts` | `TRAMPOJA_MEDIR=1 pnpm --filter api exec vitest run --config vitest.integracao.config.ts test/medidas/exclusao-grande.integracao.test.ts` | dev | C | **sim** (dado fictício, exclusão) | 69 |
| 13 | Telas da `telas.test.tsx` (spec): `limite` e `<FocarPrimeiroErro>` em Cadastro, Entrar e EditarPerfil; `carregamento` em EditarPerfil; `limite` e toast em Buscar e Início | `M/telas/{Cadastro,Entrar,EditarPerfil,Buscar,Inicio}.tsx`, `M/telas/telas.test.tsx` | base app + `jest src/telas/telas` | designer | C | não | 55, 57, 62, 63 |
| 14 | Demais telas (spec): `limite` e `<FocarPrimeiroErro>` em FormularioDeAnuncio, ExcluirConta e ExportarDados; `limite` em RodapeDoTrampo e no campo da Conversa; "Carregar mais" em MeusAnuncios | `M/telas/{FormularioDeAnuncio,ExcluirConta,ExportarDados,RodapeDoTrampo,Conversa,MeusAnuncios}.tsx`, `M/telas/{publicacao,editar-anuncio,conta-e-privacidade,candidaturas,retirar-candidatura,conversas,acoes-do-anuncio,encerrado}.test.tsx` | base app + `jest src/telas` | designer | C | não | 55, 62, 66 |
| 15 | Anúncios nas rotas: em `trampos/[id]`, o autor vem de `souAutor` (sai o `useMeusTrampos`), o `anuncioAtual` e o 409 do rodapé chamam `onRecarregarTrampo`; em `servicos/[id]` e `meus-anuncios`, o `anuncioAtual`; Meus anúncios com "Carregar mais"; `rodape-do-trampo` com `souAutor`. Os fakes de autor ganham `versao` no `GET /trampos/:id`. Testes: trampo da página 2 aberto pelo autor mostra "Mais opções"; R8 por rota; selo depois do 409 | `M/app/(app)/{meus-anuncios.tsx,trampos/[id].tsx,servicos/[id].tsx}`, `M/estado/{rodape-do-trampo,rodape-do-trampo.test}.ts`, os arquivos de `rg -l 'trampos/meus' apps/mobile/src/testes` (15 hoje) | base app + `pnpm --filter mobile test` | dev | D | não | 61, 64, 66 |
| 16 | Editar perfil e aviso nas abas: `carregamento` a partir de `useMeuPerfil` (pronta só com `isSuccess`); Início e Busca consomem `useAvisoDeRetorno`. Testes: perfil lento mostra o carregando e nada é salvo; erro com "Tentar de novo"; excluir pelo detalhe aberto da Busca mostra o toast na Busca | `M/app/(app)/perfil/editar.tsx`, `M/app/(app)/(abas)/{index,buscar}.tsx`, `M/testes/rotas/{editar-perfil-l4,aviso-de-retorno}.test.tsx`, `M/testes/rotas/detalhes-e-perfil.test.tsx` | base app + `jest src/testes/rotas/editar-perfil-l4 src/testes/rotas/aviso-de-retorno src/testes/rotas/detalhes-e-perfil` | dev | D | não | 57, 63 |
| 17 | Faixa na raiz (spec): `NavegacaoRaiz` desenha a faixa e zera o `top` do contexto do `Stack` enquanto ela aparece; saem as faixas de `base.tsx`, `Buscar.tsx` e `Conversa.tsx` (a prop `semConexao` continua para desabilitar ações). Testes: uma faixa só, com e sem sessão; some ao reconectar; nenhuma tela a desenha | `M/app/_layout.tsx`, `M/telas/{base,Buscar,Conversa}.tsx`, `M/telas/{telas,conversas}.test.tsx`, os arquivos de `rg -l semConexaoFaixa apps/mobile/src/testes`, `M/testes/rotas/faixa-sem-conexao.test.tsx` | base app + `pnpm --filter mobile test` | dev | E | não | 56 |
| 18 | Docs e roteiro manual: README (paginação, retirar sob trava, faixa, limite por ponto de código, resultado da medida); roteiro no aparelho com TalkBack e VoiceOver ("Nova mensagem de…"), gesto de voltar no iPhone com alterações, faixa e entalhe, `Paths.document` no Expo Go e colar emoji no limite | `README.md` | `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter mobile build`; o roteiro, à mão | dev (README); lead e dono (roteiro) | F | não | 69, 70 |

**Ordem:** A (1–7) → B (8–11) → C (12–14) → D (15–16) → E (17) → F (18).
- **Dependências:**
  - a 8 depende da 1, porque as duas mexem em `casos-de-uso.ts` e `trampos.bdd.test.ts`;
  - a 9 usa o contrato da 8, mas testa com o fake;
  - a 10 depende da 5;
  - a 11 depende da 7, e a 13 e a 14, da 7 e da 11;
  - a 15 depende da 6, 8, 9 e 14; a 16, da 4 e da 13; a 17, da 11, 13 e 14.
- **Arquivos repetidos:** só em grupos diferentes. `telas/base.tsx`: 11 e 17. `Buscar.tsx` e `telas.test.tsx`: 13 e 17. `Conversa.tsx` e `conversas.test.tsx`: 14 e 17. `trampos/[id].tsx`: só a 15. `detalhes-e-perfil.test.tsx`: 16 e, se o `rg` da 17 o listar, 17.
- **Testes do qa** (`M/testes/qa/*`): a 15 e a 17 ajustam fakes de lá. É desvio registrado no relatório, com o qa parado nesses grupos.
- **Docs:** o lead registra a D45 à D50 em `docs/produto/decisoes.md` e troca o texto do ADR-006 no `CLAUDE.md` (ver "Texto para o CLAUDE.md").

## Coordenação com a spec
| Etapa | Depende da spec? | O que a spec decide |
|---|---|---|
| 7, 11 | sim | Texto e forma do anúncio de limite; aparência da faixa no topo com a margem segura; nada muda em `tokens.ts` |
| 13 | sim | Carregando e erro do Editar perfil (sugestão: `Carregando` e `ErroDoBloco`, como na edição de anúncio); posição do toast em Início e Busca |
| 14 | sim | "Carregar mais" em Meus anúncios, no padrão da Busca (`telas/tipos.ts:158`) |
| 17 | sim | Faixa acima do cabeçalho, sem animação com "reduzir movimento" |
| 1–6, 8–10, 12, 15, 16, 18 | não | — |

Avisar o designer já:
- o corte (D45) vence a preferência da seção 9;
- a faixa fica na raiz, e quem a desenha é o dev (etapa 17); o designer só ajusta o componente (11);
- a regra de exibição fica fora das telas (fronteira D15).

## Pontos para o seguranca
- **Retirar (1):** a trava é a mesma de encerrar e excluir, na mesma ordem (trampo, depois candidaturas), então não abre deadlock com a exclusão de conta. Retirar e candidatar de novo continua gastando `publicacao`.
- **Paginação (8):** só `autor_id` da sessão; o cursor não revela nada além do que a própria página já trouxe; querystring fechada (400 antes do limite por conta); `limite` máximo de 50; fica no grupo `leitura`.
- **D46:** o papel no app é só exibição. Editar, encerrar e excluir continuam com 404 para quem não é autor.
- **S5 (2):** a lápide em espera não é esquecida e volta depois de 6 h. A espera vive na memória do processo: reiniciar repete a tentativa, sem perda. O log continua só com o código.
- **URL (3):** userinfo embutido no bundle seria segredo no APK; a recusa vale no build e em runtime.
- **Offline (4):** a senha deixa de ficar em `variables` de uma mutação pausada esperando a rede.
- **Conversa (5, 10):** `conferirDesde` lê texto de terceiros só em memória local e não grava no cache. A janela não muda o número de GETs por minuto (D20). A conferência é de no máximo 20 páginas, e só por toque.
- **Medida (12):** só dado fictício no banco de teste, e só com a variável ligada.

## Riscos e como reverter
- **Sem migração.** Cada etapa reverte pelo git.
- **Paginação:** a API sem parâmetros passa a devolver 20. Um build antigo do app veria só os 20 primeiros, mas não há usuários. Para reverter, `limite` ausente volta a listar tudo.
- **D46 nos testes:** muitos fakes derivam o autor da lista. A etapa 15 roda a suíte inteira. Se o número de arquivos passar de 20, o dev para e relata.
- **Janela do R2:** supõe relógios das réplicas da API com menos de cerca de 45 s de diferença. Para voltar ao cursor antigo, basta `JANELA_DE_RELEITURA_MS = 0`.
- **Faixa:** não verificados no aparelho o `SafeAreaInsetsContext` com `top: 0` e o entalhe; o roteiro da 18 confere. Plano B: a faixa desce para baixo do cabeçalho via contexto lido pelo `Cabecalho`.
- **Medida:** se a exclusão de referência passar de 5 s, vale a D50 (pergunta abaixo). A falta de índice em `autor_id` pode aparecer aí.
- **Tamanho:** são 18 etapas. Se o dono quiser uma L4 menor, o corte natural é **L4a** (tudo menos 8, 9 e o trecho de paginação da 15) e **L4b** (paginação e D46).

## Perguntas em aberto e premissas adotadas
**Para o dono (recomendação em cada uma):**
- **D45, limite do campo:** cortar no limite por ponto de código e anunciar, como no escopo do D32. A alternativa é não cortar e mostrar erro (preferência da spec). *Recomendo cortar.*
- **D46, autor pelo detalhe:** o app reconhece o autor pela visão do autor no `GET /trampos/:id`, não mais pela lista "meus" (revê a D19 só para o trampo). *Recomendo*, porque é condição da paginação.
- **D47, paginação de `/trampos/meus`:** 20 por página, até 50, cursor `(criadoEm, id)`, e sem parâmetros vem a primeira página. *Recomendo.* Se preferir uma L4 menor, este é o item a adiar.
- **D48, R2 no app:** releitura de 60 s, sem mudar a API. A alternativa é a trava por conversa na API. *Recomendo o app.*
- **D49, retirar sob trava:** retirar passa à trava pessimista, como encerrar e excluir (fecha a rajada de mais de 10). *Recomendo.*
- **D50, condicional:** se a etapa 12 medir mais de 5 s, a transação da exclusão (e a releitura da lápide) ganha `set local statement_timeout = '60s'`, exceção à D42 só ali. *Recomendo aprovar agora.* O lead acrescenta a etapa só se a medida pedir.

**R10 da 2c:** resolvido pelo lead. É a duplicata em conversa longa, coberta pelo CA60.

**Premissas:**
- não há usuários reais, então a mudança de contrato de `/trampos/meus` é aceitável;
- "envio pausado offline em conversas" é, de fato, o de entrar, cadastrar e salvar perfil (Contexto);
- o placeholder `[E-MAIL DE CONTATO]` e os riscos da L3 para o dono aceitar não são código e ficam fora.

## ADR
**ADR-008: listas "minhas" paginadas e autor pela visão do autor** (proposto)
- **Contexto:** o ADR-003 deriva o papel das listas "minhas" completas, e `/trampos/meus` cresce sem teto.
- **Decisão:** `/trampos/meus` pagina por `(criadoEm, id)`. No detalhe do trampo, o autor é reconhecido pela visão do autor (D33), e a lista serve só à tela Meus anúncios.
- **Consequências:**
  - um GET a menos por detalhe;
  - `/servicos/meus` e `/candidaturas/minhas` seguem completas até o mesmo gatilho;
  - fake de teste de autor precisa de `versao`.

## Texto para o CLAUDE.md
Em "Concorrência em anúncios", trocar "Encerrar e excluir travam o trampo (`for update`, sem versão) e nunca respondem `conflito_de_versao`; retirar relê e reaplica a regra no servidor." por "Encerrar, excluir e retirar travam o trampo (`for update`, sem versão) e nunca respondem `conflito_de_versao`."

## Roteiro manual da L4
Etapa 18, CA70. Feito no aparelho pelo lead e pelo dono, com a API local (`semear` + `dev`) e o Expo Go (SDK 57), exceto o item 7, que roda na máquina de desenvolvimento. O aparelho e o sistema entram na coluna "Resultado", junto com o veredito (passou, falhou, não aplicável) e uma linha do que foi visto. Item que falha vira achado antes do release. Só dado fictício.

| # | Item | Passos | Resultado esperado | Resultado |
|---|---|---|---|---|
| 1 | TalkBack (Android) e VoiceOver (iPhone): "Nova mensagem de…" | Entre com `ana.empregadora@exemplo.test` num aparelho e com `bruno.freela@exemplo.test` em outro (ou no mesmo, trocando de conta), abra a mesma conversa nos dois, ligue o leitor de tela no que recebe e mande uma mensagem do outro | O leitor fala "Nova mensagem de <nome>" na chegada, sem ter de tocar na tela, uma vez por mensagem nova (a minha não anuncia). No iPhone, o anúncio sai uma vez só, sem repetir | |
| 2 | Gesto de voltar no iPhone com alterações | Em Editar trampo (e depois Editar serviço), mude o título e faça o gesto de voltar pela borda da tela. Repita com o botão "Voltar" da tela. Repita sem alterar nada | Com alteração, o gesto e o botão mostram "Descartar alterações?" e a tela não sai; "Descartar" volta e "Continuar editando" fica. Sem alteração, o gesto volta direto | |
| 3 | Faixa "sem conexão", com entalhe e fonte a 200% | Em aparelho com entalhe ou recorte de câmera (iPhone e, se houver, Android), ponha o tamanho da fonte do sistema no máximo (200% no Android) e ligue o modo avião, com e sem sessão (tela de entrada e Início). Navegue por Buscar, uma conversa e um formulário. Desligue o modo avião | Uma faixa só, no topo, abaixo do entalhe e sem cobrir o cabeçalho nem duplicar o espaço de cima; o texto quebra em até duas linhas, sem corte. A mesma faixa permanece ao trocar de tela. Ao voltar a rede, ela some e o leitor de tela fala "Conexão de volta." Plano B do plano se o entalhe cobrir o cabeçalho | |
| 4 | `Paths.document` no Expo Go (marcador de instalação) | Entre na conta, feche o app por completo (tire do multitarefa) e abra de novo no Expo Go. Depois reabra mais uma vez | O app abre ainda com sessão nas duas reaberturas (o marcador `trampoja.instalacao` foi criado na primeira execução e é achado nas seguintes), sem erro na tela. Se cair no login a cada abertura, `Paths.document` não persiste no Expo Go: registre e leve ao lead | |
| 5 | Colar emoji no limite de um campo | No título do trampo (limite de 80 caracteres), cole um texto de 79 letras mais um emoji, depois 78 letras mais uma bandeira e uma família. Repita na mensagem da conversa e no nome do perfil | O contador mostra "n de limite" por ponto de código (um emoji conta 1) e chega ao limite sem cortar antes. O que passa do limite é cortado, e o leitor de tela fala "Limite de n caracteres atingido." ou "O texto passou de n caracteres e foi cortado.". Nada de caractere quebrado (losango) no fim do texto, exceto a família ou o acento composto partidos no corte (limitação conhecida, por ponto de código) | |
| 6 | "Carregar mais" anunciando os itens novos | Com uma conta de 21 trampos ou mais (publique, ou insira por SQL no banco de desenvolvimento), abra Meus anúncios com o leitor de tela ligado, vá ao fim da lista e ative "Carregar mais". Repita com o modo avião ligado | A lista cresce, o leitor fala "k trampos a mais carregados." e o foco vai ao primeiro item novo, não ao botão. Com 20 ou menos itens o botão não aparece. Sem rede, o botão fica desabilitado com "Sem conexão. Conecte-se para carregar mais." | |
| 7 | Testes de bundle do build de produção | Na raiz: `TRAMPOJA_QA_BUILD=1 pnpm --filter mobile exec jest --maxWorkers=2 src/testes/qa/build-producao-l3.test.ts`. Apague `apps/mobile/dist` depois | Todos os testes do arquivo passam (nenhum pulado) e o `dist/` não fica no diretório | |
