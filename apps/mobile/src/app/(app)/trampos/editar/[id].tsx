import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef } from 'react';
import { ehErroDaApi } from '../../../../api/erros';
import type { EntradaDeTrampo, Trampo } from '../../../../api/tipos';
import { acoesDoAnuncio } from '../../../../estado/acoes-do-anuncio';
import { avisarAoVoltar } from '../../../../estado/aviso-de-retorno';
import {
  useEditarTrampo,
  useTrampo,
} from '../../../../estado/consultas/anuncios';
import {
  centavosParaCampo,
  dataParaCampo,
  lerData,
  lerValorEmCentavos,
} from '../../../../estado/formatacao';
import {
  type BaseDaEdicao,
  type SituacaoDoCarregamento,
  useFormularioDeAnuncio,
} from '../../../../estado/formulario-de-anuncio';
import { useSessao } from '../../../../estado/sessao';
import { validarTrampo } from '../../../../estado/validacao';
import { FormularioDeAnuncio, type ValoresDoAnuncio } from '../../../../telas';

type EntradaDaEdicao = EntradaDeTrampo & { readonly versao: number };

/**
 * Corpo do `PUT /trampos/:id`, aparado, com a `versao` da base. Prazo em
 * branco não vai, e a API entende isso como "sem prazo".
 */
function montarEdicao(
  valores: ValoresDoAnuncio,
  versao: number | null,
): EntradaDaEdicao | null {
  const centavos = lerValorEmCentavos(valores.valor);
  const prazo = lerData(valores.prazo);
  if (centavos === null || valores.categoria === null || versao === null) {
    return null;
  }
  return {
    titulo: valores.titulo.trim(),
    descricao: valores.descricao.trim(),
    categoria: valores.categoria,
    cidade: valores.cidade.trim(),
    valorCentavos: centavos,
    ...(prazo !== null && { prazo }),
    versao,
  };
}

/**
 * Base do formulário a partir do trampo lido. Sem `versao`, quem pediu não
 * é o autor (a API só manda a versão para ele): `null`, e a tela mostra
 * "não encontrado". Só trampo aberto e sem candidaturas é editável (CA25).
 */
function baseDoTrampo(trampo: Trampo | null): BaseDaEdicao | null {
  if (trampo === null || trampo.versao === undefined) return null;
  // A mesma regra da folha "Mais opções" (e o motivo específico da tela).
  const { editar } = acoesDoAnuncio(
    {
      tipo: 'trampo',
      status: trampo.status,
      ...(trampo.candidaturasRecebidas !== undefined && {
        candidaturasRecebidas: trampo.candidaturasRecebidas,
      }),
    },
    true,
  );
  return {
    valores: {
      titulo: trampo.titulo,
      descricao: trampo.descricao,
      categoria: trampo.categoria,
      cidade: trampo.cidade,
      valor: centavosParaCampo(trampo.valorCentavos),
      prazo: trampo.prazo === null ? '' : dataParaCampo(trampo.prazo),
    },
    versao: trampo.versao,
    editavel: editar.disponivel,
    ...(!editar.disponivel && { motivoNaoEditavel: editar.motivo }),
  };
}

/** O que a tela mostra enquanto não há base. Sem conexão, segue carregando. */
function situacaoSemBase(
  trampo: Trampo | null,
  erro: Error | null,
): SituacaoDoCarregamento {
  if (trampo !== null) return 'nao_encontrado';
  if (erro === null) return 'carregando';
  return ehErroDaApi(erro) && erro.status === 404 ? 'nao_encontrado' : 'erro';
}

/**
 * Editar trampo (CA32, CA35). Ver `useFormularioDeAnuncio`. O rascunho vive
 * só no estado desta rota: nada dele vai para a URL nem para os parâmetros.
 * No sucesso, deixa "Alterações salvas." para o detalhe (só a chave) e
 * volta. Sair com alterações pergunta antes (`beforeRemove`), seja pelo
 * "Voltar" da tela, seja pelo voltar do sistema (botão do Android, gesto do
 * iOS).
 */
export default function RotaDeEditarTrampo() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idDoTrampo = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();
  const navigation = useNavigation();
  const { geracao } = useSessao();
  const consulta = useTrampo(idDoTrampo);
  const { recarregar } = consulta;
  const inicial = useMemo(
    () => baseDoTrampo(consulta.trampo),
    [consulta.trampo],
  );

  const { props, salvo, alterado, perguntarDescarte } = useFormularioDeAnuncio({
    tipo: 'trampo',
    validar: validarTrampo,
    montarEntrada: montarEdicao,
    mutacao: useEditarTrampo(idDoTrampo),
    inicial,
    carregamento: situacaoSemBase(consulta.trampo, consulta.erro),
    // O `refetch` do TanStack não rejeita: a falha da recarga precisa
    // rejeitar para o aviso de conflito continuar na tela.
    // Devolve a base nova: é ela que o formulário adota (a viva fica fora).
    recarregar: async () => {
      const resultado = await recarregar();
      if (resultado.isError) throw resultado.error;
      return baseDoTrampo(resultado.data ?? null);
    },
  });

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/trampos/[id]', params: { id: idDoTrampo } });
    }
  };
  const voltarRef = useRef(voltar);
  voltarRef.current = voltar;

  // `usePreventRemove` é o `beforeRemove` que o native-stack entende: com
  // alteração, o gesto de voltar do iOS também é segurado (um `addListener`
  // solto deixaria a tela sair no nativo e ficar no estado do JS). Repetir a
  // ação segurada não pergunta de novo.
  usePreventRemove(alterado, ({ data }) => {
    const continuar = () => navigation.dispatch(data.action);
    if (!perguntarDescarte(continuar)) continuar();
  });

  const avisou = useRef(false);
  useEffect(() => {
    if (!salvo || avisou.current) return;
    avisou.current = true;
    avisarAoVoltar('alteracoes_salvas', geracao());
    voltarRef.current();
  }, [salvo, geracao]);

  return (
    <FormularioDeAnuncio
      {...props}
      // Sem efeito na edição: a tela não mostra o aviso de perfil nem a
      // confirmação de publicado.
      onCompletarPerfil={() => undefined}
      onAgoraNao={voltar}
      onVerPublicado={() => undefined}
      onVoltar={voltar}
    />
  );
}
