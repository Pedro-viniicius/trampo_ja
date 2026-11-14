// Componentes novos da V2 (spec docs/produto/specs/visual-v2.md, "Componentes")
// e a barra de abas dos dois modos (CA76: nome acessível e alvo de 48).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Tabs } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { toqueMinimo } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  AbasSegmentadas,
  AbasSublinhadas,
  ALTURA_DA_BARRA_DE_ABAS,
  BolhaDeMensagem,
  Botao,
  BotaoDeIcone,
  CampoDeBusca,
  CampoDeMensagem,
  CartaoDeConteudo,
  CartaoDeDestaque,
  CartaoDeFreelancer,
  CartaoDeMinhaCandidatura,
  CartaoDeModo,
  DialogoDeConfirmacao,
  Estrelas,
  EstrelasDeAvaliacao,
  FaixaDeDestaque,
  folgaDaBarraDeAbas,
  GrupoDeConfiguracao,
  Interruptor,
  LinhaDeConfiguracao,
  opcoesDaAba,
  opcoesDaBarraDeAbas,
  opcoesDaBarraDeAbasCom,
  PassosDeCandidatura,
  PilhaDeAvatares,
  type RotaDeAba,
  Selo,
  SeparadorDeDia,
} from './index';

const Vazia = () => <View />;

function abas(itens: readonly [RotaDeAba, string][]) {
  function Layout() {
    return (
      <Tabs screenOptions={opcoesDaBarraDeAbas}>
        {itens.map(([rota, titulo], i) => (
          <Tabs.Screen
            key={rota}
            name={i === 0 ? 'index' : rota}
            options={opcoesDaAba(rota, titulo)}
          />
        ))}
      </Tabs>
    );
  }
  return {
    _layout: Layout,
    ...Object.fromEntries(
      itens.map(([rota], i) => [i === 0 ? 'index' : rota, Vazia]),
    ),
  };
}

