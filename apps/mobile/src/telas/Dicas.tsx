import { type ComponentRef, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  Cabecalho,
  CartaoDeConteudo,
  CartaoDeDestaque,
  Chip,
  EstadoVazio,
  type NomeDeIcone,
} from '../componentes';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco } from '../tema/tokens';
import {
  CATEGORIAS_DAS_DICAS,
  type CategoriaDaDica,
  DICAS,
} from '../textos/dicas';
import { textos } from '../textos/pt-BR';
import { Coluna, Pagina } from './base';
import type { DicaParaExibir, PropsDasDicas } from './tipos';

/** Ícone do cartão por categoria (decorativo). */
const ICONE_DA_CATEGORIA: Record<CategoriaDaDica, NomeDeIcone> = {
  conseguir_trabalho: 'message-circle',
  atendimento: 'smile',
  garcom_e_cozinha: 'coffee',
  eventos: 'calendar',
  comercio_e_estoque: 'package',
  seguranca: 'shield',
};

/** Rótulo do tipo do conteúdo ("Dica rápida" ou "Minicurso"). */
export function rotuloDoTipoDaDica(tipo: DicaParaExibir['tipo']): string {
  return tipo === 'minicurso'
    ? textos.dicas.tipoMinicurso
    : textos.dicas.tipoDica;
}

/**
 * Dicas & minicursos (quadro 11; CA81): conteúdo local, sem rede. O filtro
 * por categoria fica na tela; "Explorar conteúdos" leva às categorias.
 */
export function Dicas({ conteudos = DICAS, onAbrir, onVoltar }: PropsDasDicas) {
  const [categoria, setCategoria] = useState<CategoriaDaDica | null>(null);
  const rolagem = useRef<ComponentRef<typeof ScrollView>>(null);
  const categorias = useRef<ComponentRef<typeof Text>>(null);
  const [posicaoDasCategorias, setPosicaoDasCategorias] = useState(0);
  const filtrados = categoria
    ? conteudos.filter((dica) => dica.categoria === categoria)
    : conteudos;

  const explorar = () => {
    rolagem.current?.scrollTo({ y: posicaoDasCategorias, animated: false });
    const no = findNodeHandle(categorias.current);
    if (no) AccessibilityInfo.setAccessibilityFocus(no);
  };

  return (
    <Pagina>
      <Cabecalho
        titulo={textos.dicas.titulo}
        subtitulo={textos.dicas.subtitulo}
        onVoltar={onVoltar}
      />
      <ScrollView
        ref={rolagem}
        contentContainerStyle={{ alignItems: 'center' }}
      >
        <Coluna gap={espaco.l}>
          <CartaoDeDestaque
            sobretitulo={textos.dicas.sobretitulo}
            titulo={textos.dicas.destaque}
            texto={textos.dicas.destaqueTexto}
            acao={{ texto: textos.dicas.explorar, onPress: explorar }}
          />
          <View
            style={{ gap: espaco.m - 4 }}
            onLayout={(evento) =>
              setPosicaoDasCategorias(evento.nativeEvent.layout.y)
            }
          >
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: espaco.s,
              }}
            >
              <Text
                ref={categorias}
                accessibilityRole="header"
                style={[estiloDeTexto('h2'), { color: cores.texto }]}
              >
                {textos.dicas.categorias}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  estiloDeTexto('legenda'),
                  { color: cores.textoSecundario },
                ]}
              >
                {textos.dicas.conteudos(filtrados.length)}
              </Text>
            </View>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s }}
            >
              <Chip
                texto={textos.dicas.todos}
                selecionado={categoria === null}
                onPress={() => setCategoria(null)}
              />
              {CATEGORIAS_DAS_DICAS.map((chave) => (
                <Chip
                  key={chave}
                  texto={textos.dicas.categoria[chave]}
                  selecionado={categoria === chave}
                  onPress={() => setCategoria(chave)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: espaco.m }}>
            <Text
              accessibilityRole="header"
              style={[estiloDeTexto('h2'), { color: cores.texto }]}
            >
              {textos.dicas.paraComecar}
            </Text>
            {filtrados.length === 0 ? (
              <EstadoVazio icone="book-open" titulo={textos.dicas.vazio} />
            ) : (
              filtrados.map((dica) => (
                <CartaoDeConteudo
                  key={dica.id}
                  titulo={dica.titulo}
                  resumo={dica.resumo}
                  tipo={rotuloDoTipoDaDica(dica.tipo)}
                  duracao={textos.dicas.minutos(dica.minutos)}
                  icone={ICONE_DA_CATEGORIA[dica.categoria]}
                  onPress={() => onAbrir(dica.id)}
                />
              ))
            )}
          </View>
        </Coluna>
      </ScrollView>
    </Pagina>
  );
}
