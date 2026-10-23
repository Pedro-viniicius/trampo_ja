import { ScrollView, View } from 'react-native';
import { Botao, CabecalhoGradiente, Logo } from '../componentes';
import { cores, espaco, larguraMaxima } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import type { PropsDaEntrada } from './tipos';

/** Primeira tela: marca em destaque, frase de valor e as duas portas de entrada. */
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
        <CabecalhoGradiente titulo={textos.entrada.frase}>
          <Logo tamanho="grande" />
        </CabecalhoGradiente>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: larguraMaxima,
              padding: espaco[4],
              gap: espaco[3],
            }}
          >
            <Botao texto={textos.entrada.criarConta} onPress={onCriarConta} />
            <Botao
              texto={textos.entrada.jaTenhoConta}
              variante="secundario"
              onPress={onJaTenhoConta}
            />
            {onTermos || onPolitica ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  columnGap: espaco[2],
                }}
              >
                {onTermos ? (
                  <Botao
                    texto={textos.cadastro.aceiteTermos}
                    variante="texto"
                    larguraCheia={false}
                    onPress={onTermos}
                  />
                ) : null}
                {onPolitica ? (
                  <Botao
                    texto={textos.cadastro.aceitePolitica}
                    variante="texto"
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
