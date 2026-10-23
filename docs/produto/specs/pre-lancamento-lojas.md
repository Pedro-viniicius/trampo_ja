# Especificação de UI/UX: pendências antes da publicação nas lojas

Plano técnico (regras de dados, endpoints): `docs/produto/planos/pre-lancamento-lojas.md` (do arquiteto). Spec base: `docs/produto/specs/mvp-trampo-ja.md`; decisões D1 a D24 em `docs/produto/decisoes.md` (D10: exclusão e exportação antes das lojas; D14 fonte do sistema e Ionicons; D15 fronteira designer/dev).
Verificação visual: **não verificado visualmente** (spec, sem código). Onde o texto depender de regra de dados, aparece **[conforme o plano]**; o dev troca pelo que o plano decidir antes de implementar.
Tokens, componentes e tom seguem o que já existe (`Botao`, `Aviso`, `Motivo`, `DialogoDeConfirmacao`, `CampoDeTexto`, `EstadoVazio`, `Toast`, `Rolavel`/`EstadoDeTela` em `telas/base.tsx`). Nenhum token, pacote ou ícone novo (só Ionicons).

## Objetivo e usuário

Mesmas pessoas do MVP (freelancers e empregadores, celular, pressa, conexão instável), agora com o que as lojas e a LGPD exigem: controlar a própria conta e os próprios dados, ler política e termos antes de criar conta, e desfazer o que publicou ou enviou. Princípios: ações irreversíveis exigem confirmação clara e dizem o efeito em uma linha; nunca prender a pessoa numa tela sem saída; falar em linguagem simples, sem juridiquês na interface.

## Fluxo

- **Perfil** ganha a linha "Conta e privacidade" -> tela **Conta e privacidade** (lista): Exportar meus dados, Excluir minha conta, Política de privacidade, Termos de uso, Sair. "Sair" sai do bloco de ações do Perfil e vai para cá (decisão D-a, ver Perguntas); o Perfil mantém "Editar perfil" e os atalhos.
- **Exportar**: Conta e privacidade -> Exportar meus dados -> "Gerar arquivo" -> folha de compartilhamento do sistema -> volta à tela com aviso de sucesso.
- **Excluir**: Conta e privacidade -> Excluir minha conta (explicação + senha) -> "Excluir minha conta" -> diálogo destrutivo final -> carregando -> Entrada com aviso.
- **Documentos legais**: Entrada, Cadastro, Login (opcional) e Conta e privacidade -> Política de privacidade / Termos de uso. Rotas **públicas** (sem login), voltam à origem.
- **Cadastro**: texto de aceite com links + aviso de visibilidade do perfil.
- **Anúncio**: Meus anúncios e Detalhe (autor) -> Editar anúncio (formulário reaproveitado) | Encerrar | Excluir.
- **Candidatura**: Minhas candidaturas e rodapé do trampo (candidatado) -> Retirar candidatura (diálogo).

## Layout (mobile)

Mesmas regras do MVP: margem 16 (`espaco[4]`), alvo 44, botão largo 48, uma ação principal por tela, largura máx. 560, fonte até 200% sem cortar.

### 1. Conta e privacidade (tela nova `ContaEPrivacidade`)
- Cabeçalho com voltar; título "Conta e privacidade".
- Duas seções com título de seção (18): **Seus dados** (Exportar meus dados; Excluir minha conta) e **Sobre o app** (Política de privacidade; Termos de uso), e **Sair** isolado ao fim, em botão secundário largo (não é linha de lista, para não parecer navegação).
- Linhas de lista: ícone à esquerda (decorativo), título 16, subtítulo 13 em `textoSecundario`, chevron à direita; altura mínima 56, toda a linha tocável. "Excluir minha conta" usa texto e ícone na cor de erro, **mais** o texto (cor não é o único sinal: o título já diz "Excluir").
- Componente novo `LinhaDeConfiguracao` (apresentacional; props: `titulo`, `descricao?`, `icone`, `destrutiva?`, `onPress`). Sem estado de dados.