describe('CA76: barra de abas flutuante dos dois modos', () => {
  const FREELA: [RotaDeAba, string][] = [
    ['inicio', textos.abas.inicio],
    ['meus-trampos', textos.abas.meusTrampos],
    ['conversas', textos.abas.conversas],
    ['perfil', textos.abas.perfil],
  ];
  const CONTRATANTE: [RotaDeAba, string][] = [
    ['inicio', textos.abas.inicio],
    ['demandas', textos.abas.demandas],
    ['buscar', textos.abas.buscar],
    ['mensagens', textos.abas.mensagens],
    ['perfil', textos.abas.perfil],
  ];

  it.each([
    ['freela', FREELA],
    ['contratante', CONTRATANTE],
  ] as const)(
    '%s: cada aba tem nome acessível e rótulo de uma linha (reticências só como último recurso)',
    async (_modo, itens) => {
      await renderRouter(abas(itens), { initialUrl: '/' });
      for (const [, titulo] of itens) {
        expect(screen.getByLabelText(titulo)).toBeOnTheScreen();
        const rotulo = screen.getByText(titulo);
        expect(rotulo.props.numberOfLines).toBe(1);
        expect(rotulo.props.adjustsFontSizeToFit).toBeUndefined();
        expect(rotulo.props.allowFontScaling).not.toBe(false);
      }
      expect(screen.queryByLabelText(textos.abas.publicar)).toBeNull();
    },
  );

  it('alvo de toque de cada aba >= 48 e barra de 72', () => {
    const item = opcoesDaBarraDeAbas.tabBarItemStyle;
    expect(item.minHeight).toBeGreaterThanOrEqual(toqueMinimo);
    expect(
      ALTURA_DA_BARRA_DE_ABAS - 2 * item.marginVertical,
    ).toBeGreaterThanOrEqual(toqueMinimo);
    expect(opcoesDaBarraDeAbas.tabBarStyle.height).toBe(72);
    expect(item.minWidth).toBeGreaterThanOrEqual(toqueMinimo);
  });

  // F4: a aba parte da largura do rótulo e divide a sobra. Regra do Yoga
  // (`Node::processFlexBasis`, `Node.cpp` do RN 0.86.3 e 0.88.1): `flexBasis` 'auto'
  // ou indefinido conta como base não definida, e então `flex > 0` impõe
  // base 0 (todas as abas iguais, o rótulo longo corta). O bottom-tabs monta
  // o item com `[{ flex: 1 }, tabBarItemStyle]`, então o estilo renderizado
  // precisa de `flex` indefinido ou <= 0 para a base ficar auto.
  it.each([
    ['freela', FREELA],
    ['contratante', CONTRATANTE],
  ] as const)(
    'F4, %s: o item renderizado tem base auto (flex não força base 0)',
    async (_modo, itens) => {
      await renderRouter(abas(itens), { initialUrl: '/' });
      for (const [, titulo] of itens) {
        const botao = screen.getByLabelText(titulo);
        const item = botao.parent;
        const estilo = StyleSheet.flatten(item?.props.style) ?? {};
        expect(estilo.overflow).toBe('hidden');
        expect(estilo.flex === undefined || estilo.flex <= 0).toBe(true);
        expect(estilo.flexBasis ?? 'auto').toBe('auto');
        expect(estilo).toMatchObject({ flexGrow: 1, flexShrink: 1 });
        expect(estilo.width).toBeUndefined();
        expect(estilo.maxWidth).toBeUndefined();
        // R1: com `flex: 0` o botão não estica; o item tem a altura dele
        // (centralizado na barra), então a pílula cobre o item inteiro.
        expect(estilo.alignSelf).toBe('center');
        expect(estilo.minHeight).toBeGreaterThanOrEqual(toqueMinimo);
        expect(estilo.minWidth).toBeGreaterThanOrEqual(toqueMinimo);
      }
    },
  );

  it('F4: rótulo em sobretítulo (12, o mínimo para aba), com a fonte do sistema', async () => {
    const opcoes = opcoesDaAba('meus-trampos', textos.abas.meusTrampos);
    await render(
      <View>{opcoes.tabBarLabel({ color: '#0F6AD8', focused: true })}</View>,
    );
    const rotulo = screen.getByText(textos.abas.meusTrampos);
    expect(rotulo).toHaveStyle({ fontSize: 12 });
    expect(rotulo.props.numberOfLines).toBe(1);
    expect(rotulo.props.allowFontScaling).not.toBe(false);
  });

  it('a barra sobe a margem segura e o conteúdo tem folga para ela', () => {
    expect(opcoesDaBarraDeAbasCom({ bottom: 34 }).tabBarStyle.bottom).toBe(
      8 + 34,
    );
    expect(folgaDaBarraDeAbas(34)).toBe(72 + 8 + 34 + 16);
  });

  it('o rótulo da aba ativa fica em negrito (outra família) e o ícone é Feather', async () => {
    const opcoes = opcoesDaAba('demandas', textos.abas.demandas);
    await render(
      <View>
        {opcoes.tabBarLabel({ color: '#0F6AD8', focused: true })}
        {opcoes.tabBarLabel({ color: '#555B73', focused: false })}
        {opcoes.tabBarIcon({ color: '#0F6AD8', size: 24, focused: true })}
      </View>,
    );
    const [ativo, inativo] = screen.getAllByText(textos.abas.demandas);
    expect(ativo?.props.style).not.toEqual(inativo?.props.style);
    expect(screen.getByTestId('icone-check-square')).toBeTruthy();
  });
});

