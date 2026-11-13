# Especificação de UI/UX: MVP do Trampo Já (app mobile)

Brief: `docs/produto/briefs/mvp-trampo-ja.md`. Visão: `docs/produto/visao.md`.
Verificação visual: **não verificado visualmente** (projeto sem código). Cores e logo vêm do dono (extraídas da logo); a fonte do protótipo segue pendente e a spec usa a fonte do sistema.

## Objetivo e usuário

Freelancers e empregadores (a mesma conta faz os dois papéis), no celular, com pressa e conexão instável. Princípios: poucos toques até publicar ou se candidatar; uma ação principal por tela; nunca perder o que a pessoa digitou; dizer sempre o que houve e como resolver.

## Fluxo

- Visitante: Entrada -> (Cadastro | Login) -> Início. Navegar e buscar exige conta (decidido).
- Navegação principal: barra inferior com 5 destinos: **Início, Buscar, Publicar, Conversas, Perfil**. "Candidaturas" fica em Perfil ("Minhas candidaturas") e dentro do detalhe do trampo para o autor ("Candidaturas recebidas"); o início mostra atalho.
- Freelancer: Buscar -> Detalhe do trampo -> Candidatar-se (folha inferior) -> confirmação -> Conversas (após candidatura há relação, CA12).
- Empregador: Publicar -> Trampo -> Candidaturas recebidas -> Aceitar -> confirmação -> Conversa.
- Publicar abre escolha: "Publicar um trampo" ou "Ofertar um serviço".
- Cadastro leva ao Perfil em modo "completar perfil" (CA3); pode pular, mas publicar e candidatar-se exigem perfil completo (decidido). Se o app tentar mesmo assim, ou a API responder `perfil_incompleto`, mostrar o aviso "Complete seu perfil..." com o botão "Completar perfil" (vai ao Editar perfil, e volta à tela de origem ao salvar).

## Layout (mobile e desktop)

Mobile 320 a 430 pt é o alvo; tablet/desktop não são escopo (conteúdo centralizado, largura máx. 560, se rodar em tela larga).
- Margem lateral 16 (`space-4`). Barra inferior 56 + área segura. Cabeçalho de tela: título 22 semibold, botão voltar 44x44.
- Ação principal da tela: botão largo (altura 48) fixo no rodapé acima do teclado em formulários; some a barra inferior em formulários e conversa.
- Formulários: 1 coluna, rótulo acima do campo, texto de ajuda abaixo, erro abaixo do campo substituindo a ajuda.
- Listas: cartões empilhados, rolagem vertical, carregar mais ao chegar ao fim (botão "Carregar mais" como alternativa acessível).
- Linhas de texto longo: máx. ~65 caracteres por linha em telas largas.

### Telas (resumo de conteúdo)

1. **Entrada**: logo, frase de valor ("Ache trampo. Ache quem faça."), botões "Criar conta" (primário) e "Já tenho conta" (secundário).
2. **Login**: e-mail, senha (mostrar/ocultar), "Entrar". Link "Criar conta".
3. **Cadastro**: e-mail, senha (mín. 8, contador/ajuda), "Criar conta". Aviso curto de privacidade com link (termos pendentes).
4. **Início**: saudação com nome; campo de busca (atalho para Buscar); atalhos "Publicar trampo" e "Ofertar serviço"; seções "Trampos recentes" e "Serviços recentes" (carrossel horizontal com "Ver todos"); aviso "Complete seu perfil" se incompleto; atalho "Minhas candidaturas".
5. **Buscar**: campo de texto, filtros categoria e cidade (chips que abrem folha de seleção), alternância "Trampos | Serviços" (abas), lista ordenada do mais recente (CA7), contagem de resultados, "Limpar filtros".
6. **Detalhe do trampo**: título, status (selo), categoria, cidade, valor, prazo, descrição, cartão do autor (avatar inicial, nome, cidade, toque abre perfil). Rodapé: ação conforme papel/estado (ver Estados).
7. **Detalhe do serviço**: título, categoria, cidade do freelancer, preço base, descrição, cartão do freelancer. Rodapé: "Conversar" só se houver relação; senão texto explicativo (CA13) e botão desabilitado com motivo.
8. **Publicar trampo**: título, descrição, categoria, cidade, valor (R$), prazo (data, opcional). "Publicar trampo".
9. **Ofertar serviço**: título, descrição, categoria, preço base (R$). "Ofertar serviço".
10. **Candidatar-se** (folha inferior do detalhe): mensagem, valor proposto. "Enviar candidatura".
11. **Candidaturas**: duas abas em "Minhas candidaturas" (como freelancer: status pendente/aceita/recusada) e "Candidaturas recebidas" por trampo (como empregador; cada item com nome, valor, mensagem resumida e "Aceitar" com confirmação).
12. **Conversas**: lista (avatar, nome, prévia da última mensagem, hora) e **Conversa** (bolhas em ordem cronológica, campo de mensagem fixo no rodapé, "Enviar").
13. **Perfil**: avatar inicial, nome, cidade, descrição, habilidades (chips); "Editar perfil", "Minhas candidaturas", "Meus trampos", "Meus serviços", "Sair". Perfil de outra pessoa: sem ações de edição.
14. **Editar perfil**: nome, cidade, descrição (opcional, máx. 300), habilidades (campo + "Adicionar", chips removíveis; mín. 1).

