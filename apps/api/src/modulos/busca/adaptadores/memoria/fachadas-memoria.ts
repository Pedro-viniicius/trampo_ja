import { ehCategoriaValida } from '../../../../compartilhado/dominio/categorias.js';
import { ErroDeValidacao } from '../../../../compartilhado/dominio/erros.js';
import { normalizarTexto } from '../../../../compartilhado/dominio/texto.js';
import type {
  FachadasDeBusca,
  FiltrosDaFachada,
  ServicoParaBusca,
  TrampoParaBusca,
} from '../../aplicacao/buscar.js';

const TEXTO_MAXIMO = 100;
const CIDADE_MAXIMA = 80;
const LIMITE_MAXIMO_DA_FACHADA = 50;

type ComTexto<T> = T & { readonly descricao?: string };

/**
 * Fakes das fachadas de `trampos` e `servicos` para os testes de `busca`.
 * Imitam o contrato: filtros com E lógico (texto e cidade normalizados),
 * `criadoEm`/`id` decrescentes, cursor estrito e `limite` até 50, com
 * `ErroDeValidacao` para filtro inválido. Guardam as chamadas recebidas.
 */
export class FachadasDeBuscaEmMemoria implements FachadasDeBusca {
  private readonly trampos: ComTexto<TrampoParaBusca>[] = [];
  private readonly servicos: ComTexto<ServicoParaBusca>[] = [];
  readonly chamadasDeTrampos: FiltrosDaFachada[] = [];
  readonly chamadasDeServicos: FiltrosDaFachada[] = [];

  adicionarTrampo(trampo: ComTexto<TrampoParaBusca>): void {
    this.trampos.push(trampo);
  }

  adicionarServico(servico: ComTexto<ServicoParaBusca>): void {
    this.servicos.push(servico);
  }

  readonly buscarTrampos = async (
    filtros: FiltrosDaFachada,
  ): Promise<TrampoParaBusca[]> => {
    this.chamadasDeTrampos.push(filtros);
    return filtrar(this.trampos, filtros);
  };

  readonly buscarServicos = async (
    filtros: FiltrosDaFachada,
  ): Promise<ServicoParaBusca[]> => {
    this.chamadasDeServicos.push(filtros);
    return filtrar(this.servicos, filtros);
  };
}

interface Filtravel {
  readonly id: string;
  readonly titulo: string;
  readonly descricao?: string;
  readonly categoria: string;
  readonly cidade?: string;
  readonly criadoEm: Date;
}

function filtrar<T extends Filtravel>(
  itens: readonly T[],
  filtros: FiltrosDaFachada,
): T[] {
  validar(filtros);
  const texto = normalizarTexto(filtros.texto ?? '');
  const cidade = normalizarTexto(filtros.cidade ?? '');
  const { antesDe } = filtros;
  return itens
    .filter(
      (item) =>
        (texto === '' ||
          normalizarTexto(`${item.titulo} ${item.descricao ?? ''}`).includes(
            texto,
          )) &&
        (!filtros.categoria || item.categoria === filtros.categoria) &&
        (cidade === '' ||
          (item.cidade !== undefined &&
            normalizarTexto(item.cidade) === cidade)) &&
        (!antesDe || vemDepois(item, antesDe)),
    )
    .sort(
      (a, b) =>
        b.criadoEm.getTime() - a.criadoEm.getTime() ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )
    .slice(0, filtros.limite ?? 20);
}

/** Estritamente mais antigo que o cursor, na ordem `criadoEm`, `id`. */
function vemDepois(
  item: Filtravel,
  cursor: NonNullable<FiltrosDaFachada['antesDe']>,
): boolean {
  const diferenca = item.criadoEm.getTime() - cursor.criadoEm.getTime();
  return diferenca < 0 || (diferenca === 0 && item.id < cursor.id);
}

function validar(filtros: FiltrosDaFachada): void {
  const campos: { campo: string; motivo: 'invalido' | 'tamanho' }[] = [];
  if ((filtros.texto ?? '').length > TEXTO_MAXIMO) {
    campos.push({ campo: 'texto', motivo: 'tamanho' });
  }
  if ((filtros.cidade ?? '').length > CIDADE_MAXIMA) {
    campos.push({ campo: 'cidade', motivo: 'tamanho' });
  }
  if (
    filtros.categoria !== undefined &&
    !ehCategoriaValida(filtros.categoria)
  ) {
    campos.push({ campo: 'categoria', motivo: 'invalido' });
  }
  const { limite } = filtros;
  if (
    limite !== undefined &&
    (!Number.isInteger(limite) ||
      limite < 1 ||
      limite > LIMITE_MAXIMO_DA_FACHADA)
  ) {
    campos.push({ campo: 'limite', motivo: 'invalido' });
  }
  if (campos.length > 0) {
    throw new ErroDeValidacao(campos);
  }
}
