import { type Kysely, sql, type Transaction } from 'kysely';
import { DatabaseError } from 'pg';
import {
  ErroDeRegra,
  ErroDeValidacao,
} from '../../../../compartilhado/dominio/erros.js';
import type {
  Candidatura,
  StatusDaCandidatura,
} from '../../dominio/candidatura.js';
import type {
  FiltrosDeBusca,
  RepositorioDeTrampos,
} from '../../dominio/portas.js';
import {
  type DadosDoTrampo,
  Trampo,
  type TrampoResumo,
} from '../../dominio/trampo.js';
import type { TabelasDeTrampos } from './tabelas.js';

type Conexao = Kysely<TabelasDeTrampos>;

const VIOLACAO_DE_UNICIDADE = '23505';
const PK_DE_TRAMPOS = 'trampos_pkey';
const UNICA_POR_FREELANCER = 'candidaturas_trampo_freelancer_unico';

// Os ids são `uuid` no banco: um texto fora do formato faria o Postgres falhar
// com erro de sintaxe (500). Quem procura por um id assim não acha nada.
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ehUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}

/**
 * Padrão do `LIKE` para "contém o texto": escapa `\`, `%` e `_`, para que
 * caracteres digitados na busca nunca virem curinga (usado com `escape '\'`).
 */
function padraoContem(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;
}

function colunasDoResumo(db: Conexao | Transaction<TabelasDeTrampos>) {
  return db.selectFrom('trampos').select([
    'id',
    'autor_id',
    'titulo',
    'descricao',
    'categoria',
    'cidade',
    'cidade_normalizada',
    'texto_busca',
    'valor_centavos',
    // `date` viraria `Date` no fuso local do processo; o texto é exato.
    sql<string | null>`to_char(prazo, 'YYYY-MM-DD')`.as('prazo'),
    'status',
    'versao',
    'criado_em',
  ]);
}

type LinhaDoTrampo = Awaited<
  ReturnType<ReturnType<typeof colunasDoResumo>['executeTakeFirstOrThrow']>
>;

type LinhaDaCandidatura = {
  readonly id: string;
  readonly trampo_id: string;
  readonly freelancer_id: string;
  readonly mensagem: string;
  readonly valor_proposto_centavos: number;
  readonly status: StatusDaCandidatura;
  readonly criada_em: Date;
};

function paraResumo(linha: LinhaDoTrampo): TrampoResumo {
  return {
    id: linha.id,
    autorId: linha.autor_id,
    titulo: linha.titulo,
    descricao: linha.descricao,
    categoria: linha.categoria,
    cidade: linha.cidade,
    cidadeNormalizada: linha.cidade_normalizada,
    textoBusca: linha.texto_busca,
    valorCentavos: linha.valor_centavos,
    prazo: linha.prazo,
    status: linha.status,
    criadoEm: linha.criado_em,
  };
}

function paraCandidatura(linha: LinhaDaCandidatura): Candidatura {
  return {
    id: linha.id,
    trampoId: linha.trampo_id,
    freelancerId: linha.freelancer_id,
    mensagem: linha.mensagem,
    valorPropostoCentavos: linha.valor_proposto_centavos,
    status: linha.status,
    criadaEm: linha.criada_em,
  };
}

function linhaDaCandidatura(candidatura: Candidatura): LinhaDaCandidatura {
  return {
    id: candidatura.id,
    trampo_id: candidatura.trampoId,
    freelancer_id: candidatura.freelancerId,
    mensagem: candidatura.mensagem,
    valor_proposto_centavos: candidatura.valorPropostoCentavos,
    status: candidatura.status,
    criada_em: candidatura.criadaEm,
  };
}

/**
 * Converte as violações de unicidade esperadas em erro de regra. O erro novo
 * não leva `cause` nem `detail`: o `detail` do `pg` traz os valores da linha.
 */
function traduzirErroDoBanco(erro: unknown): unknown {
  if (
    erro instanceof DatabaseError &&
    erro.code === VIOLACAO_DE_UNICIDADE &&
    erro.constraint !== undefined
  ) {
    if (erro.constraint === UNICA_POR_FREELANCER) {
      return new ErroDeRegra('candidatura_duplicada');
    }
    if (erro.constraint === PK_DE_TRAMPOS) {
      return new ErroDeRegra('conflito_de_versao');
    }
  }
  return erro;
}

