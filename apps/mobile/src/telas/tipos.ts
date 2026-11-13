import type { ReactNode } from 'react';
import type {
  PerfilPublico,
  StatusDaCandidatura,
  StatusDoTrampo,
} from '../api/tipos';
import type { Dica } from '../textos/dicas';

/** Estado de um bloco de dados, já traduzido: a tela só desenha, o contêiner decide. */
export type Estado<T> =
  | { readonly situacao: 'carregando' }
  | {
      readonly situacao: 'erro';
      /** Mensagem já traduzida. */
      readonly mensagem: string;
      readonly onTentarDeNovo: () => void;
    }
  | { readonly situacao: 'vazio' }
  | { readonly situacao: 'ok'; readonly dados: T };

/** Campos que faltam no perfil (rótulos já traduzidos: "nome", "cidade"...). */
export interface PerfilIncompleto {
  readonly falta: readonly string[];
}

export type TipoDeAnuncio = 'trampo' | 'servico';

/** V2: modo de navegação (freela ou contratante); igual ao `Modo` do estado. */
export type ModoDoApp = 'freela' | 'contratante';

/** Status aceito pelas telas. `encerrado` entra em `StatusDoTrampo` na etapa 5 (L2). */
export type StatusDoTrampoParaExibir = StatusDoTrampo | 'encerrado';

/** Ação da folha "Mais opções"; ausente no objeto = a ação não existe para o anúncio. */
export interface AcaoDoAnuncio {
  disponivel: boolean;
  /** Motivo (já traduzido) quando indisponível. */
  motivo?: string;
}

/** Folha "Mais opções" de um anúncio. Os diálogos ficam na folha. */
export interface PropsDaFolhaDeAcoes {
  visivel: boolean;
  /** Título do anúncio, para o rótulo da folha. */
  titulo: string;
  tipo: TipoDeAnuncio;
  editar: AcaoDoAnuncio;
  /** Só trampo aberto ou em andamento. */
  encerrar?: AcaoDoAnuncio;
  excluir: AcaoDoAnuncio;
  /** Mensagens dos diálogos, já traduzidas. */
  efeitoDoEncerrar: string;
  efeitoDoExcluir: string;
  processando: 'encerrar' | 'excluir' | null;
  /** Mensagem já traduzida, mostrada na folha. */
  erro?: string;
  /** L4: o anúncio está sendo relido (depois de um 409); as três ações ficam desabilitadas. */
  atualizando?: boolean;
  onEditar: () => void;
  /** Chamado só depois do diálogo. */
  onEncerrar: () => void;
  /** Chamado só depois do diálogo. */
  onExcluir: () => void;
  onFechar: () => void;
}

/** Item de lista pronto para exibir: rótulo, valor e data já formatados pelo contêiner. */
export interface ItemParaExibir {
  tipo: TipoDeAnuncio;
  id: string;
  titulo: string;
  /** Rótulo da categoria (não o id). */
  categoria: string;
  cidade: string | null;
  valorFormatado: string;
  dataFormatada: string;
  /**
   * V2: prazo do trampo já formatado (ex.: "30/11/2026"). Só trampo.
   * `string` = o prazo; `null` = o trampo não tem prazo ("Sem prazo
   * definido"); `undefined` = desconhecido (a busca não devolve o prazo): o
   * cartão não mostra a linha de prazo.
   */
  prazoFormatado?: string | null;
  /**
   * V2: nome de quem publicou, quando o contêiner o tiver (`null` = perfil
   * indisponível). Na busca de serviços com `tipo` fixo, o item vira
   * `CartaoDeFreelancer`; sem o campo, fica o cartão de anúncio.
   */
  autor?: string | null;
}

/** Opção de categoria: `id` vai para a API, `rotulo` para a tela. */
export interface OpcaoDeCategoria {
  id: string;
  rotulo: string;
}
export type AbaDaBusca = 'trampos' | 'servicos';

