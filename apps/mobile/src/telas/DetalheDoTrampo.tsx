import { Text, View } from 'react-native';
import { Selo } from '../componentes';
import { cores, espaco, tipografia } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  BlocoDoAutor,
  DescricaoLonga,
  EstadoDeTela,
  LinhaDeDado,
  NaoEncontrado,
  Rolavel,
  Titulo,
} from './base';
import type { PropsDoDetalheDoTrampo } from './tipos';

export function DetalheDoTrampo({
  estado,
  autor,
  rodape,
  semConexao,
  onVoltar,
  onAbrirAutor,
}: PropsDoDetalheDoTrampo) {
  return (
    <Rolavel
      titulo={textos.detalheTrampo.titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={rodape}
    >
      <EstadoDeTela
        estado={estado}
        vazio={<NaoEncontrado onVoltar={onVoltar} />}
      >
        {(trampo) => (
          <>
            <Selo
              variante={trampo.status}
              texto={
                trampo.status === 'aberto'
                  ? textos.detalheTrampo.seloAberto
                  : textos.detalheTrampo.seloEmAndamento
              }
            />
            <Text
              accessibilityRole="header"
              style={{
                color: cores.texto,
                fontSize: tipografia.tamanho.tituloDeTela,
                lineHeight: tipografia.lineHeight.tituloDeTela,
                fontWeight: tipografia.peso.negrito,
              }}
            >
              {trampo.titulo}
            </Text>
            <View style={{ gap: espaco[1] }}>
              <LinhaDeDado
                rotulo={textos.buscar.categoria}
                valor={trampo.categoria}
              />
              <LinhaDeDado
                rotulo={textos.buscar.cidade}
                valor={trampo.cidade}
              />
              <LinhaDeDado
                rotulo={textos.detalheTrampo.valor}
                valor={trampo.valorFormatado}
              />
              <LinhaDeDado
                rotulo={textos.detalheTrampo.prazo}
                valor={trampo.prazoFormatado ?? textos.detalheTrampo.semPrazo}
              />
            </View>
            <Titulo texto={textos.detalheTrampo.descricao} />
            <DescricaoLonga
              texto={trampo.descricao}
              rotuloMais={textos.detalheTrampo.lerMais}
              rotuloMenos={textos.detalheTrampo.lerMenos}
            />
            <BlocoDoAutor
              rotulo={textos.detalheTrampo.publicadoPor}
              autor={autor}
              onAbrir={onAbrirAutor}
            />
          </>
        )}
      </EstadoDeTela>
    </Rolavel>
  );
}
