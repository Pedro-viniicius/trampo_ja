import { getEventListeners } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EsperaCancelada, EsperaEsgotada, Semaforo } from './semaforo.js';

/** Promessa controlada de fora: a tarefa só termina quando o teste manda. */
function adiada<T = void>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** Deixa rodar as continuações pendentes (microtarefas e um tique). */
const esvaziar = () => new Promise<void>((resolver) => setImmediate(resolver));

type Desfecho<T> = { ok: true; valor: T } | { ok: false; erro: unknown };

/**
 * Pendura o tratamento na hora: uma rejeição esperada não vira "Unhandled
 * Rejection" enquanto o teste avança o relógio ou espera `setImmediate`.
 */
function desfecho<T>(promessa: Promise<T>): Promise<Desfecho<T>> {
  return promessa.then(
    (valor) => ({ ok: true as const, valor }),
    (erro: unknown) => ({ ok: false as const, erro }),
  );
}

/** Ocupa todas as vagas com tarefas que só terminam quando o teste manda. */
function ocupar(semaforo: Semaforo, vagas: number) {
  const portoes = Array.from({ length: vagas }, () => adiada());
  const resultados = portoes.map((portao) =>
    semaforo.executar(() => portao.promessa),
  );
  return {
    async liberar(i = 0) {
      portoes[i]?.resolver();
      await resultados[i];
      await esvaziar();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Semaforo', () => {
  it('com 5 tarefas simultâneas e limite 2, no máximo 2 rodam ao mesmo tempo', async () => {
    const semaforo = new Semaforo(2);
    const portoes = Array.from({ length: 5 }, () => adiada());
    let rodando = 0;
    let pico = 0;
    const iniciadas: number[] = [];

    const resultados = portoes.map((portao, i) =>
      semaforo.executar(async () => {
        rodando += 1;
        pico = Math.max(pico, rodando);
        iniciadas.push(i);
        await portao.promessa;
        rodando -= 1;
        return i;
      }),
    );
    await esvaziar();

    expect(iniciadas).toEqual([0, 1]);
    expect(semaforo.emUso).toBe(2);
    expect(semaforo.naFila).toBe(3);

    for (const portao of portoes) {
      portao.resolver();
      await esvaziar();
      expect(rodando).toBeLessThanOrEqual(2);
    }

    expect(await Promise.all(resultados)).toEqual([0, 1, 2, 3, 4]);
    expect(pico).toBe(2);
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it('atende na ordem de chegada, mesmo quando a vaga liberada é a segunda', async () => {
    const semaforo = new Semaforo(2);
    const portoes = Array.from({ length: 6 }, () => adiada());
    const iniciadas: number[] = [];
    const resultados = portoes.map((portao, i) =>
      semaforo.executar(async () => {
        iniciadas.push(i);
        await portao.promessa;
      }),
    );
    await esvaziar();
    expect(iniciadas).toEqual([0, 1]);

    // Libera fora de ordem: a vaga vai sempre para a primeira da fila.
    for (const i of [1, 0, 3, 2, 5, 4]) {
      portoes[i]?.resolver();
      await esvaziar();
    }
    await Promise.all(resultados);

    expect(iniciadas).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('depois de uma tarefa rejeitar, a vaga é liberada e a fila anda', async () => {
    const semaforo = new Semaforo(1);
    const falha = adiada();
    const iniciadas: string[] = [];
    const a = semaforo.executar(async () => {
      iniciadas.push('a');
      await falha.promessa;
    });
    const b = semaforo.executar(async () => {
      iniciadas.push('b');
      return 'ok';
    });
    await esvaziar();
    expect(iniciadas).toEqual(['a']);

    falha.rejeitar(new Error('falhou'));

    await expect(a).rejects.toThrow('falhou');
    await expect(b).resolves.toBe('ok');
    expect(iniciadas).toEqual(['a', 'b']);
    expect(semaforo.emUso).toBe(0);
  });

  it('tarefa que lança de forma síncrona também libera a vaga', async () => {
    const semaforo = new Semaforo(1);
    const a = semaforo.executar((): Promise<never> => {
      throw new Error('síncrono');
    });
    const b = semaforo.executar(async () => 'ok');

    await expect(a).rejects.toThrow('síncrono');
    await expect(b).resolves.toBe('ok');
    expect(semaforo.emUso).toBe(0);
  });

  it('fila sem teto: atende muitas tarefas, todas na ordem de chegada', async () => {
    const semaforo = new Semaforo(2);
    const total = 5_000;
    const iniciadas: number[] = [];
    let rodando = 0;
    let pico = 0;
    const resultados = Array.from({ length: total }, (_, i) =>
      semaforo.executar(async () => {
        rodando += 1;
        pico = Math.max(pico, rodando);
        iniciadas.push(i);
        await Promise.resolve();
        rodando -= 1;
      }),
    );
    expect(semaforo.naFila).toBe(total - 2);

    await Promise.all(resultados);

    expect(iniciadas).toEqual(Array.from({ length: total }, (_, i) => i));
    expect(pico).toBe(2);
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'recusa limite inválido: %s',
    (limite) => {
      expect(() => new Semaforo(limite)).toThrow(TypeError);
    },
  );

  it('sem opções, continua esperando o quanto for preciso', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const b = desfecho(semaforo.executar(async () => 'b'));

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await esvaziar();
    expect(semaforo.naFila).toBe(1);

    await ocupada.liberar();
    expect(await b).toEqual({ ok: true, valor: 'b' });
  });
});

describe('Semaforo: espera máxima (CA45)', () => {
  it('a espera esgotada rejeita com EsperaEsgotada, sem rodar e sem consumir vaga', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const tarefaB = vi.fn(async () => 'b');
    const b = desfecho(semaforo.executar(tarefaB, { esperaMaximaMs: 10_000 }));
    const c = desfecho(semaforo.executar(async () => 'c'));
    await esvaziar();
    expect(semaforo.naFila).toBe(2);

    vi.advanceTimersByTime(9_999);
    await esvaziar();
    expect(semaforo.naFila).toBe(2);

    vi.advanceTimersByTime(1);
    const desfechoB = await b;
    expect(desfechoB.ok).toBe(false);
    expect(desfechoB.ok ? undefined : desfechoB.erro).toBeInstanceOf(
      EsperaEsgotada,
    );
    expect(tarefaB).not.toHaveBeenCalled();
    expect(semaforo.naFila).toBe(1);
    expect(semaforo.emUso).toBe(1);

    // A vaga liberada vai para C, a seguinte na fila; B não ocupou nada.
    await ocupada.liberar();
    expect(await c).toEqual({ ok: true, valor: 'c' });
    expect(tarefaB).not.toHaveBeenCalled();
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it('com vaga livre, roda na hora mesmo com espera máxima 0', async () => {
    const semaforo = new Semaforo(1);

    await expect(
      semaforo.executar(async () => 'ok', { esperaMaximaMs: 0 }),
    ).resolves.toBe('ok');
    expect(semaforo.emUso).toBe(0);
  });

  it('espera máxima 0 com as vagas ocupadas rejeita na hora, sem entrar na fila', async () => {
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const tarefa = vi.fn(async () => 'x');

    const recusa = semaforo.executar(tarefa, { esperaMaximaMs: 0 });
    expect(semaforo.naFila).toBe(0);
    await expect(recusa).rejects.toBeInstanceOf(EsperaEsgotada);

    await ocupada.liberar();
    expect(tarefa).not.toHaveBeenCalled();
    expect(semaforo.emUso).toBe(0);
  });

  it('a vaga concedida antes do prazo desarma o temporizador', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const portaoB = adiada<string>();
    const b = desfecho(
      semaforo.executar(() => portaoB.promessa, { esperaMaximaMs: 100 }),
    );

    vi.advanceTimersByTime(50);
    await ocupada.liberar();
    expect(semaforo.naFila).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    // B pegou a vaga: o prazo de espera não vale mais para ela.
    vi.advanceTimersByTime(1_000);
    portaoB.resolver('b');
    expect(await b).toEqual({ ok: true, valor: 'b' });
    expect(semaforo.emUso).toBe(0);
  });

  it('o temporizador da espera não segura o processo (unref)', async () => {
    const setTimeoutEspiao = vi.spyOn(globalThis, 'setTimeout');
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const b = desfecho(
      semaforo.executar(async () => 'b', { esperaMaximaMs: 60_000 }),
    );

    const temporizador = setTimeoutEspiao.mock.results.at(-1)?.value as
      | NodeJS.Timeout
      | undefined;
    setTimeoutEspiao.mockRestore();
    expect(temporizador?.hasRef()).toBe(false);

    await ocupada.liberar();
    expect(await b).toEqual({ ok: true, valor: 'b' });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31])(
    'recusa espera máxima inválida (%s) sem rodar nem consumir vaga',
    async (esperaMaximaMs) => {
      const semaforo = new Semaforo(1);
      const tarefa = vi.fn(async () => 'x');

      await expect(
        semaforo.executar(tarefa, { esperaMaximaMs }),
      ).rejects.toBeInstanceOf(TypeError);
      expect(tarefa).not.toHaveBeenCalled();
      expect(semaforo.emUso).toBe(0);
      expect(semaforo.naFila).toBe(0);
    },
  );
});

describe('Semaforo: cancelamento pelo sinal (CA45)', () => {
  it('a tarefa cancelada na fila nunca roda e sai com EsperaCancelada', async () => {
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const controle = new AbortController();
    const tarefaB = vi.fn(async () => 'b');
    const b = desfecho(
      semaforo.executar(tarefaB, {
        sinal: controle.signal,
        esperaMaximaMs: 10_000,
      }),
    );
    await esvaziar();
    expect(semaforo.naFila).toBe(1);

    controle.abort(new Error('conexão de maria.silva@exemplo.com caiu'));
    const desfechoB = await b;

    expect(desfechoB.ok).toBe(false);
    const erro = desfechoB.ok ? undefined : desfechoB.erro;
    expect(erro).toBeInstanceOf(EsperaCancelada);
    // O motivo do abort não é copiado para o erro.
    expect(String(erro)).not.toContain('maria');
    expect((erro as Error).cause).toBeUndefined();
    expect(semaforo.naFila).toBe(0);
    expect(getEventListeners(controle.signal, 'abort')).toHaveLength(0);

    await ocupada.liberar();
    expect(tarefaB).not.toHaveBeenCalled();
    expect(semaforo.emUso).toBe(0);
  });

  it('o cancelamento desarma o temporizador da espera', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const controle = new AbortController();
    const b = desfecho(
      semaforo.executar(async () => 'b', {
        sinal: controle.signal,
        esperaMaximaMs: 10_000,
      }),
    );
    expect(vi.getTimerCount()).toBe(1);

    controle.abort();
    const desfechoB = await b;

    expect(desfechoB.ok ? undefined : desfechoB.erro).toBeInstanceOf(
      EsperaCancelada,
    );
    expect(vi.getTimerCount()).toBe(0);
    await ocupada.liberar();
  });

  it('com o sinal já abortado, rejeita sem rodar mesmo com vaga livre', async () => {
    const semaforo = new Semaforo(1);
    const tarefa = vi.fn(async () => 'x');

    await expect(
      semaforo.executar(tarefa, { sinal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(EsperaCancelada);
    expect(tarefa).not.toHaveBeenCalled();
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it('abortar depois de pegar a vaga não interrompe a tarefa', async () => {
    const semaforo = new Semaforo(1);
    const controleA = new AbortController();
    const portaoA = adiada<string>();
    const a = desfecho(
      semaforo.executar(() => portaoA.promessa, { sinal: controleA.signal }),
    );
    await esvaziar();
    expect(semaforo.emUso).toBe(1);

    controleA.abort();
    portaoA.resolver('a');

    expect(await a).toEqual({ ok: true, valor: 'a' });
    expect(semaforo.emUso).toBe(0);
  });

  it('abortar depois de a vaga passar da fila para a tarefa não a interrompe', async () => {
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const controleB = new AbortController();
    const portaoB = adiada<string>();
    const iniciadas: string[] = [];
    const b = desfecho(
      semaforo.executar(
        async () => {
          iniciadas.push('b');
          return portaoB.promessa;
        },
        { sinal: controleB.signal, esperaMaximaMs: 10_000 },
      ),
    );

    await ocupada.liberar();
    expect(iniciadas).toEqual(['b']);
    // O ouvinte do abort sai junto com a fila.
    expect(getEventListeners(controleB.signal, 'abort')).toHaveLength(0);

    controleB.abort();
    portaoB.resolver('b');

    expect(await b).toEqual({ ok: true, valor: 'b' });
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it('quem sai da fila não muda a ordem dos demais (FIFO)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const iniciadas: string[] = [];
    const tarefa = (nome: string) => async () => {
      iniciadas.push(nome);
    };
    const controleC = new AbortController();
    const controleE = new AbortController();
    const resultados = [
      desfecho(semaforo.executar(tarefa('b'))),
      desfecho(
        semaforo.executar(tarefa('c'), {
          sinal: controleC.signal,
          esperaMaximaMs: 60_000,
        }),
      ),
      desfecho(semaforo.executar(tarefa('d'), { esperaMaximaMs: 500 })),
      desfecho(semaforo.executar(tarefa('e'), { sinal: controleE.signal })),
      desfecho(semaforo.executar(tarefa('f'), { esperaMaximaMs: 60_000 })),
      desfecho(semaforo.executar(tarefa('g'))),
    ];
    expect(semaforo.naFila).toBe(6);

    controleC.abort();
    vi.advanceTimersByTime(500);
    controleE.abort();
    await esvaziar();
    expect(semaforo.naFila).toBe(3);

    await ocupada.liberar();
    await Promise.all(resultados);

    expect(iniciadas).toEqual(['b', 'f', 'g']);
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it('muitas saídas com a vaga presa: a fila compacta e mantém a ordem', async () => {
    const semaforo = new Semaforo(1);
    const ocupada = ocupar(semaforo, 1);
    const total = 5_000;
    const iniciadas: number[] = [];
    const controles = Array.from(
      { length: total },
      () => new AbortController(),
    );
    const resultados = controles.map((controle, i) =>
      desfecho(
        semaforo.executar(
          async () => {
            iniciadas.push(i);
          },
          { sinal: controle.signal },
        ),
      ),
    );

    // Saem os pares, depois os múltiplos de 3 que restaram.
    controles.forEach((controle, i) => {
      if (i % 2 === 0) controle.abort();
    });
    controles.forEach((controle, i) => {
      if (i % 3 === 0) controle.abort();
    });
    const ficam = Array.from({ length: total }, (_, i) => i).filter(
      (i) => i % 2 !== 0 && i % 3 !== 0,
    );
    await esvaziar();
    expect(semaforo.naFila).toBe(ficam.length);

    await ocupada.liberar();
    const desfechos = await Promise.all(resultados);

    expect(iniciadas).toEqual(ficam);
    expect(desfechos.filter((d) => !d.ok)).toHaveLength(total - ficam.length);
    expect(semaforo.emUso).toBe(0);
    expect(semaforo.naFila).toBe(0);
  });

  it('a fila volta a 0 quando todos saem, e a próxima tarefa pega a vaga livre', async () => {
    const semaforo = new Semaforo(2);
    const ocupada = ocupar(semaforo, 2);
    const controle = new AbortController();
    const saindo = Array.from({ length: 3 }, () =>
      desfecho(semaforo.executar(async () => 'x', { sinal: controle.signal })),
    );
    expect(semaforo.naFila).toBe(3);

    controle.abort();
    await Promise.all(saindo);
    expect(semaforo.naFila).toBe(0);

    await ocupada.liberar(0);
    await ocupada.liberar(1);
    expect(semaforo.emUso).toBe(0);
    await expect(semaforo.executar(async () => 'y')).resolves.toBe('y');
    expect(semaforo.emUso).toBe(0);
  });
});