export interface PropsDaEntrada {
  onCriarConta: () => void;
  onJaTenhoConta: () => void;
  /** Links dos documentos legais (L1); sem o callback, o link não aparece. */
  onPolitica?: () => void;
  onTermos?: () => void;
}

export interface ErrosDeAcesso {
  email?: string;
  senha?: string;
  geral?: string;
}

export interface PropsDeEntrar {
  email: string;
  senha: string;
  erros: ErrosDeAcesso;
  enviando: boolean;
  semConexao?: boolean;
  onMudarEmail: (texto: string) => void;
  onMudarSenha: (texto: string) => void;
  onEntrar: () => void;
  onIrParaCadastro: () => void;
  onVoltar?: () => void;
}

export interface PropsDeCadastro {
  email: string;
  senha: string;
  erros: ErrosDeAcesso;
  enviando: boolean;
  semConexao?: boolean;
  onMudarEmail: (texto: string) => void;
  onMudarSenha: (texto: string) => void;
  onCriarConta: () => void;
  onIrParaEntrar: () => void;
  /** Links do texto de aceite (L1). */
  onPolitica: () => void;
  onTermos: () => void;
  onVoltar?: () => void;
  /**
   * V2 (CA75): objetivo escolhido ("Quero contratar" = `contratante`, "Quero
   * trampar" = `freela`); define só o modo inicial. Com `onEscolherObjetivo`,
   * os cartões aparecem e "Criar conta" fica desabilitado até a escolha.
   */
  objetivo?: ModoDoApp | null;
  onEscolherObjetivo?: (modo: ModoDoApp) => void;
}

export interface PropsDoInicio {
  /** Sem nome (perfil ainda vazio), a saudação é "Olá!". */
  nome?: string;
  perfilIncompleto: PerfilIncompleto | null;
  recentesTrampos: Estado<readonly ItemParaExibir[]>;
  /** Sem uso desde a D63 (o Início do freela não mostra serviços). */
  recentesServicos?: Estado<readonly ItemParaExibir[]>;
  semConexao?: boolean;
  onBuscar: () => void;
  onVerTodos: (tipo: TipoDeAnuncio) => void;
  onAbrirItem: (item: ItemParaExibir) => void;
  onCompletarPerfil: () => void;
  /** Sem uso desde a D63: o Início do freela não tem atalhos de publicar. */
  onPublicarTrampo?: () => void;
  /** Sem uso desde a D63. */
  onOfertarServico?: () => void;
  onMinhasCandidaturas?: () => void;
  /**
   * V2: candidaturas pendentes, para o destaque "{n} em análise" (mesma chave
   * de cache de Meus trampos). Sem o número, o destaque mostra um convite.
   */
  candidaturasEmAnalise?: number | null;
  /** V2: cartão de Dicas & minicursos no fim do Início. */
  onDicas?: () => void;
  /** L4: aviso de retorno (ex.: "Trampo excluído."). */
  toast?: string | null;
  onFecharToast?: () => void;
}

/** `inicial`: nenhuma busca feita ainda (mostra categorias sugeridas). */
export type EstadoDaBusca =
  | Estado<readonly ItemParaExibir[]>
  | { readonly situacao: 'inicial' };

export interface PropsDaBusca {
  texto: string;
  /** Id da categoria escolhida. */
  categoria: string | null;
  cidade: string | null;
  categorias: readonly OpcaoDeCategoria[];
  cidadesSugeridas?: readonly string[];
  /** Aba atual; ignorada quando `tipo` vem. */
  aba?: AbaDaBusca;
  /**
   * V2 (CA84): busca de um tipo só, sem abas. `servicos` = aba Buscar do
   * contratante ("Buscar freelancers"); `trampos` = busca do freela.
   */
  tipo?: AbaDaBusca;
  /** V2: botão voltar no cabeçalho (busca de trampos do freela). */
  onVoltar?: () => void;
  /** Na situação `ok`, `dados` são os itens já carregados; a contagem sai deles e de `temMais`. */
  estado: EstadoDaBusca;
  temMais: boolean;
  carregandoMais?: boolean;
  /** Erro ao carregar a próxima página (mensagem já traduzida); a lista continua visível. */
  erroAoCarregarMais?: string;
  onTentarCarregarMais?: () => void;
  /** L4: aviso de retorno (ex.: "Trampo excluído."). */
  toast?: string | null;
  onFecharToast?: () => void;
  semConexao?: boolean;
  onMudarTexto: (texto: string) => void;
  onMudarCategoria: (id: string | null) => void;
  onMudarCidade: (cidade: string | null) => void;
  onEnviar: () => void;
  onCarregarMais: () => void;
  onLimparFiltros: () => void;
  onAbrirItem: (item: ItemParaExibir) => void;
  /** Obrigatório sem `tipo` (é quem troca a aba). */
  onTrocarAba?: (aba: AbaDaBusca) => void;
}

