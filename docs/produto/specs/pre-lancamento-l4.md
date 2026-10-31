# Especificação de UI/UX: L4, qualidade (pré-lançamento)

Plano técnico em paralelo: `docs/produto/planos/pre-lancamento-l4.md` (arquiteto; não lido ao escrever). Base: `docs/produto/specs/pre-lancamento-lojas.md` (seções 6, 7 e 9), corte D32 em `docs/produto/decisoes.md`.
Verificação visual: **não verificado visualmente** (spec, sem código). Medidas conferidas só no código de `componentes/` e `telas/` no commit `11a2695`.
Sem tela nova, sem token novo, sem pacote novo. `expo-status-bar` já está em `package.json` (uso opcional, item 2.1).

## Objetivo e usuário

Mesmas pessoas do MVP (celular, pressa, conexão instável). A L4 tira da interface os cantos que ainda enganam: texto cortado sem aviso, faixa de rede repetida em cada tela, mensagem "enviada" que não foi, lista que só mostra parte, tela de perfil que abre vazia e depois se preenche, folha e selo que mostram dado velho. Princípio: a tela nunca mostra como verdade um dado que a app já sabe estar velho, e toda limitação (corte, histórico parcial, sem rede) é dita em texto.

## Pontos que precisam de decisão do lead (leia primeiro)

- **R10 da 2c:** não achei nenhum "R10" descrito nas memórias de `revisor` e `qa` nem em `mvp-trampo-ja-app-2c.md`. O único R10 do repositório é o comentário em `telas/base.tsx:287` (foco do leitor de tela em `View`/`Pressable`), que o código já trata com `isFocused`. Tratei como resolvido. Se o R10 era outro achado, envie o texto e eu complemento.
- **D9 a D11, D14 e D17 a D19:** em `decisoes.md` são decisões do **dono**, não sugestões minhas (minha memória está vazia). Situação: D9 (perfil completo), D10 (LGPD) e D11 (entregas) estão cumpridas; D17 (corte 2b/2c) e D19 (sem mudança na API) não têm interface pendente; **D14** (fonte do sistema e Ionicons) segue à espera da fonte do protótipo, fora da L4; **D18** (prazo digitado em `dd/mm/aaaa`) segue, e o seletor nativo exigiria dependência nova: não entra. Nenhuma entra na L4.
- **Texto da faixa:** hoje "Sem conexão. Mostrando o que já foi carregado." Na raiz ela aparece também em Entrar, Cadastro e formulários, onde não há nada carregado. Proponho o texto da seção 2 (troca os testes que citam o texto atual).
- **Envio com rede caindo (conversa):** a spec cobre o comportamento atual (falha na hora, reenvio manual, D21). Se o plano adotar mutação pausada, vale a nota condicional da seção 3.1.

## O que sobrou das seções 6, 7 e 9 da spec da L1

| Seção | Situação |
|---|---|
| 6 (editar, encerrar, excluir) e 7 (retirar candidatura) | Entregues na L2. Resta só o que a L2 deixou: R8 (3.4), selo (3.5) e aviso sem destino (3.6). |
| 9, faixa na raiz | Falta: seção 2. |
| 9, contador por ponto de código | Falta: seção 1. A spec antiga propunha erro ao passar do limite; aqui escolho **cortar** (a pessoa já conhece o comportamento do `maxLength`) e dizer que cortou. |
| 4, índice "Nesta página" (documento com 6 ou mais seções) | Falta (comentário "Pendência da L4" em `DocumentoLegal.tsx`). Os dois documentos têm 11 seções: entra (seção 5). |
| 3, "Ainda gerando…" após 10 s | Falta: entra (seção 5). |
| 4, "Voltar ao topo" | Era sugestão. Fica fora. |

## 1. `CampoDeTexto`: contador e corte por ponto de código

**Regra:** conta e corta em **pontos de código** (`Array.from`), o mesmo critério da API e de `estado/validacao.ts` (`tamanhoDe`). `maxLength` do React Native conta UTF-16 e corta cedo demais com emoji. O campo deixa de usar `maxLength` nos campos de texto livre; fica `maxLength` só nos campos ASCII com máscara (valor, prazo, e-mail), onde UTF-16 e ponto de código coincidem.

