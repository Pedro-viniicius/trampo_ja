import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ehErroDaApi } from '../../../api/erros';
import type { Trampo } from '../../../api/tipos';
import { Aviso, Toast } from '../../../componentes';
import {
  type AnuncioDaFolha,
  acoesDoAnuncio,
  type MotivoDaSaida,
  useAcoesDoAnuncio,
} from '../../../estado/acoes-do-anuncio';
import {
  avisarAoVoltar,
  type ChaveDeAvisoDeRetorno,
  useAvisoDeRetorno,
} from '../../../estado/aviso-de-retorno';
import { useConexao } from '../../../estado/conexao';
import { useConversar } from '../../../estado/consultas/abrir-conversa';
import { useMeusTrampos, useTrampo } from '../../../estado/consultas/anuncios';
import { useCategorias } from '../../../estado/consultas/busca';
import {
  useCandidatar,
  useCandidaturasRecebidas,
  useMinhasCandidaturas,
  useRetirarCandidatura,
} from '../../../estado/consultas/candidaturas';
import {
  useMeuPerfil,
  usePerfilPublico,
} from '../../../estado/consultas/perfil';
import { chaveDoErro, textoDeErroDeAcao } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import {
  centavosParaCampo,
  formatarCentavos,
  formatarData,
  lerValorEmCentavos,
  rotuloDaCategoria,
} from '../../../estado/formatacao';
import { useNavegarUmaVez } from '../../../estado/navegar-uma-vez';
import { useAvisoDePerfil } from '../../../estado/perfil-incompleto';
import {
  type ListaDoRodape,
  situacaoDoRodape,
} from '../../../estado/rodape-do-trampo';
import { useSessao } from '../../../estado/sessao';
import { validarCandidatura } from '../../../estado/validacao';
import {
  DetalheDoTrampo,
  type FolhaDeCandidatura,
  type PropsDaFolhaDeAcoes,
  RodapeDoTrampo,
  type TrampoParaExibir,
} from '../../../telas';
import { type ChaveDeErro, textos } from '../../../textos/pt-BR';

const CARREGANDO = { situacao: 'carregando' } as const;

const SEM_ACAO = () => undefined;

/**
 * Folha fechada: o detalhe só mostra "Mais opções" com uma `folha` em mãos, e
 * a do hook só existe depois do primeiro `abrir`.
 */
function folhaFechada(
  anuncio: AnuncioDaFolha,
  online: boolean,
): PropsDaFolhaDeAcoes {
  return {
    visivel: false,
    titulo: anuncio.titulo,
    tipo: anuncio.tipo,
    ...acoesDoAnuncio(anuncio, online),
    processando: null,
    onEditar: SEM_ACAO,
    onEncerrar: SEM_ACAO,
    onExcluir: SEM_ACAO,
    onFechar: SEM_ACAO,
  };
}

/** O aviso que o detalhe deixa à tela anterior quando o trampo some. */
function avisoDaSaida(motivo: MotivoDaSaida): ChaveDeAvisoDeRetorno {
  return motivo === 'excluido' ? 'trampo_excluido' : 'ja_nao_existe';
}

export default function RotaDoTrampo() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idDoTrampo = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();
  const { online } = useConexao();
  const { categorias } = useCategorias();
  const consulta = useTrampo(idDoTrampo);

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const estado = estadoDeConsulta(
    { ...consulta, dados: consulta.trampo },
    (trampo): TrampoParaExibir => ({
      titulo: trampo.titulo,
      descricao: trampo.descricao,
      categoria: rotuloDaCategoria(categorias, trampo.categoria),
      cidade: trampo.cidade,
      valorFormatado: formatarCentavos(trampo.valorCentavos),
      prazoFormatado: trampo.prazo === null ? null : formatarData(trampo.prazo),
      status: trampo.status,
    }),
  );

  if (consulta.trampo === null) {
    return (
      <DetalheDoTrampo
        estado={estado}
        autor={CARREGANDO}
        semConexao={!online}
        onVoltar={voltar}
        onAbrirAutor={() => undefined}
      />
    );
  }
  return (
    <TrampoComAutor
      trampo={consulta.trampo}
      estado={estado}
      semConexao={!online}
      onVoltar={voltar}
      onRecarregarTrampo={() => {
        void consulta.recarregar();
      }}
    />
  );
}

/**
 * Só existe depois que o trampo carregou: o autor é buscado a partir do
 * `autorId`, e um 404 dele (`vazio`) não derruba o detalhe.
 */
