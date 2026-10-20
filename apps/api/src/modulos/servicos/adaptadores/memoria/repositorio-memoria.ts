import type {
  CursorDeBusca,
  FiltrosDeBusca,
  RepositorioDeServicos,
} from '../../dominio/portas.js';
import type { Servico } from '../../dominio/servico.js';

function copiar(servico: Servico): Servico {
  return { ...servico, criadoEm: new Date(servico.criadoEm.getTime()) };
}

// Ordem de exibição: mais recentes primeiro, desempate por id decrescente.
function maisRecentesPrimeiro(a: Servico, b: Servico): number {
  const diferenca = b.criadoEm.getTime() - a.criadoEm.getTime();
  if (diferenca !== 0) {
    return diferenca;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function ehAnteriorAoCursor(servico: Servico, cursor: CursorDeBusca): boolean {
  const tempo = servico.criadoEm.getTime();
  const tempoDoCursor = cursor.criadoEm.getTime();
  return (
    tempo < tempoDoCursor || (tempo === tempoDoCursor && servico.id < cursor.id)
  );
}

/** Adaptador de teste: guarda os serviços num `Map`, sem banco. */
export class RepositorioDeServicosEmMemoria implements RepositorioDeServicos {
  readonly #servicos = new Map<string, Servico>();

  async salvar(servico: Servico): Promise<void> {
    this.#servicos.set(servico.id, copiar(servico));
  }

  async buscarPorId(id: string): Promise<Servico | null> {
    const servico = this.#servicos.get(id);
    return servico ? copiar(servico) : null;
  }

  async listarDoAutor(autorId: string): Promise<readonly Servico[]> {
    return [...this.#servicos.values()]
      .filter((servico) => servico.autorId === autorId)
      .sort(maisRecentesPrimeiro)
      .map(copiar);
  }

  async buscar(filtros: FiltrosDeBusca): Promise<readonly Servico[]> {
    const { texto, categoria, cidade, antesDe, limite } = filtros;
    return [...this.#servicos.values()]
      .filter(
        (servico) =>
          (texto === undefined || servico.textoBusca.includes(texto)) &&
          (categoria === undefined || servico.categoria === categoria) &&
          (cidade === undefined || servico.cidadeNormalizada === cidade) &&
          (antesDe === undefined || ehAnteriorAoCursor(servico, antesDe)),
      )
      .sort(maisRecentesPrimeiro)
      .slice(0, limite)
      .map(copiar);
  }
}
