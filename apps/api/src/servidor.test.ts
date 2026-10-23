/**
 * Entrypoint (`servidor.ts`): agendamento da limpeza periódica (D40, ADR-007),
 * log da falha só com o código (CA54) e encerramento que para a limpeza antes
 * de fechar o banco.
 *
 * O arquivo roda `iniciar()` ao ser importado. Aqui a configuração, a conexão
 * e a composição são simuladas; a aplicação devolvida tem um Fastify real com
 * o logger de produção (`criarLogger`, com redact) escrevendo num coletor. Os
 * ouvintes de sinal são capturados, sem registrar nada no `process`.
 */
import type { FastifyInstance } from 'fastify';
import { DatabaseError } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarLogger } from './compartilhado/http/logger.js';
import { criarServidor } from './compartilhado/http/servidor.js';
import type { Aplicacao } from './composicao.js';

const simulados = vi.hoisted(() => ({
  montarAplicacao: vi.fn(),
  criarConexao: vi.fn(),
}));

vi.mock('./composicao.js', () => ({
  montarAplicacao: simulados.montarAplicacao,
}));
vi.mock('./compartilhado/banco/conexao.js', () => ({
  criarConexao: simulados.criarConexao,
}));
vi.mock('./config.js', async (original) => ({
  ...(await original<typeof import('./config.js')>()),
  carregarArquivoEnv: () => undefined,
  carregarConfig: () => ({
    databaseUrl: URL_DO_BANCO,
    porta: 3000,
    trustProxy: false,
  }),
}));

// Sentinelas: nenhuma pode aparecer no log (CA54).
const URL_DO_BANCO = 'postgres://usuario:SenhaDoBanco@localhost/trampoja';
const ID_EXCLUIDO = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const EMAIL = 'sentinela.limpeza@exemplo.test';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

let app: FastifyInstance | undefined;
let linhas: string[];
let ouvintes: Map<string, (sinal: string) => void>;
let ordem: string[];
let limpar: ReturnType<typeof vi.fn<Aplicacao['limparRegistrosVencidos']>>;
let destruir: ReturnType<typeof vi.fn<() => Promise<void>>>;
let fechar: ReturnType<typeof vi.fn<() => Promise<void>>>;
let escutar: ReturnType<typeof vi.fn<() => Promise<string>>>;

/** Deixa o `iniciar()` e os `await` pendentes andarem (o `setImmediate` é real). */
async function esvaziar(voltas = 20): Promise<void> {
  for (let i = 0; i < voltas; i++) {
    await new Promise((pronto) => setImmediate(pronto));
  }
}

async function subir(): Promise<void> {
  await import('./servidor.js');
  await esvaziar();
}

function logs(): Record<string, unknown>[] {
  return linhas.map((linha) => JSON.parse(linha) as Record<string, unknown>);
}

function comMensagem(mensagem: string): Record<string, unknown>[] {
  return logs().filter((linha) => linha.msg === mensagem);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  linhas = [];
  ouvintes = new Map();
  ordem = [];
  app = criarServidor({
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => void linhas.push(linha) },
    }),
  });
  limpar = vi.fn<Aplicacao['limparRegistrosVencidos']>(async () => {
    ordem.push('limpeza');
    return { sessoes: 3, contasRevarridas: 1 };
  });
  fechar = vi.fn(async () => {
    ordem.push('fechar');
  });
  escutar = vi.fn(async () => 'http://0.0.0.0:3000');
  destruir = vi.fn(async () => {
    ordem.push('destroy');
  });
  const servidor = app;
  simulados.criarConexao.mockReturnValue({ destroy: destruir });
  simulados.montarAplicacao.mockImplementation(async () => ({
    app: new Proxy(servidor, {
      get: (alvo, chave, receptor) =>
        chave === 'listen' ? escutar : Reflect.get(alvo, chave, receptor),
    }),
    rotas: [],
    limparRegistrosVencidos: limpar,
    fechar,
  }));
  vi.spyOn(process, 'once').mockImplementation(((
    evento: string,
    ouvinte: (sinal: string) => void,
  ) => {
    ouvintes.set(evento, ouvinte);
    return process;
  }) as typeof process.once);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  simulados.montarAplicacao.mockReset();
  simulados.criarConexao.mockReset();
  process.exitCode = undefined;
  await app?.close();
  app = undefined;
});