function TrampoComAutor({
  trampo,
  estado,
  semConexao,
  onVoltar,
  onRecarregarTrampo,
}: {
  trampo: Trampo;
  estado: ReturnType<typeof estadoDeConsulta<Trampo, TrampoParaExibir>>;
  semConexao: boolean;
  onVoltar: () => void;
  onRecarregarTrampo: () => void;
}) {
  const router = useRouter();
  const { geracao } = useSessao();
  const abrirEdicao = useNavegarUmaVez();
  const consultaDoAutor = usePerfilPublico(trampo.autorId);
  const autor = estadoDeConsulta(
    { ...consultaDoAutor, dados: consultaDoAutor.perfil },
    (perfil) => perfil,
  );
  const [toast, setToast] = useState<string | null>(null);

  // "Mais opções" (CA33), só para o autor, decidido pela lista "meus". O
  // status e a contagem de candidaturas que a folha precisa vêm do próprio
  // detalhe, que os traz para o autor (a lista pode estar mais velha).
  // Excluir não mostra o toast do hook: o aviso vai para a tela de destino, e
  // esta para de ouvir antes de avisar (senão consumiria o próprio aviso).
  const meusTrampos = useMeusTrampos();
  const meu = meusTrampos.trampos?.find((m) => m.id === trampo.id);
  const [saida, setSaida] = useState<MotivoDaSaida | null>(null);
  const acoes = useAcoesDoAnuncio({
    aoEditar: (anuncio) =>
      abrirEdicao({
        pathname: '/trampos/editar/[id]',
        params: { id: anuncio.id },
      }),
    aoExcluir: (_anuncio, motivo) => setSaida(motivo),
  });
  const aviso = useAvisoDeRetorno(useIsFocused() && saida === null);
  const saiu = useRef(false);
  const voltarRef = useRef(onVoltar);
  voltarRef.current = onVoltar;
  useEffect(() => {
    if (saida === null || saiu.current) {
      return;
    }
    saiu.current = true;
    avisarAoVoltar(avisoDaSaida(saida), geracao());
    voltarRef.current();
  }, [saida, geracao]);

  const anuncio: AnuncioDaFolha | null =
    meu === undefined
      ? null
      : {
          tipo: 'trampo',
          id: trampo.id,
          titulo: trampo.titulo,
          status: trampo.status,
          ...(trampo.candidaturasRecebidas !== undefined && {
            candidaturasRecebidas: trampo.candidaturasRecebidas,
          }),
        };
  // Encerrar mostra o toast do hook aqui mesmo; excluir (ou o 404) sai da
  // tela, e o aviso é da tela de destino.
  const mensagem =
    toast ?? (saida === null ? acoes.toast : null) ?? aviso.texto;
  return (
    <DetalheDoTrampo
      estado={estado}
      autor={autor}
      // Excluído: a lista já não traz o trampo, e o rodapé não pisca antes de sair.
      rodape={
        saida === null ? (
          <RodapeDaRota
            trampo={trampo}
            semConexao={semConexao}
            onEnviada={() => setToast(textos.candidatar.enviada)}
            onRetirada={() => setToast(textos.candidatura.retirada)}
            onRecarregarTrampo={onRecarregarTrampo}
          />
        ) : undefined
      }
      sobreposicao={
        <Toast
          visivel={mensagem !== null}
          mensagem={mensagem ?? ''}
          onFechar={() => {
            setToast(null);
            acoes.fecharToast();
            aviso.limpar();
          }}
          rotuloFechar={textos.gerais.toastFechar}
        />
      }
      folha={
        anuncio === null
          ? undefined
          : // O botão "Mais opções" fala do título de agora, não do da
            // última abertura da folha.
            {
              ...(acoes.folha ?? folhaFechada(anuncio, !semConexao)),
              titulo: anuncio.titulo,
            }
      }
      onMaisOpcoes={anuncio === null ? undefined : () => acoes.abrir(anuncio)}
      semConexao={semConexao}
      onVoltar={onVoltar}
      onAbrirAutor={(contaId) =>
        router.push({ pathname: '/perfis/[contaId]', params: { contaId } })
      }
    />
  );
}

/** Uma lista "minha" no formato do rodapé: erro conta como lista vazia. */
function paraLista<T>(dados: readonly T[] | null, erro: Error | null) {
  return {
    dados: dados ?? undefined,
    falhou: erro !== null,
  } satisfies ListaDoRodape<T>;
}

type ErrosDaFolha = FolhaDeCandidatura['erros'];

