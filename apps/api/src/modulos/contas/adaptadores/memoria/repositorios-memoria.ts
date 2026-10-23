import {
  type Relogio,
  relogioDoSistema,
} from '../../../../compartilhado/dominio/relogio.js';
import type { Conta } from '../../dominio/conta.js';
import type { Email } from '../../dominio/email.js';
import {
  type ContagemDeTentativas,
  type ContaId,
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type PartesExportadas,
  type RepositorioDeContas,
  type RepositorioDeContasExcluidas,
  type RepositorioDeSessoes,
  type RepositorioDeTentativasDeEntrada,
  type SessaoDaConta,
  type SessaoInicial,
} from '../../dominio/portas.js';

/**
 * Contas em memória, indexadas pelo e-mail normalizado (testes e BDD). A
 * sessão inicial do cadastro vai para `sessoes`, gravada junto com a conta.
 */
export class RepositorioDeContasEmMemoria implements RepositorioDeContas {
  readonly #porEmail = new Map<string, Conta>();
  readonly #sessoes: RepositorioDeSessoesEmMemoria | undefined;

  constructor(sessoes?: RepositorioDeSessoesEmMemoria) {
    this.#sessoes = sessoes;
  }

  /**
   * Tudo ou nada, como a transação do Postgres: confere antes e grava as duas
   * sem `await` no meio, a sessão primeiro; se ela lançar, a conta não é
   * gravada. Sem `sessoes` no construtor, recusa a sessão inicial.
   */
  async salvar(conta: Conta, sessaoInicial?: SessaoInicial): Promise<void> {
    if (sessaoInicial !== undefined && this.#sessoes === undefined) {
      throw new TypeError(
        'RepositorioDeContasEmMemoria: sessão inicial sem repositório de sessões',
      );
    }
    if (this.#porEmail.has(conta.email.valor)) {
      throw new ErroDeEmailDuplicado();
    }
    if (sessaoInicial !== undefined) {
      this.#sessoes?.gravar(
        sessaoInicial.tokenHash,
        conta.id,
        sessaoInicial.expiraEm,
      );
    }
    this.#porEmail.set(conta.email.valor, conta);
  }

  async buscarPorEmail(email: Email): Promise<Conta | null> {
    return this.#porEmail.get(email.valor) ?? null;
  }

  async buscarPorId(id: ContaId): Promise<Conta | null> {
    for (const conta of this.#porEmail.values()) {
      if (conta.id === id) {
        return conta;
      }
    }
    return null;
  }

  async existeEmail(email: Email): Promise<boolean> {
    return this.#porEmail.has(email.valor);
  }

  /** Apaga a conta pelo id; sem a conta, não faz nada (`DadosDaContaEmMemoria`). */
  excluir(id: ContaId): void {
    for (const [chave, conta] of this.#porEmail) {
      if (conta.id === id) {
        this.#porEmail.delete(chave);
      }
    }
  }

  /** Para os testes: quantas contas foram gravadas. */
  get quantidade(): number {
    return this.#porEmail.size;
  }
}

interface SessaoGravada {
  readonly contaId: ContaId;
  readonly expiraEm: Date;
  readonly criadaEm: Date;
}

/** Sessões em memória, indexadas pelo hash do token (testes e BDD). */
export class RepositorioDeSessoesEmMemoria implements RepositorioDeSessoes {
  readonly #porTokenHash = new Map<string, SessaoGravada>();
  readonly #relogio: Relogio;

  /** O relógio faz o papel do `default now()` de `sessoes.criada_em`. */
  constructor(relogio: Relogio = relogioDoSistema) {
    this.#relogio = relogio;
  }

  async salvar(
    tokenHash: string,
    contaId: ContaId,
    expiraEm: Date,
  ): Promise<void> {
    this.gravar(tokenHash, contaId, expiraEm);
  }

