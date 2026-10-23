import { ehErroDaApi, ehErroDeRede } from '../api/erros';
import type { CampoInvalido, MotivoDeCampo } from '../api/tipos';
import { type ChaveDeErro, textos } from '../textos/pt-BR';

export type { ChaveDeErro };

/** Formulário (ou ação) que originou o erro; define quais campos valem. */
export type Formulario =
  | 'entrar'
  | 'cadastro'
  | 'perfil'
  | 'trampo'
  | 'servico'
  | 'candidatura'
  | 'nenhum';

export interface ErroTraduzido {
  /** Erro que não é de um campo (mostrado acima do botão ou como aviso). */
  readonly geral?: ChaveDeErro;
  /** Erro por campo do formulário (`email`, `nome`, `habilidades`...). */
  readonly campos: Partial<Record<string, ChaveDeErro>>;
}

const CAMPOS_DO_FORMULARIO: Record<Formulario, readonly string[]> = {
  entrar: ['email', 'senha'],
  cadastro: ['email', 'senha'],
  perfil: ['nome', 'cidade', 'descricao', 'habilidades'],
  trampo: [
    'titulo',
    'descricao',
    'categoria',
    'cidade',
    'valorCentavos',
    'prazo',
  ],
  servico: ['titulo', 'descricao', 'categoria', 'cidade', 'precoBaseCentavos'],
  candidatura: ['mensagem', 'valorPropostoCentavos'],
  nenhum: [],
};

function chaveDoCampo(
  campo: string,
  motivo: MotivoDeCampo,
  formulario: Formulario,
): ChaveDeErro | undefined {
  switch (campo) {
    case 'email':
      return 'email_invalido';
    case 'senha':
      return 'senha_curta';
    case 'nome':
      return motivo === 'obrigatorio' ? 'nome_obrigatorio' : 'nome_tamanho';
    case 'cidade':
      if (motivo !== 'obrigatorio') {
        return 'cidade_tamanho';
      }
      return formulario === 'perfil'
        ? 'cidade_obrigatoria'
        : 'cidade_anuncio_obrigatoria';
    case 'descricao':
      if (formulario === 'perfil') {
        return 'descricao_tamanho';
      }
      if (motivo !== 'obrigatorio') {
        return 'descricao_anuncio_tamanho';
      }
      return formulario === 'servico'
        ? 'descricao_servico_obrigatoria'
        : 'descricao_trampo_obrigatoria';
    case 'titulo':
      return 'titulo_tamanho';
    case 'categoria':
      return 'categoria_obrigatoria';
    case 'valorCentavos':
    case 'precoBaseCentavos':
      return 'valor_invalido';
    case 'valorPropostoCentavos':
      return 'valor_proposto_invalido';
    case 'prazo':
      return 'prazo_invalido';
    case 'mensagem':
      return motivo === 'obrigatorio'
        ? 'mensagem_obrigatoria'
        : 'mensagem_tamanho';
    case 'habilidades':
      if (motivo === 'obrigatorio') {
        return 'habilidade_obrigatoria';
      }
      return motivo === 'tamanho'
        ? 'habilidades_demais'
        : 'habilidade_invalida';
    default:
      return undefined;
  }
}

function chaveDeItemDeHabilidade(motivo: MotivoDeCampo): ChaveDeErro {
  return motivo === 'tamanho' ? 'habilidade_tamanho' : 'habilidade_invalida';
}

// `habilidades.3` -> `habilidades` (o índice não importa para o texto).
const ITEM_DE_HABILIDADE = /^habilidades\.\d+$/;

function camposDoErro400(
  campos: readonly CampoInvalido[],
  formulario: Formulario,
): Partial<Record<string, ChaveDeErro>> {
  const aceitos = CAMPOS_DO_FORMULARIO[formulario];
  const resultado: Partial<Record<string, ChaveDeErro>> = {};
  let itemDeHabilidade: ChaveDeErro | undefined;

  for (const { campo, motivo } of campos) {
    if (ITEM_DE_HABILIDADE.test(campo)) {
      // O primeiro item recusado decide o texto do grupo.
      if (aceitos.includes('habilidades') && itemDeHabilidade === undefined) {
        itemDeHabilidade = chaveDeItemDeHabilidade(motivo);
      }
      continue;
    }
    if (!aceitos.includes(campo)) {
      continue;
    }
    const chave = chaveDoCampo(campo, motivo, formulario);
    if (chave !== undefined && resultado[campo] === undefined) {
      resultado[campo] = chave;
    }
  }

  // Erro da lista inteira (vazia, grande demais) vale mais que o de item.
  if (itemDeHabilidade !== undefined && resultado.habilidades === undefined) {
    resultado.habilidades = itemDeHabilidade;
  }
  return resultado;
}

// Código do 409 -> chave. Vale para qualquer formulário: a API é quem decide.
const CONFLITOS: ReadonlyMap<string, ChaveDeErro> = new Map<
  string,
  ChaveDeErro
