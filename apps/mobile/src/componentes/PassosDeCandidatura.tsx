import { Feather } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Text, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio } from '../tema/tokens';
import { textos } from '../textos/pt-BR';

export type PropsDosPassosDeCandidatura = {
  /** 1 = enviada, 2 = em análise, 3 = confirmado (ou recusada). */
  passoAtual: 1 | 2 | 3;
  /** O 3º passo vira "Recusada", em vermelho. */
  recusada?: boolean;
};

type Estado = 'feito' | 'atual' | 'futuro' | 'recusado';

function Marcador({ estado }: { estado: Estado }) {
  if (estado === 'feito' || estado === 'recusado') {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: raio.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            estado === 'feito'
              ? cores.feedback.sucesso.base
              : cores.feedback.erro.texto,
        }}
      >
        <Feather
          name={estado === 'feito' ? 'check' : 'x'}
          size={14}
          color={cores.branco}
        />
      </View>
    );
  }
  if (estado === 'atual') {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: raio.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cores.roxo[100],
        }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: raio.pill,
            backgroundColor: cores.roxo[700],
          }}
        />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: raio.pill,
          backgroundColor: cores.divisor,
        }}
      />
    </View>
  );
}

/**
 * Linha de 3 passos da candidatura. Falada como um texto só ("Passo 2 de 3:
 * Em análise"); os círculos são decorativos e o texto sob cada um diz o passo.
 */
export function PassosDeCandidatura({
  passoAtual,
  recusada = false,
}: PropsDosPassosDeCandidatura) {
  const { passos } = textos.candidaturaEnviada;
  const rotulos = [
    passos.enviada,
    passos.emAnalise,
    recusada ? passos.recusada : passos.confirmado,
  ];
  const estados: Estado[] = [1, 2, 3].map((n) => {
    if (n === 3 && recusada) return 'recusado';
    if (n < passoAtual) return 'feito';
    if (n === passoAtual) return 'atual';
    return 'futuro';
  });
  const atual = rotulos[passoAtual - 1] ?? '';

  return (
    <View
      accessible
      accessibilityLabel={textos.candidaturaEnviada.passo(passoAtual, atual)}
      style={{ gap: espaco.s }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center' }}
        importantForAccessibility="no-hide-descendants"
      >
        {estados.map((estado, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 3 passos fixos.
          <Fragment key={i}>
            {i > 0 ? (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  marginHorizontal: espaco.xs,
                  backgroundColor:
                    estado === 'futuro'
                      ? cores.divisor
                      : cores.feedback.sucesso.base,
                }}
              />
            ) : null}
            <Marcador estado={estado} />
          </Fragment>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {rotulos.map((rotulo, i) => {
          const estado = estados[i];
          return (
            <Text
              key={rotulo}
              style={[
                estiloDeTexto(
                  'legenda',
                  estado === 'atual' || estado === 'recusado'
                    ? 'negrito'
                    : 'medio',
                ),
                {
                  flex: 1,
                  textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
                  color:
                    estado === 'recusado'
                      ? cores.feedback.erro.texto
                      : estado === 'futuro'
                        ? cores.textoSecundario
                        : cores.texto,
                },
              ]}
            >
              {rotulo}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