## Componentes

| Componente | Existente ou novo | Onde fica |
|---|---|---|
| Botão (primário, secundário, texto, destrutivo; carregando) | novo | biblioteca de componentes do app |
| Campo de texto (rótulo, ajuda, erro, contador, mostrar/ocultar) | novo | idem |
| Seletor (folha inferior com lista e busca) para categoria e cidade | novo | idem |
| Chip (filtro, habilidade removível) | novo | idem |
| Cartão de trampo / cartão de serviço | novo | idem |
| Selo de status (Aberto, Em andamento, Pendente, Aceita, Recusada) | novo | idem |
| Avatar de inicial | novo | idem |
| Barra inferior e cabeçalho de tela | novo | layout do app |
| Folha inferior (bottom sheet) e diálogo de confirmação | novo | idem |
| Aviso em linha (erro/sucesso/info) e aviso "Sem conexão" (faixa) | novo | idem |
| Esqueleto de carregamento | novo | idem |
| Estado vazio (ícone, título, texto, ação) | novo | idem |
| Bolha de mensagem | novo | idem |
| Toast/snackbar de sucesso | novo | idem |

Ícones: usar o conjunto nativo da stack; pacote novo precisa de aprovação (pendência do dono: estilo de ícones do protótipo).

## Tokens (cores definidas pelo dono; tipografia e demais, provisórios)

Marca: gradiente `linear-gradient(90deg, #1A7FF6 0%, #AF6FF1 100%)` (azul `#1A7FF6` a roxo `#AF6FF1`), extraído da logo. Contraste calculado sobre #FFFFFF.
Problema: `#1A7FF6` com branco dá 3,88:1 e `#AF6FF1` com branco, 3,30:1; nenhum passa 4,5:1 para texto normal. Decisão: **as cores de marca puras ficam só em áreas decorativas e texto grande; texto, botão e foco usam tons derivados mais escuros.**

| Token | Valor | Uso / contraste |
|---|---|---|
| `color-brand-blue` / `color-brand-purple` | #1A7FF6 / #AF6FF1 | decorativo: cabeçalho da Entrada, splash, faixas, ilustrações. Nunca como texto sobre branco nem fundo de texto pequeno |
| `gradient-brand` | 90deg, #1A7FF6 -> #AF6FF1 | cabeçalho da Entrada e destaques. Sobre ele só texto branco **grande** (>= 24 pt ou 18,66 pt em negrito): 3,88:1 a 3,30:1, passa 3:1; sem texto pequeno |
| `color-primary` | #0B5FD0 | botão primário (texto branco 5,9:1), links, ícone ativo, seleção; sobre `color-surface` 5,4:1 |
| `color-primary-pressed` | #0A4FB0 | pressionado (branco 7,6:1) |
| `color-accent` | #7A3FC4 | acento roxo para texto/ícone/selo (branco 6,3:1); par do azul |
| `color-bg` | #FFFFFF | fundo |
| `color-surface` | #F3F5F9 | cartões, campos |
| `color-text` | #1B1F27 | texto (16,5:1) |
| `color-text-muted` | #4B5563 | texto secundário (7,6:1) |
| `color-border` | #7A8496 | borda de campo (3,8:1 sobre branco; passa 3:1) |
| `color-error` / `color-success` | #B3261E / #1B7A43 | 6,5:1 / 5,4:1 sobre branco; sempre com ícone e texto (derivados, não vêm da marca) |
| `color-focus` | #0B5FD0, anel 2 px com 2 px de offset | foco visível, >= 3:1 sobre fundo e superfície |

