import { describe, expect, it } from 'vitest';
import { Semaforo } from './semaforo.js';

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
});