async function inserirTrampo(
  trx: Transaction<TabelasDeTrampos>,
  dados: DadosDoTrampo,
): Promise<void> {
  await trx
    .insertInto('trampos')
    .values({
      id: dados.id,
      autor_id: dados.autorId,
      titulo: dados.titulo,
      descricao: dados.descricao,
      categoria: dados.categoria,
      cidade: dados.cidade,
      cidade_normalizada: dados.cidadeNormalizada,
      texto_busca: dados.textoBusca,
      valor_centavos: dados.valorCentavos,
      prazo: dados.prazo,
      status: dados.status,
      versao: dados.versao,
      criado_em: dados.criadoEm,
    })
    .execute();
}

/**
 * Trava otimista: só grava se a versão no banco ainda for a lida (`versao - 1`).
 * Com duas transações concorrentes, a segunda espera a trava da linha e, depois
 * do commit da primeira, não acha mais a versão antiga. O agregado só muda
 * `status` e `versao`; os demais campos não são regravados.
 */
async function atualizarTrampo(
  trx: Transaction<TabelasDeTrampos>,
  dados: DadosDoTrampo,
): Promise<void> {
  const resultado = await trx
    .updateTable('trampos')
    .set({ status: dados.status, versao: dados.versao })
    .where('id', '=', dados.id)
    .where('versao', '=', dados.versao - 1)
    .executeTakeFirst();
  if (resultado.numUpdatedRows === 0n) {
    throw new ErroDeRegra('conflito_de_versao');
  }
}

/** Insere as candidaturas novas e atualiza o status das que mudaram. */
async function sincronizarCandidaturas(
  trx: Transaction<TabelasDeTrampos>,
  dados: DadosDoTrampo,
): Promise<void> {
  const guardadas = await trx
    .selectFrom('candidaturas')
    .select(['id', 'status'])
    .where('trampo_id', '=', dados.id)
    .execute();
  const statusGuardado = new Map(guardadas.map((c) => [c.id, c.status]));

  const novas = dados.candidaturas.filter((c) => !statusGuardado.has(c.id));
  if (novas.length > 0) {
    await trx
      .insertInto('candidaturas')
      .values(novas.map(linhaDaCandidatura))
      .execute();
  }

  const idsPorStatus = new Map<StatusDaCandidatura, string[]>();
  for (const candidatura of dados.candidaturas) {
    const anterior = statusGuardado.get(candidatura.id);
    if (anterior !== undefined && anterior !== candidatura.status) {
      const ids = idsPorStatus.get(candidatura.status) ?? [];
      ids.push(candidatura.id);
      idsPorStatus.set(candidatura.status, ids);
    }
  }
  for (const [status, ids] of idsPorStatus) {
    await trx
      .updateTable('candidaturas')
      .set({ status })
      .where('trampo_id', '=', dados.id)
      .where('id', 'in', ids)
      .execute();
  }
}

/**
 * Repositório do agregado `Trampo` no Postgres (tabelas da migração
 * `0002_trampos.ts`). Grava o agregado inteiro numa transação, com trava
 * otimista pela coluna `versao`.
 */
export class RepositorioDeTramposPostgres implements RepositorioDeTrampos {
  readonly #db: Conexao;

  constructor(db: Conexao) {
    this.#db = db;
  }

