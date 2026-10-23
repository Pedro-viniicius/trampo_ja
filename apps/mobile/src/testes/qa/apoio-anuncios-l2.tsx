/**
 * Apoio dos testes de QA da L2 no app: um servidor em memória que aplica as
 * regras da API de verdade (versão que sobe a cada escrita, 409
 * `conflito_de_versao` e `trampo_nao_editavel`, 409 `trampo_nao_aberto`,
 * `candidatura_nao_pendente`, candidatura duplicada) e responde à visão do
 * autor só para a conta dona. Os testes de rota da L2 usam um fake estático
 * (a `versao` nunca sobe), que não pega o app mandando a versão velha.
 *
 * A conta da sessão é `conta-ana`; `conta-bia` e `conta-caio` são terceiros.
 */
import { act, screen } from 'expo-router/testing-library';
import { textos } from '../../textos/pt-BR';
import { criarFetchFalso, type FetchFalso } from '../fetch-falso';
import { CATEGORIAS, PERFIL_COMPLETO } from './apoio-qa';

export const EU = 'conta-ana';
export const BIA = 'conta-bia';
export const CAIO = 'conta-caio';

export type StatusDoTrampo = 'aberto' | 'em_andamento' | 'encerrado';
export type StatusDaCandidatura = 'pendente' | 'aceita' | 'recusada';

export interface TrampoDoServidor {
  id: string;
  autorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string;
  valorCentavos: number;
  prazo: string | null;
  status: StatusDoTrampo;
  criadoEm: string;
  versao: number;
}

export interface CandidaturaDoServidor {
  id: string;
  trampoId: string;
  freelancerId: string;
  mensagem: string;
  valorPropostoCentavos: number;
  status: StatusDaCandidatura;
  criadaEm: string;
}

export interface ServicoDoServidor {
  id: string;
  autorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cidade: string | null;
  precoBaseCentavos: number;
  status: 'ativo';
  criadoEm: string;
  versao: number;
}

export const IDS_DE_TRAMPO = ['t1', 't2', 't3', 't9'] as const;
export const IDS_DE_CANDIDATURA = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'] as const;

export function novoTrampo(
  id: string,
  titulo: string,
  extra: Partial<TrampoDoServidor> = {},
): TrampoDoServidor {
  return {
    id,
    autorId: EU,
    titulo,
    descricao: 'Duas demãos de tinta branca.',
    categoria: 'reformas',
    cidade: 'Lavras',
    valorCentavos: 150000,
    prazo: '2026-12-31',
    status: 'aberto',
    criadoEm: '2026-10-01T12:00:00.000Z',
    versao: 1,
    ...extra,
  };
}

export function novaCandidatura(
  id: string,
  trampoId: string,
  freelancerId: string,
  extra: Partial<CandidaturaDoServidor> = {},
): CandidaturaDoServidor {
  return {
    id,
    trampoId,
    freelancerId,
    mensagem: `Posso fazer, diz ${freelancerId}.`,
    valorPropostoCentavos: 140000,
    status: 'pendente',
    criadaEm: '2026-10-02T12:00:00.000Z',
    ...extra,
  };
}

export interface ServidorL2 {
  readonly fetch: FetchFalso;
  readonly trampos: TrampoDoServidor[];
  readonly candidaturas: CandidaturaDoServidor[];
  readonly servicos: ServicoDoServidor[];
  /** Corpos dos `PUT` recebidos, na ordem. */
  readonly puts: { id: string; corpo: Record<string, unknown> }[];
  /** Alguém (outro aparelho) altera o trampo: muda o título e sobe a versão. */
  readonly editarPorFora: (id: string, titulo: string) => void;
  /** Uma candidatura chega ao trampo (a versão sobe). */
  readonly chegarCandidatura: (trampoId: string, freelancerId: string) => void;
  /** Atraso (ms) da resposta do `PUT /trampos/:id`. */
  demoraDoPut: number;
}

function erro(status: number, codigo: string) {
  return { status, corpo: { erro: codigo } };
}

function visao(
  t: TrampoDoServidor,
  candidaturas: readonly CandidaturaDoServidor[],
) {
  if (t.autorId !== EU) {
    const { versao: _versao, ...publico } = t;
    return publico;
  }
  return {
    ...t,
    candidaturasRecebidas: candidaturas.filter((c) => c.trampoId === t.id)
      .length,
  };
}

