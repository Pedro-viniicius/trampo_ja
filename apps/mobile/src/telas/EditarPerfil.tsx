import { type ComponentRef, useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { View } from 'react-native';
import { Aviso, Botao, CampoDeTexto, Chip, Toast } from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { Formulario, Paragrafo, Titulo, useFocarPrimeiroErro } from './base';
import type { PropsDoEditarPerfil } from './tipos';

const LIMITE_DA_DESCRICAO = 300;
const LIMITE_DO_NOME = 80;
const LIMITE_DA_CIDADE = 80;

/** Conta caracteres como o servidor: pontos de código, não unidades UTF-16. */
const contarCaracteres = (texto: string): number => Array.from(texto).length;

export function EditarPerfil({
  modoCompletar,
  valores,
  erros,
  salvando,
  sucesso = false,
  semConexao,
  onMudarNome,
  onMudarCidade,
  onMudarDescricao,
  onAdicionarHabilidade,
  onRemoverHabilidade,
  onSalvar,
  onFecharSucesso,
  onVoltar,
  onAgoraNao,
}: PropsDoEditarPerfil) {
  const refNome = useRef<ComponentRef<typeof TextInput>>(null);
  const refCidade = useRef<ComponentRef<typeof TextInput>>(null);
  const refDescricao = useRef<ComponentRef<typeof TextInput>>(null);
  const refHabilidade = useRef<ComponentRef<typeof TextInput>>(null);
  const [rascunho, setRascunho] = useState('');
  const [alturaDoRodape, setAlturaDoRodape] = useState(0);
  const quantidade = valores.habilidades.length;
  const anterior = useRef(quantidade);

  // O rascunho some só quando a habilidade foi aceita (a lista cresceu).
  useEffect(() => {
    if (quantidade > anterior.current) setRascunho('');
    anterior.current = quantidade;
  }, [quantidade]);

  useFocarPrimeiroErro([
    { ref: refNome, erro: erros.nome },
    { ref: refCidade, erro: erros.cidade },
    { ref: refDescricao, erro: erros.descricao },
    { ref: refHabilidade, erro: erros.habilidades },
  ]);

  const adicionar = () => {
    // Vazio também sobe: o contêiner responde com `habilidade_obrigatoria`.
    onAdicionarHabilidade(rascunho.trim());
  };
  const salvar = () => {
    if (!salvando) onSalvar();
  };

  return (
    <>
      <Formulario
        titulo={
          modoCompletar
            ? textos.editarPerfil.tituloCompletar
            : textos.editarPerfil.titulo
        }
        onVoltar={onVoltar}
        semConexao={semConexao}
        aoMedirRodape={setAlturaDoRodape}
        rodape={
          <>
            <Botao
              texto={textos.editarPerfil.salvar}
              textoCarregando={textos.editarPerfil.salvando}
              carregando={salvando}
              onPress={salvar}
            />
            {modoCompletar && onAgoraNao ? (
              <Botao
                texto={textos.editarPerfil.agoraNao}
                variante="texto"
                onPress={onAgoraNao}
              />
            ) : null}
          </>
        }
      >
        {modoCompletar ? (
          <Paragrafo texto={textos.editarPerfil.introCompletar} secundario />
        ) : null}
        {erros.geral ? <Aviso variante="erro" texto={erros.geral} /> : null}
        <Aviso variante="info" texto={textos.editarPerfil.avisoVisibilidade} />
        <CampoDeTexto
          rotulo={textos.editarPerfil.nome}
          valor={valores.nome}
          onChangeText={onMudarNome}
          erro={erros.nome}
          inputRef={refNome}
          maxLength={LIMITE_DO_NOME}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => refCidade.current?.focus()}
        />
        <CampoDeTexto
          rotulo={textos.editarPerfil.cidade}
          valor={valores.cidade}
          onChangeText={onMudarCidade}
          erro={erros.cidade}
          inputRef={refCidade}
          maxLength={LIMITE_DA_CIDADE}
          autoComplete="postal-address-locality"
          textContentType="addressCity"
          returnKeyType="next"
          onSubmitEditing={() => refDescricao.current?.focus()}
        />
        <CampoDeTexto
          rotulo={textos.editarPerfil.descricao}
          valor={valores.descricao}
          onChangeText={onMudarDescricao}
          erro={erros.descricao}
          inputRef={refDescricao}
          multiline
          contador={textos.editarPerfil.contador(
            contarCaracteres(valores.descricao),
            LIMITE_DA_DESCRICAO,
          )}
        />
        <Titulo texto={textos.editarPerfil.habilidades} />
        <View style={{ gap: espaco[2] }}>
          <CampoDeTexto
            rotulo={textos.editarPerfil.adicionarHabilidade}
            valor={rascunho}
            onChangeText={setRascunho}
            erro={erros.habilidades}
            inputRef={refHabilidade}
            returnKeyType="done"
            onSubmitEditing={adicionar}
          />
          <Botao
            texto={textos.editarPerfil.adicionar}
            variante="secundario"
            icone="add"
            onPress={adicionar}
          />
        </View>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaco[2] }}
        >
          {valores.habilidades.map((habilidade) => (
            <Chip
              key={habilidade}
              texto={habilidade}
              rotuloRemover={textos.editarPerfil.remover(habilidade)}
              onRemover={() => onRemoverHabilidade(habilidade)}
            />
          ))}
        </View>
      </Formulario>
      <Toast
        visivel={sucesso}
        mensagem={textos.editarPerfil.sucesso}
        rotuloFechar={textos.gerais.fechar}
        deslocamentoInferior={alturaDoRodape}
        onFechar={() => onFecharSucesso?.()}
      />
    </>
  );
}