**API do componente (substitui `maxLength` e `contador: string` nos campos de texto):**
- `limite?: number`: liga contagem e corte.
- `contador?: 'perto' | 'sempre' | 'nunca'` (padrão `'perto'`).
- Corte no `onChangeText`: se passar do limite, entrega ao pai o texto cortado no limite. Se o corte deixar um ZWJ (U+200D) sobrando no fim, remove o ZWJ. Se o corte ocorreu, marca "texto cortado" até a próxima digitação.
- Utilidades puras em `componentes/utilitarios.ts`: `contarCaracteres`, `cortarEmCaracteres`. Hook `useLimiteDeCaracteres(valor, limite, onChangeText)` e componente `ContadorDeCaracteres` exportados de `componentes/` para o campo de mensagem da conversa (hoje um `TextInput` à parte com contador próprio) usar o mesmo comportamento.

**Quando aparece** (`'perto'`): a partir de 80% do limite. `'sempre'` para os campos de texto longo em que a pessoa precisa saber a folga: **Sobre você** (300) e **Descrição** do anúncio (2000). `'nunca'` para senha (128) e campos de filtro. Hoje o título do anúncio e a mensagem mostram contador sempre; passam a `'perto'`.

**Campos que adotam `limite`:** nome (80), cidade (80, também a do filtro da Buscar), título (80), descrição do anúncio (2000), mensagem da candidatura (2000), mensagem da conversa (2000), sobre você (300, hoje sem corte: passa do limite e só falha ao salvar), habilidade (30, hoje sem corte), senha (128, `'nunca'`).

**Estados do contador** (sempre abaixo do campo, à direita, legenda 13; área do erro e da ajuda não muda):

| Faixa | Aparência | Texto |
|---|---|---|
| Abaixo de 80% (`perto`) | oculto | |
| 80% a 89% | `textoSecundario` | "{n} de {limite} caracteres" |
| 90% a 99% | `texto`, peso `medio`, sem ícone | "{n} de {limite} caracteres. Faltam {x}." |
| 100% | `texto`, peso `semibold`, ícone `information-circle` (14) | "Limite de {limite} caracteres atingido." |
| Colou e cortou | igual ao 100%, até a próxima digitação | "O texto passou de {limite} caracteres e foi cortado." |

Não usa a cor de erro: chegar ao limite não é erro, e o corte já impede o excesso. Cor nunca é o único sinal (muda o texto e o peso). Contraste: `texto` e `textoSecundario` sobre `fundo`/`superficie` já passam em AA (ver `tokens.test.ts`). O erro de validação (`erro`) segue separado, acima do contador.

**Leitor de tela:** o texto do contador é um `Text` comum (lido quando a pessoa chega nele), **sem** `accessibilityLiveRegion`, para não repetir a cada letra. Um anúncio à parte (região invisível, como em `Conversa`) fala **uma vez por mudança de faixa**: ao entrar nos 90% ("Faltam {x} caracteres."), ao chegar ao limite ("Limite de {limite} caracteres atingido.") e no corte por colagem. Volta a falar se a pessoa apagar e cruzar a faixa de novo. No iOS, `announceForAccessibility` (a `liveRegion` só vale no Android); remonta o `Text` com `key` para falar duas vezes seguidas o mesmo texto.

**Conteúdo longo e inesperado:** colar 5000 caracteres corta em 2000 e diz que cortou; emoji, bandeira (2 pontos de código) e família com ZWJ contam como pontos de código, não como "uma letra" (o contador mostra o que a API vai contar). Texto em NFD (acento solto) conta mais pontos que em NFC: ver pergunta 1.

## 2. `FaixaSemConexao` na raiz

**Onde:** no `NavegacaoRaiz` (`app/_layout.tsx`, contêiner do dev), ao redor do `<Stack>`. Substitui as renderizações em `telas/base.tsx` (`Rolavel` e `Formulario`), `Buscar.tsx` e `Conversa.tsx`. A prop `semConexao` continua nas telas só para desabilitar ações e mostrar `Motivo`.

