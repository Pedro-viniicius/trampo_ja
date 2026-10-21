import { useRouter } from 'expo-router';
import type { EntradaDeServico } from '../../../api/tipos';
import { useOfertarServico } from '../../../estado/consultas/anuncios';
import { lerValorEmCentavos } from '../../../estado/formatacao';
import { useFormularioDeAnuncio } from '../../../estado/formulario-de-anuncio';
import { validarServico } from '../../../estado/validacao';
import { FormularioDeAnuncio, type ValoresDoAnuncio } from '../../../telas';

/** Corpo do `POST /servicos`, aparado; cidade em branco não vai (D7). */
function montarServico(valores: ValoresDoAnuncio): EntradaDeServico | null {
  const centavos = lerValorEmCentavos(valores.valor);
  const cidade = valores.cidade.trim();
  if (centavos === null || valores.categoria === null) return null;
  return {
    titulo: valores.titulo.trim(),
    descricao: valores.descricao.trim(),
    categoria: valores.categoria,
    precoBaseCentavos: centavos,
    ...(cidade !== '' && { cidade }),
  };
}

/** Ofertar serviço (CA6, CA5, D9). Ver `useFormularioDeAnuncio`. */
export default function RotaDeOfertarServico() {
  const router = useRouter();
  const { props, publicadoId } = useFormularioDeAnuncio({
    tipo: 'servico',
    validar: validarServico,
    montarEntrada: montarServico,
    mutacao: useOfertarServico(),
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
            pathname: '/servicos/[id]',
            params: { id: publicadoId },
          });
        }
      }}
      onVoltar={voltar}
    />
  );
}
