import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ehErroDaApi } from '../../../api/erros';
import type { Trampo } from '../../../api/tipos';
import { Aviso, Toast } from '../../../componentes';
import { useConexao } from '../../../estado/conexao';
import { useConversar } from '../../../estado/consultas/abrir-conversa';
import { useMeusTrampos, useTrampo } from '../../../estado/consultas/anuncios';
import { useCategorias } from '../../../estado/consultas/busca';
import {
  useCandidatar,
  useCandidaturasRecebidas,
  useMinhasCandidaturas,
} from '../../../estado/consultas/candidaturas';
import {
  useMeuPerfil,
  usePerfilPublico,
} from '../../../estado/consultas/perfil';
import { chaveDoErro } from '../../../estado/erros';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import {
  centavosParaCampo,
  formatarCentavos,
  formatarData,
  lerValorEmCentavos,
  rotuloDaCategoria,
} from '../../../estado/formatacao';
import { useAvisoDePerfil } from '../../../estado/perfil-incompleto';
import {
  type ListaDoRodape,
  situacaoDoRodape,
} from '../../../estado/rodape-do-trampo';
import { validarCandidatura } from '../../../estado/validacao';
import {
  DetalheDoTrampo,
  type FolhaDeCandidatura,
  RodapeDoTrampo,
  type TrampoParaExibir,
} from '../../../telas';
import { type ChaveDeErro, textos } from '../../../textos/pt-BR';

const CARREGANDO = { situacao: 'carregando' } as const;

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
  const consultaDoAutor = usePerfilPublico(trampo.autorId);
  const autor = estadoDeConsulta(
    { ...consultaDoAutor, dados: consultaDoAutor.perfil },
    (perfil) => perfil,
  );
  const [toast, setToast] = useState<string | null>(null);
  return (
    <DetalheDoTrampo
      estado={estado}
      autor={autor}
      rodape={
        <RodapeDaRota
          trampo={trampo}
          semConexao={semConexao}
          onEnviada={() => setToast(textos.candidatar.enviada)}
          onRecarregarTrampo={onRecarregarTrampo}
        />
      }
      sobreposicao={
        <Toast
          visivel={toast !== null}
          mensagem={toast ?? ''}
          onFechar={() => setToast(null)}
          rotuloFechar={textos.gerais.toastFechar}
        />
      }
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
  onRecarregarTrampo,
}: {
  trampo: Trampo;
  semConexao: boolean;
  /** Candidatura criada: o detalhe mostra o toast. */
  onEnviada: () => void;
  onRecarregarTrampo: () => void;
}) {
  const router = useRouter();
  const meusTrampos = useMeusTrampos();
  const minhasCandidaturas = useMinhasCandidaturas();
  const meuPerfil = useMeuPerfil();
  const candidatar = useCandidatar(trampo.id);
  const conversa = useConversar(trampo.autorId, semConexao);

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

  const [visivel, setVisivel] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [valor, setValor] = useState('');
  const [erros, setErros] = useState<ErrosDaFolha>({});
  const [tentativa, setTentativa] = useState(0);
  const aviso = useAvisoDePerfil(meuPerfil);
  // O `isPending` só chega à tela no próximo render: o toque duplo no
  // "Enviar" não pode disparar um segundo `POST`.
  const enviando = useRef(false);

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
      <RodapeDoTrampo
        situacao={situacao}
        semConexao={semConexao}
        folha={folha}
        estadoDoConversar={conversa.estado}
        onConversar={conversa.conversar}
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
