import type { CampoInvalido } from './tipos';

/**
 * Resposta da API fora de 2xx. Guarda só o status, o código (`erro` do corpo,
 * já filtrado pelo cliente) e os campos recusados. Nunca guarda o corpo da
 * resposta, a URL, o token nem o que a pessoa digitou (CA15): a mensagem é
 * fixa e não há `cause`.
 */
export class ErroDaApi extends Error {
  override readonly name = 'ErroDaApi';
  readonly status: number;
  readonly codigo: string;
  readonly campos: readonly CampoInvalido[];

  constructor(
    status: number,
    codigo: string,
    campos: readonly CampoInvalido[] = [],
  ) {
    super(`erro da API: ${codigo}`);
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

/** Por que a requisição não chegou a ter resposta. */
export type MotivoDoErroDeRede = 'tempo_esgotado' | 'falha';

/**
 * A requisição não teve resposta: sem conexão, servidor fora do ar ou tempo
 * esgotado. Não guarda o erro original, cuja mensagem pode trazer a URL.
 */
export class ErroDeRede extends Error {
  override readonly name = 'ErroDeRede';
  readonly motivo: MotivoDoErroDeRede;

  constructor(motivo: MotivoDoErroDeRede) {
    super('falha de rede');
    this.motivo = motivo;
  }
}

export function ehErroDaApi(erro: unknown): erro is ErroDaApi {
  return erro instanceof ErroDaApi;
}

export function ehErroDeRede(erro: unknown): erro is ErroDeRede {
  return erro instanceof ErroDeRede;
}
