import { ScrollView, Text, View } from 'react-native';
import { Botao, CabecalhoGradiente, Logo } from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, larguraMaxima, margemDaTela } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import type { PropsDaEntrada } from './tipos';

/**
 * Primeira tela (spec, 02 · Entrada): faixa da marca com a logo, a frase em
 * `display` e as duas portas de entrada.
 */
export function Entrada({
  onCriarConta,
  onJaTenhoConta,
  onPolitica,
  onTermos,
}: PropsDaEntrada) {
  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      {/* Rola em paisagem ou com fonte grande; centraliza quando cabe. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <CabecalhoGradiente>
          <Logo tamanho="grande" />
        </CabecalhoGradiente>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: larguraMaxima,
              paddingHorizontal: margemDaTela,
              paddingVertical: espaco.l,
              gap: espaco.m,
            }}
          >
            <Text
              accessibilityRole="header"
              style={[
                estiloDeTexto('display'),
                { color: cores.texto, marginBottom: espaco.s },
              ]}
            >
              {textos.entrada.frase}
            </Text>
            <Botao
              texto={textos.entrada.criarConta}
              tamanho="grande"
              onPress={onCriarConta}
            />
            <Botao
              texto={textos.entrada.jaTenhoConta}
              variante="contorno"
              tamanho="grande"
              onPress={onJaTenhoConta}
            />
            {onTermos || onPolitica ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  columnGap: espaco.m,
                }}
              >
                {onTermos ? (
                  <Botao
                    texto={textos.cadastro.aceiteTermos}
                    variante="texto"
                    tamanho="pequeno"
                    larguraCheia={false}
                    onPress={onTermos}
                  />
                ) : null}
                {onPolitica ? (
                  <Botao
                    texto={textos.cadastro.aceitePolitica}
                    variante="texto"
                    tamanho="pequeno"
                    larguraCheia={false}
                    onPress={onPolitica}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
