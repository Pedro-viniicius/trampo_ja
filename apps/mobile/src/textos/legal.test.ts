import {
  type DocumentoLegal,
  politicaDePrivacidade,
  termosDeUso,
} from './legal';

// O app não tem @types/node (nem deve ter: é código de dispositivo). Só este
// teste, que roda em Node no jest, lê os .md do disco; tipa o mínimo que usa.
declare const __dirname: string;
const { readFileSync } = require('node:fs') as {
  readFileSync(caminho: string, codificacao: 'utf8'): string;
};
const { join } = require('node:path') as {
  join(...partes: string[]): string;
};

const PASTA_LEGAL = join(__dirname, '../../../../docs/produto/legal');

const AVISO_DE_RASCUNHO = 'RASCUNHO — sujeito a revisão jurídica, não publicar';

const MARCADORES = [
  '[NOME DO CONTROLADOR]',
  '[CPF/CNPJ]',
  '[E-MAIL DE CONTATO]',
  '[ENDEREÇO DE HOSPEDAGEM]',
];

type SecaoDoMarkdown = { titulo: string; paragrafos: string[] };

type Markdown = {
  titulo: string;
  /** Texto do primeiro bloco de citação (o aviso de rascunho). */
  aviso: string;
  versao: string | null;
  secoes: SecaoDoMarkdown[];
};

/**
 * Lê o `.md` no formato combinado: `# título`, bloco `>` de aviso,
 * `**Versão:** AAAA-MM-DD` e seções `## título` com um parágrafo por linha,
 * separados por linha em branco.
 */
function lerMarkdown(arquivo: string): Markdown {
  const linhas = readFileSync(join(PASTA_LEGAL, arquivo), 'utf8').split('\n');
  const doc: Markdown = { titulo: '', aviso: '', versao: null, secoes: [] };
  let secao: SecaoDoMarkdown | null = null;
  for (const linha of linhas) {
    if (linha.startsWith('# ')) {
      doc.titulo = linha.slice(2);
    } else if (linha.startsWith('## ')) {
      secao = { titulo: linha.slice(3), paragrafos: [] };
      doc.secoes.push(secao);
    } else if (linha.startsWith('> ')) {
      doc.aviso = doc.aviso === '' ? linha.slice(2) : doc.aviso;
    } else if (linha.startsWith('**Versão:** ')) {
      doc.versao = linha.slice('**Versão:** '.length);
    } else if (linha.trim() !== '' && secao !== null) {
      secao.paragrafos.push(linha);
    }
  }
  return doc;
}

const DOCUMENTOS: readonly {
  nome: string;
  arquivo: string;
  tituloNoMarkdown: string;
  doc: DocumentoLegal;
}[] = [
  {
    nome: 'política de privacidade',
    arquivo: 'politica-de-privacidade.md',
    tituloNoMarkdown: 'Política de Privacidade — Trampo Já',
    doc: politicaDePrivacidade,
  },
  {
    nome: 'termos de uso',
    arquivo: 'termos-de-uso.md',
    tituloNoMarkdown: 'Termos de Uso — Trampo Já',
    doc: termosDeUso,
  },
];