describe('servidor.ts — limpeza periódica (D40, CA46, CA47)', () => {
  it('a primeira rodada sai 1 min depois de subir e as seguintes 1 h depois do fim da anterior, com as contagens no log', async () => {
    await subir();
    expect(escutar).toHaveBeenCalledOnce();
    expect(ouvintes.has('SIGTERM')).toBe(true);

    await vi.advanceTimersByTimeAsync(MINUTO - 1);
    expect(limpar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(limpar).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(HORA - 1);
    expect(limpar).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(limpar).toHaveBeenCalledTimes(2);

    const concluidas = comMensagem('limpeza periódica concluída');
    expect(concluidas).toHaveLength(2);
    expect(concluidas[0]).toMatchObject({
      level: 30,
      sessoes: 3,
      contasRevarridas: 1,
    });
    expect(typeof concluidas[0]?.duracaoMs).toBe('number');
  });

  it('CA54 — a falha registra só o código: nem a mensagem, o detail, o e-mail, o id excluído ou a URL do banco; e a limpeza segue agendada', async () => {
    const doDriver = Object.assign(
      new DatabaseError(
        `falha com ${EMAIL} e ${ID_EXCLUIDO} em ${URL_DO_BANCO}`,
        0,
        'error',
      ),
      {
        code: '57014',
        detail: `Key (conta_id)=(${ID_EXCLUIDO}) ${EMAIL}`,
        parameters: [ID_EXCLUIDO, EMAIL],
      },
    );
    const semCodigoUtil = Object.assign(new Error(`erro ${ID_EXCLUIDO}`), {
      code: `codigo com ${EMAIL}`,
    });
    limpar
      .mockRejectedValueOnce(doDriver)
      .mockRejectedValueOnce(semCodigoUtil)
      .mockRejectedValueOnce('texto solto');
    await subir();

    await vi.advanceTimersByTimeAsync(MINUTO);
    await vi.advanceTimersByTimeAsync(HORA);
    await vi.advanceTimersByTimeAsync(HORA);
    await vi.advanceTimersByTimeAsync(HORA);

    expect(limpar).toHaveBeenCalledTimes(4);
    const falhas = comMensagem('falha na limpeza periódica');
    expect(falhas.map(({ level, codigo }) => ({ level, codigo }))).toEqual([
      { level: 50, codigo: '57014' },
      { level: 50, codigo: 'sem_codigo' },
      { level: 50, codigo: 'sem_codigo' },
    ]);
    for (const falha of falhas) {
      expect(Object.keys(falha).sort()).toEqual([
        'codigo',
        'hostname',
        'level',
        'msg',
        'pid',
        'time',
      ]);
    }
    const tudo = linhas.join('');
    for (const sentinela of [
      EMAIL,
      ID_EXCLUIDO,
      URL_DO_BANCO,
      'SenhaDoBanco',
      'Key (conta_id)',
      'falha com',
    ]) {
      expect(tudo, sentinela).not.toContain(sentinela);
    }
    // Depois das falhas, a 4ª rodada deu certo.
    expect(comMensagem('limpeza periódica concluída')).toHaveLength(1);
  });

  it('no SIGTERM, cancela a próxima limpeza e espera a rodada em curso terminar antes do db.destroy()', async () => {
    let terminarRodada: () => void = () => undefined;
    limpar.mockImplementationOnce(
      () =>
        new Promise((pronto) => {
          ordem.push('limpeza começou');
          terminarRodada = () => {
            ordem.push('limpeza terminou');
            pronto({ sessoes: 0, contasRevarridas: 0 });
          };
        }),
    );
    await subir();
    await vi.advanceTimersByTimeAsync(MINUTO);
    expect(limpar).toHaveBeenCalledOnce();

    ouvintes.get('SIGTERM')?.('SIGTERM');
    await esvaziar();
    expect(fechar).toHaveBeenCalledOnce();
    expect(destruir).not.toHaveBeenCalled();

    terminarRodada();
    await esvaziar();
    expect(ordem).toEqual([
      'limpeza começou',
      'fechar',
      'limpeza terminou',
      'destroy',
    ]);
    expect(comMensagem('servidor encerrado')).toHaveLength(1);

    // Nada fica agendado: nenhuma rodada nova, nem horas depois.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3 * HORA);
    expect(limpar).toHaveBeenCalledOnce();
  });

  it('no SIGINT antes da primeira rodada, a limpeza não chega a rodar', async () => {
    await subir();
    ouvintes.get('SIGINT')?.('SIGINT');
    await esvaziar();

    expect(ordem).toEqual(['fechar', 'destroy']);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * HORA);
    expect(limpar).not.toHaveBeenCalled();
  });

  it('se o listen falhar, a limpeza não é agendada e o banco fecha', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    escutar.mockRejectedValueOnce(
      Object.assign(new Error('listen EADDRINUSE 0.0.0.0:3000'), {
        code: 'EADDRINUSE',
      }),
    );
    await subir();

    expect(ordem).toEqual(['fechar', 'destroy']);
    expect(vi.getTimerCount()).toBe(0);
    expect(ouvintes.size).toBe(0);
    expect(erro).toHaveBeenCalledWith(
      '[servidor] falha ao iniciar (Error, código: EADDRINUSE)',
    );
    expect(process.exitCode).toBe(1);
  });
});
