import type { ReactNode } from 'react';
import type { PerfilPublico, StatusDoTrampo } from '../api/tipos';

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
  onVoltar?: () => void;
}

export interface PropsDoInicio {
  /** Sem nome (perfil ainda vazio), a saudação é "Olá!". */
  nome?: string;
  perfilIncompleto: PerfilIncompleto | null;
  recentesTrampos: Estado<readonly ItemParaExibir[]>;
  recentesServicos: Estado<readonly ItemParaExibir[]>;
  semConexao?: boolean;
  onBuscar: () => void;
  onVerTodos: (tipo: TipoDeAnuncio) => void;
  onAbrirItem: (item: ItemParaExibir) => void;
  onCompletarPerfil: () => void;
  /** Atalhos da 2b: o botão só aparece se o callback for passado. */
  onPublicarTrampo?: () => void;
  onOfertarServico?: () => void;
  onMinhasCandidaturas?: () => void;
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
  aba: AbaDaBusca;
  /** Na situação `ok`, `dados` são os itens já carregados; a contagem sai deles e de `temMais`. */
  estado: EstadoDaBusca;
  temMais: boolean;
  carregandoMais?: boolean;
  /** Erro ao carregar a próxima página (mensagem já traduzida); a lista continua visível. */
  erroAoCarregarMais?: string;
  onTentarCarregarMais?: () => void;
  semConexao?: boolean;
  onMudarTexto: (texto: string) => void;
  onMudarCategoria: (id: string | null) => void;
  onMudarCidade: (cidade: string | null) => void;
  onEnviar: () => void;
  onCarregarMais: () => void;
  onLimparFiltros: () => void;
  onAbrirItem: (item: ItemParaExibir) => void;
  onTrocarAba: (aba: AbaDaBusca) => void;
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
  status: StatusDoTrampo;
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
  semConexao?: boolean;
  onVoltar: () => void;
  onAbrirAutor: (contaId: string) => void;
}

export interface PropsDoDetalheDoServico {
  estado: Estado<ServicoParaExibir>;
  autor: Estado<PerfilPublico>;
  rodape?: ReactNode;
  semConexao?: boolean;
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