  /**
   * Trampo novo (`versao` 1): insere; se o id já existir, `conflito_de_versao`.
   * Existente: `UPDATE … WHERE versao = <versao - 1>`; nenhuma linha afetada
   * vira `conflito_de_versao`. Na mesma transação, sincroniza as candidaturas;
   * a segunda candidatura do mesmo freelancer, barrada pelo índice único,
   * vira `candidatura_duplicada`.
   */
  async salvar(trampo: Trampo): Promise<void> {
    const dados = trampo.dados();
    try {
      await this.#db.transaction().execute(async (trx) => {
        if (dados.versao === 1) {
          await inserirTrampo(trx, dados);
        } else {
          await atualizarTrampo(trx, dados);
        }
        await sincronizarCandidaturas(trx, dados);
      });
    } catch (erro) {
      throw traduzirErroDoBanco(erro);
    }
  }

  /** Lê o trampo e as candidaturas no mesmo instante (`repeatable read`). */
  async buscarPorId(id: string): Promise<Trampo | null> {
    if (!ehUuid(id)) {
      return null;
    }
    return this.#db
      .transaction()
      .setIsolationLevel('repeatable read')
      .setAccessMode('read only')
      .execute(async (trx) => {
        const linha = await colunasDoResumo(trx)
          .where('id', '=', id)
          .executeTakeFirst();
        if (!linha) {
          return null;
        }
        const candidaturas = await trx
          .selectFrom('candidaturas')
          .selectAll()
          .where('trampo_id', '=', id)
          .orderBy('criada_em')
          .orderBy('id')
          .execute();
        return Trampo.reconstituir({
          ...paraResumo(linha),
          versao: linha.versao,
          candidaturas: candidaturas.map(paraCandidatura),
        });
      });
  }

  async listarDoAutor(autorId: string): Promise<TrampoResumo[]> {
    if (!ehUuid(autorId)) {
      return [];
    }
    const linhas = await colunasDoResumo(this.#db)
      .where('autor_id', '=', autorId)
      .orderBy('criado_em', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return linhas.map(paraResumo);
  }

  /**
   * CA7 (trampos): só abertos; `texto` por `LIKE` parametrizado e escapado
   * sobre `texto_busca`; `categoria` e `cidade` por igualdade; mais recentes
   * primeiro, com o cursor `(criado_em, id) < (…)` e o limite.
   */
  async buscar(filtros: FiltrosDeBusca): Promise<TrampoResumo[]> {
    const { texto, categoria, cidade, antesDe, limite } = filtros;
    if (antesDe !== undefined && !ehUuid(antesDe.id)) {
      throw ErroDeValidacao.doCampo('antesDe', 'invalido');
    }
    let consulta = colunasDoResumo(this.#db).where('status', '=', 'aberto');
    if (texto !== undefined) {
      consulta = consulta.where(
        sql<boolean>`texto_busca like ${padraoContem(texto)} escape '\\'`,
      );
    }
    if (categoria !== undefined) {
      consulta = consulta.where('categoria', '=', categoria);
    }
    if (cidade !== undefined) {
      consulta = consulta.where('cidade_normalizada', '=', cidade);
    }
    if (antesDe !== undefined) {
      consulta = consulta.where(({ eb, refTuple, tuple }) =>
        eb(
          refTuple('criado_em', 'id'),
          '<',
          tuple(antesDe.criadoEm, antesDe.id),
        ),
      );
    }
    const linhas = await consulta
      .orderBy('criado_em', 'desc')
      .orderBy('id', 'desc')
      .limit(limite)
      .execute();
    return linhas.map(paraResumo);
  }

  /** Há candidatura, em qualquer estado, de um para um trampo do outro? */
  async existeCandidaturaEntre(a: string, b: string): Promise<boolean> {
    if (!ehUuid(a) || !ehUuid(b)) {
      return false;
    }
    const achada = await this.#db
      .selectFrom('candidaturas')
      .innerJoin('trampos', 'trampos.id', 'candidaturas.trampo_id')
      .select('candidaturas.id')
      .where(({ and, eb, or }) =>
        or([
          and([
            eb('trampos.autor_id', '=', a),
            eb('candidaturas.freelancer_id', '=', b),
          ]),
          and([
            eb('trampos.autor_id', '=', b),
            eb('candidaturas.freelancer_id', '=', a),
          ]),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return achada !== undefined;
  }

  async listarCandidaturasDoFreelancer(
    freelancerId: string,
  ): Promise<Candidatura[]> {
    if (!ehUuid(freelancerId)) {
      return [];
    }
    const linhas = await this.#db
      .selectFrom('candidaturas')
      .selectAll()
      .where('freelancer_id', '=', freelancerId)
      .orderBy('criada_em', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return linhas.map(paraCandidatura);
  }
}
