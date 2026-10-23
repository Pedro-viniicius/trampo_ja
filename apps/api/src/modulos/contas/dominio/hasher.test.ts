import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DERIVACOES_SIMULTANEAS,
  HasherScrypt,
  PARAMETROS_SCRYPT_PADRAO,
} from './hasher.js';

type RetornoDoScrypt = (erro: Error | null, chave?: Buffer) => void;
interface Derivacao {
  readonly salt: Buffer;
  readonly tamanho: number;
  readonly concluir: RetornoDoScrypt;
}

// Espião na derivação: por padrão repassa ao scrypt real; com `interceptar`
// ligado, segura a chamada até o teste concluir.
const espiao = vi.hoisted(() => ({
  interceptar: null as ((derivacao: Derivacao) => void) | null,
}));

vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>();
  const scryptReal = real.scrypt as (...args: unknown[]) => void;
  return {
    ...real,
    scrypt: (...args: unknown[]) => {
      if (espiao.interceptar === null) {
        scryptReal(...args);
        return;
      }
      espiao.interceptar({
        salt: Buffer.from(args[1] as Buffer),
        tamanho: args[2] as number,
        concluir: args[4] as RetornoDoScrypt,
      });
    },
  };
});

// Custo baixo para os testes de formato; o custo real tem o seu bloco abaixo.
const rapido = new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 });
const FORMATO =
  /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;
// Cada hash com N=2^17 leva centenas de ms e usa cerca de 128 MiB.
const TEMPO_DO_CUSTO_REAL = 30_000;

describe('HasherScrypt com os parâmetros do plano (N=2^17, r=8, p=1)', () => {
  const real = new HasherScrypt();

  it('o padrão é N=2^17, r=8, p=1', () => {
    expect(PARAMETROS_SCRYPT_PADRAO).toEqual({ N: 131072, r: 8, p: 1 });
  });

  it(
    'ida e volta: o hash gerado confere com a mesma senha',
    async () => {
      const hash = await real.gerarHash('segredo-123');

      expect(hash.startsWith('scrypt$131072$8$1$')).toBe(true);
      expect(await real.verificar('segredo-123', hash)).toBe(true);
    },
    TEMPO_DO_CUSTO_REAL,
  );

  it(
    'senha errada não confere',
    async () => {
      const hash = await real.gerarHash('segredo-123');
      expect(await real.verificar('segredo-124', hash)).toBe(false);
    },
    TEMPO_DO_CUSTO_REAL,
  );

  it('hash malformado devolve false sem lançar', async () => {
    await expect(
      real.verificar('segredo-123', 'scrypt$131072$8$1$naobase64!$x'),
    ).resolves.toBe(false);
  });
});