>([
  ['email_em_uso', 'email_em_uso'],
  ['perfil_incompleto', 'perfil_incompleto'],
  ['autor_nao_pode_candidatar', 'autor_nao_pode_candidatar'],
  ['candidatura_duplicada', 'candidatura_duplicada'],
  ['trampo_nao_aberto', 'trampo_nao_aberto'],
  ['candidatura_nao_pendente', 'candidatura_nao_pendente'],
  ['conflito_de_versao', 'conflito_de_versao'],
  ['conversa_consigo_mesmo', 'conversa_consigo_mesmo'],
]);

const SERVIDOR: ErroTraduzido = { geral: 'erro_servidor', campos: {} };

/**
 * Formulários de acesso, em que o 429 é o limite de tentativas de senha
 * (`muitas_tentativas`). Nos demais, é o limite de ações por conta (D29).
 */
const FORMULARIOS_DE_ACESSO: ReadonlySet<Formulario> = new Set<Formulario>([
  'entrar',
  'cadastro',
]);

/** 403 com código conhecido -> chave. Outro 403 -> `erro_servidor`. */
const PROIBIDOS: ReadonlyMap<string, ChaveDeErro> = new Map<
  string,
  ChaveDeErro
>([
  ['sem_vinculo', 'sem_vinculo'],
  ['senha_incorreta', 'senha_incorreta'],
]);

/**
 * Traduz um erro da API ou de rede em chaves de `textos.erros` (o contêiner
 * troca a chave pelo texto). Devolve só chaves: nunca `erro.message`, o
 * corpo, a URL nem o que a pessoa digitou (CA15).
 *
 * - `ErroDeRede` -> `sem_conexao`.
 * - 401 `credenciais_invalidas` -> `credenciais_invalidas`; outro 401 ->
 *   `sessao_expirada`.
 * - 409 com código conhecido (`email_em_uso`, `perfil_incompleto`,
 *   `autor_nao_pode_candidatar`, `candidatura_duplicada`, `trampo_nao_aberto`,
 *   `candidatura_nao_pendente`, `conflito_de_versao`,
 *   `conversa_consigo_mesmo`) -> a chave de mesmo nome em `geral`; outro
 *   409 -> `erro_servidor`.
 * - 403 `sem_vinculo` (abrir conversa sem candidatura nem contratação) ->
 *   `sem_vinculo`; 403 `senha_incorreta` (excluir a conta, exportar os
 *   dados) -> `senha_incorreta`; outro 403 -> `erro_servidor`.
 * - 429 -> `muitas_tentativas` em `entrar` e `cadastro` (limite de
 *   tentativas de senha); em qualquer outro formulário, inclusive `nenhum`
 *   (busca, conversa, exclusão, exportação), `muitas_tentativas_acao`
 *   (limite de ações por conta, CA20).
 * - 404 -> `nao_encontrado`.
 * - 400 com campos conhecidos do `formulario` -> uma chave por campo;
 *   `habilidades.N` agrupa em `habilidades`.
 * - O resto (400 sem campo conhecido, 5xx, erro desconhecido) ->
 *   `erro_servidor`.
 */
export function chaveDoErro(
  erro: unknown,
  formulario: Formulario,
): ErroTraduzido {
  if (ehErroDeRede(erro)) {
    return { geral: 'sem_conexao', campos: {} };
  }
  if (!ehErroDaApi(erro)) {
    return SERVIDOR;
  }

  switch (erro.status) {
    case 400: {
      const campos = camposDoErro400(erro.campos, formulario);
      return Object.keys(campos).length > 0 ? { campos } : SERVIDOR;
    }
    case 401:
      return {
        geral:
          erro.codigo === 'credenciais_invalidas'
            ? 'credenciais_invalidas'
            : 'sessao_expirada',
        campos: {},
      };
    case 403: {
      const geral = PROIBIDOS.get(erro.codigo);
      return geral === undefined ? SERVIDOR : { geral, campos: {} };
    }
    case 404:
      return { geral: 'nao_encontrado', campos: {} };
    case 409: {
      const geral = CONFLITOS.get(erro.codigo);
      return geral === undefined ? SERVIDOR : { geral, campos: {} };
    }
    case 429:
      return {
        geral: FORMULARIOS_DE_ACESSO.has(formulario)
          ? 'muitas_tentativas'
          : 'muitas_tentativas_acao',
        campos: {},
      };
    default:
      return SERVIDOR;
  }
}

/**
 * Texto (pt-BR) de um erro que não é de formulário: o `geral` de
 * `chaveDoErro`, ou "erro do servidor". Nunca `erro.message`.
 */
export function mensagemDoErro(erro: unknown): string {
  return textos.erros[chaveDoErro(erro, 'nenhum').geral ?? 'erro_servidor'];
}