**Layout:**
- Coluna: faixa no topo, `Stack` logo abaixo com `flex: 1`. A faixa **empurra** o conteúdo, nunca o cobre; a barra de abas, embaixo, não muda.
- Fundo `cores.texto` com texto `branco`, como hoje (contraste maior que 15:1), ícone `cloud-offline-outline`.
- Ocupa a área segura do topo: `paddingTop = margens.top + espaco[2]`. Enquanto a faixa está visível, o componente fornece às telas `SafeAreaInsetsContext` com `top: 0`, senão o `Cabecalho` somaria a margem de novo (`Cabecalho.tsx:29` usa `margens.top`). Quando a faixa some, o contexto volta ao normal.
- Linha de até 2 linhas em 320 px e com fonte a 200%; sem altura fixa.
- Cobre também as telas públicas (Entrada, Entrar, Cadastro). Não aparece enquanto a sessão carrega (a splash cobre).
- `Modal` (folha e diálogo) cobre a faixa: nesses casos a ação desabilitada já mostra `Motivo` dentro da folha. Não repetir a faixa dentro do `Modal`.
- Barra de status: com a faixa visível, ícones claros (`expo-status-bar`, `style="light"`); sem a faixa, o padrão atual. Se o dev preferir não usar o pacote, omitir e avisar (ícones escuros sobre fundo escuro).

**Comportamento:** aparece sem animação (nada a reduzir). Some ao voltar a rede. O cabeçalho das telas desloca pela altura da faixa ao entrar e sair; aceitável.

**Anúncio:** `role="alert"` e `liveRegion` polite continuam, mais `announceForAccessibility` no iOS **uma vez por mudança de estado**, não por tela (hoje cada tela monta a sua e fala de novo). Ao voltar a rede, fala "Conexão de volta." (a faixa some em silêncio hoje). Não rouba o foco.

**Texto novo** (`gerais.semConexaoFaixa`): "Sem conexão. Ações que precisam de internet ficam indisponíveis." Novo `gerais.conexaoDeVolta`: "Conexão de volta."

## 3. Conversas, anúncios e selo

### 3.1 Envio sem conexão (conversa)

O envio falha na hora sem rede (`networkMode: 'always'`) e a bolha vira "Não enviada". Hoje o toque em "Não enviada" sem rede só falha de novo, e o campo explica a falta de rede com um `Text` solto. Muda:
- **Campo:** continua editável, rascunho mantido, **Enviar desabilitado**, e o aviso passa a usar `Motivo` (mesmo componente dos demais botões desabilitados), logo abaixo do campo. Texto atual `conversas.semConexaoNoCampo` mantido.
- **Bolha "Não enviada" com a rede fora:** nova prop `semConexao` em `BolhaDeMensagem`. Fica **não tocável** (`accessibilityState.disabled`, sem `onPress`), com o texto "Não enviada. Sem conexão: conecte-se para tentar de novo." Ao voltar a rede, a bolha troca para o texto tocável atual ("Toque para tentar de novo"), sem reenvio automático (D21: reenviar sozinho aumenta a chance de duplicata). O rótulo falado muda junto.
- **Se o plano adotar mutação pausada** (envio espera a rede e sai sozinho): nova situação `aguardando` na bolha, ícone `cloud-offline-outline`, texto "Aguardando conexão", rótulo falado "Aguardando conexão", não tocável; vira `enviando` e `enviada` quando sair. Só se o arquiteto decidir pausar; caso contrário, não implementar.

### 3.2 Conversa com mais de 500 mensagens

O cache guarda as últimas 500. Quem abre uma conversa maior vê o início cortado sem saber.
- No topo da lista, `ListHeaderComponent` com `Text` legenda 13 `textoSecundario`: "Mostrando as últimas {n} mensagens. As anteriores não aparecem neste aparelho." Prop nova `historicoCortado?: number` (o `n`); ausente = não mostra. Não é `Aviso` (não é erro nem exige ação).
- **Duplicata** (a mensagem que chegou depois de sair do teto e foi reenviada): é problema de dado; a tela não mostra duas chaves iguais (chave estável por id). Sem texto novo.
- Se a API ganhar `antesDe` no plano: botão secundário "Ver mensagens anteriores" no lugar do texto, com `carregando`, erro inline e foco no primeiro item novo (mesma regra da seção 4). Condicional ao plano.

