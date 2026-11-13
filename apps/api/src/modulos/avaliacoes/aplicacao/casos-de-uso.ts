import { randomUUID } from 'node:crypto';
import {
  type CampoInvalido,
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import type { Relogio } from '../../../compartilhado/dominio/relogio.js';
import {
  type Avaliacao,
  criarAvaliacao,
  type EntradaDeAvaliacao,
  ehUuid,
  lerEntradaDeAvaliacao,
  PAPEIS_DO_AVALIADO,
  type PapelDoAvaliado,
} from '../dominio/avaliacao.js';
import { criarFavorito, LIMITE_DE_FAVORITOS } from '../dominio/favorito.js';
import type {
  AvaliacaoFeita,
  CursorDeAvaliacoes,
  RepositorioDeAvaliacoes,
  VerificadorDeVinculo,
  VinculoDeAvaliacao,
} from '../dominio/portas.js';
import {
  type ResumoDeAvaliacoes,
  resumirAvaliacoes,
} from '../dominio/resumo.js';
import { codificarCursor, decodificarCursor } from './cursor.js';

/** Página padrão de `listarRecebidas` (CA90). */
export const LIMITE_PADRAO_DE_AVALIACOES = 20;
/** Maior página que `listarRecebidas` aceita (CA90). */
export const LIMITE_MAXIMO_DE_AVALIACOES = 50;
/** Ids por pedido em `resumos` e `feitas` (CA89, CA91). */
export const MAXIMO_DE_IDS_POR_LOTE = 50;
/**
 * Teto do texto do lote antes de separá-lo: 50 uuids de 36 caracteres e as 49
 * vírgulas. Acima disso não há como caber o lote, e o texto nem é separado.
 */
const TAMANHO_MAXIMO_DO_LOTE_EM_TEXTO =
  MAXIMO_DE_IDS_POR_LOTE * 36 + (MAXIMO_DE_IDS_POR_LOTE - 1);

export interface DependenciasDeAvaliacoes {
  readonly repositorio: RepositorioDeAvaliacoes;
  /** CA87: na composição, `trampos.vinculoParaAvaliacao`. */
  readonly vinculoDeAvaliacao: VinculoDeAvaliacao;
  /** CA92: na composição, `trampos.existeVinculoEntre`. */
  readonly verificadorDeVinculo: VerificadorDeVinculo;
  readonly relogio: Relogio;
  /** Gerador de id; o padrão é `crypto.randomUUID`. Injetável em teste. */
  readonly gerarId?: () => string;
}

export interface AvaliacaoCriada {
  readonly id: string;
}

/** Filtros de `GET /avaliacoes` como chegam da borda, ainda não validados. */
export interface PedidoDeAvaliacoesRecebidas {
  readonly contaId?: unknown;
  readonly papel?: unknown;
  /** Cursor opaco devolvido por uma página anterior (`proximoCursor`). */
  readonly antesDe?: unknown;
  /** Padrão 20, de 1 a 50. */
  readonly limite?: unknown;
}

/**
 * Item de `GET /avaliacoes` (CA90): só estes cinco campos. Ficam de fora o id
 * da avaliação, o trampo, o avaliado e o papel.
 */
export interface AvaliacaoRecebida {
  readonly nota: number;
  readonly destaques: readonly string[];
  readonly comentario: string | null;
  readonly avaliadorId: string;
  readonly criadaEm: Date;
}

export interface PaginaDeAvaliacoesRecebidas {
  readonly itens: readonly AvaliacaoRecebida[];
  /** Cursor opaco da próxima página; `null` na última. */
  readonly proximoCursor: string | null;
}

/** Item de `GET /favoritos` (CA92). */
export interface FavoritoDaConta {
  readonly contaId: string;
  readonly criadoEm: Date;
}

/**
 * Lote de ids de `resumos` e `feitas`, como chega da querystring: texto
 * separado por vírgulas (ou lista de textos). Ausente → `obrigatorio`; mais
 * de 50 itens → `tamanho`. Item que não é uuid é ignorado, sem erro e sem
 * chegar ao banco (o Postgres recusaria o parâmetro com 500); os válidos vão
 * em minúsculas, sem repetição, na ordem do pedido.
 */
function lerLoteDeIds(bruto: unknown, campo: string): readonly string[] {
  if (bruto === undefined || bruto === null) {
    throw ErroDeValidacao.doCampo(campo, 'obrigatorio');
  }
  let itens: readonly unknown[];
  if (typeof bruto === 'string') {
    if (bruto.length > TAMANHO_MAXIMO_DO_LOTE_EM_TEXTO) {
      throw ErroDeValidacao.doCampo(campo, 'tamanho');
    }
    itens = bruto.split(',');
  } else if (Array.isArray(bruto)) {
    itens = bruto;
  } else {
    throw ErroDeValidacao.doCampo(campo, 'invalido');
  }
  if (itens.length > MAXIMO_DE_IDS_POR_LOTE) {
    throw ErroDeValidacao.doCampo(campo, 'tamanho');
  }
  const ids = new Set<string>();
  for (const item of itens) {
    if (ehUuid(item)) {
      ids.add(item.toLowerCase());
    }
  }
  return Object.freeze([...ids]);
}

/**
 * Conta de um caminho (`/favoritos/:contaId`). Fora do formato uuid → 404,
 * como as outras rotas com id no caminho.
 */
function lerContaDoCaminho(valor: unknown): string {
  if (!ehUuid(valor)) {
    throw new ErroNaoEncontrado();
  }
  return valor.toLowerCase();
}

function lerContaId(bruto: unknown, problemas: CampoInvalido[]): string {
  if (bruto === undefined || bruto === null || bruto === '') {
    problemas.push({ campo: 'contaId', motivo: 'obrigatorio' });
    return '';
  }
  if (!ehUuid(bruto)) {
    problemas.push({ campo: 'contaId', motivo: 'invalido' });
    return '';
  }
  return bruto.toLowerCase();
}

function lerPapel(bruto: unknown, problemas: CampoInvalido[]): PapelDoAvaliado {
  if (bruto === undefined || bruto === null || bruto === '') {
    problemas.push({ campo: 'papel', motivo: 'obrigatorio' });
    return 'freela';
  }
  const papel = PAPEIS_DO_AVALIADO.find((valido) => valido === bruto);
  if (papel === undefined) {
    problemas.push({ campo: 'papel', motivo: 'invalido' });
    return 'freela';
  }
  return papel;
}

function lerLimite(bruto: unknown, problemas: CampoInvalido[]): number {
  if (bruto === undefined || bruto === null) {
    return LIMITE_PADRAO_DE_AVALIACOES;
  }
  if (
    typeof bruto === 'number' &&
    Number.isInteger(bruto) &&
    bruto >= 1 &&
    bruto <= LIMITE_MAXIMO_DE_AVALIACOES
  ) {
    return bruto;
  }
  problemas.push({ campo: 'limite', motivo: 'invalido' });
  return LIMITE_PADRAO_DE_AVALIACOES;
}

function lerCursor(
  bruto: unknown,
  problemas: CampoInvalido[],
): CursorDeAvaliacoes | undefined {
  // Em branco equivale a "sem cursor" (primeira página).
  if (bruto === undefined || bruto === null || bruto === '') {
    return undefined;
  }
  try {
    return decodificarCursor(bruto);
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      problemas.push(...erro.campos);
      return undefined;
    }
    throw erro;
  }
}

