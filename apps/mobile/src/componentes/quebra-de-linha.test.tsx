// Etapa 12, rodadas 1 e 2 (achados visuais F2 e F3; R1 a R3 do revisor): textos que não podem ser
// cortados nem deixar um pedaço sozinho na linha de baixo.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { AbasSegmentadas } from './Abas';
import { AcaoDeAvaliar } from './AcaoDeAvaliar';
import { Selo } from './Selo';

const oculto = { includeHiddenElements: true } as const;

describe('F2: selo "Avaliado com N ★"', () => {
  it.each([4, 5])(
    'nota %i: a estrela fica num Text próprio que não encolhe',
    async (nota) => {
      await render(<AcaoDeAvaliar notaDada={nota} titulo="Faxina" />);
      // O texto principal não carrega a estrela (então ela não quebra com ele).
      expect(
        screen.getByText(textos.avaliar.avaliadoComNota(nota), oculto),
      ).toBeTruthy();
      expect(screen.queryByText(/★/, oculto)?.props.children).toBe(
        textos.avaliar.estrela,
      );
      const estrela = screen.getByText(textos.avaliar.estrela, oculto);
      expect(StyleSheet.flatten(estrela.props.style)).toMatchObject({
        flexShrink: 0,
      });
      // O nome falado continua inteiro.
      expect(
        screen.getByLabelText(textos.avaliar.avaliadoComFalado(nota)),
      ).toBeTruthy();
    },
  );

  it('Selo: o sufixo só aparece quando passado', async () => {
    await render(<Selo variante="neutro" texto="Encerrado" />);
    expect(screen.getByText('Encerrado')).toBeOnTheScreen();
    expect(screen.queryByText('★')).toBeNull();
    await render(<Selo variante="neutro" texto="Encerrado" sufixo="★" />);
    expect(screen.getByText('Encerrado')).toBeOnTheScreen();
    expect(screen.getByText('★')).toBeOnTheScreen();
  });

  it('Selo (R3): texto e sufixo numa linha alinhada pela base, para o sufixo acompanhar a última linha', async () => {
    await render(<Selo variante="neutro" texto="Avaliado com 5" sufixo="★" />);
    const viewAcima = (no: ReturnType<typeof screen.getByText>) => {
      let atual = no.parent;
      while (atual && atual.type !== 'View') atual = atual.parent;
      return atual;
    };
    const linha = viewAcima(screen.getByText('★'));
    expect(linha).toBeTruthy();
    expect(StyleSheet.flatten(linha?.props.style)).toMatchObject({
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexShrink: 1,
    });
    expect(viewAcima(screen.getByText('Avaliado com 5'))).toBe(linha);
  });
});

describe('F3: AbasSegmentadas de Meus trampos', () => {
  const itens = [
    { chave: 'analise', rotulo: textos.meusTrampos.abaAnalise },
    {
      chave: 'confirmados',
      rotulo: textos.meusTrampos.abaConfirmados,
      contador: 0,
    },
    { chave: 'encerrados', rotulo: textos.meusTrampos.abaEncerrados },
  ] as const;

  it.each(['analise', 'confirmados', 'encerrados'] as const)(
    'com "%s" selecionada, nenhum rótulo é cortado e as abas medem pelo conteúdo',
    async (selecionada) => {
      await render(
        <AbasSegmentadas
          rotulo={textos.meusTrampos.titulo}
          itens={itens}
          selecionada={selecionada}
          onSelecionar={() => {}}
        />,
      );
      for (const item of itens) {
        const rotulo = screen.getByText(item.rotulo);
        // Sem limite de linhas: com fonte grande, quebra em vez de "Confirm…".
        expect(rotulo.props.numberOfLines).toBeUndefined();
        expect(rotulo.props.allowFontScaling).not.toBe(false);
        const aba = screen.getByRole('tab', {
          name:
            'contador' in item
              ? `${item.rotulo}, ${item.contador}`
              : item.rotulo,
        });
        // Largura pelo conteúdo (não 1/3 fixo) e contador pode descer, com o
        // conteúdo centrado nos dois eixos mesmo com `flexWrap` (regressão da
        // rodada 1: rótulo grudado no topo).
        expect(StyleSheet.flatten(aba.props.style)).toMatchObject({
          flexGrow: 1,
          flexBasis: 'auto',
          flexWrap: 'wrap',
          alignContent: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: toqueMinimo,
          borderRadius: toqueMinimo / 2,
        });
      }
      // Se não couber numa linha, a aba que sobra desce no trilho. O raio do
      // trilho é concêntrico ao das abas (R1): nada de `raio.pill`, que o
      // Android limita num trilho de duas linhas e faz a aba do canto vazar.
      const trilho = StyleSheet.flatten(
        screen.getByLabelText(textos.meusTrampos.titulo).props.style,
      );
      expect(trilho).toMatchObject({
        flexWrap: 'wrap',
        padding: 4,
        gap: 4,
        borderRadius: toqueMinimo / 2 + 4,
      });
      // Sem altura mínima própria: o trilho não fica mais alto que as abas.
      expect(trilho.minHeight).toBeUndefined();
    },
  );
});