Botão primário: **cor sólida `color-primary`**, sem gradiente (garante contraste). Gradiente só no cabeçalho da Entrada, barra de progresso do perfil e splash.

### Logo (`logo.svg` na raiz do projeto)
- Limitação: o SVG embute um JPEG de 1254x1254 px; **não é vetor** e tem fundo branco. Pode virar ícone do app, splash e logo da Entrada, mas fica borrado se ampliado além de 1254 px e não tem transparência.
- Uso: sempre sobre fundo branco (`color-bg`) ou dentro de um contêiner branco com `radius-lg`, com respiro de pelo menos 16 ao redor, para não aparecer recorte. Na Entrada: contêiner branco sobre o `gradient-brand`, logo centralizada, lado 96 a 128. Mínimo 48 de lado.
- Splash: fundo branco, logo centralizada. Ícone do app: exportar nos tamanhos exigidos pelas lojas a partir do raster (1024x1024 exige redução, nunca ampliação).
- Pendência: pedir ao dono o **vetor original** (SVG real) para escalar sem perda, versão monocromática e fundo transparente.


### Demais tokens

| Token | Valor | Uso |
|---|---|---|
| Tipografia | fonte do sistema (provisória; pendente: fonte do protótipo) | corpo 16, rótulo 14, título de tela 22, título de seção 18, legenda 13 (mín.); line-height 1,4 |
| `space-1..6` | 4, 8, 12, 16, 24, 32 | espaçamento |
| `radius-sm/md/lg` | 8, 12, 20 | campos, cartões, folhas |
| `touch-min` | 44 | alvo mínimo |

Suportar fonte ampliada do sistema (até 200%) sem cortar texto. Tema escuro fora do MVP.

## Estados

**Globais**
- Carregando: esqueletos nas listas; botão com indicador e desabilitado, texto muda ("Enviando…"); evitar duplo envio.
- Offline: faixa "Sem conexão" no topo; leitura do que já foi carregado continua; ações de envio ficam desabilitadas com explicação; ao voltar a rede, faixa some e "Tentar de novo" recarrega. Rascunhos de formulário e mensagem digitada são mantidos.
- Erro de rede/servidor em lista: estado de erro com "Tentar de novo".
- Sessão expirada (401): volta ao login com aviso; após entrar, retorna à tela anterior.
- Conteúdo longo: títulos em até 2 linhas com reticências nos cartões e completos no detalhe; descrição com "Ler mais" depois de 5 linhas; nomes longos truncados; palavras sem espaço quebram; valores grandes formatados (R$ 1.234,56).
- Foco/pressionado: todo elemento tocável tem estado pressionado e foco visível; desabilitado com contraste reduzido mais motivo em texto quando relevante.

**Por tela**
- Login/Cadastro: padrão, erro por campo, erro geral, carregando. Cadastro com e-mail já usado: mensagem genérica, sem revelar dados (CA2).
- Início: vazio de trampos/serviços ("Ainda não há anúncios"), erro por seção, perfil incompleto (aviso).
- Buscar: inicial (sem busca: categorias sugeridas), carregando, resultados, **sem resultados** (sugere limpar filtros), erro, offline.
- Detalhe do trampo, rodapé por situação:
  - visitante-freelancer, aberto: "Candidatar-se";
  - já candidatado: selo "Candidatura enviada" + "Conversar" (CA9);
  - próprio autor: "Ver candidaturas (n)" (não pode se candidatar);
  - não aberto (em andamento): botão desabilitado + "Este trampo não recebe mais candidaturas." (CA11).
