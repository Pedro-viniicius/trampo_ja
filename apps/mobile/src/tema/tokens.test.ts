import { FONTES } from './fontes';
import { cores, tipografia } from './tokens';

function canal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((maior ?? 0) + 0.05) / ((menor ?? 0) + 0.05);
}

const { azul, roxo, tinta, feedback, branco } = cores;
type Par = [string, string, string];

describe('contraste dos tokens V2 (WCAG AA)', () => {
  const texto: Par[] = [
    ['branco/azul.600 (botão)', branco, azul[600]],
    ['branco/azul.700 (pressionado)', branco, azul[700]],
    ['branco/roxo.700 (urgente)', branco, roxo[700]],
    ['branco/roxo.600 (fim do gradiente de ação)', branco, roxo[600]],
    ['azul.600/branco (link)', azul[600], tinta[0]],
    ['azul.600/tinta.50', azul[600], tinta[50]],
    ['azul.600/azul.50 (chip ativo)', azul[600], azul[50]],
    ['azul.700/azul.50 (selo info)', azul[700], azul[50]],
    ['roxo.700/branco', roxo[700], tinta[0]],
    ['roxo.700/roxo.50', roxo[700], roxo[50]],
    ['tinta.900/branco', tinta[900], tinta[0]],
    ['tinta.900/tinta.50', tinta[900], tinta[50]],
    ['tinta.600/branco', tinta[600], tinta[0]],
    ['tinta.600/tinta.50', tinta[600], tinta[50]],
    ['tinta.500/branco', tinta[500], tinta[0]],
    ['tinta.500/tinta.50', tinta[500], tinta[50]],
    [
      'sucesso.texto/sucesso.fundo',
      feedback.sucesso.texto,
      feedback.sucesso.fundo,
    ],
    ['sucesso.texto/branco', feedback.sucesso.texto, branco],
    ['erro.texto/erro.fundo', feedback.erro.texto, feedback.erro.fundo],
    ['erro.texto/branco', feedback.erro.texto, branco],
    ['alerta.texto/alerta.fundo', feedback.alerta.texto, feedback.alerta.fundo],
    [
      'informacao.texto/informacao.fundo',
      feedback.informacao.texto,
      feedback.informacao.fundo,
    ],
    ['branco/tinta.900 (botão secundário, cartão de modo)', branco, tinta[900]],
    [
      'tinta.200/tinta.900 (descrição do cartão de modo)',
      tinta[200],
      tinta[900],
    ],
    [
      'branco/erro.texto (botão destrutivo do diálogo)',
      branco,
      feedback.erro.texto,
    ],
    // apelidos das chaves antigas
    ['texto/fundo', cores.texto, cores.fundo],
    ['texto/superficie', cores.texto, cores.superficie],
    ['textoSecundario/fundo', cores.textoSecundario, cores.fundo],
    ['textoSecundario/superficie', cores.textoSecundario, cores.superficie],
    ['branco/primaria', cores.branco, cores.primaria],
    ['branco/primariaPressionada', cores.branco, cores.primariaPressionada],
    ['branco/acento', cores.branco, cores.acento],
    ['primaria/fundo', cores.primaria, cores.fundo],
    ['primaria/superficie', cores.primaria, cores.superficie],
    ['erro/fundo', cores.erro, cores.fundo],
    ['erro/superficie', cores.erro, cores.superficie],
    ['sucesso/fundo', cores.sucesso, cores.fundo],
    ['sucesso/superficie', cores.sucesso, cores.superficie],
  ];
  it.each(texto)('%s >= 4,5:1', (_nome, a, b) => {
    expect(contraste(a, b)).toBeGreaterThanOrEqual(4.5);
  });

  const gradienteDeAcao = [
    ['início', cores.gradienteAcao[0]],
    ['fim', cores.gradienteAcao[1]],
    ['pressionado, início', cores.gradienteAcaoPressionado[0]],
    ['pressionado, fim', cores.gradienteAcaoPressionado[1]],
    ['urgência, início', cores.gradienteUrgencia[0]],
    ['urgência, fim', cores.gradienteUrgencia[1]],
  ] as const;
  it.each(gradienteDeAcao)(
    'branco sobre o gradiente (%s) >= 4,5:1',
    (_nome, cor) => {
      expect(contraste(branco, cor)).toBeGreaterThanOrEqual(4.5);
    },
  );

  const componentes: Par[] = [
    ['bordaDeCampo/branco', cores.bordaDeCampo, tinta[0]],
    ['bordaDeCampo/tinta.50', cores.bordaDeCampo, tinta[50]],
    ['borda (apelido)/superficie', cores.borda, cores.superficie],
    ['foco/branco', cores.foco, tinta[0]],
    ['foco/tinta.50', cores.foco, tinta[50]],
    ['azul.600/branco (borda de campo em foco)', azul[600], tinta[0]],
  ];
  it.each(componentes)('%s >= 3:1', (_nome, a, b) => {
    expect(contraste(a, b)).toBeGreaterThanOrEqual(3);
  });

  it('cores do dono ficam como no protótipo', () => {
    expect(cores.marcaAzul).toBe('#1A7FF6');
    expect(cores.marcaRoxo).toBe('#AF6FF1');
    expect(azul[500]).toBe('#1A7FF6');
    expect(roxo[500]).toBe('#AF6FF1');
    expect(cores.gradienteMarca).toEqual(['#1A7FF6', '#AF6FF1']);
    expect(cores.gradiente).toEqual(cores.gradienteMarca);
  });

  it('gradiente de marca: branco passa 3:1 (só texto grande) e não chega a 4,5:1', () => {
    for (const c of cores.gradienteMarca) {
      expect(contraste(branco, c)).toBeGreaterThanOrEqual(3);
      expect(contraste(branco, c)).toBeLessThan(4.5);
    }
  });

  it('tinta.400 e o divisor ficam só para decoração (não chegam a 3:1 sobre branco como controle)', () => {
    expect(contraste(tinta[400], tinta[0])).toBeLessThan(3);
    expect(contraste(cores.divisor, tinta[0])).toBeLessThan(3);
  });
});

describe('tipografia V2', () => {
  it('toda família existe em FONTES', () => {
    const nomes = Object.keys(FONTES);
    for (const nome of Object.values(tipografia.familia)) {
      expect(nomes).toContain(nome);
    }
    for (const e of Object.values(tipografia.estilo)) {
      expect(nomes).toContain(e.fontFamily);
    }
  });

  it('nenhum estilo fica abaixo de 12 pt e só o sobretítulo tem 12', () => {
    for (const [nome, e] of Object.entries(tipografia.estilo)) {
      expect(e.fontSize).toBeGreaterThanOrEqual(12);
      if (nome !== 'sobretitulo') expect(e.fontSize).toBeGreaterThan(12);
    }
  });
});
