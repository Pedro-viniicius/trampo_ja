import type { Avaliacao, PapelDoAvaliado } from '../../dominio/avaliacao.js';
import type { Favorito } from '../../dominio/favorito.js';
import type {
  AvaliacaoFeita,
  AvaliacaoLida,
  ConferirVinculo,
  ContagemDeAvaliacoes,
  OpcoesDeInsercaoDeFavorito,
  PaginaDeAvaliacoes,
  RepositorioDeAvaliacoes,
  ResultadoDaAvaliacao,
  ResultadoDoFavorito,
} from '../../dominio/portas.js';

function copiarAvaliacao(avaliacao: Avaliacao): Avaliacao {
  return Object.freeze({
    ...avaliacao,
    destaques: Object.freeze([...avaliacao.destaques]),
    criadaEm: new Date(avaliacao.criadaEm.getTime()),
  });
}

function copiarFavorito(favorito: Favorito): Favorito {
  return Object.freeze({
    ...favorito,
    criadoEm: new Date(favorito.criadoEm.getTime()),
  });
}

/** Ordem de comparação de texto, como o `order by` de `uuid` no Postgres. */
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `criadaEm` e `id` decrescentes (CA90). */
function maisRecentesPrimeiro(a: Avaliacao, b: Avaliacao): number {
  return (
    b.criadaEm.getTime() - a.criadaEm.getTime() || compararTexto(b.id, a.id)
  );
}

function chaveDoFavorito(donoId: string, favoritoId: string): string {
  return `${donoId}|${favoritoId}`;
}

/**
 * Adaptador de teste: avaliações e favoritos em memória, sem banco. Imita as
 * constraints da migração `0009`: o `unique (trampo_id, avaliador_id)` vira
 * `ja_feita`, a chave primária do favorito vira `ja_existe`, e a check
 * "avaliador diferente do avaliado" lança, como o 23514 do Postgres.
 *
 * Na avaliação, confere o vínculo antes de tudo (sem transação:
 * `undefined`), como o adaptador Postgres faz depois de travar as contas. No
 * favorito, o par já gravado vem antes do vínculo (D61) e é conferido de novo
 * depois dele. O que vem depois da conferência roda sem `await`, então uma
 * rajada de gravações iguais nunca passa duas (nem do teto de favoritos).
 */