/** Chaves de `validarCandidatura` ou do 400 -> textos da folha. */
function errosDaFolha(
  campos: Partial<Record<string, ChaveDeErro>>,
  geral?: ChaveDeErro,
): ErrosDaFolha {
  const erros: { -readonly [K in keyof ErrosDaFolha]: ErrosDaFolha[K] } = {};
  if (campos.mensagem !== undefined) {
    erros.mensagem = textos.erros[campos.mensagem];
  }
  if (campos.valorPropostoCentavos !== undefined) {
    erros.valor = textos.erros[campos.valorPropostoCentavos];
  }
  if (geral !== undefined) {
    erros.geral = textos.erros[geral];
  }
  return erros;
}

/** Código do 409, ou `null` para qualquer outro erro. */
function codigoDoConflito(erro: unknown): string | null {
  return ehErroDaApi(erro) && erro.status === 409 ? erro.codigo : null;
}

/**
 * 409 que mostram que o rodapé estava desatualizado: as listas "minhas"
 * falharam ou estavam velhas. Recarregá-las troca o botão pelo selo ou por
 * "Ver candidaturas".
 */
const CONFLITOS_DAS_LISTAS: ReadonlySet<string> = new Set([
  'candidatura_duplicada',
  'autor_nao_pode_candidatar',
]);

/**
 * Rodapé do detalhe: a situação vem das listas "minhas" (o app não conhece o
 * id da conta, ADR-003) e as candidaturas recebidas só são pedidas quando a
 * pessoa é a autora. A folha guarda o rascunho só na memória do componente.
 */