export function criarServidorL2(
  inicial: {
    trampos?: TrampoDoServidor[];
    candidaturas?: CandidaturaDoServidor[];
    servicos?: ServicoDoServidor[];
  } = {},
): ServidorL2 {
  const trampos = inicial.trampos ?? [novoTrampo('t1', 'Pintar a sala')];
  const candidaturas = inicial.candidaturas ?? [];
  const servicos = inicial.servicos ?? [];
  const puts: { id: string; corpo: Record<string, unknown> }[] = [];
  // Ids de candidatura nunca se repetem (na API são uuid): reusar `k1` depois
  // de uma retirada esconderia bug de cache por id.
  let proximaCandidatura = candidaturas.length + 1;
  const servidor: ServidorL2 = {
    fetch: criarFetchFalso(),
    trampos,
    candidaturas,
    servicos,
    puts,
    demoraDoPut: 0,
    editarPorFora(id, titulo) {
      const t = trampos.find((x) => x.id === id);
      if (t === undefined) throw new Error('trampo ausente');
      t.titulo = titulo;
      t.versao += 1;
    },
    chegarCandidatura(trampoId, freelancerId) {
      const t = trampos.find((x) => x.id === trampoId);
      if (t === undefined) throw new Error('trampo ausente');
      candidaturas.push(
        novaCandidatura(`k${proximaCandidatura++}`, trampoId, freelancerId),
      );
      t.versao += 1;
    },
  };
  const fetch = servidor.fetch;
  fetch
    .responder('GET /categorias', { corpo: CATEGORIAS })
    .responder('GET /perfis/eu', { corpo: PERFIL_COMPLETO })
    .responder('GET /conversas', { corpo: [] })
    .responder('GET /busca', { corpo: { itens: [], proximoCursor: null } })
    .responder('GET /trampos/meus', () => ({
      corpo: trampos
        .filter((t) => t.autorId === EU)
        .map((t) => visao(t, candidaturas)),
    }))
    .responder('GET /servicos/meus', () => ({
      corpo: servicos.filter((s) => s.autorId === EU),
    }))
    .responder('GET /candidaturas/minhas', () => ({
      corpo: candidaturas.filter((c) => c.freelancerId === EU),
    }));
  for (const conta of [EU, BIA, CAIO]) {
    fetch.responder(`GET /perfis/${conta}`, {
      corpo: {
        contaId: conta,
        nome: conta === EU ? 'Ana Lima' : `Nome de ${conta}`,
        cidade: 'Lavras',
        descricao: null,
        habilidades: ['pintura'],
      },
    });
  }

  for (const id of IDS_DE_TRAMPO) {
    const achar = () => trampos.find((x) => x.id === id);
    fetch
      .responder(`GET /trampos/${id}`, () => {
        const t = achar();
        return t === undefined
          ? erro(404, 'nao_encontrado')
          : { corpo: visao(t, candidaturas) };
      })
      .responder(`GET /trampos/${id}/candidaturas`, () => {
        const t = achar();
        if (t === undefined || t.autorId !== EU) {
          return erro(404, 'nao_encontrado');
        }
        return { corpo: candidaturas.filter((c) => c.trampoId === id) };
      })
      .responder(`PUT /trampos/${id}`, (r) => {
        const corpo = r.corpo as Record<string, unknown>;
        puts.push({ id, corpo });
        const t = achar();
        const demora =
          servidor.demoraDoPut > 0 ? { demoraMs: servidor.demoraDoPut } : {};
        if (t === undefined || t.autorId !== EU) {
          return { ...erro(404, 'nao_encontrado'), ...demora };
        }
        if (
          t.status !== 'aberto' ||
          candidaturas.some((c) => c.trampoId === id)
        ) {
          return { ...erro(409, 'trampo_nao_editavel'), ...demora };
        }
        if (corpo.versao !== t.versao) {
          return { ...erro(409, 'conflito_de_versao'), ...demora };
        }
        Object.assign(t, {
          titulo: corpo.titulo,
          descricao: corpo.descricao,
          categoria: corpo.categoria,
          cidade: corpo.cidade,
          valorCentavos: corpo.valorCentavos,
          prazo: (corpo.prazo as string | undefined) ?? null,
        });
        t.versao += 1;
        return { status: 204, ...demora };
      })
      .responder(`POST /trampos/${id}/encerrar`, () => {
        const t = achar();
        if (t === undefined || t.autorId !== EU) {
          return erro(404, 'nao_encontrado');
        }
        if (t.status !== 'encerrado') {
          for (const c of candidaturas) {
            if (c.trampoId === id && c.status === 'pendente') {
              c.status = 'recusada';
            }
          }
          t.status = 'encerrado';
          t.versao += 1;
        }
        return { status: 204 };
      })
      .responder(`DELETE /trampos/${id}`, () => {
        const t = achar();
        if (t === undefined || t.autorId !== EU) {
          return erro(404, 'nao_encontrado');
        }
        if (t.status !== 'aberto') return erro(409, 'trampo_nao_aberto');
        trampos.splice(trampos.indexOf(t), 1);
        for (let i = candidaturas.length - 1; i >= 0; i -= 1) {
          if (candidaturas[i]?.trampoId === id) candidaturas.splice(i, 1);
        }
        return { status: 204 };
      })
      .responder(`POST /trampos/${id}/candidaturas`, (r) => {
        const t = achar();
        if (t === undefined) return erro(404, 'nao_encontrado');
        if (t.autorId === EU) return erro(409, 'autor_nao_pode_candidatar');
        if (
          candidaturas.some((c) => c.trampoId === id && c.freelancerId === EU)
        ) {
          return erro(409, 'candidatura_duplicada');
        }
        if (t.status !== 'aberto') return erro(409, 'trampo_nao_aberto');
        const corpo = r.corpo as {
          mensagem: string;
          valorPropostoCentavos: number;
        };
        const id2 = `k${proximaCandidatura++}`;
        candidaturas.push(
          novaCandidatura(id2, id, EU, {
            mensagem: corpo.mensagem,
            valorPropostoCentavos: corpo.valorPropostoCentavos,
          }),
        );
        t.versao += 1;
        return { status: 201, corpo: { id: id2, status: 'pendente' } };
      });
  }

  for (const id of IDS_DE_CANDIDATURA) {
    fetch.responder(`DELETE /candidaturas/${id}`, () => {
      const i = candidaturas.findIndex((c) => c.id === id);
      const c = candidaturas[i];
      if (c === undefined || c.freelancerId !== EU) {
        return erro(404, 'nao_encontrado');
      }
      if (c.status !== 'pendente') return erro(409, 'candidatura_nao_pendente');
      candidaturas.splice(i, 1);
      const t = trampos.find((x) => x.id === c.trampoId);
      if (t !== undefined) t.versao += 1;
      return { status: 204 };
    });
  }

  for (const id of ['s1']) {
    const achar = () => servicos.find((x) => x.id === id);
    fetch
      .responder(`GET /servicos/${id}`, () => {
        const s = achar();
        if (s === undefined) return erro(404, 'nao_encontrado');
        if (s.autorId !== EU) {
          const { versao: _versao, ...publico } = s;
          return { corpo: publico };
        }
        return { corpo: s };
      })
      .responder(`PUT /servicos/${id}`, (r) => {
        const corpo = r.corpo as Record<string, unknown>;
        puts.push({ id, corpo });
        const s = achar();
        if (s === undefined || s.autorId !== EU) {
          return erro(404, 'nao_encontrado');
        }
        if (corpo.versao !== s.versao) return erro(409, 'conflito_de_versao');
        Object.assign(s, {
          titulo: corpo.titulo,
          descricao: corpo.descricao,
          categoria: corpo.categoria,
          cidade: (corpo.cidade as string | undefined) ?? null,
          precoBaseCentavos: corpo.precoBaseCentavos,
        });
        s.versao += 1;
        return { status: 204 };
      })
      .responder(`DELETE /servicos/${id}`, () => {
        const s = achar();
        if (s === undefined || s.autorId !== EU) {
          return erro(404, 'nao_encontrado');
        }
        servicos.splice(servicos.indexOf(s), 1);
        return { status: 204 };
      });
  }
  return servidor;
}

// --- Gestos e leituras comuns ---

const a = textos.anuncio;

/** Avança os timers falsos e deixa terminar o que a última volta disparou. */
export async function passar(ms = 50) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20);
  });
}

export function requisicoesDe(
  fetch: FetchFalso,
  metodo: string,
  caminho: string,
) {
  return fetch.requisicoes.filter(
    (r) => r.metodo === metodo && r.caminho === caminho,
  );
}

/** O botão de confirmar do diálogo repete o nome do da folha: é o último. */
export function botaoDoDialogo(nome: string) {
  const ultimo = screen.getAllByRole('button', { name: nome }).at(-1);
  if (ultimo === undefined) throw new Error(`sem botão "${nome}"`);
  return ultimo;
}

export const botaoSalvar = () =>
  screen.getByRole('button', { name: a.salvarAlteracoes });

export { a as textosDoAnuncio };