### 2. Excluir conta (tela nova `ExcluirConta`)
Rolável, com voltar. De cima para baixo:
1. Título "Excluir minha conta" e ícone de alerta (`warning-outline`) em `Aviso` tipo erro/atenção com a frase-chave: "Esta ação não pode ser desfeita."
2. Texto "O que acontece" em lista curta (marcadores com texto, cada item uma frase):
   - Seu perfil, seus trampos e serviços **[conforme o plano: removidos / anonimizados]**.
   - Suas candidaturas e conversas **[conforme o plano]**.
   - O que outras pessoas já receberam de você (mensagens) **[conforme o plano]**.
   - Você sai da conta neste aparelho e em todos os outros.
   - Prazo e o que é guardado por obrigação legal **[conforme o plano, ou omitir se nada]**.
   - Dica: "Quer guardar seus dados antes? Use Exportar meus dados." com link-texto para a tela de exportação.
3. Campo "Senha" (mostrar/ocultar, preenchimento do gerenciador de senhas, `textContentType="password"`), ajuda "Digite sua senha para confirmar que é você."
4. Botão destrutivo largo "Excluir minha conta" (desabilitado com campo vazio, com `Motivo`: "Digite sua senha para continuar."). "Cancelar" (texto) abaixo, volta.
- Ao tocar o botão: **diálogo final** (`DialogoDeConfirmacao`, `destrutivo`): título "Excluir a conta de vez?", mensagem "Seu perfil e seus anúncios deixam de existir **[conforme o plano]**. Isso não pode ser desfeito.", confirmar "Sim, excluir minha conta", cancelar "Cancelar" (foco inicial no título, como já faz; "Cancelar" é o botão padrão, nunca o destrutivo).
- A senha só é verificada pela API ao confirmar; o app não valida a senha localmente. Não há campo "digite EXCLUIR" (carga cognitiva, ruim para a audiência); a senha + diálogo bastam.

### 3. Exportar meus dados (tela nova `ExportarDados`)
Rolável, com voltar.
1. Título e parágrafo: "Gere um arquivo com os dados da sua conta e guarde uma cópia."
2. "O que vem no arquivo": lista curta **[conforme o plano]**: e-mail, perfil (nome, cidade, sobre você, habilidades), seus trampos e serviços, suas candidaturas, suas mensagens. Formato do arquivo (JSON, tamanho, se inclui mensagens de outras pessoas) **[conforme o plano]**.
3. Aviso informativo: "O arquivo fica no seu aparelho ou onde você escolher. Ele tem dados pessoais: guarde em lugar seguro." (o app nunca grava em local próprio sem o usuário escolher; quem implementa a entrega usa a folha de compartilhamento).
4. Botão primário "Gerar e compartilhar" (largo). Texto "Gerando arquivo…" enquanto carrega, desabilitado (sem duplo toque).
5. Sucesso: `Aviso` sucesso persistente na tela "Arquivo gerado. Escolha onde salvar ou para quem enviar." e botão passa a "Gerar de novo". Se a pessoa fechar a folha sem escolher: sem erro, apenas o botão volta ao normal e texto informativo "Nada foi salvo. Você pode gerar de novo quando quiser." (não é falha).

### 4. Política de privacidade e Termos de uso (tela nova `DocumentoLegal`, uma tela, duas rotas)
- Título do documento no cabeçalho ("Política de privacidade" / "Termos de uso"), voltar.
- Corpo: texto longo rolável, largura de leitura <= 560, corpo 16/1,4 (ou maior, ver Acessibilidade), títulos de seção 18 semibold, parágrafos separados por `espaco[3]`, listas com marcador de texto. Linha "Versão de {data}" em legenda 13 no topo, para mostrar vigência **[conforme o plano: versão/data do documento]**.
- Estrutura vem de dados (`{ titulo, secoes: [{ titulo, paragrafos[] }] }`) e não de componente por seção; o **conteúdo** é documento legal à parte (jurídico). Se o documento ainda não existir no lançamento, a tela não vai ao ar (ver Perguntas P1).
- Índice no topo para o texto longo ("Nesta página": lista de links que rolam até a seção) apenas se o documento tiver >= 6 seções.
- Sem login: usa o layout público (sem barra inferior). Não depende de rede (texto empacotado no app) **[conforme o plano: empacotado ou buscado]**; se for buscado, estados de carregar e erro com "Tentar de novo".
- Rodapé da leitura: botão "Voltar" (secundário) para quem rolou muito, mais um botão flutuante "Voltar ao topo" opcional (fora do escopo; sugestão).

