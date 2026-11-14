import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  notaDoResumo,
  papelDaUrl,
  textoDoErroDoFavorito,
} from '../../../estado/avaliacoes-para-exibir';
import { useConexao } from '../../../estado/conexao';
import {
  useDefinirFavorito,
  useFavoritos,
  useResumosDeAvaliacoes,
} from '../../../estado/consultas/avaliacoes';
import { usePerfilPublico } from '../../../estado/consultas/perfil';
import { estadoDeConsulta } from '../../../estado/estado-de-bloco';
import { useModo } from '../../../estado/modo';
import {
  type FavoritoDoPerfil,
  Perfil,
  type PerfilParaExibir,
} from '../../../telas';

/**
 * Perfil de outra pessoa: só leitura, sem editar nem sair. A nota é a do papel
 * de `?papel=` (`freela` se faltar; o detalhe do trampo manda `contratante`),
 * e "Favoritar" só aparece num perfil de freela de outra pessoa (`?propria=1`
 * marca o perfil da própria conta), no modo contratante e depois que a equipe
 * favorita carregou (CA97, CA98, R4). A API é quem decide o vínculo: sem ele,
 * o pedido volta atrás e a tela diz que só dá para favoritar quem já trabalhou
 * ou conversou com a conta.
 */
export default function RotaDoPerfilPublico() {
  const {
    contaId,
    papel: papelDaRota,
    propria,
  } = useLocalSearchParams<{
    contaId: string | string[];
    papel?: string | string[];
    propria?: string | string[];
  }>();
  const id = Array.isArray(contaId) ? (contaId[0] ?? '') : (contaId ?? '');
  const papel = papelDaUrl(papelDaRota);
  const { modo } = useModo();
  const ehPropria = propria === '1';
  const router = useRouter();
  const { online } = useConexao();
  const consulta = usePerfilPublico(id);
  const { resumos } = useResumosDeAvaliacoes([id]);
  const nota = notaDoResumo(resumos.get(id), papel);
  const { favoritos, ehFavorito } = useFavoritos();
  const { definir, definindo } = useDefinirFavorito();
  const [erroDoFavorito, setErroDoFavorito] = useState<string | undefined>();

  const estado = estadoDeConsulta(
    { ...consulta, dados: consulta.perfil },
    (perfil): PerfilParaExibir => ({
      nome: perfil.nome,
      cidade: perfil.cidade,
      descricao: perfil.descricao,
      habilidades: perfil.habilidades,
    }),
  );

  const favorito: FavoritoDoPerfil | null =
    papel === 'freela' &&
    modo === 'contratante' &&
    !ehPropria &&
    favoritos !== null
      ? {
          ativo: ehFavorito(id),
          salvando: definindo,
          erro: erroDoFavorito,
          onAlternar: (querFavoritar) => {
            setErroDoFavorito(undefined);
            void definir(id, querFavoritar).then((resultado) => {
              if (resultado.tipo === 'erro') {
                setErroDoFavorito(textoDoErroDoFavorito(resultado.erro));
              }
            });
          },
        }
      : null;

  return (
    <Perfil
      proprio={false}
      estado={estado}
      semConexao={!online}
      nota={nota}
      onVerAvaliacoes={() =>
        router.push({
          pathname: '/avaliacoes/[contaId]',
          params: { contaId: id, papel },
        })
      }
      favorito={favorito}
      onVoltar={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }}
    />
  );
}