### 3.3 R10 da 2c

Ver "Pontos que precisam de decisão".

### 3.4 Folha "Mais opções" depois do 409 (R8)

`FolhaDeAcoesDoAnuncio` já é apresentacional por props; o defeito é o contêiner guardar o anúncio da abertura. A tela passa a receber sempre o dado vivo. Comportamento visível:
- Depois de um 409 (`trampo_nao_aberto`, `conflito_de_versao`, `trampo_nao_editavel`), o diálogo de confirmação fecha (já faz) e a **folha continua aberta** com as ações recalculadas (ex.: "Excluir" desabilitado com o motivo "Só trampo aberto pode ser excluído.").
- `Aviso` de erro no topo da folha (já existe a prop `erro`) com texto novo: "Este anúncio mudou enquanto você olhava. Atualizamos as opções."; `role="alert"`, e o foco do leitor vai a ele.
- Prop nova `atualizando?: boolean`: enquanto o dado recarrega, as três ações ficam desabilitadas e um `Motivo` diz "Atualizando as opções…". Evita o toque em ação velha.
- Se a releitura mostrar que o anúncio sumiu (404): a folha fecha e o toast é "Este anúncio já não existe." (texto existente `anuncio.jaNaoExiste`).

### 3.5 Selo do trampo depois do 409 no rodapé

Ao retirar candidatura e receber 409 `candidatura_nao_pendente` (a candidatura foi aceita ou recusada), o `Selo` do cabeçalho do detalhe segue "Aberto" até a próxima recarga. Visível: o selo muda assim que a releitura do trampo chega, e a mudança é **anunciada** (região invisível `polite`, uma vez): "Status atualizado: {rótulo}." Em `DetalheDoTrampo`, só depois da primeira renderização (não na abertura). Texto novo `detalheDoTrampo.statusAtualizado(rotulo)`.

### 3.6 Aviso de exclusão sem destino

Ao excluir pelo detalhe, o aviso ("Trampo excluído." / "Serviço excluído." / "Este anúncio já não existe.") só é entregue se a tela de destino for Meus anúncios; vindo da Buscar, do Início ou do Perfil, ele expira calado (10 s). Muda: um **host de aviso na raiz**, junto da faixa, mostra o aviso de retorno em qualquer tela.
- Usa o `Toast` existente (6 s, dispensável com botão "Fechar aviso", anuncia sozinho).
- Posição: embaixo, como hoje. Com a barra de abas visível, `deslocamentoInferior` = altura da barra (56, `componentes/navegacao.ts`), para não cobrir as abas. Quem decide se há barra é o contêiner (rota em `(abas)`).
- Meus anúncios deixa de consumir o aviso de retorno por conta própria (o host assume); os toasts das ações feitas ali mesmo (encerrar, excluir pela folha) continuam locais.
- Nenhum texto novo.

## 4. Meus anúncios: paginação (`/trampos/meus`)

Mantém `Rolavel` + lista em coluna (as listas "minhas" são curtas; sem virtualização) e usa botão explícito, que é o padrão acessível já adotado na Buscar. Sem carregamento por rolagem: evita a lista crescer sob o dedo e o leitor perder o lugar.

Props novas em `PropsDosMeusAnuncios`: `temMais`, `carregandoMais?`, `erroAoCarregarMais?: string`, `onCarregarMais`, `fimDaLista?: number` (total, só se a pessoa carregou mais de uma página).