### 5. Aceite no cadastro (alteração em `Cadastro`)
- **Texto de aceite**, acima do botão "Criar conta", sem caixa de seleção: "Ao criar a conta, você concorda com os **Termos de uso** e com a **Política de privacidade**." Os dois trechos em negrito são links (cor `primario`, sublinhados, alvo >= 44 de altura via `accessibilityRole="link"`; cada link como `Text` aninhado não passa 44: usar dois botões de texto em linha abaixo do parágrafo se o dev não garantir o alvo).
- Escolha: texto de aceite em vez de caixa obrigatória (D-b). Se o plano exigir consentimento registrado (caixa, versão aceita), usar caixa: componente `CaixaDeSelecao` novo, rótulo igual ao texto, estado de erro "Marque para criar a conta." e botão "Criar conta" continua habilitado (erro ao enviar, não desabilita sem explicar). **[conforme o plano]**.
- **Aviso de visibilidade** (substitui o texto `cadastro.privacidade` ou vem logo depois, em `Aviso` info com ícone `eye-outline`): "Seu nome, cidade, sobre você e habilidades aparecem para quem estiver logado no app. Seu e-mail nunca aparece." Curto, sem link.
- Abrir os documentos preserva o que foi digitado (a rota empilha sobre o Cadastro; voltar mantém o estado).

### 6. Editar, encerrar e excluir anúncio
- **Editar**: mesma tela `FormularioDeAnuncio` com prop `modo: 'criar' | 'editar'`; título "Editar trampo" / "Editar serviço"; botão "Salvar alterações" ("Salvando…"). Campos vêm preenchidos. Quais campos são editáveis (ex.: trampo em andamento) **[conforme o plano]**; campo bloqueado aparece desabilitado com `Motivo` ao lado ("Não dá para mudar depois que o trampo começa.").
- **Entrada na ação**: em `MeusAnuncios`, cada cartão ganha botão de ícone "Mais opções" (`ellipsis-horizontal`, 44x44, `accessibilityLabel="Mais opções de {título}"`) que abre `FolhaInferior` com: "Editar", "Encerrar trampo" (só trampo aberto; serviço: "Pausar serviço" se o plano trouxer; sem isso, omitir) e "Excluir" (destrutivo). No detalhe, para o autor, o rodapé (hoje "Ver candidaturas (n)") mantém essa ação principal e ganha o mesmo botão "Mais opções" no cabeçalho. Decisão D-c: folha de ações em vez de 3 botões no cartão (cartão fica limpo, alvo grande).
- **Encerrar** (trampo): diálogo não destrutivo: título "Encerrar este trampo?", mensagem "Ele sai da busca e deixa de receber candidaturas. As conversas continuam. **[conforme o plano]**". Confirmar "Encerrar trampo". Resultado: selo "Encerrado" **[nome e existência conforme o plano]**; toast "Trampo encerrado."
- **Excluir**: diálogo destrutivo: título "Excluir este trampo?", mensagem em uma linha do efeito **[conforme o plano]**, por exemplo "Ele some da busca e as {n} candidaturas recebidas também. Isso não pode ser desfeito." (se houver candidaturas; sem contagem quando 0: "Ele some da busca. Isso não pode ser desfeito."). Serviço: "Este serviço some da busca. Isso não pode ser desfeito." Confirmar "Excluir trampo" / "Excluir serviço". Toast "Trampo excluído."; em detalhe, volta à lista.
- Se o trampo está **em andamento** (candidatura aceita) o plano decide se pode excluir; se não, "Excluir" aparece desabilitado na folha com motivo "Trampo em andamento não pode ser excluído. Encerre-o primeiro."

### 7. Retirar candidatura
- `CartaoDeCandidatura` (modo "minha"): botão de texto "Retirar candidatura" (destrutivo suave, 44 de altura) visível quando a candidatura estiver **pendente** (aceita/recusada **[conforme o plano]**). Em `RodapeDoTrampo` (candidatado): ao lado do selo "Candidatura enviada" e de "Conversar", link-botão "Retirar candidatura" abaixo, menor ênfase (a ação principal continua "Conversar").
- Diálogo destrutivo: título "Retirar sua candidatura?", mensagem "O empregador deixa de ver sua proposta. Você pode se candidatar de novo enquanto o trampo estiver aberto. **[conforme o plano]**", confirmar "Retirar candidatura", cancelar "Manter candidatura".
- Sucesso: toast "Candidatura retirada." e o cartão sai da lista (ou muda de status se o plano mantiver histórico: selo "Retirada"); o rodapé do trampo volta ao "Candidatar-se".
- Conversa existente após retirar: **[conforme o plano]**; nenhum texto novo se nada muda.