  /** Gravação síncrona, para `RepositorioDeContasEmMemoria.salvar`. */
  gravar(tokenHash: string, contaId: ContaId, expiraEm: Date): void {
    this.#porTokenHash.set(tokenHash, {
      contaId,
      expiraEm: new Date(expiraEm.getTime()),
      criadaEm: this.#relogio.agora(),
    });
  }

  async buscarContaIdPorTokenHash(
    tokenHash: string,
    agora: Date,
  ): Promise<ContaId | null> {
    const sessao = this.#porTokenHash.get(tokenHash);
    if (!sessao || sessao.expiraEm.getTime() <= agora.getTime()) {
      return null;
    }
    return sessao.contaId;
  }

  async remover(tokenHash: string): Promise<void> {
    this.#porTokenHash.delete(tokenHash);
  }

  async listarDaConta(contaId: ContaId): Promise<SessaoDaConta[]> {
    return [...this.#porTokenHash.values()]
      .filter((sessao) => sessao.contaId === contaId)
      .sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime())
      .map((sessao) => ({
        criadaEm: new Date(sessao.criadaEm.getTime()),
        expiraEm: new Date(sessao.expiraEm.getTime()),
      }));
  }

  async contarDaConta(contaId: ContaId): Promise<number> {
    let quantas = 0;
    for (const sessao of this.#porTokenHash.values()) {
      if (sessao.contaId === contaId) {
        quantas += 1;
      }
    }
    return quantas;
  }

  async apagarExpiradas(agora: Date, lote: number): Promise<number> {
    let apagadas = 0;
    for (const [chave, sessao] of this.#porTokenHash) {
      if (apagadas >= lote) {
        break;
      }
      if (sessao.expiraEm.getTime() <= agora.getTime()) {
        this.#porTokenHash.delete(chave);
        apagadas += 1;
      }
    }
    return apagadas;
  }

  /** Para os testes: quantas sessões estão gravadas, válidas ou não. */
  get quantidade(): number {
    return this.#porTokenHash.size;
  }

  /** Apaga todas as sessões da conta (`DadosDaContaEmMemoria`). */
  excluirDaConta(contaId: ContaId): void {
    for (const [chave, sessao] of this.#porTokenHash) {
      if (sessao.contaId === contaId) {
        this.#porTokenHash.delete(chave);
      }
    }
  }

  /** Para os testes: as chaves gravadas, para conferir que são hashes. */
  hashesGravados(): string[] {
    return [...this.#porTokenHash.keys()];
  }
}

/**
 * Lápides em memória (testes e BDD). `gravar` faz o papel do `insert … on
 * conflict do nothing` da exclusão: a lápide que já existe guarda a data.
 */
