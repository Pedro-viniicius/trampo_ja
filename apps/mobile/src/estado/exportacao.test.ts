import * as Sharing from 'expo-sharing';
import type { DadosExportados } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import {
  compartilharExportacao,
  limparExportacoesAntigas,
  nomeDoArquivoDeExportacao,
} from './exportacao';

// Disco falso: uri -> conteúdo. `mock*` pode ser lido dentro do `jest.mock`.
const mockDisco = new Map<string, string>();
const mockFalhas: {
  gravar?: Error;
  apagar?: Error;
  listar?: Error;
  /** Só este arquivo falha ao apagar. */
  apagarSo?: string;
} = {};
// Pastas no cache (nomes) e as que alguém tentou apagar.
const mockPastas: string[] = [];
const mockPastasApagadas: string[] = [];

jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(diretorio: { readonly uri: string }, nome: string) {
      this.uri = `${diretorio.uri}${nome}`;
    }
    get name(): string {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists(): boolean {
      return mockDisco.has(this.uri);
    }
    writeSync(conteudo: string): void {
      if (mockFalhas.gravar !== undefined) {
        // Gravação interrompida no meio: sobra um pedaço do arquivo.
        mockDisco.set(this.uri, conteudo.slice(0, 5));
        throw mockFalhas.gravar;
      }
      mockDisco.set(this.uri, conteudo);
    }
    /** No SDK 58 `write` é assíncrono: o código usa `writeSync` (CA7). */
    write(): never {
      throw new Error('write assíncrono: use writeSync');
    }
    delete(): void {
      if (mockFalhas.apagar !== undefined) {
        throw mockFalhas.apagar;
      }
      if (mockFalhas.apagarSo === this.uri) {
        throw new Error('sem permissão');
      }
      if (!mockDisco.delete(this.uri)) {
        throw new Error('arquivo inexistente');
      }
    }
  }
  class Directory {
    readonly name: string;
    constructor(nome: string) {
      this.name = nome;
    }
    get exists(): boolean {
      return true;
    }
    delete(): void {
      mockPastasApagadas.push(this.name);
    }
  }
  const cache = {
    uri: 'file:///cache/',
    list(): (File | Directory)[] {
      if (mockFalhas.listar !== undefined) {
        throw mockFalhas.listar;
      }
      return [
        ...mockPastas.map((nome) => new Directory(nome)),
        ...[...mockDisco.keys()].map(
          (uri) => new File(cache, uri.slice(cache.uri.length)),
        ),
      ];
    },
  };
  return { Directory, File, Paths: { cache } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const disponivel = jest.mocked(Sharing.isAvailableAsync);
const compartilhar = jest.mocked(Sharing.shareAsync);

const SENTINELA = 'conteudo-sentinela-7f3a@exemplo.com';
const DADOS: DadosExportados = {
  formato: 'trampo-ja.exportacao.v1',
  conta: { id: 'c1', email: SENTINELA },
  perfil: { nome: 'Maria Silva' },
};
const AGORA = new Date(2026, 9, 22, 14, 30);
const URI = 'file:///cache/trampo-ja-meus-dados-2026-10-22.json';

/** Conteúdo do arquivo no instante em que a folha abriu. */
let vistoPelaFolha: (string | undefined)[] = [];

beforeEach(() => {
  mockDisco.clear();
  delete mockFalhas.gravar;
  delete mockFalhas.apagar;
  delete mockFalhas.listar;
  delete mockFalhas.apagarSo;
  mockPastas.length = 0;
  mockPastasApagadas.length = 0;
  vistoPelaFolha = [];
  disponivel.mockReset().mockResolvedValue(true);
  compartilhar.mockReset().mockImplementation(async (uri: string) => {
    vistoPelaFolha.push(mockDisco.get(uri));
  });
});

describe('nomeDoArquivoDeExportacao', () => {
  it.each([
    [new Date(2026, 9, 22, 14, 30), 'trampo-ja-meus-dados-2026-10-22.json'],
    [new Date(2026, 0, 5, 0, 0), 'trampo-ja-meus-dados-2026-01-05.json'],
    // Data local, não UTC: perto da meia-noite o dia é o do aparelho.
    [new Date(2026, 11, 31, 23, 59), 'trampo-ja-meus-dados-2026-12-31.json'],
  ])('%s -> %s', (agora, nome) => {
    expect(nomeDoArquivoDeExportacao(agora)).toBe(nome);
  });
});

describe('compartilharExportacao (CA19)', () => {
  it('grava o JSON no cache, abre a folha com o tipo e o título e apaga o arquivo', async () => {
    await expect(compartilharExportacao(DADOS, AGORA)).resolves.toBe(
      'compartilhado',
    );

    expect(compartilhar).toHaveBeenCalledTimes(1);
    expect(compartilhar).toHaveBeenCalledWith(URI, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: textos.exportarDados.tituloDaFolha,
    });
    // A folha viu o arquivo completo; depois dela, o arquivo sumiu.
    expect(vistoPelaFolha).toEqual([JSON.stringify(DADOS)]);
    expect(JSON.parse(vistoPelaFolha[0] ?? '')).toEqual(DADOS);
    expect(mockDisco.size).toBe(0);
  });

  it('grava com writeSync: o arquivo está completo antes de a folha abrir (CA7)', async () => {
    const { File } =
      jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const writeSync = jest.spyOn(File.prototype, 'writeSync');
    const write = jest.spyOn(File.prototype, 'write');
    try {
      await compartilharExportacao(DADOS, AGORA);

      expect(writeSync).toHaveBeenCalledTimes(1);
      expect(write).not.toHaveBeenCalled();
      expect(writeSync.mock.invocationCallOrder[0]).toBeLessThan(
        compartilhar.mock.invocationCallOrder[0] ?? 0,
      );
      expect(vistoPelaFolha).toEqual([JSON.stringify(DADOS)]);
      expect(mockDisco.size).toBe(0);
    } finally {
      writeSync.mockRestore();
      write.mockRestore();
    }
  });

  it('sem folha no aparelho devolve indisponivel e não grava nada', async () => {
    disponivel.mockResolvedValue(false);

    await expect(compartilharExportacao(DADOS, AGORA)).resolves.toBe(
      'indisponivel',
    );

    expect(compartilhar).not.toHaveBeenCalled();
    expect(mockDisco.size).toBe(0);
  });

  it('quando a folha falha, rejeita e o arquivo gravado é apagado', async () => {
    const falha = new Error('falha da folha');
    compartilhar.mockImplementation(async (uri: string) => {
      vistoPelaFolha.push(mockDisco.get(uri));
      throw falha;
    });

    await expect(compartilharExportacao(DADOS, AGORA)).rejects.toBe(falha);

    expect(vistoPelaFolha).toEqual([JSON.stringify(DADOS)]);
    expect(mockDisco.size).toBe(0);
  });

  it('quando a gravação falha no meio, rejeita, não abre a folha e apaga o pedaço', async () => {
    const falha = new Error('disco cheio');
    mockFalhas.gravar = falha;

    await expect(compartilharExportacao(DADOS, AGORA)).rejects.toBe(falha);

    expect(compartilhar).not.toHaveBeenCalled();
    expect(mockDisco.size).toBe(0);
  });

  it('quando a consulta à folha falha, rejeita sem gravar', async () => {
    disponivel.mockRejectedValue(new Error('módulo ausente'));

    await expect(compartilharExportacao(DADOS, AGORA)).rejects.toThrow(
      'módulo ausente',
    );

    expect(compartilhar).not.toHaveBeenCalled();
    expect(mockDisco.size).toBe(0);
  });

  it('falha ao apagar não transforma o compartilhamento em erro', async () => {
    mockFalhas.apagar = new Error('sem permissão');

    await expect(compartilharExportacao(DADOS, AGORA)).resolves.toBe(
      'compartilhado',
    );
  });

  it('sobrescreve um resto do mesmo dia e apaga no fim', async () => {
    mockDisco.set(URI, 'resto de uma exportação anterior');

    await compartilharExportacao(DADOS, AGORA);

    expect(vistoPelaFolha).toEqual([JSON.stringify(DADOS)]);
    expect(mockDisco.has(URI)).toBe(false);
  });

  it('usa a data de agora quando não recebe uma', async () => {
    jest.useFakeTimers({ now: new Date(2027, 1, 3, 9, 0) });
    try {
      await compartilharExportacao(DADOS);
    } finally {
      jest.useRealTimers();
    }

    expect(compartilhar.mock.calls[0]?.[0]).toBe(
      'file:///cache/trampo-ja-meus-dados-2027-02-03.json',
    );
  });

  it('nada vai para o console, nem nas falhas (CA24)', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (metodo) => jest.spyOn(console, metodo).mockImplementation(() => {}),
    );
    let chamadas: unknown[] = [];
    try {
      await compartilharExportacao(DADOS, AGORA);
      compartilhar.mockRejectedValueOnce(new Error('falha da folha'));
      await compartilharExportacao(DADOS, AGORA).catch(() => undefined);
      mockFalhas.apagar = new Error('sem permissão');
      await compartilharExportacao(DADOS, AGORA);
      chamadas = espioes.flatMap((espiao) => espiao.mock.calls);
    } finally {
      for (const espiao of espioes) {
        espiao.mockRestore();
      }
    }
    expect(chamadas).toEqual([]);
  });
});