### 8. Limite de envio (429)
Hoje `erros.muitas_tentativas` = "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." Está correto para login e cadastro. Para ações de uso normal (mensagem, abrir conversa, publicar, candidatar-se, exportar, excluir) fica pouco claro e sem retorno do que foi preservado. Proposta:
- Nova chave `erros.muitas_tentativas_acao`: "Você fez muitas ações em pouco tempo. Aguarde um minuto e tente de novo. O que você escreveu foi mantido." (o "mantido" só aparece onde há rascunho; mapeamento do dev: formulários, folha de candidatura e campo de mensagem preservam o texto, já é regra do MVP).
- Manter `muitas_tentativas` em login e cadastro.
- Exibição: formulário e folha -> `Aviso` de erro em linha acima do botão principal; conversa -> mensagem fica como "Não enviada. Toque para tentar de novo." e o aviso acima do campo; abrir conversa -> `Aviso` na tela de origem (ou toast de erro com >= 6 s). Cor nunca única: ícone `time-outline` e texto.
- Não há contagem regressiva (a API pode não devolver o tempo; **[conforme o plano: se vier `retryAfter`, mostrar "Tente de novo em {n} s" e manter o botão desabilitado até lá]**). Sem `retryAfter`, o botão fica habilitado (a pessoa decide) e não há bloqueio artificial.
- O mapeamento 429 -> chave por contexto fica em `estado/erros.ts` (regra do dev).

### 9. Itens visuais pendentes
- **Faixa "sem conexão" na raiz**: hoje cada tela (`Buscar`, `Conversa`, `base.tsx` em duas variantes) renderiza a sua. Passa a existir uma só, no layout raiz (`src/app/_layout.tsx`, contêiner), acima do conteúdo e abaixo da área segura superior; telas deixam de receber `semConexao` para exibir faixa (a prop pode permanecer para desabilitar ações). Comportamento igual ao de hoje: texto `gerais.semConexaoFaixa`, `role=alert`, `liveRegion=polite`, some ao voltar a rede. Ela **empurra** o conteúdo, não o cobre. Ao entrar e sair, o cabeçalho das telas não pula além da altura da faixa (reservar a altura ao desaparecer não é necessário; aceitar o deslocamento, mas sem animação com `reduzir movimento`). Anunciar só uma vez por mudança de estado (evita repetir ao trocar de tela).
- **Contador em pontos de código**: `maxLength` do React Native conta unidades UTF-16, então um emoji (2 unidades, às vezes mais em sequências) consome o limite e o texto é cortado antes de o contador chegar ao máximo. Regra visual: o contador mostra "{n}/{limite}" contando **pontos de código** (`Array.from(texto).length`), o mesmo critério da API **[conforme o plano: confirmar como a API conta]**; o campo não usa `maxLength` para cortar: passa do limite -> contador e borda em erro com texto "{n}/{limite}. Passou {x} caracteres. Encurte o texto." e o botão principal mostra o erro ao enviar (em vez de cortar em silêncio). Alternativa aceita se o dev preferir manter o corte: truncar por ponto de código no `onChangeText` e anunciar "Limite de {limite} caracteres atingido". Vale para título, descrição, mensagem da candidatura, mensagem da conversa, sobre você, habilidade, nome e cidade (todos os `CampoDeTexto` com `maxLength`). A utilidade de contagem fica em `componentes/utilitarios.ts` (apresentação), testada com emoji simples, bandeira, família (ZWJ) e acentos compostos.

## Componentes