describe('Botao V2', () => {
  it.each([
    'primario',
    'secundario',
    'tonal',
    'contorno',
    'urgente',
    'texto',
    'destrutivo',
    'perigo',
  ] as const)('variante %s é um botão com o texto', async (variante) => {
    const onPress = jest.fn();
    await render(<Botao texto="Ação" variante={variante} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Ação' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('urgente leva o ícone zap; pequeno amplia o toque', async () => {
    await render(
      <Botao
        texto="Urgente"
        variante="urgente"
        tamanho="pequeno"
        onPress={() => undefined}
      />,
    );
    expect(screen.getByTestId('icone-zap')).toBeTruthy();
    expect(screen.getByRole('button').props.hitSlop).toBe(4);
  });
});

describe('BotaoDeIcone', () => {
  it('tem rótulo, alvo de 48 e mostra o contador', async () => {
    const onPress = jest.fn();
    await render(
      <BotaoDeIcone
        icone="sliders"
        rotulo="Filtros, 2 ativos"
        variante="escuro"
        contador={2}
        onPress={onPress}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Filtros, 2 ativos' });
    expect(botao).toHaveStyle({ width: 48, height: 48 });
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(botao);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('CampoDeBusca', () => {
  it('campo com rótulo e botão de filtros', async () => {
    const onFiltros = jest.fn();
    function Exemplo() {
      const [valor, setValor] = useState('');
      return (
        <CampoDeBusca
          rotulo={textos.conversas.buscar}
          valor={valor}
          onChangeText={setValor}
          onFiltros={onFiltros}
        />
      );
    }
    await render(<Exemplo />);
    await fireEvent.changeText(
      screen.getByLabelText(textos.conversas.buscar),
      'Ana',
    );
    expect(screen.getByDisplayValue('Ana')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.buscarFreelancers.filtros }),
    );
    expect(onFiltros).toHaveBeenCalledTimes(1);
  });
});

describe('CampoDeMensagem', () => {
  function Exemplo({
    onEnviar,
    envioDesabilitado,
  }: {
    onEnviar: () => void;
    envioDesabilitado?: boolean;
  }) {
    const [valor, setValor] = useState('');
    return (
      <CampoDeMensagem
        valor={valor}
        onChangeText={setValor}
        onEnviar={onEnviar}
        envioDesabilitado={envioDesabilitado}
        respostasRapidas={textos.conversas.respostasRapidas}
        limite={10}
      />
    );
  }

  it('enviar fica desabilitado sem texto; a resposta rápida só preenche o campo', async () => {
    const onEnviar = jest.fn();
    await render(<Exemplo onEnviar={onEnviar} />);
    const enviar = screen.getByRole('button', {
      name: textos.conversas.enviar,
    });
    expect(enviar).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Cheguei!' }));
    expect(onEnviar).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Cheguei!')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.conversas.enviar }),
    );
    expect(onEnviar).toHaveBeenCalledTimes(1);
  });

  it('corta no limite e respeita o envio desabilitado', async () => {
    const onEnviar = jest.fn();
    await render(<Exemplo onEnviar={onEnviar} envioDesabilitado />);
    await fireEvent.changeText(
      screen.getByLabelText(textos.conversas.campo),
      'mensagem longa demais',
    );
    expect(screen.getByDisplayValue('mensagem l')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: textos.conversas.enviar }),
    ).toBeDisabled();
  });
});

describe('Abas segmentadas e sublinhadas', () => {
  it.each([
    ['segmentadas', AbasSegmentadas],
    ['sublinhadas', AbasSublinhadas],
  ] as const)(
    '%s: tablist com tab selecionada e contador falado',
    async (_n, Abas) => {
      const onSelecionar = jest.fn();
      await render(
        <Abas
          rotulo={textos.meusTrampos.titulo}
          itens={[
            { chave: 'analise', rotulo: textos.meusTrampos.abaAnalise },
            {
              chave: 'confirmados',
              rotulo: textos.meusTrampos.abaConfirmados,
              contador: 2,
            },
          ]}
          selecionada="analise"
          onSelecionar={onSelecionar}
        />,
      );
      // Contêiner de grupo não é "accessible" (senão esconderia as abas): busca pelo rótulo.
      expect(
        screen.getByLabelText(textos.meusTrampos.titulo).props
          .accessibilityRole,
      ).toBe('tablist');
      expect(
        screen.getByRole('tab', { name: textos.meusTrampos.abaAnalise }).props
          .accessibilityState,
      ).toMatchObject({ selected: true });
      await fireEvent.press(
        screen.getByRole('tab', {
          name: `${textos.meusTrampos.abaConfirmados}, 2`,
        }),
      );
      expect(onSelecionar).toHaveBeenCalledWith('confirmados');
    },
  );
});

describe('Interruptor e CartaoDeModo', () => {
  it('Interruptor: a linha é um switch com o estado', async () => {
    const onMudar = jest.fn();
    await render(
      <Interruptor
        rotulo={textos.avaliar.favoritar}
        descricao={textos.avaliar.favoritarTexto}
        valor={false}
        onMudar={onMudar}
      />,
    );
    const linha = screen.getByRole('switch', {
      name: textos.avaliar.favoritar,
    });
    expect(linha.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(linha);
    expect(onMudar).toHaveBeenCalledWith(true);
  });

  it.each([
    [
      'freela',
      textos.modo.trocarParaContratante,
      textos.modo.cartaoFreela.titulo,
    ],
    [
      'contratante',
      textos.modo.trocarParaFreela,
      textos.modo.cartaoContratante.titulo,
    ],
  ] as const)(
    'CartaoDeModo no modo %s oferece o outro modo',
    async (modo, rotulo, titulo) => {
      const onTrocar = jest.fn();
      await render(<CartaoDeModo modoAtual={modo} onTrocar={onTrocar} />);
      expect(screen.getByText(titulo)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: rotulo }));
      expect(onTrocar).toHaveBeenCalledTimes(1);
    },
  );
});

