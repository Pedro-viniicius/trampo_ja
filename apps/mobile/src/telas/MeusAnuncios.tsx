import { type Ref, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Text,
  View,
} from 'react-native';
import {
  Aviso,
  Botao,
  BotaoMaisOpcoes,
  CartaoDeAnuncio,
  EstadoVazio,
  FolhaDeAcoesDoAnuncio,
  Motivo,
  Selo,
  Toast,
} from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { EstadoDeTela, Rolavel } from './base';
import type { MeuAnuncioParaExibir, PropsDosMeusAnuncios } from './tipos';

const selo = {
  aberto: { variante: 'aberto', texto: textos.selos.aberto },
  em_andamento: { variante: 'em_andamento', texto: textos.selos.emAndamento },
  encerrado: { variante: 'encerrado', texto: textos.selos.encerrado },
  ativo: { variante: 'aberto', texto: textos.selos.ativo },
} as const;

export function MeusAnuncios({
  tipo,
  lista,
  semConexao,
  onAbrirItem,
  onPublicar,
  onVoltar,
  folha,
  onMaisOpcoes,
  toast,
  onFecharToast,
  carregarMais,
}: PropsDosMeusAnuncios) {
  const ehTrampo = tipo === 'trampo';
  const quantidade = lista.situacao === 'ok' ? lista.dados.length : 0;
  const carregandoMais = carregarMais?.carregando ?? false;
  const antes = useRef<number | null>(null);
  const primeiroNovo = useRef<View>(null);
  const [indiceDoNovo, setIndiceDoNovo] = useState<number | null>(null);
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(
    null,
  );

  // Ao terminar "Carregar mais": anuncia quantos vieram e leva o foco do
  // leitor de tela ao primeiro item novo (o foco ficaria no botão, que desce).
  useEffect(() => {
    if (carregandoMais) {
      antes.current = quantidade;
      setIndiceDoNovo(null);
      return;
    }
    const anterior = antes.current;
    antes.current = null;
    if (anterior === null || quantidade <= anterior) return;
    const texto = textos.meusAnuncios.maisCarregados(
      quantidade - anterior,
      tipo,
    );
    setIndiceDoNovo(anterior);
    setAnuncio((atual) => ({ texto, n: (atual?.n ?? 0) + 1 }));
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(texto);
  }, [carregandoMais, quantidade, tipo]);
  useEffect(() => {
    if (indiceDoNovo === null) return;
    const no = findNodeHandle(primeiroNovo.current);
    if (no) AccessibilityInfo.setAccessibilityFocus(no);
  }, [indiceDoNovo]);
  const vazio = (
    <EstadoVazio
      icone={ehTrampo ? 'briefcase-outline' : 'construct-outline'}
      titulo={
        ehTrampo
          ? textos.meusAnuncios.vazioTrampos
          : textos.meusAnuncios.vazioServicos
      }
      texto={
        ehTrampo
          ? textos.meusAnuncios.vazioTrampoTexto
          : textos.meusAnuncios.vazioServicoTexto
      }
      textoAcao={
        ehTrampo
          ? textos.meusAnuncios.publicarTrampo
          : textos.meusAnuncios.ofertarServico
      }
      onAcao={onPublicar}
    />
  );
  return (
    <Rolavel
      titulo={
        ehTrampo
          ? textos.meusAnuncios.tituloTrampos
          : textos.meusAnuncios.tituloServicos
      }
      onVoltar={onVoltar}
      semConexao={semConexao}
      sobreposicao={
        toast ? (
          <Toast
            visivel
            mensagem={toast}
            rotuloFechar={textos.gerais.toastFechar}
            onFechar={() => onFecharToast?.()}
          />
        ) : undefined
      }
    >
      <EstadoDeTela estado={lista} vazio={vazio}>
        {(itens) =>
          itens.length === 0 ? (
            vazio
          ) : (
            <View style={{ gap: espaco[3] }}>
              {itens.map((item, indice) => (
                <Anuncio
                  key={item.id}
                  refDoFoco={indice === indiceDoNovo ? primeiroNovo : undefined}
                  item={item}
                  onAbrir={onAbrirItem}
                  onMaisOpcoes={onMaisOpcoes}
                />
              ))}
            </View>
          )
        }
      </EstadoDeTela>
      {carregarMais && lista.situacao === 'ok' && quantidade > 0 ? (
        <View style={{ gap: espaco[2] }}>
          {carregarMais.erro ? (
            <Aviso
              variante="erro"
              texto={carregarMais.erro}
              textoAcao={textos.gerais.tentarDeNovo}
              onAcao={carregarMais.onCarregarMais}
            />
          ) : null}
          <Botao
            texto={textos.gerais.carregarMais}
            textoCarregando={textos.gerais.carregando}
            variante="secundario"
            carregando={carregarMais.carregando}
            desabilitado={Boolean(semConexao)}
            onPress={carregarMais.onCarregarMais}
          />
          {semConexao ? (
            <Motivo texto={textos.meusAnuncios.semConexaoParaCarregarMais} />
          ) : null}
        </View>
      ) : null}
      {anuncio ? (
        <Text
          key={anuncio.n}
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        >
          {anuncio.texto}
        </Text>
      ) : null}
      {folha ? <FolhaDeAcoesDoAnuncio {...folha} /> : null}
    </Rolavel>
  );
}

function Anuncio({
  item,
  refDoFoco,
  onAbrir,
  onMaisOpcoes,
}: {
  refDoFoco?: Ref<View>;
  item: MeuAnuncioParaExibir;
  onAbrir: (item: MeuAnuncioParaExibir) => void;
  onMaisOpcoes?: (item: MeuAnuncioParaExibir) => void;
}) {
  const { variante, texto } = selo[item.status];
  return (
    <View ref={refDoFoco} accessible={false} style={{ gap: espaco[1] }}>
      <Selo variante={variante} texto={texto} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: espaco[1],
        }}
      >
        <View style={{ flex: 1 }}>
          <CartaoDeAnuncio
            tipo={item.tipo}
            titulo={item.titulo}
            categoria={item.categoria}
            cidade={item.cidade}
            valorFormatado={item.valorFormatado}
            dataFormatada={item.dataFormatada}
            onPress={() => onAbrir(item)}
          />
        </View>
        {onMaisOpcoes ? (
          <BotaoMaisOpcoes
            titulo={item.titulo}
            onPress={() => onMaisOpcoes(item)}
          />
        ) : null}
      </View>
    </View>
  );
}