| Componente | Existente ou novo | Onde fica |
|---|---|---|
| `LinhaDeConfiguracao` (ícone, título, descrição, chevron, destrutiva) | novo | `componentes/` |
| `CaixaDeSelecao` | novo, só se o plano exigir caixa de aceite | `componentes/` |
| `DocumentoLegal` (tela de leitura, índice opcional) | nova tela | `telas/` |
| `ContaEPrivacidade`, `ExcluirConta`, `ExportarDados` | novas telas | `telas/` |
| `FormularioDeAnuncio` com `modo` editar | alterado | `telas/` |
| `MeusAnuncios`, `RodapeDoTrampo`, `RodapeDoServico` (autor), `CartaoDeAnuncio` | alterados (botão "Mais opções", folha de ações) | `telas/`, `componentes/` |
| `CartaoDeCandidatura`, `MinhasCandidaturas`, `RodapeDoTrampo` | alterados ("Retirar candidatura") | idem |
| `Cadastro`, `Entrada` | alterados (aceite, aviso de visibilidade, links) | `telas/` |
| `Perfil` | alterado (linha "Conta e privacidade"; "Sair" sai daqui) | `telas/` |
| `FaixaSemConexao` | existente, passa para a raiz | `componentes/` + `app/_layout.tsx` |
| `CampoDeTexto` | alterado (contador por ponto de código, sem corte silencioso) | `componentes/` |
| `DialogoDeConfirmacao`, `FolhaInferior`, `Aviso`, `Motivo`, `Toast`, `Botao` | existentes, sem mudança | `componentes/` |

## Estados

**Conta e privacidade**: padrão; offline (linhas de exportar e excluir desabilitadas com `Motivo` "Sem conexão. Conecte-se para continuar."; documentos legais continuam abertos se empacotados).

**Excluir conta**
- Padrão: botão desabilitado, `Motivo` "Digite sua senha para continuar."
- Senha preenchida: botão habilitado -> diálogo.
- Carregando (após confirmar): diálogo com botão "Excluindo…" e indicador, ambos os botões desabilitados, sem fechar por toque fora ou voltar do sistema.
- Senha errada: o diálogo fecha, erro no campo "Senha incorreta. Confira e tente de novo." (foco volta ao campo e é anunciado); o campo mantém o texto selecionado.
- Sem conexão: `Aviso` erro acima do botão "Sem conexão. Sua conta não foi excluída. Conecte-se e tente de novo."
- Erro do servidor: "Algo deu errado do nosso lado. Sua conta não foi excluída. Tente de novo em instantes."
- 429: `erros.muitas_tentativas_acao` (senha: limite de tentativas; **[conforme o plano]**).
- 401 (sessão expirada): fluxo global, volta ao login com aviso padrão.
- Sucesso: a sessão é limpa, vai à **Entrada** com `Aviso` de sucesso no topo: "Sua conta foi excluída. Sentiremos sua falta." (sem tom de culpa; sem botão "Desfazer", a menos que o plano preveja carência: **[conforme o plano: com prazo de recuperação, "Você tem {n} dias para voltar entrando de novo."]**). Aviso é persistente até a pessoa tocar em um botão ou fechar, não só toast, e é anunciado ao abrir a Entrada.

**Exportar**
- Padrão; carregando ("Gerando arquivo…", botão desabilitado, indicador, `accessibilityLiveRegion`); sucesso (aviso + folha do sistema já aberta); folha dispensada (informativo, não é erro); sem conexão ("Sem conexão. Conecte-se e tente de novo."); erro de servidor; 429 (`muitas_tentativas_acao`); arquivo grande/lento **[conforme o plano]**: após 10 s o texto muda para "Ainda gerando. Isso pode levar um minuto." (ver P4); falha ao abrir a folha de compartilhamento: "Não foi possível abrir as opções de compartilhamento. Tente de novo."
- Nada do conteúdo do arquivo é exibido na tela (dado pessoal); só mensagens fixas.

**Documento legal**: carregando e erro só se o texto vier da rede; texto longo; seção com palavra sem espaço (URL) quebra; fonte 200% sem cortar; paisagem rolável.

**Cadastro**: aceite como texto não gera erro; se caixa (plano): erro "Marque para criar a conta." com foco na caixa; os demais estados do MVP intactos.

