import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Fronteiras do monólito modular hexagonal, checadas pelos imports:
 * (a) nada em `dominio/` ou `aplicacao/` importa `fastify`, `kysely` ou `pg`;
 * (b) um módulo só importa outro pela fachada `src/modulos/<outro>/index.ts`.
 *
 * Lê os arquivos com regex, sem dependência nova. Vale para os módulos que
 * ainda vão existir: com zero módulos, só o domínio compartilhado é checado.
 */

const RAIZ_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_MODULOS = join(RAIZ_SRC, 'modulos');
const PASTA_DOMINIO_COMPARTILHADO = join(RAIZ_SRC, 'compartilhado', 'dominio');

const PACOTES_PROIBIDOS_NO_NUCLEO = ['fastify', '@fastify', 'kysely', 'pg'];
const CAMADAS_DO_NUCLEO = ['dominio', 'aplicacao'];

interface Arquivo {
  /** Caminho absoluto. */
  readonly caminho: string;
  readonly conteudo: string;
}

// `import … from 'x'`, `export … from 'x'` (inclusive em várias linhas e `import type`).
const IMPORT_FROM =
  /(?:^|[^\w$.])(?:import|export)\s[^;'"`]*?\sfrom\s*['"]([^'"]+)['"]/g;
// `import 'x'` (só o efeito).
const IMPORT_SIMPLES = /(?:^|[^\w$.])import\s*['"]([^'"]+)['"]/g;
// `import('x')` e `require('x')`.
const IMPORT_DINAMICO =
  /(?:^|[^\w$.])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsDe(conteudo: string): string[] {
  const especificadores: string[] = [];
  for (const regex of [IMPORT_FROM, IMPORT_SIMPLES, IMPORT_DINAMICO]) {
    for (const achado of conteudo.matchAll(regex)) {
      if (achado[1]) {
        especificadores.push(achado[1]);
      }
    }
  }
  return especificadores;
}

function listarTs(pasta: string): string[] {
  if (!existsSync(pasta)) {
    return [];
  }
  return readdirSync(pasta, { withFileTypes: true, recursive: true })
    .filter((entrada) => entrada.isFile() && /\.(c|m)?tsx?$/.test(entrada.name))
    .map((entrada) => join(entrada.parentPath, entrada.name));
}

function lerArquivos(pastas: string[]): Arquivo[] {
  return pastas.flatMap(listarTs).map((caminho) => ({
    caminho,
    conteudo: readFileSync(caminho, 'utf8'),
  }));
}

function partesRelativas(raizSrc: string, caminho: string): string[] {
  return relative(raizSrc, caminho).split(sep);
}

function ehDoNucleo(raizSrc: string, caminho: string): boolean {
  const partes = partesRelativas(raizSrc, caminho);
  // compartilhado/dominio/** ou modulos/<m>/(dominio|aplicacao)/**
  if (partes[0] === 'compartilhado' && partes[1] === 'dominio') {
    return true;
  }
  return (
    partes[0] === 'modulos' &&
    partes.length > 3 &&
    CAMADAS_DO_NUCLEO.includes(partes[2] ?? '')
  );
}

function moduloDe(raizSrc: string, caminho: string): string | undefined {
  const partes = partesRelativas(raizSrc, caminho);
  return partes[0] === 'modulos' && partes.length > 2 ? partes[1] : undefined;
}

function ehPacoteProibido(especificador: string): boolean {
  return PACOTES_PROIBIDOS_NO_NUCLEO.some(
    (pacote) =>
      especificador === pacote || especificador.startsWith(`${pacote}/`),
  );
}

/** `../outro`, `../outro/index`, `../outro/index.js` e `.ts` apontam para a fachada. */
function ehFachada(partesDoAlvo: string[]): boolean {
  if (partesDoAlvo.length === 2) {
    return true;
  }
  return (
    partesDoAlvo.length === 3 &&
    /^index(\.(c|m)?(j|t)sx?)?$/.test(partesDoAlvo[2] ?? '')
  );
}

function violacoes(raizSrc: string, arquivos: Arquivo[]): string[] {
  const encontradas: string[] = [];
  for (const { caminho, conteudo } of arquivos) {
    const nome = relative(raizSrc, caminho);
    const nucleo = ehDoNucleo(raizSrc, caminho);
    const modulo = moduloDe(raizSrc, caminho);
    for (const especificador of importsDe(conteudo)) {
      if (nucleo && ehPacoteProibido(especificador)) {
        encontradas.push(`${nome}: núcleo importa '${especificador}'`);
      }
      if (modulo === undefined || !especificador.startsWith('.')) {
        continue;
      }
      const alvo = resolve(dirname(caminho), especificador);
      const partesDoAlvo = partesRelativas(raizSrc, alvo);
      const outroModulo =
        partesDoAlvo[0] === 'modulos' ? partesDoAlvo[1] : undefined;
      if (
        outroModulo !== undefined &&
        outroModulo !== modulo &&
        !ehFachada(partesDoAlvo)
      ) {
        encontradas.push(
          `${nome}: importa '${especificador}' de '${outroModulo}' sem passar por index.ts`,
        );
      }
    }
  }
  return encontradas;
}

describe('arquitetura hexagonal (fronteiras por import)', () => {
  it('o domínio compartilhado e os módulos respeitam as fronteiras', () => {
    const arquivos = lerArquivos([PASTA_DOMINIO_COMPARTILHADO, PASTA_MODULOS]);

    // Garante que a varredura enxerga arquivos (o domínio compartilhado já existe).
    expect(
      arquivos.filter((a) => ehDoNucleo(RAIZ_SRC, a.caminho)).length,
    ).toBeGreaterThan(0);
    expect(violacoes(RAIZ_SRC, arquivos)).toEqual([]);
  });
});

describe('verificador de fronteiras', () => {
  const raiz = '/projeto/src';
  const arquivo = (caminho: string, conteudo: string): Arquivo => ({
    caminho: `${raiz}/${caminho}`,
    conteudo,
  });

  it('lê import, import type, export from, import de efeito, dinâmico e em várias linhas', () => {
    expect(
      importsDe(`
        import { a } from 'pg';
        import type { FastifyInstance } from "fastify";
        export { b } from '../b/index.js';
        import 'kysely/helpers';
        const c = await import('pg');
        const d = require('./d');
        import {
          e,
          f,
        } from '@fastify/rate-limit';
        const reimport = 'x'; // nada aqui
      `),
    ).toEqual([
      'pg',
      'fastify',
      '../b/index.js',
      '@fastify/rate-limit',
      'kysely/helpers',
      'pg',
      './d',
    ]);
  });

  it('(a) acusa fastify, kysely e pg em dominio/ e aplicacao/ de módulo e no domínio compartilhado', () => {
    const achados = violacoes(raiz, [
      arquivo('modulos/contas/dominio/conta.ts', "import pg from 'pg';"),
      arquivo(
        'modulos/contas/aplicacao/casos-de-uso.ts',
        "import type { Kysely } from 'kysely';",
      ),
      arquivo(
        'modulos/contas/aplicacao/x.test.ts',
        "import type { FastifyRequest } from 'fastify';",
      ),
      arquivo(
        'compartilhado/dominio/texto.ts',
        "import { sql } from 'kysely/helpers/postgres';",
      ),
    ]);

    expect(achados).toHaveLength(4);
  });

  it('(a) aceita fastify, kysely e pg em adaptadores e fora do núcleo, e pacotes parecidos', () => {
    expect(
      violacoes(raiz, [
        arquivo(
          'modulos/contas/adaptadores/http/rotas.ts',
          "import type { FastifyInstance } from 'fastify';",
        ),
        arquivo(
          'modulos/contas/adaptadores/postgres/repo.ts',
          "import { Kysely } from 'kysely';",
        ),
        arquivo(
          'compartilhado/http/servidor.ts',
          "import Fastify from 'fastify';",
        ),
        arquivo('modulos/contas/dominio/conta.ts', "import x from 'pg-like';"),
        arquivo(
          'modulos/contas/index.ts',
          "import { y } from './dominio/conta.js';",
        ),
      ]),
    ).toEqual([]);
  });

  it('(b) acusa import de dentro de outro módulo', () => {
    const achados = violacoes(raiz, [
      arquivo(
        'modulos/conversas/aplicacao/casos-de-uso.ts',
        "import { Trampo } from '../../trampos/dominio/trampo.js';",
      ),
      arquivo(
        'modulos/busca/adaptadores/http/rotas.ts',
        "import { x } from '../../../trampos/adaptadores/memoria/repositorio-memoria.js';",
      ),
      arquivo(
        'modulos/busca/aplicacao/buscar.ts',
        "export * from '../../servicos/index/outro.js';",
      ),
    ]);

    expect(achados).toHaveLength(3);
    expect(achados[0]).toContain("de 'trampos' sem passar por index.ts");
  });

  it('(b) aceita a fachada do outro módulo e imports dentro do próprio módulo', () => {
    expect(
      violacoes(raiz, [
        arquivo(
          'modulos/busca/aplicacao/buscar.ts',
          [
            "import { buscarTrampos } from '../../trampos/index.js';",
            "import { buscarServicos } from '../../servicos';",
            "import type { X } from '../../servicos/index';",
          ].join('\n'),
        ),
        arquivo(
          'modulos/trampos/aplicacao/casos-de-uso.ts',
          "import { Trampo } from '../dominio/trampo.js';",
        ),
        arquivo(
          'modulos/trampos/index.ts',
          "export { buscarTrampos } from './aplicacao/casos-de-uso.js';",
        ),
        arquivo(
          'modulos/trampos/dominio/trampo.ts',
          "import { ErroDeRegra } from '../../../compartilhado/dominio/erros.js';",
        ),
      ]),
    ).toEqual([]);
  });
});