export class RepositorioDeContasExcluidasEmMemoria
  implements RepositorioDeContasExcluidas
{
  readonly #lapides = new Map<ContaId, Date>();

  gravar(id: ContaId, excluidaEm: Date): void {
    if (!this.#lapides.has(id)) {
      this.#lapides.set(id, new Date(excluidaEm.getTime()));
    }
  }

  async listarAntesDe(limite: Date, lote: number): Promise<ContaId[]> {
    return [...this.#lapides]
      .filter(([, data]) => data.getTime() <= limite.getTime())
      .sort(([, a], [, b]) => a.getTime() - b.getTime())
      .slice(0, lote)
      .map(([id]) => id);
  }

  async esquecer(id: ContaId): Promise<void> {
    this.#lapides.delete(id);
  }

  /** Para os testes: as lápides gravadas, com a data em ISO. */
  gravadas(): Record<ContaId, string> {
    return Object.fromEntries(
      [...this.#lapides].map(([id, data]) => [id, data.toISOString()]),
    );
  }
}

interface ContadorGravado {
  readonly inicioDaJanela: Date;
  readonly tentativas: number;
}

/**
 * Teto de entrada por conta em memória (testes e BDD). Com `contas`, faz o
 * papel da FK do Postgres: conta que não existe não ganha contador
 * (`registrar` devolve `null`). Sem `await` entre a leitura e a gravação do
 * contador, cada `registrar` é atômico.
 */
export class RepositorioDeTentativasDeEntradaEmMemoria
  implements RepositorioDeTentativasDeEntrada
{
  readonly #porConta = new Map<ContaId, ContadorGravado>();
  readonly #contas: RepositorioDeContasEmMemoria | undefined;

  constructor(contas?: RepositorioDeContasEmMemoria) {
    this.#contas = contas;
  }

  async registrar(
    contaId: ContaId,
    agora: Date,
    janelaMs: number,
  ): Promise<ContagemDeTentativas | null> {
    if (
      this.#contas !== undefined &&
      !(await this.#contas.buscarPorId(contaId))
    ) {
      return null;
    }
    const atual = this.#porConta.get(contaId);
    const novo: ContadorGravado =
      atual === undefined ||
      atual.inicioDaJanela.getTime() + janelaMs <= agora.getTime()
        ? { inicioDaJanela: new Date(agora.getTime()), tentativas: 1 }
        : { ...atual, tentativas: atual.tentativas + 1 };
    this.#porConta.set(contaId, novo);
    return {
      tentativas: novo.tentativas,
      inicioDaJanela: new Date(novo.inicioDaJanela.getTime()),
    };
  }

  async apagarVencidas(limite: Date): Promise<number> {
    let apagados = 0;
    for (const [contaId, contador] of this.#porConta) {
      if (contador.inicioDaJanela.getTime() <= limite.getTime()) {
        this.#porConta.delete(contaId);
        apagados += 1;
      }
    }
    return apagados;
  }

  /** Para os testes: a contagem gravada da conta, ou `undefined`. */
  contagemDe(contaId: ContaId): number | undefined {
    return this.#porConta.get(contaId)?.tentativas;
  }

  /** Para os testes: quantos contadores estão gravados. */
  get quantidade(): number {
    return this.#porConta.size;
  }
}

/** Exportação sem nada nos outros módulos. */
export const PARTES_VAZIAS: PartesExportadas = Object.freeze({
  perfil: null,
  trampos: [],
  servicos: [],
  candidaturas: [],
  conversas: [],
});

/**
 * `DadosDaConta` para testes e BDD, no lugar da composição: a exclusão apaga
 * a conta e as sessões dos repositórios em memória (como o cascade do banco)
 * e, com `lapides`, grava a lápide na hora do `relogio`; a coleta devolve as
 * partes recebidas; a medida devolve `medida` (padrão: os bytes do JSON das
 * partes). Guarda os ids de cada chamada.
 */
export class DadosDaContaEmMemoria implements DadosDaConta {
  readonly #contas: RepositorioDeContasEmMemoria;
  readonly #sessoes: RepositorioDeSessoesEmMemoria;
  readonly #partes: PartesExportadas;
  readonly #lapides: RepositorioDeContasExcluidasEmMemoria | undefined;
  readonly #relogio: Relogio;
  /** Bytes que `medirDosOutrosModulos` devolve; mude no teste à vontade. */
  medida: number;
  /** Ids recebidos por `excluirTudo`, na ordem. */
  readonly exclusoes: ContaId[] = [];
  /** Ids recebidos por `coletarDosOutrosModulos`, na ordem. */
  readonly coletas: ContaId[] = [];
  /** Ids recebidos por `medirDosOutrosModulos`, na ordem. */
  readonly medicoes: ContaId[] = [];

  constructor(dependencias: {
    readonly contas: RepositorioDeContasEmMemoria;
    readonly sessoes: RepositorioDeSessoesEmMemoria;
    readonly partes?: PartesExportadas;
    readonly lapides?: RepositorioDeContasExcluidasEmMemoria;
    readonly relogio?: Relogio;
    readonly medida?: number;
  }) {
    this.#contas = dependencias.contas;
    this.#sessoes = dependencias.sessoes;
    this.#partes = dependencias.partes ?? PARTES_VAZIAS;
    this.#lapides = dependencias.lapides;
    this.#relogio = dependencias.relogio ?? relogioDoSistema;
    this.medida =
      dependencias.medida ??
      Buffer.byteLength(JSON.stringify(this.#partes), 'utf8');
  }

  async excluirTudo(contaId: ContaId): Promise<void> {
    this.exclusoes.push(contaId);
    this.#sessoes.excluirDaConta(contaId);
    this.#contas.excluir(contaId);
    this.#lapides?.gravar(contaId, this.#relogio.agora());
  }

  async coletarDosOutrosModulos(contaId: ContaId): Promise<PartesExportadas> {
    this.coletas.push(contaId);
    return this.#partes;
  }

  async medirDosOutrosModulos(contaId: ContaId): Promise<number> {
    this.medicoes.push(contaId);
    return this.medida;
  }
}