/** Trampo pronto para exibir: valor, prazo e categoria já formatados pelo contêiner. */
export interface TrampoParaExibir {
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string;
  valorFormatado: string;
  /** `null` sem prazo. */
  prazoFormatado: string | null;
  status: StatusDoTrampoParaExibir;
}

export interface ServicoParaExibir {
  titulo: string;
  descricao: string;
  categoria: string;
  /** `null` quando o serviço não tem cidade. */
  cidade: string | null;
  precoBaseFormatado: string;
}

export interface PropsDoDetalheDoTrampo {
  estado: Estado<TrampoParaExibir>;
  autor: Estado<PerfilPublico>;
  /** Slot da 2b (candidatar, ver candidaturas). Vazio na 2a. */
  rodape?: ReactNode;
  /** Slot sobreposto (ex.: `Toast`), renderizado acima do rodapé fixo. */
  sobreposicao?: ReactNode;
  semConexao?: boolean;
  onVoltar: () => void;
  onAbrirAutor: (contaId: string) => void;
  /** Só para o autor (L2). */
  onMaisOpcoes?: () => void;
  folha?: PropsDaFolhaDeAcoes;
}

export interface PropsDoDetalheDoServico {
  estado: Estado<ServicoParaExibir>;
  autor: Estado<PerfilPublico>;
  rodape?: ReactNode;
  /** Slot sobreposto (ex.: `Toast`) (L2). */
  sobreposicao?: ReactNode;
  semConexao?: boolean;
  /** Só para o autor (L2). */
  onMaisOpcoes?: () => void;
  folha?: PropsDaFolhaDeAcoes;
  onVoltar: () => void;
  onAbrirAutor: (contaId: string) => void;
}

/** `MeuPerfil` e `PerfilPublico` servem: só o que a tela mostra. */
export interface PerfilParaExibir {
  nome: string;
  cidade: string;
  descricao: string | null;
  habilidades: readonly string[];
}

export interface PropsDoPerfil {
  proprio: boolean;
  estado: Estado<PerfilParaExibir>;
  /** Só no próprio perfil. */
  perfilIncompleto?: PerfilIncompleto | null;
  semConexao?: boolean;
  onEditar?: () => void;
  /** Chamado depois da confirmação do diálogo "Sair da conta?". */
  onSair?: () => void;
  onVoltar?: () => void;
  /** Atalhos da 2b: só aparecem se o callback for passado. */
  onMinhasCandidaturas?: () => void;
  onMeusTrampos?: () => void;
  onMeusServicos?: () => void;
  /** Atalho da L1 para "Conta e privacidade". */
  onContaEPrivacidade?: () => void;
  /** V2 (CA75): cartão de modo ("Modo contratante"); só no próprio perfil. */
  onTrocarModo?: () => void;
  /** V2: linha "Dicas & minicursos". */
  onDicas?: () => void;
  /**
   * V2 (CA83): números de `/candidaturas/minhas`; ausente ou `null`, os
   * cartões de número não aparecem.
   */
  contagens?: ContagensDoPerfil | null;
}

/** V2: números do Perfil do freela. */
export interface ContagensDoPerfil {
  enviadas: number;
  confirmadas: number;
}

