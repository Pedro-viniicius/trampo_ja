import { ehErroDaApi, ehErroDeRede } from '../api/erros';
import type { CampoInvalido, MotivoDeCampo } from '../api/tipos';
import { type ChaveDeErro, textos } from '../textos/pt-BR';

export type { ChaveDeErro };

/** Formulário (ou ação) que originou o erro; define quais campos valem. */
export type Formulario = 'entrar' | 'cadastro' | 'perfil' | 'nenhum';

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
  nenhum: [],
};

function chaveDoCampo(
  campo: string,
  motivo: MotivoDeCampo,
): ChaveDeErro | undefined {
  switch (campo) {
    case 'email':
      return 'email_invalido';
    case 'senha':
      return 'senha_curta';
    case 'nome':
      return motivo === 'obrigatorio' ? 'nome_obrigatorio' : 'nome_tamanho';
    case 'cidade':
      return motivo === 'obrigatorio' ? 'cidade_obrigatoria' : 'cidade_tamanho';
    case 'descricao':
      return 'descricao_tamanho';
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
    const chave = chaveDoCampo(campo, motivo);
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

const SERVIDOR: ErroTraduzido = { geral: 'erro_servidor', campos: {} };

/**
 * Traduz um erro da API ou de rede em chaves de `textos.erros` (o contêiner
 * troca a chave pelo texto). Devolve só chaves: nunca `erro.message`, o
 * corpo, a URL nem o que a pessoa digitou (CA15).
 *
 * - `ErroDeRede` -> `sem_conexao`.
 * - 401 `credenciais_invalidas` -> `credenciais_invalidas`; outro 401 ->
 *   `sessao_expirada`.
 * - 409 `email_em_uso` -> `email_em_uso`; 429 -> `muitas_tentativas`; 404 ->
 *   `nao_encontrado`.
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
    case 404:
      return { geral: 'nao_encontrado', campos: {} };
    case 409:
      return erro.codigo === 'email_em_uso'
        ? { geral: 'email_em_uso', campos: {} }
        : SERVIDOR;
    case 429:
      return { geral: 'muitas_tentativas', campos: {} };
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
