import { describe, expect, it } from 'vitest';
import { HasherScrypt, PARAMETROS_SCRYPT_PADRAO } from './hasher.js';

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
