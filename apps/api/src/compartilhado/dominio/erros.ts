/**
 * Erros de domínio compartilhados pelos módulos.
 *
 * Regra de LGPD (CA15): estes erros nunca carregam o valor informado pelo usuário.
 * Carregam só o nome do campo, o motivo e um código estável que a API devolve e
 * o app traduz. Por isso o código e o nome do campo são validados contra um
 * formato de identificador: um texto livre (ex.: um e-mail) é recusado na criação.
 */

export type MotivoDeCampo = 'obrigatorio' | 'tamanho' | 'invalido';

export interface CampoInvalido {
  readonly campo: string;
  readonly motivo: MotivoDeCampo;
}

const MOTIVOS: readonly MotivoDeCampo[] = [
  'obrigatorio',
  'tamanho',
  'invalido',
];

// Código de erro: snake_case minúsculo, ex.: `perfil_incompleto`.
const FORMATO_CODIGO = /^[a-z][a-z0-9_]{0,63}$/;
// Nome de campo: identificador camelCase, com índice ou subcampo opcional, ex.: `habilidades.0`.
const FORMATO_CAMPO = /^[a-zA-Z][a-zA-Z0-9]{0,63}(\.[a-zA-Z0-9]{1,64}){0,3}$/;

/** Base dos erros de domínio; o tratador HTTP (etapa 3) converte pelo `codigo`. */
export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: string;
}

/** Entrada recusada por formato ou limite. A API responde 400 com a lista de campos (CA5). */
export class ErroDeValidacao extends ErroDeDominio {
  readonly codigo = 'dados_invalidos';
  readonly campos: readonly CampoInvalido[];

  constructor(campos: readonly CampoInvalido[]) {
    if (campos.length === 0) {
      throw new TypeError('ErroDeValidacao exige ao menos um campo');
    }
    // Copia só `campo` e `motivo`: qualquer outra propriedade do objeto recebido
    // (ex.: o valor digitado) fica de fora.
    const copia = campos.map(({ campo, motivo }) => {
      if (!FORMATO_CAMPO.test(campo)) {
        throw new TypeError(
          'ErroDeValidacao: nome de campo fora do formato de identificador',
        );
      }
      if (!MOTIVOS.includes(motivo)) {
        throw new TypeError('ErroDeValidacao: motivo desconhecido');
      }
      return Object.freeze({ campo, motivo });
    });
    super(
      `dados_invalidos: ${copia.map((c) => `${c.campo}(${c.motivo})`).join(', ')}`,
    );
    this.name = 'ErroDeValidacao';
    this.campos = Object.freeze(copia);
  }

  /** Atalho para o caso comum de um único campo. */
  static doCampo(campo: string, motivo: MotivoDeCampo): ErroDeValidacao {
    return new ErroDeValidacao([{ campo, motivo }]);
  }
}

/** Regra de negócio violada (ex.: `perfil_incompleto`, `candidatura_duplicada`). */
export class ErroDeRegra extends ErroDeDominio {
  readonly codigo: string;

  constructor(codigo: string) {
    if (!FORMATO_CODIGO.test(codigo)) {
      throw new TypeError('ErroDeRegra: código fora do formato snake_case');
    }
    super(codigo);
    this.name = 'ErroDeRegra';
    this.codigo = codigo;
  }
}

/**
 * Recurso inexistente ou que o usuário não pode ver. A API responde 404.
 * Use também quando o recurso existe mas pertence a outra pessoa, para não
 * confirmar a existência (ex.: candidaturas de um trampo alheio).
 */
export class ErroNaoEncontrado extends ErroDeDominio {
  readonly codigo: string;

  constructor(codigo = 'nao_encontrado') {
    if (!FORMATO_CODIGO.test(codigo)) {
      throw new TypeError(
        'ErroNaoEncontrado: código fora do formato snake_case',
      );
    }
    super(codigo);
    this.name = 'ErroNaoEncontrado';
    this.codigo = codigo;
  }
}

/** Ação sem permissão sobre o recurso (ex.: `sem_vinculo`). A API responde 403. */
export class ErroProibido extends ErroDeDominio {
  readonly codigo: string;

  constructor(codigo = 'proibido') {
    if (!FORMATO_CODIGO.test(codigo)) {
      throw new TypeError('ErroProibido: código fora do formato snake_case');
    }
    super(codigo);
    this.name = 'ErroProibido';
    this.codigo = codigo;
  }
}