/** V2 (quadro 18): Perfil da empresa, o Perfil do modo contratante. */
export interface PropsDoPerfilDaEmpresa {
  estado: Estado<PerfilParaExibir>;
  perfilIncompleto?: PerfilIncompleto | null;
  semConexao?: boolean;
  /** Cartão "Modo freela". */
  onTrocarModo: () => void;
  /** "Editar perfil" e "Informações da empresa" (cidade e sobre ficam lá). */
  onEditar: () => void;
  onContaEPrivacidade: () => void;
  /** Chamado depois da confirmação do diálogo "Sair da conta?". */
  onSair: () => void;
}

export interface ValoresDoPerfil {
  nome: string;
  cidade: string;
  descricao: string;
  habilidades: readonly string[];
}

export interface ErrosDoPerfil {
  nome?: string;
  cidade?: string;
  descricao?: string;
  /** Erro de habilidade (obrigatória, demais, inválida): aparece no campo de adicionar. */
  habilidades?: string;
  geral?: string;
}

export interface PropsDoEditarPerfil {
  modoCompletar: boolean;
  valores: ValoresDoPerfil;
  erros: ErrosDoPerfil;
  salvando: boolean;
  /** Mostra o toast "Perfil atualizado." */
  sucesso?: boolean;
  semConexao?: boolean;
  /** L4: ausente = formulário. Fora de `pronta`, a tela não mostra campos nem "Salvar". */
  carregamento?: {
    situacao: 'carregando' | 'erro' | 'pronta';
    onTentarDeNovo: () => void;
  };
  onMudarNome: (texto: string) => void;
  onMudarCidade: (texto: string) => void;
  onMudarDescricao: (texto: string) => void;
  /** O texto digitado fica na tela e é limpo quando a lista de habilidades cresce. */
  onAdicionarHabilidade: (habilidade: string) => void;
  onRemoverHabilidade: (habilidade: string) => void;
  onSalvar: () => void;
  onFecharSucesso?: () => void;
  onVoltar?: () => void;
  onAgoraNao?: () => void;
}

// ---- Entrega 2b: publicação, candidaturas e meus anúncios ----

export type SituacaoDoRodape =
  | { tipo: 'carregando' }
  | { tipo: 'fechado' }
  | { tipo: 'candidatar' }
  /** `quantidade` null: "Ver candidaturas" sem número. */
  | { tipo: 'autor'; quantidade: number | null }
  | { tipo: 'candidatado'; status: StatusDaCandidatura };

export type CampoDoAnuncio =
  | 'titulo'
  | 'descricao'
  | 'categoria'
  | 'cidade'
  | 'valor'
  | 'prazo';

export interface ValoresDoAnuncio {
  titulo: string;
  descricao: string;
  categoria: string | null;
  cidade: string;
  valor: string;
  prazo: string;
}

export type ErrosDoAnuncio = Partial<Record<CampoDoAnuncio | 'geral', string>>;

export interface EdicaoDeAnuncio {
  situacao: 'carregando' | 'erro' | 'nao_encontrado' | 'pronta';
  /** Anúncio que não pode mais ser editado: aviso e campos desabilitados. */
  naoEditavel: boolean;
  /** Motivo específico (`textos.anuncio.motivoEditar*`); sem ele, vale o texto genérico. */
  motivoNaoEditavel?: string;
  /** Conflito de versão (409): aviso com "Ver versão atual". */
  conflito: boolean;
  /** Diálogo "Descartar alterações?". */
  descartarVisivel: boolean;
  onTentarDeNovo: () => void;
  onVerVersaoAtual: () => void;
  onDispensarConflito: () => void;
  onDescartar: () => void;
  onContinuarEditando: () => void;
}