describe('HasherScrypt (formato e parsing)', () => {
  it('gera scrypt$N$r$p$salt$hash com salt de 16 bytes e hash de 64', async () => {
    const hash = await rapido.gerarHash('segredo-123');
    const partes = FORMATO.exec(hash);

    expect(partes?.slice(1, 4)).toEqual(['16', '8', '1']);
    expect(Buffer.from(partes?.[4] ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(partes?.[5] ?? '', 'base64')).toHaveLength(64);
    expect(hash).not.toContain('segredo');
  });

  it('salt aleatório: a mesma senha gera hashes diferentes, e os dois conferem', async () => {
    const a = await rapido.gerarHash('segredo-123');
    const b = await rapido.gerarHash('segredo-123');

    expect(a).not.toBe(b);
    expect(await rapido.verificar('segredo-123', a)).toBe(true);
    expect(await rapido.verificar('segredo-123', b)).toBe(true);
  });

  it('lê N, r e p do próprio hash, não da instância', async () => {
    const hash = await new HasherScrypt({ N: 2 ** 5, r: 4, p: 2 }).gerarHash(
      'segredo-123',
    );
    expect(await rapido.verificar('segredo-123', hash)).toBe(true);
    expect(await rapido.verificar('segredo-12', hash)).toBe(false);
  });

  it('confere senhas com acento e emoji', async () => {
    const hash = await rapido.gerarHash('pão-de-açúcar 🌶️');
    expect(await rapido.verificar('pão-de-açúcar 🌶️', hash)).toBe(true);
    expect(await rapido.verificar('pao-de-acucar 🌶️', hash)).toBe(false);
  });

  it('hash adulterado não confere', async () => {
    const hash = await rapido.gerarHash('segredo-123');
    const partes = hash.split('$');
    const bytes = Buffer.from(partes[5] ?? '', 'base64');
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    partes[5] = bytes.toString('base64');

    expect(await rapido.verificar('segredo-123', partes.join('$'))).toBe(false);
  });

  it('hash malformado devolve false sem lançar', async () => {
    const valido = await rapido.gerarHash('segredo-123');
    const [, , , , salt, hash] = valido.split('$');
    const malformados: unknown[] = [
      '',
      'x',
      `bcrypt$16$8$1$${salt}$${hash}`,
      `scrypt$16$8$1$${salt}`,
      `scrypt$16$8$1$${salt}$${hash}$extra`,
      `scrypt$15$8$1$${salt}$${hash}`, // N não é potência de 2
      `scrypt$1$8$1$${salt}$${hash}`,
      `scrypt$0$8$1$${salt}$${hash}`,
      `scrypt$016$8$1$${salt}$${hash}`,
      `scrypt$-16$8$1$${salt}$${hash}`,
      `scrypt$16.0$8$1$${salt}$${hash}`,
      `scrypt$${2 ** 21}$8$1$${salt}$${hash}`, // memória demais
      `scrypt$${2 ** 20}$8$1$${salt}$${hash}`, // 1 GiB
      `scrypt$16$0$1$${salt}$${hash}`,
      `scrypt$16$8$0$${salt}$${hash}`,
      `scrypt$16$8$99$${salt}$${hash}`,
      `scrypt$16$8$1$$${hash}`,
      `scrypt$16$8$1$${salt}$`,
      `scrypt$16$8$1$c2FsdA==$${hash}`, // salt curto
      `scrypt$16$8$1$${salt}$aGFzaA==`, // hash curto
      `scrypt$16$8$1$${salt}$${hash}==`, // preenchimento a mais
      `scrypt$16$8$1$${salt}!$${hash}`,
      `scrypt$16$8$1$${salt}$${hash} `,
      `scrypt$16$8$1$${'A'.repeat(2000)}$${hash}`,
      undefined,
      null,
      42,
    ];
    for (const malformado of malformados) {
      await expect(
        rapido.verificar('segredo-123', malformado as string),
        String(malformado),
      ).resolves.toBe(false);
    }
  });

  it('senha que não é texto não confere', async () => {
    const hash = await rapido.gerarHash('segredo-123');
    expect(await rapido.verificar(undefined as unknown as string, hash)).toBe(
      false,
    );
  });

  it.each([
    { N: 15, r: 8, p: 1 },
    { N: 1, r: 8, p: 1 },
    { N: 2 ** 21, r: 8, p: 1 },
    { N: 2 ** 4, r: 0, p: 1 },
    { N: 2 ** 4, r: 8, p: 0 },
    { N: 2 ** 4, r: 8.5, p: 1 },
    { N: Number.NaN, r: 8, p: 1 },
  ])('recusa parâmetros fora dos limites: %j', (parametros) => {
    expect(() => new HasherScrypt(parametros)).toThrow(TypeError);
  });
});

describe('HasherScrypt (limite de derivações simultâneas, CA23)', () => {
  /** Deixa rodar as continuações pendentes (microtarefas e um tique). */
  const esvaziar = () =>
    new Promise<void>((resolver) => setImmediate(resolver));

  /** Liga o espião e devolve as derivações que chegaram ao scrypt. */
  function segurarDerivacoes() {
    const chegaram: Derivacao[] = [];
    let concluidas = 0;
    espiao.interceptar = (derivacao) => {
      chegaram.push({
        ...derivacao,
        concluir: (erro, chave) => {
          concluidas += 1;
          derivacao.concluir(erro, chave);
        },
      });
    };
    return {
      chegaram,
      rodando: () => chegaram.length - concluidas,
    };
  }

  afterEach(() => {
    espiao.interceptar = null;
  });

  it('o limite por processo é 2', () => {
    expect(DERIVACOES_SIMULTANEAS).toBe(2);
  });

  it('com 5 hashes simultâneos, no máximo 2 derivações rodam ao mesmo tempo', async () => {
    const derivacoes = segurarDerivacoes();
    // Duas instâncias: o limite é do processo, não da instância.
    const outro = new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 });
    const hashes = [
      rapido.gerarHash('senha-0'),
      outro.gerarHash('senha-1'),
      rapido.gerarHash('senha-2'),
      outro.gerarHash('senha-3'),
      rapido.gerarHash('senha-4'),
    ];
    await esvaziar();

    expect(derivacoes.chegaram).toHaveLength(2);
    let pico = derivacoes.rodando();
    for (let i = 0; i < 5; i += 1) {
      derivacoes.chegaram[i]?.concluir(null, Buffer.alloc(64, i));
      await esvaziar();
      pico = Math.max(pico, derivacoes.rodando());
      expect(derivacoes.chegaram).toHaveLength(Math.min(5, i + 3));
    }

    expect(pico).toBe(2);
    const prontos = await Promise.all(hashes);
    expect(prontos.every((hash) => hash.startsWith('scrypt$16$8$1$'))).toBe(
      true,
    );
  });

  it('verificar também respeita o limite e atende na ordem de chegada', async () => {
    const armazenados = await Promise.all(
      Array.from({ length: 5 }, (_, i) => rapido.gerarHash(`senha-${i}`)),
    );
    const saltDe = (hash: string) => hash.split('$')[4];
    const derivacoes = segurarDerivacoes();

    const verificacoes = armazenados.map((hash, i) =>
      rapido.verificar(`senha-${i}`, hash),
    );
    await esvaziar();
    expect(derivacoes.chegaram).toHaveLength(2);

    // Conclui fora de ordem: a vaga vai sempre para o primeiro da fila.
    for (const i of [1, 0, 3, 2, 4]) {
      derivacoes.chegaram[i]?.concluir(null, Buffer.alloc(64));
      await esvaziar();
      expect(derivacoes.rodando()).toBeLessThanOrEqual(2);
    }

    expect(derivacoes.chegaram.map((d) => d.salt.toString('base64'))).toEqual(
      armazenados.map(saltDe),
    );
    // Chave falsa: nenhuma confere, mas todas terminam.
    expect(await Promise.all(verificacoes)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('depois de um erro na derivação, a vaga é liberada e a fila anda', async () => {
    const derivacoes = segurarDerivacoes();
    const hashes = Array.from({ length: 4 }, (_, i) =>
      rapido.gerarHash(`senha-${i}`),
    );
    // Trata as rejeições desde já, para não virarem "unhandled rejection".
    const resultados = Promise.allSettled(hashes);
    await esvaziar();
    expect(derivacoes.chegaram).toHaveLength(2);

    derivacoes.chegaram[0]?.concluir(new Error('falha no scrypt'));
    derivacoes.chegaram[1]?.concluir(new Error('falha no scrypt'));
    await esvaziar();
    expect(derivacoes.chegaram).toHaveLength(4);

    derivacoes.chegaram[2]?.concluir(null, Buffer.alloc(64));
    derivacoes.chegaram[3]?.concluir(null, Buffer.alloc(64));
    const estados = (await resultados).map((r) => r.status);
    expect(estados).toEqual(['rejected', 'rejected', 'fulfilled', 'fulfilled']);
    await expect(hashes[0]).rejects.toThrow('falha no scrypt');

    // Sem o espião, o scrypt real ainda acha vaga: nenhuma ficou presa.
    espiao.interceptar = null;
    const hash = await rapido.gerarHash('segredo-123');
    expect(await rapido.verificar('segredo-123', hash)).toBe(true);
  });

  it('erro síncrono do scrypt também libera a vaga', async () => {
    espiao.interceptar = () => {
      throw new Error('parâmetro recusado');
    };
    const falhas = await Promise.allSettled(
      Array.from({ length: 3 }, () => rapido.gerarHash('segredo-123')),
    );
    for (const falha of falhas) {
      expect(falha.status).toBe('rejected');
      expect((falha as PromiseRejectedResult).reason).toEqual(
        new Error('parâmetro recusado'),
      );
    }

    espiao.interceptar = null;
    const hash = await rapido.gerarHash('segredo-123');
    expect(await rapido.verificar('segredo-123', hash)).toBe(true);
  });
});
