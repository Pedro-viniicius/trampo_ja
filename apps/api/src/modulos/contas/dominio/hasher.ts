import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { HasherDeSenha } from './portas.js';
import { type OpcoesDeExecucao, Semaforo } from './semaforo.js';

/** Parâmetros de custo do scrypt (RFC 7914). */
export interface ParametrosScrypt {
  /** Custo de CPU e memória; potência de 2. */
  readonly N: number;
  /** Tamanho do bloco. */
  readonly r: number;
  /** Paralelismo. */
  readonly p: number;
}

/** Padrão de produção: cerca de 128 MiB e algumas centenas de ms por hash. */
export const PARAMETROS_SCRYPT_PADRAO: ParametrosScrypt = Object.freeze({
  N: 2 ** 17,
  r: 8,
  p: 1,
});

const PREFIXO = 'scrypt';
const BYTES_DO_SALT = 16;
const BYTES_DO_HASH = 64;

// Limites para aceitar parâmetros, inclusive os lidos de um hash armazenado:
// um hash adulterado não pode pedir memória ou CPU sem fim.
const N_MAXIMO = 2 ** 20;
const R_MAXIMO = 32;
const P_MAXIMO = 16;
const MEMORIA_MAXIMA = 256 * 1024 * 1024;
const BYTES_DO_HASH_MINIMO = 16;
const BYTES_DO_HASH_MAXIMO = 128;
const BYTES_DO_SALT_MAXIMO = 64;

// Inteiro positivo em decimal, sem zero à esquerda nem sinal.
const FORMATO_INTEIRO = /^[1-9][0-9]{0,9}$/;
// Base64 padrão com preenchimento; a ida e volta abaixo recusa o resto.
const FORMATO_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Memória que o OpenSSL exige para o scrypt (blocos B e V). */
function memoriaNecessaria({ N, r, p }: ParametrosScrypt): number {
  return 128 * r * (N + p + 2);
}

function parametrosAceitaveis(parametros: ParametrosScrypt): boolean {
  const { N, r, p } = parametros;
  return (
    Number.isSafeInteger(N) &&
    N >= 2 &&
    N <= N_MAXIMO &&
    (N & (N - 1)) === 0 &&
    Number.isSafeInteger(r) &&
    r >= 1 &&
    r <= R_MAXIMO &&
    Number.isSafeInteger(p) &&
    p >= 1 &&
    p <= P_MAXIMO &&
    memoriaNecessaria(parametros) <= MEMORIA_MAXIMA
  );
}

function lerInteiro(texto: string | undefined): number | null {
  return texto !== undefined && FORMATO_INTEIRO.test(texto)
    ? Number(texto)
    : null;
}

function lerBase64(texto: string | undefined): Buffer | null {
  if (texto === undefined || !FORMATO_BASE64.test(texto)) {
    return null;
  }
  const bytes = Buffer.from(texto, 'base64');
  return bytes.toString('base64') === texto ? bytes : null;
}