export interface PropsDoFormularioDeAnuncio {
  /** `servico`: sem prazo, cidade opcional, "Preço base (R$)". */
  tipo: TipoDeAnuncio;
  valores: ValoresDoAnuncio;
  erros: ErrosDoAnuncio;
  categorias: readonly OpcaoDeCategoria[];
  enviando: boolean;
  semConexao?: boolean;
  /** Não nulo: aviso D9 no lugar do botão. */
  perfilIncompleto: PerfilIncompleto | null;
  /** Confirmação "Trampo publicado!" / "Serviço ofertado!". */
  publicado: boolean;
  /** Sobe a cada envio recusado: leva o foco ao primeiro erro mesmo se ele não mudou. */
  tentativa?: number;
  /** Modo editar (L2): sem a prop, a tela publica. */
  edicao?: EdicaoDeAnuncio;
  onMudar: (campo: Exclude<CampoDoAnuncio, 'categoria'>, texto: string) => void;
  onMudarCategoria: (id: string | null) => void;
  onSairDoCampo: (campo: CampoDoAnuncio) => void;
  onEnviar: () => void;
  onCompletarPerfil: () => void;
  onAgoraNao: () => void;
  onVerPublicado: () => void;
  onPublicarOutro: () => void;
  onVoltar: () => void;
}

export interface FolhaDeCandidatura {
  visivel: boolean;
  mensagem: string;
  valor: string;
  erros: { mensagem?: string; valor?: string; geral?: string };
  enviando: boolean;
  perfilIncompleto: PerfilIncompleto | null;
  /** Sobe a cada envio recusado: leva o foco ao primeiro erro mesmo se ele não mudou. */
  tentativa?: number;
  onMudarMensagem: (texto: string) => void;
  onMudarValor: (texto: string) => void;
  onSairDoValor: () => void;
  onEnviar: () => void;
  onFechar: () => void;
  onCompletarPerfil: () => void;
}

export interface PropsDoRodapeDoTrampo {
  situacao: SituacaoDoRodape;
  /** V2 (quadro 05): valor à esquerda do "Quero me candidatar". */
  valorFormatado?: string;
  semConexao?: boolean;
  folha: FolhaDeCandidatura;
  onCandidatar: () => void;
  onVerCandidaturas: () => void;
  /** Chega na 2c. */
  onConversar?: () => void;
  estadoDoConversar?: EstadoDoConversar;
  /** Só para candidatura pendente (L2). `motivo`: botão desabilitado e texto. */
  retirar?: {
    retirando: boolean;
    motivo: string | null;
    onRetirar: () => void;
  };
}

export interface CandidaturaParaExibir {
  id: string;
  contaId: string;
  /** `null`: "Perfil indisponível". */
  nome: string | null;
  valorPropostoFormatado: string;
  mensagem: string;
  dataFormatada: string;
  status: StatusDaCandidatura;
  podeAceitar: boolean;
}

export interface PropsDasCandidaturasRecebidas {
  trampo: Estado<{ titulo: string; status: StatusDoTrampoParaExibir }>;
  lista: Estado<readonly CandidaturaParaExibir[]>;
  /** Id em aceite: desabilita todos os "Aceitar". */
  aceitando: string | null;
  erroDoAceite?: string;
  /** Id (conta) com abertura de conversa em andamento: desabilita o "Conversar" dele. */
  abrindoConversaCom?: string | null;
  /** Erro ao abrir a conversa (mensagem já traduzida), mostrado num `Aviso`. */
  erroDaConversa?: string;
  /**
   * Motivo (já traduzido) pelo qual o "Conversar" de cada candidatura está desabilitado;
   * chave = `contaId` do item. Sem entrada, o botão fica habilitado.
   */
  motivoDaConversa?: Readonly<Record<string, string>>;
  toast: string | null;
  semConexao?: boolean;
  /** Chamado depois da confirmação do diálogo. */
  onAceitar: (id: string) => void;
  onAbrirPerfil: (contaId: string) => void;
  onFecharToast: () => void;
  onVoltar: () => void;
  /** Chega na 2c. */
  onConversar?: (contaId: string) => void;
}