**Editar anúncio**: carregando o anúncio (esqueleto do formulário, botão desabilitado); erro ao carregar (`EstadoDeTela` erro + "Tentar de novo", e "Voltar"); anúncio inexistente/removido (404): `NaoEncontrado`; salvando ("Salvando…"); sucesso (toast "Alterações salvas." e volta ao detalhe); erro por campo (igual ao publicar); sem conexão/servidor/429 (avisos padrão, rascunho mantido); **conflito** (409, `conflito_de_versao`): `Aviso` de erro no topo "Este anúncio foi alterado em outro lugar. Veja a versão atual e refaça sua alteração." com botões "Ver versão atual" (recarrega e preenche o formulário, preservando o que a pessoa digitou numa área "Suas alterações" **[conforme o plano: ou só recarregar]**) e "Cancelar"; trampo que deixou de ser editável (em andamento/encerrado): `Aviso` "Este trampo não pode mais ser editado." e campos desabilitados; sair com alterações não salvas: diálogo "Descartar alterações?" / "Descartar" / "Continuar editando" (só em modo editar).

**Encerrar e excluir**: diálogo -> carregando (botão "Encerrando…" / "Excluindo…") -> sucesso (toast) | erro (`Aviso` no diálogo fechado + toast de erro "Não foi possível excluir. Tente de novo." e o item permanece) | já removido (404: trata como sucesso, "Este anúncio já não existe." e remove da lista) | em andamento (`trampo_nao_aberto`/regra do plano: `Aviso` explicando) | offline (ações desabilitadas na folha com motivo). Lista vazia depois de excluir o último: estado vazio já existente.

**Retirar candidatura**: diálogo -> carregando ("Retirando…") -> sucesso (toast) | erro (toast "Não foi possível retirar. Tente de novo.") | já decidida pelo empregador (409 do plano): `Aviso` "Esta candidatura já foi respondida e não pode ser retirada." e a lista recarrega com o status novo | 404: removida da lista | offline: botão desabilitado com `Motivo` | só uma ação por vez (evita duplo toque).

**Limite 429**: ver seção 8.

## Textos da interface

Para `apps/mobile/src/textos/pt-BR.ts`, chaves por tela (propostas: `contaEPrivacidade`, `excluirConta`, `exportarDados`, `documentoLegal`, `cadastro` (extensão), `anuncio` (menu, editar, encerrar, excluir), `candidatura` (retirar), `erros` (extensão)). Marcadores **[plano]** dependem do arquiteto.

**Conta e privacidade**: título "Conta e privacidade"; seções "Seus dados" / "Sobre o app"; "Exportar meus dados" (sub: "Baixe uma cópia do que o app guarda sobre você"); "Excluir minha conta" (sub: "Apaga seu perfil e seus anúncios" **[plano]**); "Política de privacidade"; "Termos de uso"; "Sair" (diálogo existente "Sair da conta?").

**Excluir conta**: título "Excluir minha conta"; alerta "Esta ação não pode ser desfeita."; cabeçalho da lista "O que acontece"; itens **[plano]**; "Quer guardar seus dados antes? Exporte uma cópia."; rótulo "Senha"; ajuda "Digite sua senha para confirmar que é você."; botão "Excluir minha conta" / "Excluindo…"; motivo "Digite sua senha para continuar."; diálogo "Excluir a conta de vez?" / "Seu perfil e seus anúncios deixam de existir. Isso não pode ser desfeito." **[plano]** / "Sim, excluir minha conta" / "Cancelar"; erro de campo "Senha incorreta. Confira e tente de novo."; erro geral "Sua conta não foi excluída. {motivo padrão}"; sucesso "Sua conta foi excluída. Sentiremos sua falta."

**Exportar**: título "Exportar meus dados"; "Gere um arquivo com os dados da sua conta e guarde uma cópia."; "O que vem no arquivo" + itens **[plano]**; aviso "O arquivo tem dados pessoais. Guarde em um lugar seguro."; botão "Gerar e compartilhar" / "Gerando arquivo…" / "Gerar de novo"; sucesso "Arquivo gerado. Escolha onde salvar ou para quem enviar."; dispensado "Nada foi salvo. Você pode gerar de novo quando quiser."; demora "Ainda gerando. Isso pode levar um minuto."; erro compartilhamento "Não foi possível abrir as opções de compartilhamento. Tente de novo."; título da folha do sistema "Dados do Trampo Já".

**Documento legal**: "Política de privacidade"; "Termos de uso"; "Versão de {data}"; "Nesta página"; "Voltar".

