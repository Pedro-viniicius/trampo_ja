/** Textos da interface (pt-BR), por tela. Entregas 2a e 2b (as conversas entram na 2c). */

const plural = (n: number, um: string, varios: string): string =>
  n === 1 ? um : varios;

const listaDeCampos = (campos: readonly string[]): string =>
  campos.length > 1
    ? `${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}`
    : (campos[0] ?? '');

export const textos = {
  abas: {
    inicio: 'Início',
    buscar: 'Buscar',
    publicar: 'Publicar',
    perfil: 'Perfil',
  },
  gerais: {
    toastFechar: 'Fechar aviso',
    ajudaValor: 'Digite o valor em reais, por exemplo 150,00.',
    tentarDeNovo: 'Tentar de novo',
    carregarMais: 'Carregar mais',
    voltar: 'Voltar',
    cancelar: 'Cancelar',
    carregando: 'Carregando…',
    semConexaoFaixa: 'Sem conexão. Mostrando o que já foi carregado.',
    verTodos: 'Ver todos',
    fechar: 'Fechar',
    tipoTrampo: 'Trampo',
    tipoServico: 'Serviço',
    status: (rotulo: string): string => `Status: ${rotulo}`,
  },
  entrada: {
    frase: 'Ache trampo. Ache quem faça.',
    criarConta: 'Criar conta',
    jaTenhoConta: 'Já tenho conta',
    logo: 'Logo do Trampo Já',
  },
  entrar: {
    titulo: 'Entrar',
    email: 'E-mail',
    senha: 'Senha',
    mostrarSenha: 'Mostrar senha',
    ocultarSenha: 'Ocultar senha',
    entrar: 'Entrar',
    entrando: 'Entrando…',
    criarConta: 'Criar conta',
    semConta: 'Ainda não tem conta?',
  },
  cadastro: {
    titulo: 'Criar conta',
    email: 'E-mail',
    senha: 'Senha',
    ajudaSenha: 'Mínimo de 8 caracteres',
    mostrarSenha: 'Mostrar senha',
    ocultarSenha: 'Ocultar senha',
    criarConta: 'Criar conta',
    criando: 'Criando conta…',
    jaTenhoConta: 'Já tenho conta',
    privacidade:
      'Usamos seu e-mail só para a sua conta. Ele nunca aparece no seu perfil público.',
  },
  inicio: {
    saudacao: (nome: string): string => `Olá, ${nome}`,
    saudacaoSemNome: 'Olá!',
    buscar: 'Buscar trampos e serviços',
    publicarTrampo: 'Publicar trampo',
    ofertarServico: 'Ofertar serviço',
    trampos: 'Trampos recentes',
    servicos: 'Serviços recentes',
    vazio: 'Ainda não há anúncios',
    vazioTexto: 'Assim que alguém publicar, aparece aqui.',
    minhasCandidaturas: 'Minhas candidaturas',
    erroSecao: 'Não foi possível carregar esta parte.',
  },
  buscar: {
    titulo: 'Buscar',
    campo: 'Buscar trampos e serviços',
    abaTrampos: 'Trampos',
    abaServicos: 'Serviços',
    categoria: 'Categoria',
    cidade: 'Cidade',
    todasCategorias: 'Todas as categorias',
    todasCidades: 'Todas as cidades',
    limparFiltros: 'Limpar filtros',
    resultados: (n: number, temMais: boolean): string =>
      `${n}${temMais ? '+' : ''} ${plural(n, 'resultado', 'resultados')}`,
    semResultados:
      'Nenhum resultado para essa busca. Tente outras palavras ou limpe os filtros.',
    inicial: 'Comece por uma categoria',
    inicialTexto: 'Escolha uma categoria ou digite o que você procura.',
    aplicar: 'Aplicar',
    pesquisarCategoria: 'Pesquisar categoria',
    pesquisarCidade: 'Pesquisar cidade',
    semOpcoes: 'Nenhuma opção com esse nome. Tente outras letras.',
    tocarParaEscolher: 'Toque para escolher uma opção',
  },
  detalheTrampo: {
    titulo: 'Trampo',
    valor: 'Valor',
    prazo: 'Prazo',
    semPrazo: 'Sem prazo definido',
    descricao: 'Descrição',
    lerMais: 'Ler mais',
    lerMenos: 'Ler menos',
    publicadoPor: 'Publicado por',
    candidatar: 'Candidatar-se',
    jaCandidatou: 'Candidatura enviada',
    verCandidaturas: (n: number): string => `Ver candidaturas (${n})`,
    fechado: 'Este trampo não recebe mais candidaturas.',
    seloAberto: 'Aberto',
    seloEmAndamento: 'Em andamento',
  },
  detalheServico: {
    titulo: 'Serviço',
    precoBase: 'Preço base',
    descricao: 'Descrição',
    lerMais: 'Ler mais',
    lerMenos: 'Ler menos',
    ofertadoPor: 'Ofertado por',
    conversar: 'Conversar',
    semRelacao:
      'Você só pode conversar com quem tem uma candidatura ou contratação com você.',
  },
  perfil: {
    titulo: 'Perfil',
    editar: 'Editar perfil',
    minhasCandidaturas: 'Minhas candidaturas',
    meusTrampos: 'Meus trampos',
    meusServicos: 'Meus serviços',
    sair: 'Sair',
    sairTitulo: 'Sair da conta?',
    sairConfirmar: 'Sair',
    sairCancelar: 'Cancelar',
    sobre: 'Sobre',
    habilidades: 'Habilidades',
    semDescricao: 'Sem descrição.',
    falta: (campos: readonly string[]): string =>
      `Falta: ${listaDeCampos(campos)}`,
    avisoIncompleto: (campos: readonly string[]): string =>
      `Complete seu perfil para publicar e se candidatar. Falta: ${listaDeCampos(campos)}.`,
    completar: 'Completar perfil',
    camposNome: 'nome',
    camposCidade: 'cidade',
    camposHabilidades: 'habilidades',
  },
  editarPerfil: {
    titulo: 'Editar perfil',
    tituloCompletar: 'Complete seu perfil',
    introCompletar: 'Falta pouco para publicar e se candidatar.',
    nome: 'Nome',
    cidade: 'Cidade',
    descricao: 'Sobre você (opcional)',
    habilidades: 'Habilidades',
    adicionarHabilidade: 'Adicionar habilidade',
    adicionar: 'Adicionar',
    remover: (habilidade: string): string => `Remover ${habilidade}`,
    salvar: 'Salvar alterações',
    salvando: 'Salvando…',
    agoraNao: 'Agora não',
    avisoVisibilidade:
      'Nome, cidade, descrição e habilidades aparecem para quem usa o Trampo Já. Não coloque telefone, endereço ou documentos.',
    sucesso: 'Perfil atualizado.',
    contador: (n: number, max: number): string => `${n} de ${max} caracteres`,
  },
  avisoPerfil: {
    // Aviso D9: no lugar do formulário ou do botão quando o perfil não está completo.
    mensagem: (campos: readonly string[]): string =>
      campos.length > 0
        ? `Complete seu perfil para publicar e se candidatar. Falta: ${listaDeCampos(campos)}.`
        : 'Complete seu perfil para publicar e se candidatar.',
    completar: 'Completar perfil',
    agoraNao: 'Agora não',
  },
  escolhaDePublicacao: {
    titulo: 'Publicar',
    pergunta: 'O que você quer fazer?',
    trampo: 'Publicar trampo',
    trampoAjuda: 'Preciso de alguém para fazer um serviço.',
    servico: 'Ofertar serviço',
    servicoAjuda: 'Quero oferecer o que sei fazer.',
  },
  formularioDeAnuncio: {
    tituloTrampo: 'Publicar trampo',
    tituloServico: 'Ofertar serviço',
    titulo: 'Título',
    descricao: 'Descrição',
    categoria: 'Categoria',
    escolherCategoria: 'Escolher categoria',
    pesquisarCategoria: 'Pesquisar categoria',
    cidade: 'Cidade',
    cidadeOpcional: 'Cidade (opcional)',
    ajudaCidadeServico:
      'Sem cidade, o serviço aparece em todas as buscas por categoria.',
    valor: 'Valor (R$)',
    precoBase: 'Preço base (R$)',
    prazo: 'Prazo (opcional)',
    ajudaPrazo:
      'Digite dia, mês e ano; as barras entram sozinhas. Exemplo: 31/12/2026.',
    avisoVisibilidade:
      'Título, descrição e cidade aparecem para quem usa o Trampo Já e não podem ser editados depois. Não coloque telefone, endereço ou documentos.',
    contador: (n: number, max: number): string => `${n} de ${max} caracteres`,
    publicarTrampo: 'Publicar trampo',
    ofertarServico: 'Ofertar serviço',
    enviando: 'Enviando…',
    semConexaoMotivo: 'Sem conexão. Conecte-se para publicar.',
    publicadoTrampo: 'Trampo publicado!',
    publicadoTrampoTexto: 'Ele já aparece na busca.',
    publicadoServico: 'Serviço ofertado!',
    publicadoServicoTexto: 'Ele já aparece na busca.',
    verTrampo: 'Ver trampo',
    verServico: 'Ver serviço',
    publicarOutro: 'Publicar outro',
    ofertarOutro: 'Ofertar outro',
  },
  candidatar: {
    titulo: 'Candidatar-se',
    mensagem: 'Mensagem para o empregador',
    valor: 'Valor proposto (R$)',
    avisoVisibilidade:
      'Quem publicou o trampo vê seu nome, sua mensagem e o valor proposto.',
    enviar: 'Enviar candidatura',
    enviando: 'Enviando…',
    semConexaoMotivo: 'Sem conexão. Conecte-se para enviar sua candidatura.',
    fecharFolha: 'Fechar candidatura',
    enviada:
      'Candidatura enviada! Você pode acompanhar em Minhas candidaturas.',
    aceita: 'Candidatura aceita. Que tal combinar os detalhes na conversa?',
    verCandidaturas: (n: number | null): string =>
      n === null ? 'Ver candidaturas' : `Ver candidaturas (${n})`,
    fecharAviso: 'Fechar aviso',
  },
  selos: {
    pendente: 'Pendente',
    aceita: 'Aceita',
    recusada: 'Recusada',
    aberto: 'Aberto',
    emAndamento: 'Em andamento',
    ativo: 'Ativo',
  },
  candidaturasRecebidas: {
    titulo: 'Candidaturas recebidas',
    vazio: 'Nenhuma candidatura ainda',
    vazioTexto: 'Assim que alguém se candidatar, aparece aqui.',
    aceitar: 'Aceitar candidatura',
    aceitarDe: (nome: string | null): string =>
      nome ? `Aceitar candidatura de ${nome}` : 'Aceitar esta candidatura',
    conversarCom: (nome: string | null): string =>
      nome ? `Conversar com ${nome}` : 'Conversar com esta pessoa',
    aceitando: 'Aceitando…',
    confirmarTitulo: (nome: string | null): string =>
      `Aceitar ${nome ?? 'esta candidatura'}?`,
    confirmarTexto:
      'As outras candidaturas serão recusadas. Isso não pode ser desfeito.',
    confirmar: 'Aceitar',
    cancelar: 'Cancelar',
    perfilIndisponivel: 'Perfil indisponível',
    valorProposto: 'Valor proposto',
    enviadaEm: (data: string): string => `Enviada em ${data}`,
    verPerfil: (nome: string | null): string =>
      `Ver perfil de ${nome ?? 'candidato'}`,
    trampoEmAndamento: 'Este trampo está em andamento.',
    semConexaoMotivo: 'Sem conexão. Conecte-se para aceitar.',
    aceitaToast:
      'Candidatura aceita. Que tal combinar os detalhes na conversa?',
    conversar: 'Conversar',
  },
  minhasCandidaturas: {
    titulo: 'Minhas candidaturas',
    vazio: 'Você ainda não se candidatou',
    vazioTexto: 'Quando você se candidatar a um trampo, ele aparece aqui.',
    buscarTrampos: 'Buscar trampos',
    trampoIndisponivel: 'Trampo indisponível',
    valorProposto: 'Valor proposto',
    enviadaEm: (data: string): string => `Enviada em ${data}`,
  },
  meusAnuncios: {
    tituloTrampos: 'Meus trampos',
    tituloServicos: 'Meus serviços',
    vazioTrampos: 'Você ainda não publicou trampos',
    vazioTrampoTexto: 'Publique um trampo e receba candidaturas.',
    vazioServicos: 'Você ainda não ofertou serviços',
    vazioServicoTexto: 'Ofereça o que você sabe fazer para ser encontrado.',
    publicarTrampo: 'Publicar trampo',
    ofertarServico: 'Ofertar serviço',
  },
  erros: {
    email_invalido: 'Informe um e-mail válido, como nome@exemplo.com.',
    // Limites iguais aos da API (8 a 128).
    senha_curta: 'A senha precisa ter de 8 a 128 caracteres.',
    credenciais_invalidas:
      'E-mail ou senha incorretos. Confira e tente de novo.',
    email_em_uso:
      'Não foi possível criar a conta com este e-mail. Se você já tem conta, tente entrar.',
    muitas_tentativas:
      'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
    sessao_expirada: 'Sua sessão expirou. Entre de novo para continuar.',
    sem_conexao: 'Sem conexão. Conecte-se e tente de novo.',
    erro_servidor: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
    nao_encontrado:
      'Não encontramos isto. Pode ter sido removido. Volte e tente de novo.',
    nome_obrigatorio: 'Informe seu nome.',
    nome_tamanho: 'O nome precisa ter de 2 a 80 caracteres.',
    cidade_obrigatoria: 'Informe sua cidade.',
    cidade_tamanho: 'A cidade precisa ter de 2 a 80 caracteres.',
    descricao_tamanho:
      'O texto sobre você pode ter até 300 caracteres. Encurte um pouco.',
    habilidade_obrigatoria: 'Adicione ao menos uma habilidade.',
    habilidades_demais:
      'Você pode ter até 10 habilidades. Remova alguma para adicionar outra.',
    habilidade_tamanho: 'Cada habilidade precisa ter de 2 a 30 caracteres.',
    habilidade_invalida:
      'Esta habilidade é inválida ou já foi adicionada. Tente outro nome.',
    titulo_tamanho: 'O título precisa ter de 5 a 80 caracteres.',
    descricao_trampo_obrigatoria: 'Descreva o que você precisa.',
    descricao_servico_obrigatoria: 'Descreva o que você oferece.',
    descricao_anuncio_tamanho:
      'A descrição pode ter até 2.000 caracteres. Encurte um pouco.',
    categoria_obrigatoria: 'Escolha uma categoria.',
    cidade_anuncio_obrigatoria: 'Informe a cidade.',
    valor_invalido:
      'O valor precisa ser maior que zero. Digite, por exemplo, 150,00.',
    valor_proposto_invalido:
      'O valor proposto precisa ser maior que zero. Digite, por exemplo, 150,00.',
    valor_alto: 'Este valor é alto demais. Confira se digitou certo.',
    prazo_invalido:
      'Confira o prazo: dia, mês e ano, como 31/12/2026, ou deixe em branco.',
    aceite_perdido: 'Outra candidatura já foi aceita. Atualizamos a lista.',
    mensagem_obrigatoria: 'Escreva uma mensagem para o empregador.',
    mensagem_tamanho:
      'A mensagem pode ter até 2.000 caracteres. Encurte um pouco.',
    perfil_incompleto: 'Complete seu perfil para publicar e se candidatar.',
    autor_nao_pode_candidatar:
      'Você não pode se candidatar ao seu próprio trampo.',
    candidatura_duplicada: 'Você já se candidatou a este trampo.',
    trampo_nao_aberto: 'Este trampo não recebe mais candidaturas.',
    candidatura_nao_pendente:
      'Esta candidatura já foi respondida. Atualizamos a lista para você.',
    conflito_de_versao:
      'Algo mudou enquanto você agia. Atualizamos a lista; tente de novo.',
  },
} as const;

export type ChaveDeErro = keyof typeof textos.erros;