export interface MinhaCandidaturaParaExibir {
  id: string;
  trampoId: string;
  /** `null`: "Trampo indisponível". */
  tituloDoTrampo: string | null;
  valorPropostoFormatado: string;
  dataFormatada: string;
  status: StatusDaCandidatura;
  /** Mostra "Retirar candidatura" (só pendente) (L2). */
  podeRetirar?: boolean;
  /**
   * V2 (CA78): status do trampo, para o segmento. `aceita` com trampo
   * `encerrado` cai em Encerrados; sem o campo, em Confirmados.
   */
  statusDoTrampo?: StatusDoTrampoParaExibir | null;
  /** V2: nome de quem publicou (`GET /perfis/:id`, com cache). */
  autor?: string | null;
  /** V2: prazo do trampo, já formatado. */
  prazoFormatado?: string | null;
}

/** V2 (CA78): segmentos de Meus trampos. */
export type SegmentoDeMeusTrampos = 'analise' | 'confirmados' | 'encerrados';

export interface PropsDasMinhasCandidaturas {
  lista: Estado<readonly MinhaCandidaturaParaExibir[]>;
  semConexao?: boolean;
  /** Id da candidatura sendo retirada: desabilita os "Retirar" (L2). */
  retirando?: string | null;
  /** Aviso já traduzido (ex.: candidatura já respondida) (L2). */
  aviso?: string;
  /** Dispensa o aviso; sem ela, o aviso não tem botão de fechar. */
  onFecharAviso?: () => void;
  toast?: string | null;
  /** Chamado depois do diálogo. */
  onRetirar?: (id: string) => void;
  onFecharToast?: () => void;
  onAbrirTrampo: (trampoId: string) => void;
  onBuscarTrampos: () => void;
  /** Sem ela, não há voltar (aba Meus trampos). */
  onVoltar?: () => void;
  /**
   * V2 (CA78): aba "Meus trampos" com os segmentos Em análise, Confirmados e
   * Encerrados (título grande, sem voltar). Sem a prop, a lista é única.
   */
  segmentada?: boolean;
  /** Segmento aberto ao montar (padrão: Em análise). */
  segmentoInicial?: SegmentoDeMeusTrampos;
  /** V2: "Mensagem" na candidatura aceita. */
  onMensagem?: (item: MinhaCandidaturaParaExibir) => void;
}

export type MeuAnuncioParaExibir = ItemParaExibir & {
  status: StatusDoTrampoParaExibir | 'ativo';
  /** V2: candidaturas recebidas (selo "{n} interessados"); só trampo. */
  interessados?: number;
};

/** V2 (CA79): abas de Demandas, pelo `status` do trampo. */
export type AbaDeDemandas = 'aberto' | 'em_andamento' | 'encerrado';

export interface PropsDosMeusAnuncios {
  tipo: TipoDeAnuncio;
  lista: Estado<readonly MeuAnuncioParaExibir[]>;
  semConexao?: boolean;
  onAbrirItem: (item: MeuAnuncioParaExibir) => void;
  onPublicar: () => void;
  /**
   * D64 (quadro 14): botão "Ver candidatos ({n})" do cartão de demanda
   * (aba Demandas, com `segmentada`). Sem o callback, o botão não aparece.
   */
  onVerCandidatos?: (item: MeuAnuncioParaExibir) => void;
  /**
   * D64: botão "Editar" do cartão de demanda sem interessados (`interessados`
   * igual a 0). Sem o callback, o botão não aparece.
   */
  onEditar?: (item: MeuAnuncioParaExibir) => void;
  /** Sem ela, não há voltar (aba Demandas, com `segmentada`). */
  onVoltar?: () => void;
  /** L2: folha "Mais opções" do item aberto, toast de resultado. */
  folha?: PropsDaFolhaDeAcoes;
  onMaisOpcoes?: (item: MeuAnuncioParaExibir) => void;
  toast?: string | null;
  onFecharToast?: () => void;
  /** L4: "Carregar mais"; ausente = sem paginação. `erro` é a mensagem já traduzida. */
  carregarMais?: {
    carregando: boolean;
    erro?: string;
    onCarregarMais: () => void;
  };
  /**
   * V2 (CA79): aba "Demandas" (só `tipo` trampo): título grande com "+"
   * (`onPublicar`) e as abas Abertas, Em andamento e Encerradas, que filtram
   * as páginas já carregadas. Sem a prop, a lista é única.
   */
  segmentada?: boolean;
  abaInicial?: AbaDeDemandas;
}