describe('Estrelas', () => {
  it('exibição: nota em texto e falada', async () => {
    await render(<Estrelas media={4.86} total={8} />);
    expect(
      screen.getByLabelText(
        `${textos.gerais.nota('4,9')}, ${textos.avaliacoes.recebidas(8)}`,
      ),
    ).toBeTruthy();
  });

  it('entrada: radiogroup de 5 estrelas de 48 e rótulo da nota em texto', async () => {
    function Exemplo() {
      const [nota, setNota] = useState(0);
      return <EstrelasDeAvaliacao nota={nota} onMudar={setNota} />;
    }
    await render(<Exemplo />);
    expect(
      screen.getByLabelText(textos.avaliar.notaRotulo).props.accessibilityRole,
    ).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByText(textos.avaliar.notaVazia)).toBeTruthy();
    const quatro = screen.getByRole('radio', {
      name: textos.avaliar.rotuloEstrela(4),
    });
    expect(quatro).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(quatro);
    expect(screen.getByText('Muito bom')).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: textos.avaliar.rotuloEstrela(4) }).props
        .accessibilityState,
    ).toMatchObject({ checked: true });
  });
});

describe('PassosDeCandidatura', () => {
  it('fala o passo atual e mostra os três rótulos', async () => {
    await render(<PassosDeCandidatura passoAtual={2} />);
    expect(
      screen.getByLabelText(
        textos.candidaturaEnviada.passo(
          2,
          textos.candidaturaEnviada.passos.emAnalise,
        ),
      ),
    ).toBeTruthy();
  });

  it('recusada troca o terceiro passo', async () => {
    await render(<PassosDeCandidatura passoAtual={3} recusada />);
    expect(
      screen.getByLabelText(
        textos.candidaturaEnviada.passo(
          3,
          textos.candidaturaEnviada.passos.recusada,
        ),
      ),
    ).toBeTruthy();
  });
});