| Estado | Comportamento |
|---|---|
| Primeira página carregando / erro / vazio | Como hoje (`EstadoDeTela`). |
| Com mais | Botão secundário "Carregar mais" ao fim da lista. |
| Carregando mais | Botão com `textoCarregando` "Carregando…", desabilitado; a lista continua visível e tocável. |
| Erro ao carregar mais | `Aviso` de erro acima do botão, com "Tentar de novo"; a lista não some. |
| Sem rede | Botão desabilitado e `Motivo` "Sem conexão. Conecte-se para carregar mais." |
| Fim da lista | Só se carregou mais de uma página: texto legenda "Isso é tudo: {n} trampos." (serviços: "{n} serviços"). Lista curta, sem texto. |
| Depois de carregar | Região invisível anuncia "{k} trampos a mais carregados." e o foco de acessibilidade vai ao primeiro item novo (o foco ficaria no botão, que desce). |

Excluir ou encerrar um item com mais páginas por carregar: o botão continua; sem texto novo.
Serviços não paginam hoje; o componente é genérico e aceita as props quando a API pedir.

## 5. Outras telas

### 5.1 Editar perfil: só depois de carregar

Prop nova `carga?: { situacao: 'carregando' } | { situacao: 'erro'; mensagem: string; onTentarDeNovo: () => void }`; ausente = formulário. **Perfil inexistente (404) não é erro:** abre o formulário vazio.
- **Carregando:** cabeçalho com voltar e título normais; no corpo, esqueleto no formato do formulário (quatro campos e um bloco de chips), agrupado como um só elemento falado, `accessibilityState.busy`, rótulo "Carregando seu perfil…". Sem botão "Salvar" (não há o que salvar); em `modoCompletar`, "Agora não" continua visível (saída).
- **Erro:** `Aviso` de erro com "Tentar de novo" e botão "Voltar". Mensagem "Não foi possível carregar seu perfil. Nada foi alterado." Sem rede e sem dado: "Sem conexão. Conecte-se para editar seu perfil." (não deixar o esqueleto girando para sempre; consulta pausada não é "carregando").
- Os campos só aparecem com o valor inicial já preenchido (nada de formulário vazio que se preenche sozinho e apaga o que a pessoa digitou).
- Textos: `editarPerfil.carregando`, `editarPerfil.erroAoCarregar`, `editarPerfil.semConexaoParaCarregar`.

### 5.2 Documento legal: índice "Nesta página"
Quando o documento tem 6 ou mais seções (os dois têm 11): lista de links logo depois de "Versão de…", título "Nesta página" (`textos.documentoLegal.nestaPagina`, já existe), cada item um botão de texto com alvo de 44 px, `accessibilityRole="link"`, que rola até a seção e leva o foco do leitor ao título dela. Títulos de seção já são `header`.

### 5.3 Exportar: "Ainda gerando…"
Se `gerando` passa de 10 s, o texto de carregando vira "Ainda gerando. Isso pode levar um minuto." (região `polite`). Estado local da tela (timer), sem prop nova. Texto novo `exportarDados.aindaGerando`.

## Componentes

| Componente | Existente ou novo | Onde fica |
|---|---|---|
| `CampoDeTexto` (`limite`, `contador`) | alterado | `componentes/CampoDeTexto.tsx` |
| `ContadorDeCaracteres`, `useLimiteDeCaracteres`, utilidades de contagem | novo | `componentes/` |
| `FaixaSemConexao` + contêiner `FaixaNaRaiz` (empurra e zera a margem do topo) | alterado e novo | `componentes/FaixaSemConexao.tsx`; uso em `app/_layout.tsx` (dev) |
| Host de aviso de retorno (usa `Toast`) | novo, apresentacional | `componentes/` (contêiner no layout raiz, dev) |
| `BolhaDeMensagem` (`semConexao`; `aguardando` condicional) | alterado | `componentes/` |
| `Conversa` (`historicoCortado`, `Motivo`, contador compartilhado) | alterado | `telas/Conversa.tsx` |
| `FolhaDeAcoesDoAnuncio` (`atualizando`) | alterado | `componentes/` |
| `MeusAnuncios` (paginação) | alterado | `telas/MeusAnuncios.tsx` |
| `EditarPerfil` (`carga`) | alterado | `telas/EditarPerfil.tsx` |
| `DetalheDoTrampo` (anúncio do status) | alterado | `telas/` |
| `DocumentoLegal` (índice), `ExportarDados` (demora) | alterados | `telas/` |
| `base.tsx` (`Rolavel`, `Formulario`) | alterado: sem faixa | `telas/base.tsx` |