// ---- Entrega 2c: conversas ----

export interface ConversaParaExibir {
  id: string;
  /** `null`: "Perfil indisponível". */
  nome: string | null;
  /** `null`: "Nenhuma mensagem ainda". */
  previa: string | null;
  horaFormatada: string;
}

export interface PropsDaListaDeConversas {
  lista: Estado<readonly ConversaParaExibir[]>;
  semConexao?: boolean;
  onAbrir: (id: string) => void;
  /** V2: escolhe o subtítulo ("com seus contratantes" / "com os profissionais"). */
  modo?: ModoDoApp;
}

export type SituacaoDaMensagem = 'enviada' | 'enviando' | 'falhou';

export interface MensagemParaExibir {
  /** Chave estável da lista (nunca o texto). */
  chave: string;
  minha: boolean;
  texto: string;
  /** `null` enquanto não há hora confirmada. */
  horaFormatada: string | null;
  situacao: SituacaoDaMensagem;
  /**
   * Dia da mensagem no fuso do aparelho ("Hoje", "Ontem" ou `dd/mm/aaaa`). A
   * tela põe o separador de dia antes da primeira mensagem e sempre que ele
   * muda entre duas seguidas. Sem o campo (ou `null`), nenhum separador.
   */
  diaFormatado?: string | null;
}

/** Faixa de contexto do chat: título do trampo, selo da candidatura e valor; o toque abre o trampo. */
export interface FaixaDaConversa {
  titulo: string;
  statusDaCandidatura: StatusDaCandidatura;
  /** Ex.: "R$ 120,00". */
  valorFormatado: string;
  onAbrir: () => void;
}

export interface PropsDaConversa {
  titulo: string;
  /** Nome de quem escreve do outro lado, para o rótulo das bolhas; `null` = "Outra pessoa". Sem a prop, usa `titulo`. */
  nomeDoOutro?: string | null;
  /** Máximo de caracteres da mensagem (padrão 2000). */
  limite?: number;
  /** Vazio: "Nenhuma mensagem ainda. Que tal começar?". */
  mensagens: Estado<readonly MensagemParaExibir[]>;
  /** Aviso de conversa indisponível (nao_encontrado) com "Voltar". */
  indisponivel: boolean;
  rascunho: string;
  podeEnviar: boolean;
  semConexao?: boolean;
  /** Três falhas seguidas ao atualizar: mostra o aviso, a lista continua visível. */
  atualizacaoFalhando?: boolean;
  /** Texto já traduzido de falha ao enviar (ex.: limite de ações, 429); aparece acima do campo. */
  avisoDoEnvio?: string;
  /** V2: título do trampo da conversa, abaixo do nome ("Sobre: {título}"). */
  contexto?: string | null;
  /** V2: chips de resposta rápida (só freela com candidatura confirmada); preenchem o campo. */
  comRespostasRapidas?: boolean;
  /** V2 (quadro 09): card compacto do trampo da conversa, abaixo do cabeçalho. Sem a prop, não aparece. */
  faixa?: FaixaDaConversa | null;
  onMudarRascunho: (texto: string) => void;
  onEnviar: () => void;
  onTentarDeNovo: (chave: string) => void;
  onVoltar: () => void;
}

/** `motivo`: botão desabilitado e texto explicativo. */
export interface EstadoDoConversar {
  abrindo: boolean;
  motivo: string | null;
}

export interface PropsDoRodapeDoServico {
  conversar: EstadoDoConversar;
  onConversar: () => void;
}

/** Documento legal empacotado (mesmo formato de `textos/legal.ts`). */
export interface DocumentoLegalParaExibir {
  titulo: string;
  /** AAAA-MM-DD. */
  versao: string;
  rascunho: boolean;
  secoes: readonly {
    titulo: string;
    paragrafos: readonly string[];
  }[];
}

