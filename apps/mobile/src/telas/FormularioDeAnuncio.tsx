import { type ComponentRef, useRef } from 'react';
import type { Pressable, TextInput } from 'react-native';
import {
  Aviso,
  Botao,
  CampoDeTexto,
  DialogoDeConfirmacao,
  EstadoVazio,
  Seletor,
} from '../componentes';
import { textos } from '../textos/pt-BR';
import {
  Carregando,
  ErroDoBloco,
  Formulario,
  NaoEncontrado,
  Paragrafo,
  RolarAoTopo,
  Rolavel,
  useFocarPrimeiroErro,
} from './base';
import type { PropsDoFormularioDeAnuncio } from './tipos';

const LIMITE_DO_TITULO = 80;
const LIMITE_DA_DESCRICAO = 2000;
const LIMITE_DA_CIDADE = 80;
const LIMITE_DO_VALOR = 14;
const LIMITE_DO_PRAZO = 10;

/** Conta caracteres como o servidor: pontos de código, não unidades UTF-16. */
const contarCaracteres = (texto: string): number => Array.from(texto).length;

export function FormularioDeAnuncio({
  tipo,
  valores,
  erros,
  categorias,
  enviando,
  semConexao,
  perfilIncompleto,
  publicado,
  tentativa,
  edicao,
  onMudar,
  onMudarCategoria,
  onSairDoCampo,
  onEnviar,
  onCompletarPerfil,
  onAgoraNao,
  onVerPublicado,
  onPublicarOutro,
  onVoltar,
}: PropsDoFormularioDeAnuncio) {
  const t = textos.formularioDeAnuncio;
  const ehTrampo = tipo === 'trampo';
  const refTitulo = useRef<ComponentRef<typeof TextInput>>(null);
  const refDescricao = useRef<ComponentRef<typeof TextInput>>(null);
  const refCategoria = useRef<ComponentRef<typeof Pressable>>(null);
  const refCidade = useRef<ComponentRef<typeof TextInput>>(null);
  const refValor = useRef<ComponentRef<typeof TextInput>>(null);
  const refPrazo = useRef<ComponentRef<typeof TextInput>>(null);

  // Ordem visual da tela. A categoria é um seletor: o foco vai ao botão que o abre.
  useFocarPrimeiroErro(
    [
      { ref: refTitulo, erro: erros.titulo },
      { ref: refDescricao, erro: erros.descricao },
      { ref: refCategoria, erro: erros.categoria },
      { ref: refCidade, erro: erros.cidade },
      { ref: refValor, erro: erros.valor },
      { ref: refPrazo, erro: erros.prazo },
    ],
    tentativa,
  );

  const a = textos.anuncio;
  const editando = edicao !== undefined;
  const titulo = editando
    ? ehTrampo
      ? a.tituloEditarTrampo
      : a.tituloEditarServico
    : ehTrampo
      ? t.tituloTrampo
      : t.tituloServico;

  const dialogoDeDescarte = edicao ? (
    <DialogoDeConfirmacao
      visivel={edicao.descartarVisivel}
      titulo={a.descartarTitulo}
      mensagem={a.descartarTexto}
      textoConfirmar={a.descartar}
      textoCancelar={a.continuarEditando}
      destrutivo
      onConfirmar={edicao.onDescartar}
      onCancelar={edicao.onContinuarEditando}
    />
  ) : null;

  if (edicao && edicao.situacao !== 'pronta') {
    return (
      <>
        <Rolavel titulo={titulo} onVoltar={onVoltar} semConexao={semConexao}>
          {edicao.situacao === 'carregando' ? <Carregando cartoes={1} /> : null}
          {edicao.situacao === 'erro' ? (
            <ErroDoBloco
              mensagem={a.erroAoCarregar}
              onTentarDeNovo={edicao.onTentarDeNovo}
            />
          ) : null}
          {edicao.situacao === 'nao_encontrado' ? (
            <NaoEncontrado onVoltar={onVoltar} />
          ) : null}
        </Rolavel>
        {dialogoDeDescarte}
      </>
    );
  }
  const camposBloqueados = Boolean(edicao?.naoEditavel);
  const motivoBloqueio = edicao?.motivoNaoEditavel ?? a.naoEditavel;

  if (publicado && !editando) {
    return (
      <Rolavel
        titulo={titulo}
        onVoltar={onVoltar}
        semConexao={semConexao}
        rodape={
          <>
            <Botao
              texto={ehTrampo ? t.verTrampo : t.verServico}
              onPress={onVerPublicado}
            />
            <Botao
              texto={ehTrampo ? t.publicarOutro : t.ofertarOutro}
              variante="secundario"
              onPress={onPublicarOutro}
            />
          </>
        }
      >
        <EstadoVazio
          icone="checkmark-circle-outline"
          titulo={ehTrampo ? t.publicadoTrampo : t.publicadoServico}
          texto={ehTrampo ? t.publicadoTrampoTexto : t.publicadoServicoTexto}
        />
      </Rolavel>
    );
  }

  const rotuloDaCategoria =
    categorias.find((item) => item.id === valores.categoria)?.rotulo ?? null;
  const enviar = () => {
    if (!enviando && !semConexao && !camposBloqueados) onEnviar();
  };

  const rodape = edicao ? (
    <>
      {camposBloqueados ? (
        <Aviso variante="info" texto={motivoBloqueio} />
      ) : semConexao ? (
        <Paragrafo texto={a.semConexaoParaSalvar} secundario />
      ) : null}
      <Botao
        texto={a.salvarAlteracoes}
        accessibilityHint={
          camposBloqueados
            ? motivoBloqueio
            : semConexao
              ? a.semConexaoParaSalvar
              : undefined
        }
        textoCarregando={a.salvando}
        carregando={enviando}
        desabilitado={Boolean(semConexao) || camposBloqueados}
        onPress={enviar}
      />
    </>
  ) : perfilIncompleto ? (
    <>
      <Botao texto={textos.avisoPerfil.completar} onPress={onCompletarPerfil} />
      <Botao
        texto={textos.avisoPerfil.agoraNao}
        variante="texto"
        onPress={onAgoraNao}
      />
    </>
  ) : (
    <>
      {semConexao ? <Paragrafo texto={t.semConexaoMotivo} secundario /> : null}
      <Botao
        texto={ehTrampo ? t.publicarTrampo : t.ofertarServico}
        accessibilityHint={semConexao ? t.semConexaoMotivo : undefined}
        textoCarregando={t.enviando}
        carregando={enviando}
        desabilitado={Boolean(semConexao)}
        onPress={enviar}
      />
    </>
  );

  return (
    <>
      <Formulario
        titulo={titulo}
        onVoltar={onVoltar}
        semConexao={semConexao}
        rodape={rodape}
      >
        <RolarAoTopo
          quando={Boolean(edicao?.conflito || erros.geral)}
          tentativa={tentativa}
        />
        {edicao?.conflito ? (
          <>
            <Aviso
              variante="erro"
              texto={a.conflito}
              textoAcao={a.verVersaoAtual}
              onAcao={edicao.onVerVersaoAtual}
            />
            <Botao
              texto={a.dispensarConflito}
              variante="texto"
              onPress={edicao.onDispensarConflito}
            />
          </>
        ) : null}
        {!editando && perfilIncompleto ? (
          <Aviso
            variante="info"
            texto={textos.avisoPerfil.mensagem(perfilIncompleto.falta)}
          />
        ) : null}
        {erros.geral ? <Aviso variante="erro" texto={erros.geral} /> : null}
        {editando ? null : (
          <Aviso variante="info" texto={t.avisoVisibilidade} />
        )}
        <CampoDeTexto
          rotulo={t.titulo}
          valor={valores.titulo}
          onChangeText={(texto) => onMudar('titulo', texto)}
          erro={erros.titulo}
          onBlur={() => onSairDoCampo('titulo')}
          inputRef={refTitulo}
          editable={!camposBloqueados}
          maxLength={LIMITE_DO_TITULO}
          contador={t.contador(
            contarCaracteres(valores.titulo),
            LIMITE_DO_TITULO,
          )}
          returnKeyType="next"
          onSubmitEditing={() => refDescricao.current?.focus()}
        />
        <CampoDeTexto
          rotulo={t.descricao}
          valor={valores.descricao}
          onChangeText={(texto) => onMudar('descricao', texto)}
          erro={erros.descricao}
          onBlur={() => onSairDoCampo('descricao')}
          inputRef={refDescricao}
          editable={!camposBloqueados}
          multiline
          maxLength={LIMITE_DA_DESCRICAO}
          contador={t.contador(
            contarCaracteres(valores.descricao),
            LIMITE_DA_DESCRICAO,
          )}
        />
        <Seletor
          rotulo={t.categoria}
          valor={rotuloDaCategoria}
          textoVazio={t.escolherCategoria}
          opcoes={categorias.map((item) => item.rotulo)}
          rotuloDePesquisa={t.pesquisarCategoria}
          textoSemOpcoes={textos.buscar.semOpcoes}
          erro={erros.categoria}
          gatilhoRef={refCategoria}
          desabilitado={camposBloqueados}
          onSelecionar={(rotulo) =>
            onMudarCategoria(
              categorias.find((item) => item.rotulo === rotulo)?.id ?? null,
            )
          }
        />
        <CampoDeTexto
          rotulo={ehTrampo ? t.cidade : t.cidadeOpcional}
          ajuda={ehTrampo ? undefined : t.ajudaCidadeServico}
          valor={valores.cidade}
          onChangeText={(texto) => onMudar('cidade', texto)}
          erro={erros.cidade}
          onBlur={() => onSairDoCampo('cidade')}
          inputRef={refCidade}
          editable={!camposBloqueados}
          maxLength={LIMITE_DA_CIDADE}
          autoComplete="postal-address-locality"
          textContentType="addressCity"
          returnKeyType="next"
          onSubmitEditing={() => refValor.current?.focus()}
        />
        <CampoDeTexto
          rotulo={ehTrampo ? t.valor : t.precoBase}
          ajuda={textos.gerais.ajudaValor}
          tipo="decimal"
          valor={valores.valor}
          onChangeText={(texto) => onMudar('valor', texto)}
          onBlur={() => onSairDoCampo('valor')}
          erro={erros.valor}
          inputRef={refValor}
          editable={!camposBloqueados}
          maxLength={LIMITE_DO_VALOR}
        />
        {ehTrampo ? (
          <CampoDeTexto
            rotulo={t.prazo}
            ajuda={t.ajudaPrazo}
            tipo="numero"
            valor={valores.prazo}
            onChangeText={(texto) => onMudar('prazo', texto)}
            onBlur={() => onSairDoCampo('prazo')}
            erro={erros.prazo}
            inputRef={refPrazo}
            editable={!camposBloqueados}
            maxLength={LIMITE_DO_PRAZO}
          />
        ) : null}
      </Formulario>
      {dialogoDeDescarte}
    </>
  );
}