describe('limparExportacoesAntigas (S4)', () => {
  const CACHE = 'file:///cache/';

  it('apaga do cache só os arquivos com o prefixo da exportação', async () => {
    mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-20.json`, '{}');
    mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-22.json`, '{}');
    mockDisco.set(`${CACHE}outro-arquivo.json`, 'fica');
    mockDisco.set(`${CACHE}copia-trampo-ja-meus-dados-2026.json`, 'fica');
    mockPastas.push('trampo-ja-meus-dados-pasta');

    limparExportacoesAntigas();

    expect([...mockDisco.keys()].sort()).toEqual([
      `${CACHE}copia-trampo-ja-meus-dados-2026.json`,
      `${CACHE}outro-arquivo.json`,
    ]);
    // Pasta com o mesmo prefixo não é arquivo de exportação: fica.
    expect(mockPastasApagadas).toEqual([]);
  });

  it('cache sem exportação: não apaga nada', () => {
    mockDisco.set(`${CACHE}outro-arquivo.json`, 'fica');

    limparExportacoesAntigas();

    expect([...mockDisco.keys()]).toEqual([`${CACHE}outro-arquivo.json`]);
  });

  it('não lança quando listar o cache falha', () => {
    mockFalhas.listar = new Error('cache inacessível');
    mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-22.json`, '{}');

    expect(() => limparExportacoesAntigas()).not.toThrow();
  });

  it('não lança quando apagar falha', () => {
    mockFalhas.apagar = new Error('sem permissão');
    mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-22.json`, '{}');

    expect(() => limparExportacoesAntigas()).not.toThrow();
  });

  it('a falha ao apagar um arquivo não impede apagar os outros', () => {
    const preso = `${CACHE}trampo-ja-meus-dados-2026-10-20.json`;
    mockDisco.set(preso, '{}');
    mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-22.json`, '{}');
    mockFalhas.apagarSo = preso;

    limparExportacoesAntigas();

    expect([...mockDisco.keys()]).toEqual([preso]);
  });

  it('nada vai para o console, nem nas falhas (CA24)', () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (metodo) => jest.spyOn(console, metodo).mockImplementation(() => {}),
    );
    let chamadas: unknown[] = [];
    try {
      mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-22.json`, '{}');
      limparExportacoesAntigas();
      mockDisco.set(`${CACHE}trampo-ja-meus-dados-2026-10-22.json`, '{}');
      mockFalhas.apagar = new Error('sem permissão');
      limparExportacoesAntigas();
      mockFalhas.listar = new Error('cache inacessível');
      limparExportacoesAntigas();
      chamadas = espioes.flatMap((espiao) => espiao.mock.calls);
    } finally {
      for (const espiao of espioes) {
        espiao.mockRestore();
      }
    }
    expect(chamadas).toEqual([]);
  });
});