export interface PropsDoDocumentoLegal {
  documento: DocumentoLegalParaExibir;
  onVoltar: () => void;
}

export interface PropsDeContaEPrivacidade {
  onExportar: () => void;
  onExcluir: () => void;
  onPolitica: () => void;
  onTermos: () => void;
  /** Chamado depois da confirmação do diálogo "Sair da conta?". */
  onSair: () => void;
  /** Mostra o voltar no cabeçalho. */
  onVoltar?: () => void;
  /** Desabilita exportar e excluir, com motivo. */
  semConexao?: boolean;
}

export interface PropsDeExcluirConta {
  senha: string;
  onMudarSenha: (texto: string) => void;
  excluindo: boolean;
  /** Mensagem já traduzida (servidor, sem conexão, 429), mostrada em aviso. */
  erro?: string;
  /** Erro da senha (senha incorreta), mostrado no campo. */
  erroDaSenha?: string;
  semConexao?: boolean;
  /** Chamado depois do diálogo destrutivo. */
  onExcluir: () => void;
  onExportar: () => void;
  onCancelar: () => void;
}

export interface PropsDeExportarDados {
  situacao: 'inicial' | 'gerando' | 'gerado';
  senha: string;
  onMudarSenha: (texto: string) => void;
  /** Mensagem já traduzida. */
  erro?: string;
  /** Erro da senha (senha incorreta), mostrado no campo. */
  erroDaSenha?: string;
  semConexao?: boolean;
  onGerar: () => void;
  onVoltar: () => void;
}

// ---- V2a: telas novas ----

/** Resumo da candidatura (do cache); `null` = só o título e os passos. */
export interface ResumoDaCandidaturaEnviada {
  titulo: string;
  /** Nome de quem publicou; `null` = sem nome no cache. */
  autor: string | null;
  prazoFormatado: string | null;
  /** Valor proposto ou do trampo, já formatado. */
  valorFormatado: string | null;
}

/** V2 (quadro 06; CA80). */
export interface PropsDaCandidaturaEnviada {
  resumo: ResumoDaCandidaturaEnviada | null;
  onVerMeusTrampos: () => void;
  onBuscarMais: () => void;
  /** Volta ao detalhe do trampo (o voltar do sistema faz o mesmo). */
  onVoltar?: () => void;
}

/** Conteúdo de Dicas: o formato de `textos/dicas.ts`. */
export type DicaParaExibir = Dica;

/** V2 (quadro 11; CA81): lista local, sem rede. */
export interface PropsDasDicas {
  /** Padrão: `DICAS` de `textos/dicas.ts`. */
  conteudos?: readonly DicaParaExibir[];
  onAbrir: (id: string) => void;
  onVoltar: () => void;
}

/** V2 (CA81): leitura; `dica` nula = conteúdo não encontrado. */
export interface PropsDaLeituraDeDica {
  dica: DicaParaExibir | null;
  onVoltar: () => void;
}

/** Demanda aberta no Início do contratante (CA82). */
export interface DemandaParaExibir {
  id: string;
  titulo: string;
  prazoFormatado: string | null;
  /** `candidaturasRecebidas` do trampo. */
  interessados: number;
}

/** V2 (quadro 12; CA82). */
export interface PropsDoInicioDoContratante {
  /** Nome da empresa; sem ele, a saudação é "Olá!". */
  nome?: string;
  perfilIncompleto?: PerfilIncompleto | null;
  /** Trampos `aberto` de `/trampos/meus`; a tela mostra até 3. */
  demandas: Estado<readonly DemandaParaExibir[]>;
  /**
   * Se a conta tem alguma demanda (de qualquer status). `true` com a lista
   * vazia = "Nenhuma demanda aberta"; `false` ou ausente = "Você ainda não
   * publicou demandas".
   */
  temDemandas?: boolean;
  semConexao?: boolean;
  onNovaDemanda: () => void;
  onVerDemandas: () => void;
  onVerCandidatos: (id: string) => void;
  onCompletarPerfil?: () => void;
  toast?: string | null;
  onFecharToast?: () => void;
}
