/** Textos da interface (pt-BR), por tela. Entrega 2a; as telas da 2b entram no próximo plano. */

const plural = (n: number, um: string, varios: string): string =>
  n === 1 ? um : varios;

const listaDeCampos = (campos: readonly string[]): string =>
  campos.length > 1
    ? `${campos.slice(0, -1).join(', ')} e ${campos[campos.length - 1]}`
    : (campos[0] ?? '');

export const textos = {
  abas: { inicio: 'Início', buscar: 'Buscar', perfil: 'Perfil' },
  gerais: {
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
  },
} as const;

export type ChaveDeErro = keyof typeof textos.erros;
