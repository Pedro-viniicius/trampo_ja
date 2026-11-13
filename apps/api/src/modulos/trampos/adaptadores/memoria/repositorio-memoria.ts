import { ErroDeRegra } from '../../../../compartilhado/dominio/erros.js';
import {
  type Candidatura,
  copiarCandidatura,
} from '../../dominio/candidatura.js';
import type {
  CursorDeBusca,
  FiltrosDeBusca,
  GravacaoSobTrava,
  PaginaDoAutor,
  RepositorioDeTrampos,
  VinculoParaAvaliacao,
} from '../../dominio/portas.js';
import {
  type DadosDoTrampo,
  Trampo,
  type TrampoDoAutor,
  type TrampoResumo,
} from '../../dominio/trampo.js';

function maisRecentesPrimeiro(a: TrampoResumo, b: TrampoResumo): number {
  const diferenca = b.criadoEm.getTime() - a.criadoEm.getTime();
  if (diferenca !== 0) {
    return diferenca;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** `(criadoEm, id) < cursor`, como a comparação de tuplas do Postgres. */
function antesDoCursor(
  trampo: TrampoResumo,
  antesDe: CursorDeBusca | undefined,
): boolean {
  if (antesDe === undefined) {
    return true;
  }
  const diferenca = trampo.criadoEm.getTime() - antesDe.criadoEm.getTime();
  return diferenca < 0 || (diferenca === 0 && trampo.id < antesDe.id);
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

  /**
   * Equivalente à trava pessimista do Postgres: da leitura à gravação não há
   * `await` que ceda a vez, então nenhuma outra escrita entra no meio. A
   * gravação passa por `salvar`, com a mesma conferência de versão.
   */
  async alterarSobTrava(
    id: string,
    decidir: (trampo: Trampo) => GravacaoSobTrava,
  ): Promise<boolean> {
    const dados = this.#guardados.get(id);
    if (!dados) {
      return false;
    }
    const trampo = Trampo.reconstituir(dados);
    const gravacao = decidir(trampo);
    if (gravacao === 'salvar') {
      await this.salvar(trampo);
    } else if (gravacao === 'excluir') {
      this.#guardados.delete(id);
    }
    return true;
  }

  async buscarPorId(id: string): Promise<Trampo | null> {
    const dados = this.#guardados.get(id);
    return dados ? Trampo.reconstituir(dados) : null;
  }

  async trampoDaCandidatura(candidaturaId: string): Promise<string | null> {
    for (const dados of this.#guardados.values()) {
      if (dados.candidaturas.some((c) => c.id === candidaturaId)) {
        return dados.id;
      }
    }
    return null;
  }

  async listarDoAutor(
    autorId: string,
    pagina: PaginaDoAutor,
  ): Promise<TrampoDoAutor[]> {
    return [...this.#guardados.values()]
      .filter((dados) => dados.autorId === autorId)
      .map((dados) => Trampo.reconstituir(dados).resumoDoAutor())
      .filter((t) => antesDoCursor(t, pagina.antesDe))
      .sort(maisRecentesPrimeiro)
      .slice(0, pagina.limite);
  }

  async buscar(filtros: FiltrosDeBusca): Promise<TrampoResumo[]> {
    const { texto, categoria, cidade, antesDe, limite } = filtros;
    return this.#resumos()
      .filter((t) => t.status === 'aberto')
      .filter((t) => texto === undefined || t.textoBusca.includes(texto))
      .filter((t) => categoria === undefined || t.categoria === categoria)
      .filter((t) => cidade === undefined || t.cidadeNormalizada === cidade)
      .filter((t) => antesDoCursor(t, antesDe))
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

  async vinculoParaAvaliacao(
    trampoId: string,
    contaId: string,
  ): Promise<VinculoParaAvaliacao> {
    const dados = this.#guardados.get(trampoId);
    if (!dados) {
      return null;
    }
    const aceitos = dados.candidaturas
      .filter((c) => c.status === 'aceita')
      .map((c) => c.freelancerId);
    const ehAutor = contaId === dados.autorId;
    const ehFreelaAceito = aceitos.length === 1 && aceitos[0] === contaId;
    if (ehAutor === ehFreelaAceito) {
      // Nenhum dos dois (terceiro) ou os dois ao mesmo tempo (dado incoerente).
      return null;
    }
    if (dados.status !== 'encerrado') {
      return 'nao_encerrado';
    }
    if (ehFreelaAceito) {
      return { avaliadoId: dados.autorId, papelDoAvaliado: 'contratante' };
    }
    const freela = aceitos.length === 1 ? aceitos[0] : undefined;
    return freela === undefined
      ? null
      : { avaliadoId: freela, papelDoAvaliado: 'freela' };
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
