import { BotaoMaisOpcoes, FolhaDeAcoesDoAnuncio, Selo } from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  BlocoDoAutor,
  Cartao,
  DescricaoLonga,
  EstadoDeTela,
  LadrilhoDeDado,
  LadrilhosDeDados,
  NaoEncontrado,
  Rolavel,
  TituloDoCartao,
} from './base';
import { TopoDoDetalhe } from './DetalheDoTrampo';
import type { PropsDoDetalheDoServico } from './tipos';

/**
 * Detalhe do serviço: mesma estrutura do detalhe do trampo (quadro 05), com os
 * ladrilhos de preço base e local (só quando o serviço tem cidade).
 */
export function DetalheDoServico({
  estado,
  autor,
  rodape,
  sobreposicao,
  semConexao,
  onMaisOpcoes,
  folha,
  onVoltar,
  onAbrirAutor,
}: PropsDoDetalheDoServico) {
  const t = textos.detalheServico;
  return (
    <Rolavel
      titulo={t.titulo}
      faixa
      onVoltar={onVoltar}
      semConexao={semConexao}
      rodape={rodape}
      sobreposicao={sobreposicao}
      direita={
        folha && onMaisOpcoes ? (
          <BotaoMaisOpcoes
            titulo={folha.titulo}
            variante="claro"
            onPress={onMaisOpcoes}
          />
        ) : undefined
      }
    >
      <EstadoDeTela
        estado={estado}
        vazio={<NaoEncontrado onVoltar={onVoltar} />}
      >
        {(servico) => (
          <>
            <Cartao>
              <TopoDoDetalhe
                titulo={servico.titulo}
                linha={servico.categoria}
                autor={autor}
                icone="tool"
              />
              <Selo variante="informacao" texto={t.titulo} icone="tool" />
              <LadrilhosDeDados>
                <LadrilhoDeDado
                  icone="dollar-sign"
                  rotulo={t.precoBase}
                  valor={servico.precoBaseFormatado}
                />
                {servico.cidade ? (
                  <LadrilhoDeDado
                    icone="map-pin"
                    rotulo={textos.detalheTrampo.local}
                    valor={servico.cidade}
                  />
                ) : null}
              </LadrilhosDeDados>
            </Cartao>
            <Cartao gap={espaco.s}>
              <TituloDoCartao texto={t.descricao} />
              <DescricaoLonga
                texto={servico.descricao}
                rotuloMais={t.lerMais}
                rotuloMenos={t.lerMenos}
              />
            </Cartao>
            <BlocoDoAutor
              rotulo={t.ofertadoPor}
              autor={autor}
              onAbrir={onAbrirAutor}
            />
          </>
        )}
      </EstadoDeTela>
      {folha ? <FolhaDeAcoesDoAnuncio {...folha} /> : null}
    </Rolavel>
  );
}
