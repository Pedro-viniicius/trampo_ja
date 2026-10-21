import { Text, View } from 'react-native';
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
import type { PropsDoDetalheDoServico } from './tipos';

export function DetalheDoServico({
  estado,
  autor,
  rodape,
  semConexao,
  onVoltar,
  onAbrirAutor,
}: PropsDoDetalheDoServico) {
  return (
    <Rolavel
      titulo={textos.detalheServico.titulo}
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={rodape}
    >
      <EstadoDeTela
        estado={estado}
        vazio={<NaoEncontrado onVoltar={onVoltar} />}
      >
        {(servico) => (
          <>
            <Text
              accessibilityRole="header"
              style={{
                color: cores.texto,
                fontSize: tipografia.tamanho.tituloDeTela,
                lineHeight: tipografia.lineHeight.tituloDeTela,
                fontWeight: tipografia.peso.negrito,
              }}
            >
              {servico.titulo}
            </Text>
            <View style={{ gap: espaco[1] }}>
              <LinhaDeDado
                rotulo={textos.buscar.categoria}
                valor={servico.categoria}
              />
              {servico.cidade ? (
                <LinhaDeDado
                  rotulo={textos.buscar.cidade}
                  valor={servico.cidade}
                />
              ) : null}
              <LinhaDeDado
                rotulo={textos.detalheServico.precoBase}
                valor={servico.precoBaseFormatado}
              />
            </View>
            <Titulo texto={textos.detalheServico.descricao} />
            <DescricaoLonga
              texto={servico.descricao}
              rotuloMais={textos.detalheServico.lerMais}
              rotuloMenos={textos.detalheServico.lerMenos}
            />
            <BlocoDoAutor
              rotulo={textos.detalheServico.ofertadoPor}
              autor={autor}
              onAbrir={onAbrirAutor}
            />
          </>
        )}
      </EstadoDeTela>
    </Rolavel>
  );
}
