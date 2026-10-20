import { ErroDeRegra } from '../../../../compartilhado/dominio/erros.js';
import {
  type Candidatura,
  copiarCandidatura,
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

function maisRecentesPrimeiro(a: TrampoResumo, b: TrampoResumo): number {
  const diferenca = b.criadoEm.getTime() - a.criadoEm.getTime();
  if (diferenca !== 0) {
    return diferenca;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function candidaturasMaisRecentesPrimeiro(
  a: Candidatura,
  b: Candidatura,
): number {
  const diferenca = b.criadaEm.getTime() - a.criadaEm.getTime();
  if (diferenca !== 0) {
    return diferenca;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Repositório em memória para testes. Guarda cópias do estado do agregado e
 * simula a trava otimista do Postgres: a versão gravada tem de ser a lida mais 1.
 */
export class RepositorioDeTramposEmMemoria implements RepositorioDeTrampos {
  readonly #guardados = new Map<string, DadosDoTrampo>();

  async salvar(trampo: Trampo): Promise<void> {
    const dados = trampo.dados();
    const existente = this.#guardados.get(dados.id);
    const versaoEsperada = existente ? existente.versao + 1 : 1;
    if (dados.versao !== versaoEsperada) {
      throw new ErroDeRegra('conflito_de_versao');
    }
    this.#guardados.set(dados.id, dados);
  }

  async buscarPorId(id: string): Promise<Trampo | null> {
    const dados = this.#guardados.get(id);
    return dados ? Trampo.reconstituir(dados) : null;
  }

  async listarDoAutor(autorId: string): Promise<TrampoResumo[]> {
    return this.#resumos()
      .filter((t) => t.autorId === autorId)
      .sort(maisRecentesPrimeiro);
  }

  async buscar(filtros: FiltrosDeBusca): Promise<TrampoResumo[]> {
    const { texto, categoria, cidade, antesDe, limite } = filtros;
    return this.#resumos()
      .filter((t) => t.status === 'aberto')
      .filter((t) => texto === undefined || t.textoBusca.includes(texto))
      .filter((t) => categoria === undefined || t.categoria === categoria)
      .filter((t) => cidade === undefined || t.cidadeNormalizada === cidade)
      .filter((t) => {
        if (antesDe === undefined) {
          return true;
        }
        const diferenca = t.criadoEm.getTime() - antesDe.criadoEm.getTime();
        return diferenca < 0 || (diferenca === 0 && t.id < antesDe.id);
      })
      .sort(maisRecentesPrimeiro)
      .slice(0, limite);
  }

  async existeCandidaturaEntre(a: string, b: string): Promise<boolean> {
    for (const dados of this.#guardados.values()) {
      const autorEhA = dados.autorId === a;
      const autorEhB = dados.autorId === b;
      if (!autorEhA && !autorEhB) {
        continue;
      }
      const candidato = autorEhA ? b : a;
      if (dados.candidaturas.some((c) => c.freelancerId === candidato)) {
        return true;
      }
    }
    return false;
  }

  async listarCandidaturasDoFreelancer(
    freelancerId: string,
  ): Promise<Candidatura[]> {
    return [...this.#guardados.values()]
      .flatMap((dados) => dados.candidaturas)
      .filter((c) => c.freelancerId === freelancerId)
      .map(copiarCandidatura)
      .sort(candidaturasMaisRecentesPrimeiro);
  }

  #resumos(): TrampoResumo[] {
    return [...this.#guardados.values()].map((dados) =>
      Trampo.reconstituir(dados).resumo(),
    );
  }
}
