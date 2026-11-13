// Decisões D12, D14, D15 e D52: bibliotecas, fontes e fronteira entre
// rotas (dev), telas e componentes (designer) e regra de negócio.
const { readdirSync, readFileSync, statSync } = require('node:fs') as {
  readdirSync: (pasta: string) => string[];
  readFileSync: (arquivo: string, codificacao: 'utf8') => string;
  statSync: (caminho: string) => { isDirectory: () => boolean };
};

const raiz = (expect.getState().testPath ?? '').replace(
  /\/testes\/qa\/[^/]+$/,
  '',
);

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome: string) => {
    const caminho = `${pasta}/${nome}`;
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const naoTeste = (a: string) => !/\.test\.tsx?$/.test(a);
const relativo = (a: string) => a.slice(raiz.length + 1);

/** Linhas `import ... from '...'` (inclui `import type`) do arquivo. */
function importacoes(
  arquivo: string,
): Array<{ linha: string; origem: string }> {
  const codigo = readFileSync(arquivo, 'utf8');
  const achadas: Array<{ linha: string; origem: string }> = [];
  for (const m of codigo.matchAll(/import\s[^;]*?from\s+'([^']+)';/g)) {
    achadas.push({ linha: m[0], origem: m[1] as string });
  }
  return achadas;
}

describe('D15: fronteira entre rotas, telas e regra de negócio', () => {
  it('não há teste dentro de src/app (todo arquivo de lá vira rota)', () => {
    expect(
      arquivos(`${raiz}/app`)
        .filter((a) => !naoTeste(a))
        .map(relativo),
    ).toEqual([]);
  });

  it('componentes não importam api nem estado (nem como tipo)', () => {
    const achados = arquivos(`${raiz}/componentes`)
      .filter(naoTeste)
      .flatMap((a) =>
        importacoes(a)
          .filter((i) => /\.\.\/(api|estado)(\/|$)/.test(i.origem))
          .map((i) => `${relativo(a)}: ${i.origem}`),
      );

    expect(achados).toEqual([]);
  });

  it('telas só importam tipos de api e estado (nenhuma regra de negócio)', () => {
    const achados = arquivos(`${raiz}/telas`)
      .filter(naoTeste)
      .flatMap((a) =>
        importacoes(a)
          .filter(
            (i) =>
              /\.\.\/(api|estado)(\/|$)/.test(i.origem) &&
              !/^import type\s/.test(i.linha),
          )
          .map((i) => `${relativo(a)}: ${i.origem}`),
      );

    expect(achados).toEqual([]);
  });

  it('api e estado não dependem de telas, componentes nem rotas (só tipos)', () => {
    const achados = [...arquivos(`${raiz}/api`), ...arquivos(`${raiz}/estado`)]
      .filter(naoTeste)
      .flatMap((a) =>
        importacoes(a)
          .filter(
            (i) =>
              /\.\.\/(telas|componentes|app)(\/|$)/.test(i.origem) &&
              !/^import type\s/.test(i.linha),
          )
          .map((i) => `${relativo(a)}: ${i.origem}`),
      );

    expect(achados).toEqual([]);
  });

  it('só a regra de negócio (api e estado) usa o cliente HTTP e o fetch', () => {
    const achados = [
      ...arquivos(`${raiz}/telas`),
      ...arquivos(`${raiz}/componentes`),
      ...arquivos(`${raiz}/app`),
    ]
      .filter(naoTeste)
      .filter((a) =>
        /\bfetch\s*\(|XMLHttpRequest/.test(readFileSync(a, 'utf8')),
      )
      .map(relativo);

    expect(achados).toEqual([]);
  });
});

describe('D12, D14 e D52: bibliotecas e fonte', () => {
  const pacote = require('../../../package.json') as {
    dependencies: Record<string, string>;
  };

  it('o estado de servidor é o TanStack Query e não há outra biblioteca de estado ou de HTTP', () => {
    const nomes = Object.keys(pacote.dependencies);

    expect(nomes).toContain('@tanstack/react-query');
    expect(
      nomes.filter((n) =>
        /^(redux|@reduxjs|zustand|jotai|recoil|mobx|swr|axios|apollo|@apollo|urql|ky|got)/.test(
          n,
        ),
      ),
    ).toEqual([]);
  });

  it('as versões das dependências são fixas (sem ^ nem ~)', () => {
    const soltas = Object.entries(pacote.dependencies).filter(([, v]) =>
      /^[\^~>*]/.test(v),
    );

    expect(soltas).toEqual([]);
  });

  it('fontes (ADR-009): fontFamily, expo-font e @expo-google-fonts só em src/tema', () => {
    const achados = arquivos(raiz)
      .filter(naoTeste)
      .filter((a) => !/^tema\//.test(relativo(a)))
      .filter((a) =>
        /fontFamily|@expo-google-fonts/.test(readFileSync(a, 'utf8')),
      )
      .map(relativo);

    expect(achados).toEqual([]);
  });

  it('CA73: ícones só do Feather (D53), nenhum arquivo cita Ionicons', () => {
    const esteArquivo = relativo(expect.getState().testPath ?? '');
    const comIonicons = arquivos(raiz)
      .filter((a) => relativo(a) !== esteArquivo)
      .filter((a) => /Ionicons/.test(readFileSync(a, 'utf8')))
      .map(relativo);
    const outrosConjuntos = arquivos(raiz).flatMap((a) =>
      importacoes(a)
        .filter((i) => /^@expo\/vector-icons/.test(i.origem))
        .filter(
          (i) =>
            !/^import (type )?\{ Feather \} from '@expo\/vector-icons';$/.test(
              i.linha,
            ),
        )
        .map((i) => `${relativo(a)}: ${i.linha}`),
    );

    expect(comIonicons).toEqual([]);
    expect(outrosConjuntos).toEqual([]);
  });

  it('as fontes entram como dependências de versão fixa', () => {
    expect(pacote.dependencies['expo-font']).toBe('57.0.4');
    expect(pacote.dependencies['@expo-google-fonts/bricolage-grotesque']).toBe(
      '0.4.1',
    );
    expect(pacote.dependencies['@expo-google-fonts/figtree']).toBe('0.4.1');
  });
});