**Cadastro**: "Ao criar a conta, você concorda com os Termos de uso e com a Política de privacidade."; links "Termos de uso" e "Política de privacidade"; aviso "Seu nome, cidade, sobre você e habilidades aparecem para quem estiver logado no app. Seu e-mail nunca aparece."; erro de caixa (se houver) "Marque para criar a conta."

**Anúncio**: "Mais opções de {título}"; folha: "Editar", "Encerrar trampo", "Excluir"; "Editar trampo" / "Editar serviço"; botão "Salvar alterações" / "Salvando…"; toast "Alterações salvas."; "Encerrar este trampo?" / "Ele sai da busca e deixa de receber candidaturas. As conversas continuam." **[plano]** / "Encerrar trampo" / "Cancelar"; "Excluir este trampo?" / "Ele some da busca e as {n} candidaturas recebidas também. Isso não pode ser desfeito." / "Excluir trampo"; "Excluir este serviço?" / "Este serviço some da busca. Isso não pode ser desfeito." / "Excluir serviço"; toasts "Trampo encerrado.", "Trampo excluído.", "Serviço excluído."; erro "Não foi possível excluir. Tente de novo."; conflito "Este anúncio foi alterado em outro lugar. Veja a versão atual e refaça sua alteração." / "Ver versão atual"; não editável "Este trampo não pode mais ser editado."; "Descartar alterações?" / "Você tem alterações que não foram salvas." / "Descartar" / "Continuar editando"; bloqueio "Trampo em andamento não pode ser excluído. Encerre-o primeiro." **[plano]**.

**Candidatura**: "Retirar candidatura" / "Retirando…"; "Retirar sua candidatura?" / "O empregador deixa de ver sua proposta. Você pode se candidatar de novo enquanto o trampo estiver aberto." **[plano]** / "Retirar candidatura" / "Manter candidatura"; toast "Candidatura retirada."; erro "Não foi possível retirar. Tente de novo."; respondida "Esta candidatura já foi respondida e não pode ser retirada."

**Erros (extensão)**: `muitas_tentativas_acao` = "Você fez muitas ações em pouco tempo. Aguarde um minuto e tente de novo. O que você escreveu foi mantido."; `muitas_tentativas` (login/cadastro) inalterada; contador "{n}/{limite}. Passou {x} caracteres. Encurte o texto."; `senha_incorreta_exclusao` "Senha incorreta. Confira e tente de novo." (não reusar `credenciais_invalidas`, que cita e-mail).

## Acessibilidade (WCAG 2.2 AA)

- Contraste: tokens do MVP já validados; destrutivo usa `cores.erro` (6,5:1) com ícone e texto; links do aceite em `primario` (5,4:1 sobre superfície) e sublinhados.
- Alvos >= 44x44: linhas de configuração (56), "Mais opções", "Retirar candidatura", links do aceite e o índice do documento; 8 de espaço entre alvos.
- Documento legal: texto selecionável, `accessibilityRole="header"` nos títulos de seção (navegação por títulos no leitor), ordem lógica, índice como lista de links; respeita fonte do sistema até 200%; linha <= 65 caracteres (largura 560 em telas largas).
- Excluir conta: título anunciado ao abrir; `Aviso` com `role=alert`; diálogo prende e devolve foco, foco inicial em "Cancelar" ou título, nunca no destrutivo; erro de senha anunciado e foco no campo; campo de senha aceita colar e gerenciador de senhas (WCAG 3.3.8); sem desafio cognitivo (sem "digite EXCLUIR").
- Estados de carregamento anunciados (`accessibilityLiveRegion`, `busy`), botões desabilitados informam o motivo em texto (`Motivo`), não só opacidade.
- Toasts >= 6 s e dispensáveis; **resultados destrutivos importantes (conta excluída) em `Aviso` persistente**, não só toast.
- Aceite no cadastro: se caixa, `accessibilityRole="checkbox"` com `accessibilityState.checked`; rótulo é o próprio texto; links como `link`.
- Faixa global: `alert` + `polite`, anunciada uma única vez por mudança; não rouba foco.
- Contador: leitor de tela anuncia só ao passar de 80% do limite e ao exceder ("Passou do limite em {x} caracteres"), não a cada letra.
- Movimento: sem animação essencial; faixa e folhas respeitam `reduzir movimento`.
- Ícones decorativos escondidos do leitor; botões só de ícone têm rótulo.

