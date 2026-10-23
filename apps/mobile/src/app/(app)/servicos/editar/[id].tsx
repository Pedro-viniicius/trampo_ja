import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef } from 'react';
import { ehErroDaApi } from '../../../../api/erros';
import type { EntradaDeServico, Servico } from '../../../../api/tipos';
import { avisarAoVoltar } from '../../../../estado/aviso-de-retorno';
import {
  useEditarServico,
  useServico,
} from '../../../../estado/consultas/anuncios';
import {
  centavosParaCampo,
  lerValorEmCentavos,
} from '../../../../estado/formatacao';
import {
  type BaseDaEdicao,
  type SituacaoDoCarregamento,
  useFormularioDeAnuncio,
} from '../../../../estado/formulario-de-anuncio';
import { useSessao } from '../../../../estado/sessao';
import { validarServico } from '../../../../estado/validacao';
import { FormularioDeAnuncio, type ValoresDoAnuncio } from '../../../../telas';

type EntradaDaEdicao = EntradaDeServico & { readonly versao: number };

/**
 * Corpo do `PUT /servicos/:id`, aparado, com a `versao` da base. Cidade em
 * branco não vai, e a API entende isso como "sem cidade" (D7).
 */
function montarEdicao(
  valores: ValoresDoAnuncio,
  versao: number | null,
): EntradaDaEdicao | null {
  const centavos = lerValorEmCentavos(valores.valor);
  const cidade = valores.cidade.trim();
  if (centavos === null || valores.categoria === null || versao === null) {
    return null;
  }
  return {
    titulo: valores.titulo.trim(),
    descricao: valores.descricao.trim(),
    categoria: valores.categoria,
    precoBaseCentavos: centavos,
    ...(cidade !== '' && { cidade }),
    versao,
  };
}

/**
 * Base do formulário a partir do serviço lido. Sem `versao`, quem pediu não
 * é o autor (a API só manda a versão para ele): `null`, e a tela mostra
 * "não encontrado". Serviço é sempre editável (CA26).
 */
function baseDoServico(servico: Servico | null): BaseDaEdicao | null {
  if (servico === null || servico.versao === undefined) return null;
  return {
    valores: {
      titulo: servico.titulo,
      descricao: servico.descricao,
      categoria: servico.categoria,
      cidade: servico.cidade ?? '',
      valor: centavosParaCampo(servico.precoBaseCentavos),
      prazo: '',
    },
    versao: servico.versao,
    editavel: true,
  };
}

/** O que a tela mostra enquanto não há base. Sem conexão, segue carregando. */
function situacaoSemBase(
  servico: Servico | null,
  erro: Error | null,
): SituacaoDoCarregamento {
  if (servico !== null) return 'nao_encontrado';
  if (erro === null) return 'carregando';
  return ehErroDaApi(erro) && erro.status === 404 ? 'nao_encontrado' : 'erro';
}

/**
 * Editar serviço (CA32, CA35). Ver `useFormularioDeAnuncio`. O rascunho vive
 * só no estado desta rota: nada dele vai para a URL nem para os parâmetros.
 * No sucesso, deixa "Alterações salvas." para o detalhe (só a chave) e
 * volta. Sair com alterações pergunta antes (`beforeRemove`), seja pelo
 * "Voltar" da tela, seja pelo voltar do sistema (botão do Android, gesto do
 * iOS).
 */
export default function RotaDeEditarServico() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idDoServico = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const router = useRouter();
  const navigation = useNavigation();
  const { geracao } = useSessao();
  const consulta = useServico(idDoServico);
  const { recarregar } = consulta;
  const inicial = useMemo(
    () => baseDoServico(consulta.servico),
    [consulta.servico],
  );

  const { props, salvo, alterado, perguntarDescarte } = useFormularioDeAnuncio({
    tipo: 'servico',
    validar: validarServico,
    montarEntrada: montarEdicao,
    mutacao: useEditarServico(idDoServico),
    inicial,
    carregamento: situacaoSemBase(consulta.servico, consulta.erro),
    // O `refetch` do TanStack não rejeita: a falha da recarga precisa
    // rejeitar para o aviso de conflito continuar na tela.
    // Devolve a base nova: é ela que o formulário adota (a viva fica fora).
    recarregar: async () => {
      const resultado = await recarregar();
      if (resultado.isError) throw resultado.error;
      return baseDoServico(resultado.data ?? null);
    },
  });

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({
        pathname: '/servicos/[id]',
        params: { id: idDoServico },
      });
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
