import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agendarTarefa, type OpcoesDoAgendamento } from './agendar-tarefa.js';

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;

/** Promessa controlada pelo teste. */
function adiada(): {
  promessa: Promise<void>;
  resolver: () => void;
  rejeitar: (erro: unknown) => void;
} {
  let resolver!: () => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<void>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** Avança o relógio falso e deixa as promessas pendentes andarem. */
async function avancar(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Diz se a promessa já resolveu, sem esperar por ela. */
async function jaResolveu(promessa: Promise<unknown>): Promise<boolean> {
  let resolveu = false;
  void promessa.then(() => {
    resolveu = true;
  });
  await avancar(0);
  return resolveu;
}

function opcoes(
  parcial: Partial<OpcoesDoAgendamento> = {},
): OpcoesDoAgendamento {
  return {
    executar: async () => undefined,
    intervaloMs: HORA_MS,
    atrasoInicialMs: MINUTO_MS,
    aoFalhar: () => undefined,
    ...parcial,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('agendarTarefa (D40)', () => {
  it('roda pela primeira vez no atraso inicial e depois a cada intervalo', async () => {
    const executar = vi.fn(async () => undefined);
    const tarefa = agendarTarefa(opcoes({ executar }));

    await avancar(MINUTO_MS - 1);
    expect(executar).not.toHaveBeenCalled();
    await avancar(1);
    expect(executar).toHaveBeenCalledTimes(1);

    await avancar(HORA_MS - 1);
    expect(executar).toHaveBeenCalledTimes(1);
    await avancar(1);
    expect(executar).toHaveBeenCalledTimes(2);
    await avancar(3 * HORA_MS);
    expect(executar).toHaveBeenCalledTimes(5);

    await tarefa.parar();
  });

  it('aceita atraso inicial 0', async () => {
    const executar = vi.fn(async () => undefined);
    const tarefa = agendarTarefa(opcoes({ executar, atrasoInicialMs: 0 }));

    await avancar(0);

    expect(executar).toHaveBeenCalledTimes(1);
    await tarefa.parar();
  });

  it('sem sobreposição: enquanto uma execução não termina, a seguinte não começa', async () => {
    const execucoes: ReturnType<typeof adiada>[] = [];
    let emCurso = 0;
    let maximoEmCurso = 0;
    const executar = vi.fn(async () => {
      const atual = adiada();
      execucoes.push(atual);
      emCurso++;
      maximoEmCurso = Math.max(maximoEmCurso, emCurso);
      try {
        await atual.promessa;
      } finally {
        emCurso--;
      }
    });
    const tarefa = agendarTarefa(opcoes({ executar }));

    await avancar(MINUTO_MS);
    // A primeira demora 10 intervalos: nenhuma outra começa nesse tempo.
    await avancar(10 * HORA_MS);
    expect(executar).toHaveBeenCalledTimes(1);

    execucoes[0]?.resolver();
    await avancar(0);
    // O intervalo conta do fim da anterior, não do início.
    await avancar(HORA_MS - 1);
    expect(executar).toHaveBeenCalledTimes(1);
    await avancar(1);
    expect(executar).toHaveBeenCalledTimes(2);
    expect(maximoEmCurso).toBe(1);

    execucoes[1]?.resolver();
    await tarefa.parar();
  });

  it('parar espera a execução em curso terminar e não agenda mais nenhuma', async () => {
    const execucao = adiada();
    let terminou = false;
    const executar = vi.fn(async () => {
      await execucao.promessa;
      terminou = true;
    });
    const tarefa = agendarTarefa(opcoes({ executar }));
    await avancar(MINUTO_MS);
    expect(executar).toHaveBeenCalledTimes(1);

    const parando = tarefa.parar();

    expect(await jaResolveu(parando)).toBe(false);
    execucao.resolver();
    await parando;
    expect(terminou).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await avancar(10 * HORA_MS);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('parar antes da primeira execução cancela o timer e resolve na hora', async () => {
    const executar = vi.fn(async () => undefined);
    const tarefa = agendarTarefa(opcoes({ executar }));
    expect(vi.getTimerCount()).toBe(1);

    await tarefa.parar();

    expect(vi.getTimerCount()).toBe(0);
    await avancar(10 * HORA_MS);
    expect(executar).not.toHaveBeenCalled();
  });

  it('parar entre duas execuções cancela a próxima', async () => {
    const executar = vi.fn(async () => undefined);
    const tarefa = agendarTarefa(opcoes({ executar }));
    await avancar(MINUTO_MS);

    await tarefa.parar();

    expect(vi.getTimerCount()).toBe(0);
    await avancar(10 * HORA_MS);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('parar pode ser chamado de novo e sempre resolve', async () => {
    const execucao = adiada();
    const tarefa = agendarTarefa(opcoes({ executar: () => execucao.promessa }));
    await avancar(MINUTO_MS);

    const primeira = tarefa.parar();
    const segunda = tarefa.parar();
    execucao.resolver();

    await expect(primeira).resolves.toBeUndefined();
    await expect(segunda).resolves.toBeUndefined();
    await expect(tarefa.parar()).resolves.toBeUndefined();
  });

  it('a falha vai para aoFalhar com o erro e a tarefa segue agendada', async () => {
    const erro = Object.assign(new Error('falha de banco'), { code: '57P01' });
    const aoFalhar = vi.fn();
    const executar = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(erro)
      .mockResolvedValue(undefined);
    const tarefa = agendarTarefa(opcoes({ executar, aoFalhar }));

    await avancar(MINUTO_MS);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar).toHaveBeenCalledWith(erro);

    await avancar(HORA_MS);
    expect(executar).toHaveBeenCalledTimes(2);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    await tarefa.parar();
  });

  it('a exceção síncrona da tarefa também vai para aoFalhar', async () => {
    const erro = new Error('síncrono');
    const aoFalhar = vi.fn();
    const executar = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => {
        throw erro;
      })
      .mockResolvedValue(undefined);
    const tarefa = agendarTarefa(opcoes({ executar, aoFalhar }));

    await avancar(MINUTO_MS);
    await avancar(HORA_MS);

    expect(aoFalhar).toHaveBeenCalledWith(erro);
    expect(executar).toHaveBeenCalledTimes(2);
    await tarefa.parar();
  });

  it('se aoFalhar lançar, a tarefa segue agendada e nada vira rejeição sem tratamento', async () => {
    const naoTratadas: unknown[] = [];
    const registrar = (motivo: unknown) => void naoTratadas.push(motivo);
    process.on('unhandledRejection', registrar);
    try {
      const executar = vi.fn(async () => {
        throw new Error('falhou');
      });
      const aoFalhar = vi.fn(() => {
        throw new Error('aoFalhar também falhou');
      });
      const tarefa = agendarTarefa(opcoes({ executar, aoFalhar }));

      await avancar(MINUTO_MS);
      await avancar(HORA_MS);
      await tarefa.parar();
      // A rejeição sem tratamento é avisada num ciclo seguinte do laço.
      vi.useRealTimers();
      await new Promise((resolver) => setImmediate(resolver));

      expect(executar).toHaveBeenCalledTimes(2);
      expect(aoFalhar).toHaveBeenCalledTimes(2);
      expect(naoTratadas).toEqual([]);
    } finally {
      process.off('unhandledRejection', registrar);
    }
  });

  it('parar durante uma execução que falha resolve, sem rejeitar, e aoFalhar recebe o erro', async () => {
    const execucao = adiada();
    const aoFalhar = vi.fn();
    const tarefa = agendarTarefa(
      opcoes({ executar: () => execucao.promessa, aoFalhar }),
    );
    await avancar(MINUTO_MS);

    const parando = tarefa.parar();
    const erro = new Error('falhou no meio');
    execucao.rejeitar(erro);

    await expect(parando).resolves.toBeUndefined();
    expect(aoFalhar).toHaveBeenCalledWith(erro);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('todos os timers usam unref: a tarefa nunca segura o processo vivo', async () => {
    const espiao = vi.spyOn(globalThis, 'setTimeout');
    const tarefa = agendarTarefa(opcoes());

    await avancar(MINUTO_MS);
    await avancar(2 * HORA_MS);

    // O atraso inicial e os dois intervalos já cumpridos, mais o pendente.
    expect(espiao).toHaveBeenCalledTimes(4);
    for (const { value } of espiao.mock.results) {
      expect((value as NodeJS.Timeout).hasRef()).toBe(false);
    }
    await tarefa.parar();
  });

  it.each([
    ['intervaloMs', { intervaloMs: 0 }],
    ['intervaloMs', { intervaloMs: -1 }],
    ['intervaloMs', { intervaloMs: 1.5 }],
    ['intervaloMs', { intervaloMs: Number.NaN }],
    ['intervaloMs', { intervaloMs: Number.POSITIVE_INFINITY }],
    ['intervaloMs', { intervaloMs: 2_147_483_648 }],
    ['atrasoInicialMs', { atrasoInicialMs: -1 }],
    ['atrasoInicialMs', { atrasoInicialMs: 0.5 }],
    ['atrasoInicialMs', { atrasoInicialMs: Number.NaN }],
    ['atrasoInicialMs', { atrasoInicialMs: 2_147_483_648 }],
  ] as const)(
    'recusa %s inválido (%o) na hora, sem agendar nada',
    (nome, parcial) => {
      const executar = vi.fn(async () => undefined);

      expect(() => agendarTarefa(opcoes({ executar, ...parcial }))).toThrow(
        `agendamento inválido: ${nome}`,
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('aceita os limites do setTimeout: intervalo 1 ms e espera de 2^31 - 1 ms', async () => {
    const executar = vi.fn(async () => undefined);
    const rapida = agendarTarefa(
      opcoes({ executar, intervaloMs: 1, atrasoInicialMs: 2_147_483_647 }),
    );

    await avancar(2_147_483_646);
    expect(executar).not.toHaveBeenCalled();
    await avancar(1);
    expect(executar).toHaveBeenCalledTimes(1);
    await avancar(1);
    expect(executar).toHaveBeenCalledTimes(2);
    await rapida.parar();
  });
});