- Candidatar-se: erro de mensagem vazia e valor ≤ 0 por campo; sucesso: folha fecha, toast, selo muda.
- Candidaturas recebidas: vazia ("Nenhuma candidatura ainda"), lista de pendentes; ao aceitar: diálogo de confirmação ("As outras candidaturas serão recusadas"), depois trampo "Em andamento", escolhida "Aceita", demais "Recusada" (CA10); sem desfazer, por isso a confirmação.
- Minhas candidaturas: vazia com ação "Buscar trampos"; selos por status.
- Publicar: validação ao enviar e ao sair do campo; foco vai ao primeiro campo com erro e o leitor de tela anuncia; sucesso: tela de confirmação "Trampo publicado" com "Ver trampo" e "Publicar outro".
- Conversas: vazia ("Suas conversas aparecem aqui depois de uma candidatura ou contratação"); mensagem em envio (relógio), falha (ícone + "Não enviada. Tocar para tentar de novo"); campo vazio mantém "Enviar" desabilitado (CA12); conversa não permitida (CA13): tela de aviso com "Voltar".
- Perfil: incompleto (barra de progresso em texto: "Falta: cidade"), completo; edição com erro por campo e sucesso por toast. Sair: confirmação.

## Textos da interface

Sugestão: manter em um arquivo único de textos/traduções da stack (pt-BR), com chaves por tela.

**Gerais**: "Tentar de novo"; "Carregar mais"; "Voltar"; "Cancelar"; "Sem conexão. Mostrando o que já foi carregado."; "Algo deu errado do nosso lado. Tente de novo em instantes."; "Sem conexão. Conecte-se e tente de novo."
**Entrada/Login/Cadastro**: "Criar conta"; "Já tenho conta"; "Entrar"; "E-mail"; "Senha"; "Mostrar senha"; "Ocultar senha"; ajuda "Mínimo de 8 caracteres".
- "Informe um e-mail válido, como nome@exemplo.com."
- "A senha precisa ter ao menos 8 caracteres."
- "E-mail ou senha incorretos. Confira e tente de novo."
- "Não foi possível criar a conta com este e-mail. Se você já tem conta, tente entrar." (CA2, sem revelar dados)
- "Sua sessão expirou. Entre de novo para continuar." (CA14)
**Início/Busca**: "Olá, {nome}"; "Buscar trampos e serviços"; "Trampos recentes"; "Serviços recentes"; "Ver todos"; "Complete seu perfil para publicar e se candidatar"; "Nenhum resultado para essa busca. Tente outras palavras ou limpe os filtros."; "Limpar filtros"; "{n} resultados".
**Publicar**: "Publicar trampo"; "Ofertar serviço"; rótulos "Título", "Descrição", "Categoria", "Cidade", "Valor (R$)", "Prazo (opcional)", "Preço base (R$)".
- "O título precisa ter de 5 a 80 caracteres." (CA4)
- "Escolha uma categoria." / "Informe a cidade." / "Descreva o que você precisa." (CA5)
- "O valor precisa ser maior que zero." (CA5/CA6)
- Perfil incompleto (também para o erro `perfil_incompleto` da API): "Complete seu perfil para publicar e se candidatar. Falta: {campos}." com botão "Completar perfil" e "Agora não".
- Sucesso: "Trampo publicado! Ele já aparece na busca." / "Serviço ofertado! Ele já aparece na busca."
**Detalhe/Candidaturas**: "Candidatar-se"; "Mensagem para o empregador"; "Valor proposto (R$)"; "Enviar candidatura"; "Candidatura enviada"; "Ver candidaturas ({n})"; "Aceitar candidatura"; "Aceitar {nome}?" + "As outras candidaturas serão recusadas. Isso não pode ser desfeito."; "Aceitar" / "Cancelar"; "Nenhuma candidatura ainda. Assim que alguém se candidatar, aparece aqui."; selos "Aberto", "Em andamento", "Pendente", "Aceita", "Recusada".
- "Escreva uma mensagem para o empregador." / "O valor proposto precisa ser maior que zero."
- "Você não pode se candidatar ao seu próprio trampo." / "Você já se candidatou a este trampo." (CA9)
- "Este trampo não recebe mais candidaturas." (CA11)
- Sucesso: "Candidatura enviada! Você pode acompanhar em Minhas candidaturas." / "Candidatura aceita. Que tal combinar os detalhes na conversa?" (V2: o primeiro virou a tela "Candidatura enviada", CA80 em `specs/visual-v2.md`.)
**Conversas**: "Escreva uma mensagem"; "Enviar"; "Não enviada. Toque para tentar de novo."; "Você só pode conversar com quem tem uma candidatura ou contratação com você." (CA13); vazio: "Suas conversas aparecem aqui depois de uma candidatura ou contratação."
**Perfil**: "Editar perfil"; "Nome"; "Cidade"; "Sobre você (opcional)"; "Habilidades"; "Adicionar habilidade"; "Salvar alterações"; "Informe seu nome." / "Informe sua cidade." / "Adicione ao menos uma habilidade." (CA3); "Perfil atualizado."; "Sair" -> "Sair da conta?" / "Sair" / "Cancelar".

