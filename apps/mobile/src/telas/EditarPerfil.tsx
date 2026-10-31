import { type ComponentRef, useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { View } from 'react-native';
import {
  Aviso,
  Botao,
  CampoDeTexto,
  Chip,
  Esqueleto,
  Toast,
} from '../componentes';
import { espaco } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import {
  ErroDoBloco,
  FocarPrimeiroErro,
  Formulario,
  Paragrafo,
  Titulo,
} from './base';
import type { PropsDoEditarPerfil } from './tipos';

const LIMITE_DA_DESCRICAO = 300;
const LIMITE_DO_NOME = 80;
const LIMITE_DA_CIDADE = 80;
const LIMITE_DA_HABILIDADE = 30;

export function EditarPerfil({
  modoCompletar,
  valores,
  erros,
  salvando,
  sucesso = false,
  semConexao,
  carregamento,
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

  const adicionar = () => {
    // Vazio também sobe: o contêiner responde com `habilidade_obrigatoria`.
    onAdicionarHabilidade(rascunho.trim());
  };
  const salvar = () => {
    if (!salvando) onSalvar();
  };
  // Sem `carregamento` (ou `pronta`) vale o formulário. Antes da resposta do
  // perfil não há campo nem "Salvar": nada de formulário vazio que se
  // preenche sozinho e apaga o que a pessoa digitou.
  const situacao = carregamento?.situacao ?? 'pronta';
  const pronta = situacao === 'pronta';

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
            {pronta ? (
              <Botao
                texto={textos.editarPerfil.salvar}
                textoCarregando={textos.editarPerfil.salvando}
                carregando={salvando}
                onPress={salvar}
              />
            ) : null}
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
        {pronta ? (
          <FocarPrimeiroErro
            campos={[
              { ref: refNome, erro: erros.nome },
              { ref: refCidade, erro: erros.cidade },
              { ref: refDescricao, erro: erros.descricao },
              { ref: refHabilidade, erro: erros.habilidades },
            ]}
          />
        ) : null}
        {carregamento && situacao === 'carregando' ? (
          <CarregandoDoPerfil />
        ) : null}
        {carregamento && situacao === 'erro' ? (
          <ErroDoBloco
            mensagem={
              semConexao
                ? textos.editarPerfil.semConexaoParaCarregar
                : textos.editarPerfil.erroAoCarregar
            }
            onTentarDeNovo={carregamento.onTentarDeNovo}
          />
        ) : null}
        {pronta ? (
          <>
            {erros.geral ? <Aviso variante="erro" texto={erros.geral} /> : null}
            <Aviso
              variante="info"
              texto={textos.editarPerfil.avisoVisibilidade}
            />
            <CampoDeTexto
              rotulo={textos.editarPerfil.nome}
              valor={valores.nome}
              onChangeText={onMudarNome}
              erro={erros.nome}
              inputRef={refNome}
              limite={LIMITE_DO_NOME}
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
              limite={LIMITE_DA_CIDADE}
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
              limite={LIMITE_DA_DESCRICAO}
              contadorDoLimite="sempre"
            />
            <Titulo texto={textos.editarPerfil.habilidades} />
            <View style={{ gap: espaco[2] }}>
              <CampoDeTexto
                rotulo={textos.editarPerfil.adicionarHabilidade}
                valor={rascunho}
                onChangeText={setRascunho}
                erro={erros.habilidades}
                inputRef={refHabilidade}
                limite={LIMITE_DA_HABILIDADE}
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
              {valores.habilidades.map((habilidade, i) => (
                <Chip
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista estática, sem reordenação
                  key={`${habilidade}-${i}`}
                  texto={habilidade}
                  rotuloRemover={textos.editarPerfil.remover(habilidade)}
                  onRemover={() => onRemoverHabilidade(habilidade)}
                />
              ))}
            </View>
          </>
        ) : null}
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

/** Esqueleto no formato do formulário, lido como um só bloco ocupado. */
function CarregandoDoPerfil() {
  return (
    <View
      accessible
      accessibilityLabel={textos.editarPerfil.carregando}
      accessibilityState={{ busy: true }}
      style={{ gap: espaco[4] }}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: esqueletos idênticos e estáticos.
          key={i}
          style={{ gap: espaco[2] }}
        >
          <Esqueleto largura="30%" altura={14} />
          <Esqueleto altura={48} />
        </View>
      ))}
    </View>
  );
}