export class RepositorioDeAvaliacoesEmMemoria
  implements RepositorioDeAvaliacoes
{
  readonly #avaliacoes = new Map<string, Avaliacao>();
  readonly #favoritos = new Map<string, Favorito>();

  async inserirAvaliacao(
    avaliacao: Avaliacao,
    conferirVinculo: ConferirVinculo,
  ): Promise<ResultadoDaAvaliacao> {
    if (!(await conferirVinculo(undefined))) {
      return 'sem_vinculo';
    }
    const repetida = [...this.#avaliacoes.values()].some(
      (guardada) =>
        guardada.trampoId === avaliacao.trampoId &&
        guardada.avaliadorId === avaliacao.avaliadorId,
    );
    if (repetida) {
      return 'ja_feita';
    }
    if (this.#avaliacoes.has(avaliacao.id)) {
      throw new Error('id de avaliação repetido');
    }
    if (avaliacao.avaliadorId === avaliacao.avaliadoId) {
      throw new Error('avaliador igual ao avaliado');
    }
    this.#avaliacoes.set(avaliacao.id, copiarAvaliacao(avaliacao));
    return 'inserida';
  }

  async listarRecebidas(
    avaliadoId: string,
    papel: PapelDoAvaliado,
    pagina: PaginaDeAvaliacoes,
  ): Promise<readonly AvaliacaoLida[]> {
    const { antesDe, limite } = pagina;
    return [...this.#avaliacoes.values()]
      .filter(
        (avaliacao) =>
          avaliacao.avaliadoId === avaliadoId &&
          avaliacao.papelDoAvaliado === papel &&
          (antesDe === undefined ||
            avaliacao.criadaEm.getTime() < antesDe.criadaEm.getTime() ||
            (avaliacao.criadaEm.getTime() === antesDe.criadaEm.getTime() &&
              avaliacao.id < antesDe.id)),
      )
      .sort(maisRecentesPrimeiro)
      .slice(0, limite)
      .map((avaliacao) => {
        const { id, nota, destaques, comentario, avaliadorId, criadaEm } =
          copiarAvaliacao(avaliacao);
        return { id, nota, destaques, comentario, avaliadorId, criadaEm };
      });
  }

  async listarFeitasNosTrampos(
    avaliadorId: string,
    trampoIds: readonly string[],
  ): Promise<readonly AvaliacaoFeita[]> {
    const trampos = new Set(trampoIds);
    return [...this.#avaliacoes.values()]
      .filter(
        (avaliacao) =>
          avaliacao.avaliadorId === avaliadorId &&
          trampos.has(avaliacao.trampoId),
      )
      .map((avaliacao) => ({
        trampoId: avaliacao.trampoId,
        nota: avaliacao.nota,
        criadaEm: new Date(avaliacao.criadaEm.getTime()),
      }));
  }

  async contarRecebidas(
    contaIds: readonly string[],
  ): Promise<readonly ContagemDeAvaliacoes[]> {
    const contas = new Set(contaIds);
    const porChave = new Map<
      string,
      {
        contaId: string;
        papel: PapelDoAvaliado;
        total: number;
        somaDasNotas: number;
        destaques: Map<string, number>;
      }
    >();
    for (const avaliacao of this.#avaliacoes.values()) {
      if (!contas.has(avaliacao.avaliadoId)) {
        continue;
      }
      const chave = `${avaliacao.avaliadoId}|${avaliacao.papelDoAvaliado}`;
      const contagem = porChave.get(chave) ?? {
        contaId: avaliacao.avaliadoId,
        papel: avaliacao.papelDoAvaliado,
        total: 0,
        somaDasNotas: 0,
        destaques: new Map<string, number>(),
      };
      contagem.total += 1;
      contagem.somaDasNotas += avaliacao.nota;
      for (const codigo of avaliacao.destaques) {
        contagem.destaques.set(
          codigo,
          (contagem.destaques.get(codigo) ?? 0) + 1,
        );
      }
      porChave.set(chave, contagem);
    }
    return [...porChave.values()].map((contagem) => ({
      contaId: contagem.contaId,
      papel: contagem.papel,
      total: contagem.total,
      somaDasNotas: contagem.somaDasNotas,
      destaques: [...contagem.destaques.entries()].map(
        ([codigo, quantidade]) => ({ codigo, quantidade }),
      ),
    }));
  }

  async inserirFavorito(
    favorito: Favorito,
    opcoes: OpcoesDeInsercaoDeFavorito,
  ): Promise<ResultadoDoFavorito> {
    const chave = chaveDoFavorito(favorito.donoId, favorito.favoritoId);
    if (this.#favoritos.has(chave)) {
      return 'ja_existe';
    }
    if (!(await opcoes.conferirVinculo(undefined))) {
      return 'sem_vinculo';
    }
    // Outra gravação do mesmo par pode ter passado durante o `await`.
    if (this.#favoritos.has(chave)) {
      return 'ja_existe';
    }
    const doDono = [...this.#favoritos.values()].filter(
      (guardado) => guardado.donoId === favorito.donoId,
    ).length;
    if (doDono >= opcoes.limite) {
      return 'limite_atingido';
    }
    if (favorito.donoId === favorito.favoritoId) {
      throw new Error('dono igual ao favorito');
    }
    this.#favoritos.set(chave, copiarFavorito(favorito));
    return 'inserido';
  }

  async removerFavorito(donoId: string, favoritoId: string): Promise<void> {
    this.#favoritos.delete(chaveDoFavorito(donoId, favoritoId));
  }

  async listarFavoritos(donoId: string): Promise<readonly Favorito[]> {
    return [...this.#favoritos.values()]
      .filter((favorito) => favorito.donoId === donoId)
      .sort(
        (a, b) =>
          b.criadoEm.getTime() - a.criadoEm.getTime() ||
          compararTexto(b.favoritoId, a.favoritoId),
      )
      .map(copiarFavorito);
  }
}
