import { Agent, type ClientRequest, request as pedirHttp } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { sinalDaConexao } from './sinal-da-conexao.js';

/**
 * Servidor real na porta 0: só uma conexão TCP de verdade mostra o que
 * acontece quando o cliente desliga (o `inject` não tem socket).
 */
interface Observado {
  /** Sinal devolvido no handler. */
  sinal?: AbortSignal;
  /** Estado do sinal logo depois de o handler o pedir. */
  abortadoAoPedir?: boolean;
  /** Estado do sinal ao fim do handler. */
  abortadoNoFim?: boolean;
  /** Ouvintes de `close` no socket ao fim do handler. */
  ouvintesNoSocket?: number;
}

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

/**
 * Sobe um servidor com `POST /lento`: pede o sinal, espera `liberar` e
 * responde. Com `?antes=1`, só pede o sinal depois de o socket fechar.
 */
async function subir() {
  const observados: Observado[] = [];
  const liberacoes: Array<() => void> = [];
  app = Fastify();
  app.post<{ Querystring: { antes?: string } }>(
    '/lento',
    async (requisicao, resposta) => {
      const observado: Observado = {};
      observados.push(observado);
      if (requisicao.query.antes === '1') {
        await new Promise((r) => requisicao.raw.socket.once('close', r));
      }
      observado.sinal = sinalDaConexao(resposta);
      observado.abortadoAoPedir = observado.sinal.aborted;
      await new Promise<void>((liberar) => liberacoes.push(liberar));
      observado.abortadoNoFim = observado.sinal.aborted;
      observado.ouvintesNoSocket = requisicao.raw.socket.listenerCount('close');
      return { ok: true };
    },
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return { port, observados, liberacoes };
}

interface Pedido {
  readonly cliente: ClientRequest;
  readonly resposta: Promise<number | 'erro'>;
}

function pedir(porta: number, caminho = '/lento', agente?: Agent): Pedido {
  const corpo = JSON.stringify({ senha: 'x' });
  let cliente!: ClientRequest;
  const resposta = new Promise<number | 'erro'>((resolver) => {
    cliente = pedirHttp(
      {
        host: '127.0.0.1',
        port: porta,
        method: 'POST',
        path: caminho,
        agent: agente,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(corpo),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolver(res.statusCode ?? 0));
      },
    );
    cliente.on('error', () => resolver('erro'));
    cliente.end(corpo);
  });
  return { cliente, resposta };
}

async function ate(condicao: () => boolean): Promise<void> {
  for (let volta = 0; volta < 500 && !condicao(); volta++) {
    await new Promise((resolver) => setTimeout(resolver, 2));
  }
  expect(condicao()).toBe(true);
}

describe('sinalDaConexao (servidor real)', () => {
  it('Dado o cliente conectado, então o sinal não aborta depois de o corpo ser lido nem depois da resposta', async () => {
    const { port, observados, liberacoes } = await subir();

    const { resposta } = pedir(port);
    await ate(() => liberacoes.length === 1);
    // Um tempo com o corpo já lido: o `request.signal` do Fastify já teria
    // abortado aqui.
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(observados[0]?.sinal?.aborted).toBe(false);
    liberacoes[0]?.();

    expect(await resposta).toBe(200);
    expect(observados[0]?.abortadoAoPedir).toBe(false);
    expect(observados[0]?.abortadoNoFim).toBe(false);
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(observados[0]?.sinal?.aborted).toBe(false);
  });

  it('Dado o cliente que desliga antes da resposta, então o sinal aborta', async () => {
    const { port, observados, liberacoes } = await subir();

    const { cliente } = pedir(port);
    await ate(() => liberacoes.length === 1);
    expect(observados[0]?.sinal?.aborted).toBe(false);
    cliente.destroy();

    await ate(() => observados[0]?.sinal?.aborted === true);
    liberacoes[0]?.();
  });

  it('Dado o cliente que desligou antes de o handler pedir o sinal, então o sinal já nasce abortado', async () => {
    const { port, observados, liberacoes } = await subir();

    const { cliente } = pedir(port, '/lento?antes=1');
    await ate(() => observados.length === 1);
    cliente.destroy();

    await ate(() => liberacoes.length === 1);
    expect(observados[0]?.abortadoAoPedir).toBe(true);
    liberacoes[0]?.();
  });

  it('Dada uma conexão keep-alive com vários pedidos, então nenhum ouvinte se acumula no socket e o fim da conexão não aborta os sinais já respondidos', async () => {
    const { port, observados, liberacoes } = await subir();
    const agente = new Agent({ keepAlive: true, maxSockets: 1 });

    try {
      for (let i = 0; i < 15; i++) {
        const { resposta } = pedir(port, '/lento', agente);
        await ate(() => liberacoes.length === i + 1);
        liberacoes[i]?.();
        expect(await resposta).toBe(200);
      }
    } finally {
      agente.destroy();
    }

    const ouvintes = observados.map((o) => o.ouvintesNoSocket);
    expect(new Set(ouvintes).size).toBe(1);
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(observados.every((o) => o.sinal?.aborted === false)).toBe(true);
  });
});