## Textos da interface (`textos/pt-BR.ts`)

- `gerais`: `contador(n, limite)` único ("{n} de {limite} caracteres"; remove as cópias em `editarPerfil`, `formularioDeAnuncio` e demais); `contadorFaltam(n, limite, x)`; `contadorLimite(limite)` "Limite de {limite} caracteres atingido."; `contadorCortado(limite)` "O texto passou de {limite} caracteres e foi cortado."; `semConexaoFaixa` e `conexaoDeVolta` (seção 2).
- Plural: "Falta 1 caractere." / "Faltam {x} caracteres."
- `conversas`: `historicoCortado(n)`; `naoEnviadaSemConexao` "Não enviada. Sem conexão: conecte-se para tentar de novo."; `aguardandoConexao` "Aguardando conexão" (condicional).
- `anuncio`: `folhaAtualizada` "Este anúncio mudou enquanto você olhava. Atualizamos as opções."; `folhaAtualizando` "Atualizando as opções…".
- `detalheDoTrampo`: `statusAtualizado(rotulo)` "Status atualizado: {rótulo}."
- `meusAnuncios`: `semConexaoParaCarregarMais` "Sem conexão. Conecte-se para carregar mais."; `maisCarregados(k, tipo)`; `fimDaLista(n, tipo)` "Isso é tudo: {n} trampos."
- `editarPerfil`: `carregando`, `erroAoCarregar`, `semConexaoParaCarregar` (seção 5.1).
- `exportarDados`: `aindaGerando`.
- Reaproveitados: `gerais.carregarMais`, `gerais.carregando`, `gerais.tentarDeNovo`, `anuncio.jaNaoExiste`, `documentoLegal.nestaPagina`.

## Acessibilidade (WCAG 2.2 AA)

- Contador: sem live region por tecla; anúncio por faixa (90%, 100%, corte), uma vez; cor nunca é o único sinal (WCAG 1.4.1); 4.1.3 atendido por anúncio sem roubar foco.
- Faixa: `alert` + `polite`, uma vez por mudança, também ao voltar a rede; zera a margem do topo para não duplicar espaço; status bar legível sobre o fundo escuro; 320 px e 200% de fonte sem cortar.
- Bolha não tocável sem rede: `accessibilityState.disabled` e texto que explica (nunca só opacidade).
- Folha atualizada: erro com `role="alert"`; ações desabilitadas dizem o motivo em texto.
- Selo atualizado e itens carregados: anunciados; o foco vai ao primeiro item novo (2.4.3, ordem lógica).
- Perfil carregando: `busy` e rótulo; nada de campo sem valor que mude sozinho (3.2.2).
- Alvos: botões "Carregar mais", "Tentar de novo" e itens do índice com 44 px.
- Sem movimento novo: faixa e avisos aparecem sem animação; `Toast` já respeita as regras existentes.

## O que o dev implementa em `src/estado` e `src/api`

