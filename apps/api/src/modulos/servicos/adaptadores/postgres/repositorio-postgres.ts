import { type Kysely, type Selectable, sql } from 'kysely';
import { ErroDeValidacao } from '../../../../compartilhado/dominio/erros.js';
import type {
  FiltrosDeBusca,
  RepositorioDeServicos,
} from '../../dominio/portas.js';
import type { Servico } from '../../dominio/servico.js';
import type { TabelaServicos, TabelasDeServicos } from './tabelas.js';

// Formato textual de um `uuid` do Postgres. Um id fora dele faria o banco
// recusar a consulta (SQLSTATE 22P02) e viraria 500; aqui vira "não existe".
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ehUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}

/**
 * Escapa os curingas do `LIKE` (`%` e `_`) e o próprio caractere de escape
 * (`\`), para que o texto buscado case só literalmente.
 */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

function paraLinha(servico: Servico): TabelaServicos {
  return {
    id: servico.id,
    autor_id: servico.autorId,
    titulo: servico.titulo,
    descricao: servico.descricao,
    categoria: servico.categoria,
    cidade: servico.cidade ?? null,
    cidade_normalizada: servico.cidadeNormalizada ?? null,
    texto_busca: servico.textoBusca,
    preco_base_centavos: servico.precoBaseCentavos,
    status: servico.status,
    criado_em: servico.criadoEm,
  };
}

function paraServico(linha: Selectable<TabelaServicos>): Servico {
  return {
    id: linha.id,
    autorId: linha.autor_id,
    titulo: linha.titulo,
    descricao: linha.descricao,
    categoria: linha.categoria,
    // D7: sem cidade, as duas propriedades ficam ausentes, como no domínio.
    ...(linha.cidade !== null && linha.cidade_normalizada !== null
      ? { cidade: linha.cidade, cidadeNormalizada: linha.cidade_normalizada }
      : {}),
    textoBusca: linha.texto_busca,
    precoBaseCentavos: linha.preco_base_centavos,
    status: linha.status,
    criadoEm: linha.criado_em,
  };
}

/** Adaptador Postgres da porta `RepositorioDeServicos` (tabela `servicos`). */
export class RepositorioDeServicosPostgres implements RepositorioDeServicos {
  readonly #db: Kysely<TabelasDeServicos>;

  constructor(db: Kysely<TabelasDeServicos>) {
    this.#db = db;
  }

  async salvar(servico: Servico): Promise<void> {
    await this.#db.insertInto('servicos').values(paraLinha(servico)).execute();
  }

  async buscarPorId(id: string): Promise<Servico | null> {
    if (!ehUuid(id)) {
      return null;
    }
    const linha = await this.#db
      .selectFrom('servicos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return linha ? paraServico(linha) : null;
  }

  async listarDoAutor(autorId: string): Promise<readonly Servico[]> {
    if (!ehUuid(autorId)) {
      return [];
    }
    const linhas = await this.#db
      .selectFrom('servicos')
      .selectAll()
      .where('autor_id', '=', autorId)
      .orderBy('criado_em', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return linhas.map(paraServico);
  }

  /**
   * CA7 (parte de serviços): filtros com E lógico, mais recentes primeiro.
   * Os valores vão sempre como parâmetro; o texto entra no `LIKE` escapado.
   */
  async buscar(filtros: FiltrosDeBusca): Promise<readonly Servico[]> {
    const { texto, categoria, cidade, antesDe, limite } = filtros;
    if (antesDe !== undefined && !ehUuid(antesDe.id)) {
      throw ErroDeValidacao.doCampo('antesDe', 'invalido');
    }

    let consulta = this.#db
      .selectFrom('servicos')
      .selectAll()
      .where('status', '=', 'ativo');
    if (texto !== undefined) {
      const padrao = `%${escaparLike(texto)}%`;
      consulta = consulta.where(
        sql<boolean>`${sql.ref('texto_busca')} like ${padrao} escape ${'\\'}`,
      );
    }
    if (categoria !== undefined) {
      consulta = consulta.where('categoria', '=', categoria);
    }
    if (cidade !== undefined) {
      // D7: `cidade_normalizada` nula nunca é igual a nada, então serviço sem
      // cidade fica de fora quando há filtro de cidade.
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
    return linhas.map(paraServico);
  }
}

/**
 * Serviço como sai na exportação da conta (D26, ADR-005). Mesmo formato de
 * `ServicoExportado` do módulo `contas`, declarado aqui para não acoplar os
 * módulos. Ficam de fora as colunas derivadas (`cidade_normalizada`,
 * `texto_busca`) e o `autor_id` (é a própria conta).
 */
export interface ServicoExportado {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly categoria: string;
  /** D7: `null` quando o serviço não tem cidade. */
  readonly cidade: string | null;
  readonly precoBaseCentavos: number;
  readonly status: string;
  /** ISO 8601. */
  readonly criadoEm: string;
}

/** Parte de `servicos` na exportação: os serviços da conta, do mais antigo ao mais novo. */
export interface ParteDeServicosNaExportacao {
  readonly servicos: readonly ServicoExportado[];
}

/**
 * Parte de `servicos` na exclusão da conta (D25, ADR-005): apaga os serviços
 * de que a conta é autora, dentro da transação aberta pela composição
 * (`trx`). Não abre transação própria. Lança, sem consultar, com `contaId`
 * fora do formato uuid ou com uma conexão fora de transação. Sem serviços,
 * resolve sem erro.
 */
export async function excluirDadosDaConta(
  trx: Kysely<TabelasDeServicos>,
  contaId: string,
): Promise<void> {
  if (!ehUuid(contaId)) {
    throw new TypeError('servicos.excluirDadosDaConta: contaId não é um uuid');
  }
  if (!trx.isTransaction) {
    throw new TypeError('servicos.excluirDadosDaConta: exige uma transação');
  }
  await trx.deleteFrom('servicos').where('autor_id', '=', contaId).execute();
}

/** Parte de `servicos` na exportação da conta (D26). Id fora do formato: lista vazia. */
export async function exportarDadosDaConta(
  db: Kysely<TabelasDeServicos>,
  contaId: string,
): Promise<ParteDeServicosNaExportacao> {
  if (!ehUuid(contaId)) {
    return { servicos: [] };
  }
  const linhas = await db
    .selectFrom('servicos')
    .select([
      'id',
      'titulo',
      'descricao',
      'categoria',
      'cidade',
      'preco_base_centavos',
      'status',
      'criado_em',
    ])
    .where('autor_id', '=', contaId)
    .orderBy('criado_em', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return {
    servicos: linhas.map((linha) => ({
      id: linha.id,
      titulo: linha.titulo,
      descricao: linha.descricao,
      categoria: linha.categoria,
      cidade: linha.cidade,
      precoBaseCentavos: linha.preco_base_centavos,
      status: linha.status,
      criadoEm: linha.criado_em.toISOString(),
    })),
  };
}
