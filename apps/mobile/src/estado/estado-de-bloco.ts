import { ehErroDaApi } from '../api/erros';
import type { Estado } from '../telas/tipos';
import { mensagemDoErro } from './erros';

/** O que as consultas (`useTrampo`, `usePerfilPublico`...) devolvem. */
export interface ResultadoDeConsulta<T> {
  readonly dados: T | null;
  readonly erro: Error | null;
  readonly recarregar: () => unknown;
}

/**
 * Traduz o resultado de uma consulta no `Estado` que as telas desenham:
 * 404 vira `vazio` ("não encontrado"), outro erro vira mensagem já traduzida
 * (nunca `erro.message`, que pode trazer detalhe da requisição) e dado em
 * mãos vence erro de uma recarga.
 */
export function estadoDeConsulta<T, U>(
  { dados, erro, recarregar }: ResultadoDeConsulta<T>,
  mapear: (dados: T) => U,
): Estado<U> {
  if (dados !== null) {
    return { situacao: 'ok', dados: mapear(dados) };
  }
  if (erro !== null) {
    if (ehErroDaApi(erro) && erro.status === 404) {
      return { situacao: 'vazio' };
    }
    return {
      situacao: 'erro',
      mensagem: mensagemDoErro(erro),
      onTentarDeNovo: () => {
        void recarregar();
      },
    };
  }
  return { situacao: 'carregando' };
}
