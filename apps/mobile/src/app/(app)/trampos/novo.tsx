import { useRouter } from 'expo-router';
import type { EntradaDeTrampo } from '../../../api/tipos';
import { usePublicarTrampo } from '../../../estado/consultas/anuncios';
import { lerData, lerValorEmCentavos } from '../../../estado/formatacao';
import { useFormularioDeAnuncio } from '../../../estado/formulario-de-anuncio';
import { validarTrampo } from '../../../estado/validacao';
import { FormularioDeAnuncio, type ValoresDoAnuncio } from '../../../telas';

/** Corpo do `POST /trampos`, aparado; prazo em branco não vai. */
function montarTrampo(valores: ValoresDoAnuncio): EntradaDeTrampo | null {
  const centavos = lerValorEmCentavos(valores.valor);
  const prazo = lerData(valores.prazo);
  if (centavos === null || valores.categoria === null) return null;
  return {
    titulo: valores.titulo.trim(),
    descricao: valores.descricao.trim(),
    categoria: valores.categoria,
    cidade: valores.cidade.trim(),
    valorCentavos: centavos,
    ...(prazo !== null && { prazo }),
  };
}

/** Publicar trampo (CA4, CA5, D9). Ver `useFormularioDeAnuncio`. */
export default function RotaDePublicarTrampo() {
  const router = useRouter();
  const { props, publicadoId } = useFormularioDeAnuncio({
    tipo: 'trampo',
    validar: validarTrampo,
    montarEntrada: montarTrampo,
    mutacao: usePublicarTrampo(),
  });

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <FormularioDeAnuncio
      {...props}
      // Sem `completar=1`: ao salvar, o Editar perfil volta a este
      // formulário, com o rascunho.
      onCompletarPerfil={() => router.push('/perfil/editar')}
      onAgoraNao={voltar}
      onVerPublicado={() => {
        if (publicadoId !== null) {
          router.replace({
            pathname: '/trampos/[id]',
            params: { id: publicadoId },
          });
        }
      }}
      onVoltar={voltar}
    />
  );
}