interface HashLido {
  readonly parametros: ParametrosScrypt;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

/** Lê `scrypt$N$r$p$salt$hash`; `null` para qualquer coisa fora do formato. */
function lerHash(hashArmazenado: unknown): HashLido | null {
  if (typeof hashArmazenado !== 'string' || hashArmazenado.length > 1024) {
    return null;
  }
  const partes = hashArmazenado.split('$');
  if (partes.length !== 6 || partes[0] !== PREFIXO) {
    return null;
  }
  const N = lerInteiro(partes[1]);
  const r = lerInteiro(partes[2]);
  const p = lerInteiro(partes[3]);
  const salt = lerBase64(partes[4]);
  const hash = lerBase64(partes[5]);
  if (N === null || r === null || p === null || !salt || !hash) {
    return null;
  }
  const parametros = { N, r, p };
  if (
    !parametrosAceitaveis(parametros) ||
    salt.length < BYTES_DO_SALT ||
    salt.length > BYTES_DO_SALT_MAXIMO ||
    hash.length < BYTES_DO_HASH_MINIMO ||
    hash.length > BYTES_DO_HASH_MAXIMO
  ) {
    return null;
  }
  return { parametros, salt, hash };
}

/**
 * Derivações scrypt simultâneas por processo. Cada uma usa cerca de 128 MiB
 * com o padrão; as demais esperam numa fila FIFO (CA23, S2). Quem chama
 * limita a espera e cancela pela `fila` de `gerarHash` e `verificar` (D42).
 */
export const DERIVACOES_SIMULTANEAS = 2;

// Um só para o processo inteiro: vale para todas as instâncias do hasher.
const semaforoDoScrypt = new Semaforo(DERIVACOES_SIMULTANEAS);

/**
 * `scrypt` assíncrono (pool do libuv): não bloqueia o event loop. Passa pelo
 * semáforo, que libera a vaga também quando a derivação falha. Quem sai da
 * fila (espera esgotada ou sinal abortado) não chega ao scrypt.
 */
function derivar(
  semaforo: Semaforo,
  fila: OpcoesDeExecucao | undefined,
  senha: string,
  salt: Buffer,
  tamanho: number,
  parametros: ParametrosScrypt,
): Promise<Buffer> {
  const { N, r, p } = parametros;
  return semaforo.executar(
    () =>
      new Promise<Buffer>((resolver, rejeitar) => {
        scrypt(
          senha,
          salt,
          tamanho,
          { N, r, p, maxmem: memoriaNecessaria(parametros) + 1024 * 1024 },
          (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)),
        );
      }),
    fila,
  );
}

export interface OpcoesDoHasherScrypt {
  /**
   * Fila das derivações. Padrão: o semáforo do processo, com
   * `DERIVACOES_SIMULTANEAS` vagas. Injetável em teste.
   */
  readonly semaforo?: Semaforo;
}

/**
 * Hash de senha com scrypt de `node:crypto`, no formato
 * `scrypt$N$r$p$salt_base64$hash_base64`.
 *
 * Os parâmetros ficam no próprio hash: `verificar` usa os do hash armazenado,
 * então dá para mudar o padrão sem invalidar as senhas existentes. Os testes
 * usam um custo baixo (ex.: `{ N: 2 ** 4, r: 8, p: 1 }`) para rodar rápido.
 *
 * O texto da senha é usado como chega: a normalização (NFC, S8) é de quem
 * chama.
 */
export class HasherScrypt implements HasherDeSenha {
  readonly #parametros: ParametrosScrypt;
  readonly #semaforo: Semaforo;

  constructor(
    parametros: ParametrosScrypt = PARAMETROS_SCRYPT_PADRAO,
    opcoes: OpcoesDoHasherScrypt = {},
  ) {
    if (!parametrosAceitaveis(parametros)) {
      throw new TypeError('HasherScrypt: parâmetros fora dos limites');
    }
    this.#parametros = Object.freeze({ ...parametros });
    this.#semaforo = opcoes.semaforo ?? semaforoDoScrypt;
  }

  async gerarHash(senha: string, fila?: OpcoesDeExecucao): Promise<string> {
    const salt = randomBytes(BYTES_DO_SALT);
    const hash = await derivar(
      this.#semaforo,
      fila,
      senha,
      salt,
      BYTES_DO_HASH,
      this.#parametros,
    );
    const { N, r, p } = this.#parametros;
    return [
      PREFIXO,
      N,
      r,
      p,
      salt.toString('base64'),
      hash.toString('base64'),
    ].join('$');
  }

  /**
   * Confere a senha em tempo constante (`timingSafeEqual`). Hash malformado
   * devolve `false` sem lançar e sem rodar o scrypt.
   */
  async verificar(
    senha: string,
    hashArmazenado: string,
    fila?: OpcoesDeExecucao,
  ): Promise<boolean> {
    const lido = lerHash(hashArmazenado);
    if (lido === null || typeof senha !== 'string') {
      return false;
    }
    const calculado = await derivar(
      this.#semaforo,
      fila,
      senha,
      lido.salt,
      lido.hash.length,
      lido.parametros,
    );
    return timingSafeEqual(calculado, lido.hash);
  }
}