## O que o dev precisa implementar

1. Textos novos em `textos/pt-BR.ts`, sem texto direto em componente; trocar todos os **[plano]** pelo que o arquiteto decidir.
2. Rotas (contêineres em `src/app/`): `(app)/perfil/conta`, `.../exportar`, `.../excluir`, e documentos legais em `(publico)/politica-de-privacidade` e `(publico)/termos-de-uso` (acessíveis também logado, a partir de Conta e privacidade). Navegação a partir de Perfil, Cadastro e Entrada.
3. Chamadas de API e estado (`src/api`, `src/estado`): exclusão (senha), exportação, editar/encerrar/excluir anúncio, retirar candidatura, mapeamento de 429 por contexto, limpeza de sessão/cache e rascunhos após exclusão. Compartilhamento do arquivo com a folha do sistema do Expo (dependência nova só com aprovação, ver P5).
4. Garantir que o arquivo exportado e as senhas nunca vão a log nem a mensagem de erro (CA15); estender `sem-dado-pessoal.test.tsx` à senha da exclusão e ao conteúdo do arquivo.
5. Mover `FaixaSemConexao` para o layout raiz e remover as renderizações por tela; manter testes cobrindo uma única faixa.
6. Contagem por ponto de código em `CampoDeTexto` e telas com `maxLength`; testes com emoji.
7. Testes de apresentação: estados de cada tela nova (padrão, carregando, erro, sucesso), diálogos e foco.

## Arquivos de apresentação afetados

Novos: `telas/ContaEPrivacidade.tsx`, `telas/ExcluirConta.tsx`, `telas/ExportarDados.tsx`, `telas/DocumentoLegal.tsx`, `componentes/LinhaDeConfiguracao.tsx` (e `CaixaDeSelecao.tsx` se o plano pedir), conteúdo dos documentos (arquivo de dados, a definir com o jurídico), tipos em `telas/tipos.ts`, exports em `telas/index.ts` e `componentes/index.ts`.
Alterados: `telas/Perfil.tsx`, `Cadastro.tsx`, `Entrada.tsx`, `FormularioDeAnuncio.tsx`, `MeusAnuncios.tsx`, `MinhasCandidaturas.tsx`, `RodapeDoTrampo.tsx`, `RodapeDoServico.tsx`, `DetalheDoTrampo.tsx`, `DetalheDoServico.tsx`, `Conversa.tsx`, `Buscar.tsx`, `EditarPerfil.tsx`, `base.tsx`; `componentes/CartaoDeAnuncio.tsx`, `CartaoDeCandidatura.tsx`, `CampoDeTexto.tsx`, `FaixaSemConexao.tsx`, `utilitarios.ts`; `textos/pt-BR.ts`. Contêiner raiz `src/app/_layout.tsx` (dev). Tokens: nenhum.

## Perguntas em aberto

Para o dono:
- **P1** Política de privacidade e termos de uso: quem escreve e quando? As lojas exigem a URL pública da política; é preciso um texto jurídico final (e uma página na web, além da tela no app). Sem isso a tela não vai ao ar.
- **P2** O aceite no cadastro é só o texto "Ao criar a conta, você concorda…" (mais simples, adequado ao que as lojas pedem) ou uma caixa a marcar com registro da versão aceita? (D-b; depende do jurídico/plano.)
- **P3** Excluir conta apaga na hora e para sempre, ou há prazo para desistir (ex.: 14 dias entrando de novo)? Muda o texto de sucesso. **[plano]**
- **P4** O que acontece com mensagens que outras pessoas já receberam e com trampos já em andamento ao excluir? **[plano]**
- **P5** Compartilhar o arquivo exportado usa a folha do sistema; no Expo isso exige `expo-sharing` e `expo-file-system` (dependências novas). Aprova?
- **P6** "Sair" muda de lugar (do Perfil para Conta e privacidade): ok, ou prefere manter também no Perfil? (D-a.) Sugestão: só em Conta e privacidade.
- **P7** Serviço pode ser "pausado" além de excluído? Se não, só "Excluir" para serviço (D-c).
- **P8** Retirar candidatura some do histórico ou fica como "Retirada"? **[plano]**