**Categorias (proposta, lista fechada; confirmar com o dono)**: Reformas e reparos, Design, Aulas e reforço, Entregas e transporte, Tecnologia (TI), Eventos, Limpeza e serviços domésticos, Beleza e bem-estar, Fotografia e vídeo, Outros. Lista fechada facilita filtro (CA7) e evita variações; "Outros" cobre o resto. Cidade segue texto livre com sugestões das já cadastradas.

## Acessibilidade (WCAG 2.2 AA)

- Contraste: texto 4,5:1, texto grande e componentes/foco 3:1; valores calculados com as cores do dono (ver Tokens).
- Alvos 44x44 (barra inferior, ícones, chips, remover habilidade); espaçamento mínimo de 8 entre alvos.
- Leitor de tela (TalkBack/VoiceOver): rótulo em todo campo (não só placeholder); papel e nome em todo botão de ícone ("Voltar", "Enviar"); selos lidos como texto ("Status: pendente"); ordem de leitura = ordem visual; folha e diálogo prendem o foco e devolvem ao gatilho ao fechar.
- Erros: texto + ícone (cor nunca única); associados ao campo; anunciados ao aparecer; foco no primeiro erro.
- Teclado: tipo certo por campo (e-mail, número/decimal para valores, senha com preenchimento automático); "Enviar/Próximo" do teclado funciona; valor com máscara de moeda sem bloquear leitor.
- Toast/snackbar: anunciado, dura >= 6 s e pode ser dispensado; mensagens importantes não só em toast.
- Movimento: respeitar "reduzir animações"; sem animação essencial; sem conteúdo piscando.
- Texto escalável até 200%; layout sem rolagem horizontal em 320 pt; orientação retrato e paisagem utilizáveis.
- Autenticação acessível (2.2 3.3.8): permitir colar senha e gerenciador de senhas; sem teste cognitivo.
- Avatar de inicial é decorativo (nome vem em texto ao lado).

## O que o dev precisa implementar

1. Tema com os tokens acima (valor único, nenhum valor fixo em tela) e arquivo de textos pt-BR.
2. Componentes da tabela, com todos os estados.
3. As 14 telas e a navegação (barra inferior, pilha, folhas).
4. Validação no cliente espelhando as mensagens (CA4, CA5, CA6, CA8, CA3), mas **a regra continua no backend**; exibir erros do backend por campo.
5. Tratamento global de offline, 401 e erro de servidor; manter rascunhos.
6. Mapear erros do backend (e-mail repetido, candidatura repetida/própria/trampo fechado, conversa sem relação) para os textos acima, sem expor dados pessoais nem logá-los (CA15).
7. Formatação de moeda e data em pt-BR.

## Arquivos de apresentação afetados

Dependem da stack definida no plano do arquiteto (`docs/produto/planos/mvp-trampo-ja.md`). Por papel: arquivo de tokens do tema; arquivo de textos pt-BR; componentes compartilhados (botão, campo, seletor, chip, cartões, selo, avatar, folha, diálogo, avisos, esqueleto, estado vazio, bolha); layout/navegação (barra inferior, cabeçalho); telas de entrada, login, cadastro, início, busca, detalhe de trampo, detalhe de serviço, publicar trampo, ofertar serviço, candidatar-se, candidaturas (minhas e recebidas), conversas (lista e conversa), perfil e edição de perfil; assets estáticos (`logo.svg`, ícone do app, splash).

## Perguntas em aberto

Pendentes para o dono:
1. Fonte usada no protótipo (nome, licença, pesos) e escala de tamanhos. Até lá, fonte do sistema.
2. Estilo de ícones do protótipo (ou autorizar um pacote de ícones).
3. Logo em vetor original (hoje `logo.svg` é raster embutido), versão monocromática e transparente.

Decididas (`docs/produto/decisoes.md`): lista fechada de 10 categorias; visitante não navega sem conta; valor único e prazo opcional (data limite); publicar e candidatar-se exigem perfil completo; perfil público nunca mostra e-mail. Cores: definidas pelo dono. Tema escuro: fora do MVP.