function RodapeDaRota({
  trampo,
  semConexao,
  onEnviada,
  onRetirada,
  onRecarregarTrampo,
}: {
  trampo: Trampo;
  semConexao: boolean;
  /** Candidatura criada: o detalhe mostra o toast. */
  onEnviada: () => void;
  /** Candidatura retirada: o detalhe mostra o toast. */
  onRetirada: () => void;
  onRecarregarTrampo: () => void;
}) {
  const router = useRouter();
  const meusTrampos = useMeusTrampos();
  const minhasCandidaturas = useMinhasCandidaturas();
  const meuPerfil = useMeuPerfil();
  const candidatar = useCandidatar(trampo.id);
  const conversa = useConversar(trampo.autorId, semConexao);
  const retirar = useRetirarCandidatura();

  const listas = {
    trampo,
    meusTrampos: paraLista(meusTrampos.trampos, meusTrampos.erro),
    minhasCandidaturas: paraLista(
      minhasCandidaturas.candidaturas,
      minhasCandidaturas.erro,
    ),
  };
  const ehAutor =
    situacaoDoRodape({ ...listas, recebidas: undefined }).tipo === 'autor';
  const recebidas = useCandidaturasRecebidas(trampo.id, {
    habilitada: ehAutor,
  });
  const situacao = situacaoDoRodape({
    ...listas,
    recebidas: ehAutor ? (recebidas.candidaturas ?? undefined) : undefined,
  });

  const [avisoDaRetirada, setAvisoDaRetirada] = useState<string | undefined>();
  const [visivel, setVisivel] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [valor, setValor] = useState('');
  const [erros, setErros] = useState<ErrosDaFolha>({});
  const [tentativa, setTentativa] = useState(0);
  const aviso = useAvisoDePerfil(meuPerfil);
  // O `isPending` só chega à tela no próximo render: o toque duplo no
  // "Enviar" não pode disparar um segundo `POST`.
  const enviando = useRef(false);
  // Mesmo cuidado no "Retirar candidatura": um `DELETE` só por toque duplo.
  const retirando = useRef(false);

  const enviar = () => {
    if (enviando.current) {
      return;
    }
    const locais = validarCandidatura({ mensagem, valor });
    const centavos = lerValorEmCentavos(valor);
    if (Object.keys(locais).length > 0 || centavos === null) {
      setErros(errosDaFolha(locais));
      setTentativa((n) => n + 1);
      return;
    }
    enviando.current = true;
    setErros({});
    candidatar.mutate(
      { mensagem: mensagem.trim(), valorPropostoCentavos: centavos },
      {
        onSuccess: () => {
          // A invalidação de Minhas candidaturas já terminou: o selo muda
          // junto com o fechamento da folha.
          setVisivel(false);
          setMensagem('');
          setValor('');
          onEnviada();
        },
        onError: (erro) => {
          setTentativa((n) => n + 1);
          const codigo = codigoDoConflito(erro);
          if (codigo === 'perfil_incompleto') {
            aviso.recusar();
            return;
          }
          if (codigo !== null && CONFLITOS_DAS_LISTAS.has(codigo)) {
            void minhasCandidaturas.recarregar();
            void meusTrampos.recarregar();
          }
          if (codigo === 'trampo_nao_aberto') {
            // O rodapé passa a "fechado" se o trampo já não está aberto.
            onRecarregarTrampo();
          }
          const { geral, campos } = chaveDoErro(erro, 'candidatura');
          // O texto do `conflito_de_versao` diz "Atualizamos a lista", e a
          // folha não tem lista: a API já tentou de novo, então vale o
          // "tente de novo em instantes".
          setErros(
            errosDaFolha(
              campos,
              geral === 'conflito_de_versao' ? 'erro_servidor' : geral,
            ),
          );
        },
        onSettled: () => {
          enviando.current = false;
        },
      },
    );
  };

  // A candidatura que o rodapé mostra: o id vem da lista "minha".
  const idDaMinha = (minhasCandidaturas.candidaturas ?? []).find(
    (candidatura) => candidatura.trampoId === trampo.id,
  )?.id;

  const aoRetirar = () => {
    if (retirando.current || idDaMinha === undefined || semConexao) {
      return;
    }
    retirando.current = true;
    setAvisoDaRetirada(undefined);
    retirar.mutate(idDaMinha, {
      // A invalidação de Minhas candidaturas já terminou: o rodapé volta a
      // "Candidatar-se" junto com o toast.
      onSuccess: onRetirada,
      onError: (erro) => {
        if (ehErroDaApi(erro) && erro.status === 404) {
          // Já não existe: a recarga leva o rodapé a "Candidatar-se".
          void minhasCandidaturas.recarregar();
          return;
        }
        if (codigoDoConflito(erro) === 'candidatura_nao_pendente') {
          // Foi respondida antes: o rodapé troca para o selo novo.
          setAvisoDaRetirada(textos.candidatura.respondida);
          void minhasCandidaturas.recarregar();
          return;
        }
        setAvisoDaRetirada(
          textoDeErroDeAcao(erro, textos.candidatura.erroAoRetirar),
        );
      },
      onSettled: () => {
        retirando.current = false;
      },
    });
  };

  const folha: FolhaDeCandidatura = {
    visivel,
    mensagem,
    valor,
    erros,
    enviando: candidatar.isPending,
    perfilIncompleto: aviso.perfilIncompleto,
    tentativa,
    onMudarMensagem: (texto) => {
      setMensagem(texto);
      setErros(({ mensagem: _, ...resto }) => resto);
    },
    onMudarValor: (texto) => {
      setValor(texto);
      setErros(({ valor: _, ...resto }) => resto);
    },
    onSairDoValor: () => {
      if (valor.trim() === '') {
        return;
      }
      const chave = validarCandidatura({
        mensagem,
        valor,
      }).valorPropostoCentavos;
      const centavos = lerValorEmCentavos(valor);
      if (chave !== undefined || centavos === null) {
        setErros((atuais) => ({
          ...atuais,
          valor: textos.erros[chave ?? 'valor_proposto_invalido'],
        }));
        return;
      }
      setValor(centavosParaCampo(centavos));
    },
    onEnviar: enviar,
    onFechar: () => setVisivel(false),
    onCompletarPerfil: () => {
      setVisivel(false);
      router.push('/perfil/editar');
    },
  };

  return (
    <>
      {conversa.falha ? <Aviso variante="erro" texto={conversa.falha} /> : null}
      {avisoDaRetirada ? (
        <Aviso variante="erro" texto={avisoDaRetirada} />
      ) : null}
      <RodapeDoTrampo
        situacao={situacao}
        semConexao={semConexao}
        folha={folha}
        estadoDoConversar={conversa.estado}
        onConversar={conversa.conversar}
        retirar={{
          retirando: retirar.isPending,
          motivo: semConexao ? textos.candidatura.semConexaoMotivo : null,
          onRetirar: aoRetirar,
        }}
        onCandidatar={() => {
          // O perfil pode ter sido completado em outro lugar desde o último
          // 409: a folha reaberta deixa tentar de novo.
          aviso.esquecer();
          setErros(({ geral: _, ...resto }) => resto);
          setVisivel(true);
        }}
        onVerCandidaturas={() =>
          router.push({
            pathname: '/candidaturas/[trampoId]',
            params: { trampoId: trampo.id },
          })
        }
      />
    </>
  );
}