1. **Contagem:** confirmar com a API se o limite conta pontos de código crus ou depois de NFC. `estado/validacao.ts` e `componentes/utilitarios.ts` devem dar o mesmo número; teste em tabela comum (emoji, bandeira, família ZWJ, acento composto e decomposto).
2. **Paginação de `/trampos/meus`:** consulta infinita com `trampos`, `temMais`, `carregandoMais`, `erroAoCarregarMais`, `carregarMais`, `tentarCarregarMais` e total carregado; juntar páginas sem duplicar por id; a ordenação local (`maisRecentesPrimeiro`) só vale se coincidir com a ordem da API; invalidação depois de editar, encerrar e excluir mexe em todas as páginas; `paraFolha` procura o item em todas as páginas e trata "ainda não carregado".
3. **Conversa >500:** deduplicar por id no cache (`mesclarPagina`) e na reconciliação (uma mensagem que saiu do teto não pode ser reenviada); expor `historicoCortado` (número ou `undefined`); se o plano criar `antesDe`, o estado de "mensagens anteriores".
4. **Envio sem rede:** passar `semConexao` à bolha pela tela; sem reenvio automático. Se pausar, situação `aguardando` no estado das pendentes.
5. **Folha (R8):** `useAcoesDoAnuncio` guarda só tipo e id e monta o `AnuncioDaFolha` do cache vivo a cada render; depois de 409 recarrega, mantém a folha aberta com `erro` e `atualizando`; 404 fecha e avisa `ja_nao_existe`.
6. **Selo:** recarregar `trampo(id)` também no 409 `candidatura_nao_pendente` e nos demais 409 do rodapé (hoje só `trampo_nao_aberto` recarrega).
7. **Aviso de retorno global:** consumir `useAvisoDeRetorno` no layout raiz e passar o texto ao host; informar se a rota atual está em `(abas)` (deslocamento); tirar o consumo de `meus-anuncios.tsx`; manter validade de 10 s e a checagem de sessão (`geracao`).
8. **Perfil:** `useMeuPerfil` alimenta `carga` (carregando, erro, sem rede sem dado, perfil inexistente = formulário vazio); valores iniciais só depois de carregados; o salvar não existe antes disso.
9. **Faixa:** `useConexao()` no `NavegacaoRaiz`; atualizar os testes que contam a faixa por tela e o texto antigo.
10. **API:** nada novo além do que o plano decidir (paginação de `/trampos/meus`, `antesDe`, R2 do cursor).

## Só apresentação (minha parte, depois da aprovação)

`CampoDeTexto`, `ContadorDeCaracteres`, utilidades de contagem; `FaixaSemConexao` e contêiner de margem; host de aviso; `BolhaDeMensagem` e `Conversa` (histórico cortado, `Motivo`, contador); `FolhaDeAcoesDoAnuncio` (`atualizando`); `MeusAnuncios` (botão, estados, anúncio e foco); `EditarPerfil` (`carga`); anúncio do selo em `DetalheDoTrampo`; índice do `DocumentoLegal`; demora do `ExportarDados`; remoção da faixa de `base.tsx`, `Buscar.tsx` e `Conversa.tsx`; trocar `maxLength` por `limite` em `EditarPerfil`, `FormularioDeAnuncio`, `RodapeDoTrampo`, `Buscar`, `Cadastro`, `Entrar`; textos; testes de apresentação de cada estado acima. Os dois lados mexem em testes de rota (`testes/rotas/`, `testes/qa/`) por causa da faixa e do texto: combinar quem edita cada arquivo.

## Arquivos de apresentação afetados

`componentes/{CampoDeTexto,FaixaSemConexao,BolhaDeMensagem,FolhaDeAcoesDoAnuncio,utilitarios,index}.ts(x)` (e `ContadorDeCaracteres.tsx`, host de aviso, novos); `telas/{base,Buscar,Conversa,MeusAnuncios,EditarPerfil,FormularioDeAnuncio,RodapeDoTrampo,DetalheDoTrampo,Cadastro,Entrar,DocumentoLegal,ExportarDados,tipos}.ts(x)`; `textos/pt-BR.ts`. Contêineres (dev): `app/_layout.tsx`, `app/(app)/meus-anuncios.tsx`, `app/(app)/perfil/editar.tsx`, `app/(app)/conversas/[id].tsx`, `app/(app)/trampos/[id].tsx`. Tokens: nenhum.

## Perguntas em aberto

1. **Contagem em NFD:** a API conta antes ou depois de normalizar para NFC? Define o que o contador mostra para quem digita acento solto (raro no teclado do celular).
2. **R10 da 2c:** qual era o achado? (ver acima)
3. **Pausa do envio:** o plano adota mutação pausada? Se sim, vale a situação `aguardando`.
4. **Texto da faixa:** aprova a troca de "Mostrando o que já foi carregado" por "Ações que precisam de internet ficam indisponíveis"?
5. **Paginação:** o tamanho de página e a ordem da API (mais recente primeiro) estão fixados no plano? A tela depende da ordem para não reordenar sob o dedo.