describe('Cartões novos', () => {
  it('CartaoDeDestaque: título como cabeçalho, ação branca e ação redonda', async () => {
    const onAcao = jest.fn();
    const onMais = jest.fn();
    await render(
      <CartaoDeDestaque
        sobretitulo={textos.dicas.sobretitulo}
        titulo={textos.inicioContratante.precisa}
        texto={textos.inicioContratante.publique}
        acao={{ texto: textos.inicioFreela.verMeusTrampos, onPress: onAcao }}
        acaoRedonda={{
          icone: 'plus',
          rotulo: textos.inicioContratante.novaDemanda,
          onPress: onMais,
        }}
      />,
    );
    expect(
      screen.getByRole('header', { name: textos.inicioContratante.precisa }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: textos.inicioFreela.verMeusTrampos }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.inicioContratante.novaDemanda,
      }),
    );
    expect(onAcao).toHaveBeenCalledTimes(1);
    expect(onMais).toHaveBeenCalledTimes(1);
  });

  it('CartaoDeFreelancer: cartão e "Ver serviço" abrem o serviço', async () => {
    const onPress = jest.fn();
    await render(
      <CartaoDeFreelancer
        nome="Ana Lima"
        tituloDoServico="Faxina completa"
        categoria="Limpeza"
        cidade="Lavras"
        precoFormatado="R$ 80,00"
        nota={{ media: 4.9, total: 3 }}
        onPress={onPress}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.buscarFreelancers.verServicoDe('Ana Lima'),
      }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: /Faxina completa/ }),
    );
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Ana Lima')).toBeTruthy();
  });

  it('CartaoDeMinhaCandidatura: Mensagem só na aceita e Retirar só na pendente', async () => {
    const onMensagem = jest.fn();
    const onRetirar = jest.fn();
    const props = {
      titulo: 'Pintar a sala',
      autor: 'Carla Souza',
      valorFormatado: 'R$ 150,00',
      onMensagem,
      onRetirar,
    };
    const tela = await render(
      <CartaoDeMinhaCandidatura {...props} status="aceita" />,
    );
    expect(
      screen.queryByRole('button', {
        name: textos.candidatura.retirarDe('Pintar a sala'),
      }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.meusTrampos.mensagemPara('Carla Souza'),
      }),
    );
    expect(onMensagem).toHaveBeenCalledTimes(1);

    await tela.rerender(
      <CartaoDeMinhaCandidatura {...props} status="pendente" />,
    );
    expect(
      screen.queryByRole('button', {
        name: textos.meusTrampos.mensagemPara('Carla Souza'),
      }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', {
        name: textos.candidatura.retirarDe('Pintar a sala'),
      }),
    );
    expect(onRetirar).toHaveBeenCalledTimes(1);
  });

  it('CartaoDeConteudo: um botão com título, tipo e duração', async () => {
    const onPress = jest.fn();
    await render(
      <CartaoDeConteudo
        titulo="Como mandar bem na entrevista?"
        resumo="Três passos simples."
        tipo={textos.dicas.tipoDica}
        duracao={textos.dicas.minutos(3)}
        onPress={onPress}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: /Como mandar bem na entrevista\?/ }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Peças de apoio', () => {
  it('PilhaDeAvatares mostra até 3 e "+N", oculta do leitor de tela', async () => {
    await render(
      <PilhaDeAvatares nomes={['Ana', 'Bia', 'Caio', 'Davi', 'Eva']} />,
    );
    expect(
      screen.getByText('+2', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.queryByText('+2')).toBeNull();
  });

  it('Selo novo (alerta) fala o status', async () => {
    await render(<Selo variante="alerta" texto="Responda" />);
    expect(
      screen.getByLabelText(textos.gerais.status('Responda')),
    ).toBeTruthy();
  });

  it('FaixaDeDestaque tem voltar e conteúdo', async () => {
    const onVoltar = jest.fn();
    await render(
      <FaixaDeDestaque onVoltar={onVoltar}>
        <Text>Conteúdo</Text>
      </FaixaDeDestaque>,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.voltar }),
    );
    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Conteúdo')).toBeTruthy();
  });

  it('GrupoDeConfiguracao junta linhas tocáveis', async () => {
    const onPress = jest.fn();
    await render(
      <GrupoDeConfiguracao>
        <LinhaDeConfiguracao
          titulo={textos.perfil.dicas}
          icone="book-open"
          tom="roxo"
          onPress={onPress}
        />
        <LinhaDeConfiguracao
          titulo={textos.perfil.sair}
          icone="log-out"
          destrutiva
          onPress={() => undefined}
        />
      </GrupoDeConfiguracao>,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.perfil.dicas }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('BolhaDeMensagem minha leva a hora dentro; SeparadorDeDia é cabeçalho', async () => {
    await render(
      <View>
        <SeparadorDeDia texto={textos.conversas.diaHoje} />
        <BolhaDeMensagem
          minha
          texto="Oi"
          horaFormatada="10:30"
          situacao="enviada"
        />
      </View>,
    );
    expect(
      screen.getByRole('header', { name: textos.conversas.diaHoje }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(`${textos.conversas.minha('10:30')}. Oi`),
    ).toBeTruthy();
  });

  it('DialogoDeConfirmacao destrutivo cancela por botão de texto', async () => {
    const onCancelar = jest.fn();
    await render(
      <DialogoDeConfirmacao
        visivel
        destrutivo
        titulo={textos.perfil.sairTitulo}
        textoConfirmar={textos.perfil.sairConfirmar}
        textoCancelar={textos.gerais.agoraNao}
        onConfirmar={() => undefined}
        onCancelar={onCancelar}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: textos.gerais.agoraNao }),
    );
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