describe.each(DOCUMENTOS)(
  'CA21 — $nome',
  ({ arquivo, tituloNoMarkdown, doc }) => {
    const md = lerMarkdown(arquivo);

    it('o .md começa com o aviso de RASCUNHO, a versão e a data', () => {
      expect(md.titulo).toBe(tituloNoMarkdown);
      expect(md.aviso.startsWith(`**${AVISO_DE_RASCUNHO}.**`)).toBe(true);
      expect(md.aviso).toContain('Não é aconselhamento jurídico');
      expect(md.aviso).toContain(`Versão ${doc.versao}, redigida em `);
      expect(md.versao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('o aviso vem antes da versão e das seções', () => {
      const texto = readFileSync(join(PASTA_LEGAL, arquivo), 'utf8');
      const iAviso = texto.indexOf(AVISO_DE_RASCUNHO);
      expect(iAviso).toBeGreaterThan(-1);
      expect(iAviso).toBeLessThan(texto.indexOf('**Versão:**'));
      expect(iAviso).toBeLessThan(texto.indexOf('\n## '));
    });

    it('legal.ts está marcado como rascunho, como o .md', () => {
      expect(doc.rascunho).toBe(true);
    });

    it('a versão de legal.ts é a do .md e é uma data válida', () => {
      expect(doc.versao).toBe(md.versao);
      const [ano, mes, dia] = doc.versao.split('-').map(Number);
      const data = new Date(Date.UTC(ano ?? 0, (mes ?? 0) - 1, dia ?? 0));
      expect(data.toISOString().slice(0, 10)).toBe(doc.versao);
    });

    it('os títulos de seção de legal.ts são os do .md, na mesma ordem', () => {
      expect(md.secoes.length).toBeGreaterThan(0);
      expect(doc.secoes.map((s) => s.titulo)).toEqual(
        md.secoes.map((s) => s.titulo),
      );
    });

    it('os parágrafos de cada seção de legal.ts são os do .md', () => {
      expect(doc.secoes.map((s) => s.paragrafos)).toEqual(
        md.secoes.map((s) => s.paragrafos),
      );
    });

    it('toda seção tem título e ao menos um parágrafo, sem texto vazio', () => {
      for (const secao of doc.secoes) {
        expect(secao.titulo.trim()).not.toBe('');
        expect(secao.paragrafos.length).toBeGreaterThan(0);
        for (const p of secao.paragrafos) expect(p.trim()).not.toBe('');
      }
    });

    it('traz os marcadores da identidade do controlador (D28)', () => {
      const texto = doc.secoes.flatMap((s) => s.paragrafos).join('\n');
      expect(texto).toContain('[NOME DO CONTROLADOR]');
      expect(texto).toContain('[CPF/CNPJ]');
      expect(texto).toContain('[E-MAIL DE CONTATO]');
    });

    it('o aviso de RASCUNHO lista todo marcador entre colchetes do texto', () => {
      const texto = doc.secoes.flatMap((s) => s.paragrafos).join('\n');
      const marcadores = new Set(
        texto.match(/\[[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 /-]*\]/g),
      );
      expect(marcadores.size).toBeGreaterThan(0);
      for (const marcador of marcadores) expect(md.aviso).toContain(marcador);
    });

    it('a versão nova vale a partir da atualização do app, sem prometer aviso prévio (S5)', () => {
      const texto = doc.secoes.flatMap((s) => s.paragrafos).join('\n');
      expect(texto).toContain(
        'Uma versão nova passa a valer a partir da atualização do aplicativo que a traz.',
      );
      expect(texto).toContain('aparece no topo deste documento');
      expect(texto).not.toContain('avisaremos no aplicativo');
    });

    it('cita a idade mínima de 18 anos', () => {
      const texto = doc.secoes.flatMap((s) => s.paragrafos).join('\n');
      expect(texto).toContain('18 anos');
    });
  },
);

describe('CA21 — conteúdo previsto (D25 a D28)', () => {
  const textoDe = (doc: DocumentoLegal): string =>
    doc.secoes.flatMap((s) => [s.titulo, ...s.paragrafos]).join('\n');

  it('a política traz hospedagem, mensagens guardadas, exclusão e exportação', () => {
    const texto = textoDe(politicaDePrivacidade);
    for (const marcador of MARCADORES) expect(texto).toContain(marcador);
    expect(texto).toContain('não podem ser apagadas uma a uma');
    expect(texto).toContain('imediata e definitiva');
    expect(texto).toContain('JSON');
    expect(texto).toContain('conversa inteira');
    expect(texto).toContain('telemetria');
  });

  it('a política não promete eliminar os registros de acesso num prazo que a hospedagem ainda não define (S5)', () => {
    const texto = textoDe(politicaDePrivacidade);
    expect(texto).toContain(
      '[PRAZO E FORMA DE GUARDA DOS REGISTROS DE ACESSO]',
    );
    expect(texto).toContain('[PRAZO DE CÓPIAS DE SEGURANÇA]');
    expect(texto).not.toContain('depois desse prazo são eliminados');
  });

  it('os termos trazem o foro, a ausência de intermediação e o encerramento', () => {
    const texto = textoDe(termosDeUso);
    expect(texto).toContain('[FORO]');
    expect(texto).toContain('não intermedeia pagamento');
    expect(texto).toContain('Condutas proibidas');
    expect(texto).toContain('Encerramento da conta');
  });

  it('cada documento tem a sua versão: a política (L3) não é anterior aos termos', () => {
    expect(politicaDePrivacidade.versao).toBe('2026-10-23');
    expect(politicaDePrivacidade.versao >= termosDeUso.versao).toBe(true);
  });
});

describe('CA48 — exportação grande e limpeza de sessões (D40 e D41)', () => {
  const secao = (titulo: string) =>
    politicaDePrivacidade.secoes.find((s) => s.titulo === titulo);
  const paragrafoDe = (titulo: string, comeco: string): string => {
    const achado = secao(titulo)?.paragrafos.find((p) => p.startsWith(comeco));
    if (achado === undefined) throw new Error(`sem "${comeco}" em ${titulo}`);
    return achado;
  };

  it('em "Exportar", acima de 10 MB a pessoa pede a cópia pelo e-mail de contato', () => {
    const exportar = paragrafoDe('Seus direitos', 'Exportar:');
    expect(exportar).toContain('mais de 10 MB');
    expect(exportar).toContain('escrevendo para [E-MAIL DE CONTATO]');
  });

  it('a resposta sai em até 15 dias, com a base legal (LGPD, art. 19, II)', () => {
    const exportar = paragrafoDe('Seus direitos', 'Exportar:');
    expect(exportar).toContain('em até 15 dias');
    expect(exportar).toContain('art. 19, II');
  });

  it('o caminho por e-mail não substitui a exportação pelo app até o limite', () => {
    const exportar = paragrafoDe('Seus direitos', 'Exportar:');
    expect(exportar).toContain('você pode gerar um arquivo com os seus dados');
    expect(exportar.indexOf('mais de 10 MB')).toBeGreaterThan(
      exportar.indexOf('apaga o arquivo temporário'),
    );
  });

  // R1/S4: a limpeza conta o intervalo do fim da rodada anterior, apaga um
  // número limitado de sessões por rodada e não roda com a API parada; por
  // isso o prazo é aproximado, não uma garantia de "até 1 hora".
  it('as sessões expiradas são apagadas em cerca de 1 hora, sem prometer prazo máximo', () => {
    const sessoes = paragrafoDe(
      'Por quanto tempo guardamos os dados',
      'As sessões que já expiraram',
    );
    expect(sessoes).toContain('em cerca de 1 hora depois do vencimento');
    expect(sessoes).toContain('apagadas do servidor');
    expect(sessoes).not.toContain('em até 1 hora');
  });

  it('a política segue como rascunho, com os marcadores do controlador', () => {
    expect(politicaDePrivacidade.rascunho).toBe(true);
    const texto = politicaDePrivacidade.secoes
      .flatMap((s) => s.paragrafos)
      .join('\n');
    for (const marcador of MARCADORES) expect(texto).toContain(marcador);
  });
});