/** Mesma parte e mesmo papel que a leitura de antes da gravação. */
function mesmoVinculo(
  vinculo: Awaited<ReturnType<VinculoDeAvaliacao['obter']>>,
  avaliacao: Avaliacao,
): boolean {
  return (
    typeof vinculo === 'object' &&
    vinculo !== null &&
    vinculo.avaliadoId === avaliacao.avaliadoId &&
    vinculo.papelDoAvaliado === avaliacao.papelDoAvaliado
  );
}

/** Casos de uso do módulo `avaliacoes`, com as portas injetadas. */
export function criarCasosDeUsoDeAvaliacoes(deps: DependenciasDeAvaliacoes) {
  const { repositorio, vinculoDeAvaliacao, verificadorDeVinculo, relogio } =
    deps;
  const gerarId = deps.gerarId ?? randomUUID;

  return {
    /**
     * CA87 e CA88. `quem` avalia a outra parte de um trampo encerrado:
     * - corpo fora do formato → 400 com os campos (antes de qualquer leitura,
     *   para o 400 não dizer nada sobre o trampo);
     * - terceiro, trampo inexistente ou sem candidatura aceita → 404 igual
     *   para todos (sem oráculo);
     * - parte com o trampo ainda não encerrado → 409 `trampo_nao_encerrado`;
     * - destaque fora da lista do papel do avaliado → 400 `destaques`;
     * - avaliação repetida → 409 `avaliacao_ja_feita`, pela unicidade
     *   `(trampoId, avaliadorId)` do repositório, nunca por um "ler e depois
     *   gravar": numa rajada, só uma grava;
     * - vínculo desfeito entre a leitura e a gravação (a exclusão da conta de
     *   um dos dois terminou nesse meio-tempo, D25) → o mesmo 404, sem gravar.
     */
    async avaliar(
      quem: string,
      entrada: EntradaDeAvaliacao,
    ): Promise<AvaliacaoCriada> {
      const pedida = lerEntradaDeAvaliacao(entrada);
      const vinculo = await vinculoDeAvaliacao.obter(pedida.trampoId, quem);
      if (vinculo === 'nao_encerrado') {
        throw new ErroDeRegra('trampo_nao_encerrado');
      }
      // Ninguém avalia a si mesmo (check da tabela): dado incoerente vira o
      // mesmo 404 de quem não é parte, nunca um 500.
      if (vinculo === null || vinculo.avaliadoId === quem) {
        throw new ErroNaoEncontrado();
      }
      const avaliacao = criarAvaliacao(pedida, {
        id: gerarId(),
        avaliadorId: quem,
        avaliadoId: vinculo.avaliadoId,
        papelDoAvaliado: vinculo.papelDoAvaliado,
        agora: relogio.agora(),
      });
      const resultado = await repositorio.inserirAvaliacao(
        avaliacao,
        async (transacao) =>
          mesmoVinculo(
            await vinculoDeAvaliacao.obter(pedida.trampoId, quem, transacao),
            avaliacao,
          ),
      );
      if (resultado === 'ja_feita') {
        throw new ErroDeRegra('avaliacao_ja_feita');
      }
      if (resultado === 'sem_vinculo') {
        throw new ErroNaoEncontrado();
      }
      return { id: avaliacao.id };
    },

    /**
     * CA90: avaliações recebidas por `contaId` no `papel`, das mais recentes
     * para as mais antigas (`criadaEm` e id decrescentes), 20 por página (até
     * 50). Conta sem avaliação (ou que nem existe) dá lista vazia, sem dizer
     * se a conta existe. Filtro inválido → 400 com todos os campos.
     */
    async listarRecebidas(
      pedido: PedidoDeAvaliacoesRecebidas,
    ): Promise<PaginaDeAvaliacoesRecebidas> {
      const problemas: CampoInvalido[] = [];
      const contaId = lerContaId(pedido.contaId, problemas);
      const papel = lerPapel(pedido.papel, problemas);
      const limite = lerLimite(pedido.limite, problemas);
      const antesDe = lerCursor(pedido.antesDe, problemas);
      if (problemas.length > 0) {
        throw new ErroDeValidacao(problemas);
      }
      // Um a mais, só para saber se há próxima página.
      const lidas = await repositorio.listarRecebidas(contaId, papel, {
        limite: limite + 1,
        ...(antesDe !== undefined && { antesDe }),
      });
      const pagina = lidas.slice(0, limite);
      const itens = pagina.map((lida) =>
        Object.freeze({
          nota: lida.nota,
          destaques: Object.freeze([...lida.destaques]),
          comentario: lida.comentario,
          avaliadorId: lida.avaliadorId,
          criadaEm: new Date(lida.criadaEm.getTime()),
        }),
      );
      const ultima = pagina.at(-1);
      return {
        itens,
        proximoCursor:
          lidas.length > limite && ultima !== undefined
            ? codificarCursor({ criadaEm: ultima.criadaEm, id: ultima.id })
            : null,
      };
    },

    /**
     * CA89: um resumo por conta pedida (até 50), na ordem pedida, com média
     * de 1 casa, total e até 3 destaques por papel. Ids que não são uuid são
     * ignorados.
     */
    async resumir(contas: unknown): Promise<readonly ResumoDeAvaliacoes[]> {
      const contaIds = lerLoteDeIds(contas, 'contas');
      if (contaIds.length === 0) {
        return [];
      }
      return resumirAvaliacoes(
        contaIds,
        await repositorio.contarRecebidas(contaIds),
      );
    },

    /**
     * CA91: as avaliações que `quem` fez nos trampos pedidos (até 50), só com
     * `trampoId`, `nota` e `criadaEm`. Nunca devolve avaliação de outra conta.
     */
    async listarFeitas(
      quem: string,
      trampos: unknown,
    ): Promise<readonly AvaliacaoFeita[]> {
      const trampoIds = lerLoteDeIds(trampos, 'trampos');
      if (trampoIds.length === 0) {
        return [];
      }
      const feitas = await repositorio.listarFeitasNosTrampos(quem, trampoIds);
      return feitas.map((feita) =>
        Object.freeze({
          trampoId: feita.trampoId,
          nota: feita.nota,
          criadaEm: new Date(feita.criadaEm.getTime()),
        }),
      );
    },

    /**
     * CA92: `quem` põe `contaId` na equipe favorita. Id fora do formato → 404.
     * Depois, nesta ordem (D61): a si mesmo → 409 `favorito_invalido`; já
     * favorito → nada muda (204 de novo), mesmo que o vínculo tenha sumido;
     * sem vínculo (D4) → 404; com 200 favoritos → 409 `limite_de_favoritos`.
     * O vínculo só é exigido para gravar um favorito novo e é conferido dentro
     * da gravação, sob a trava das duas contas. A pessoa favoritada não é
     * avisada.
     */
    async favoritar(quem: string, contaId: unknown): Promise<void> {
      const outro = lerContaDoCaminho(contaId);
      const favorito = criarFavorito(quem, outro, relogio.agora());
      const resultado = await repositorio.inserirFavorito(favorito, {
        limite: LIMITE_DE_FAVORITOS,
        conferirVinculo: (transacao) =>
          verificadorDeVinculo.existeVinculoEntre(quem, outro, transacao),
      });
      if (resultado === 'sem_vinculo') {
        throw new ErroNaoEncontrado();
      }
      if (resultado === 'limite_atingido') {
        throw new ErroDeRegra('limite_de_favoritos');
      }
    },

    /** CA92: tira `contaId` da equipe favorita de `quem`. Idempotente. */
    async desfavoritar(quem: string, contaId: unknown): Promise<void> {
      await repositorio.removerFavorito(quem, lerContaDoCaminho(contaId));
    },

    /**
     * CA92: a equipe favorita de `quem`, dos mais recentes para os mais
     * antigos. Só o dono a vê.
     */
    async listarFavoritos(quem: string): Promise<readonly FavoritoDaConta[]> {
      const favoritos = await repositorio.listarFavoritos(quem);
      return favoritos.map((favorito) =>
        Object.freeze({
          contaId: favorito.favoritoId,
          criadoEm: new Date(favorito.criadoEm.getTime()),
        }),
      );
    },
  };
}

export type CasosDeUsoDeAvaliacoes = ReturnType<
  typeof criarCasosDeUsoDeAvaliacoes
>;
