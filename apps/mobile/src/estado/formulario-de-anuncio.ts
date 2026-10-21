import type { UseMutationResult } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type {
  CampoDoAnuncio,
  ErrosDoAnuncio,
  PropsDoFormularioDeAnuncio,
  TipoDeAnuncio,
  ValoresDoAnuncio,
} from '../telas/tipos';
import { type ChaveDeErro, textos } from '../textos/pt-BR';
import { useConexao } from './conexao';
import type { ContextoDaMutacao } from './consultas/anuncios';
import { useCategorias } from './consultas/busca';
import { useMeuPerfil } from './consultas/perfil';
import { chaveDoErro } from './erros';
import {
  centavosParaCampo,
  dataParaCampo,
  lerData,
  lerValorEmCentavos,
  mascararData,
} from './formatacao';
import { useAvisoDePerfil } from './perfil-incompleto';
import { LIMITES } from './validacao';

const VALORES_VAZIOS: ValoresDoAnuncio = {
  titulo: '',
  descricao: '',
  categoria: null,
  cidade: '',
  valor: '',
  prazo: '',
};

const CAMPOS_DE_TEXTO = [
  'titulo',
  'descricao',
  'categoria',
  'cidade',
  'prazo',
] as const;

/** Campo da API que corresponde ao campo `valor` da tela. */
const CAMPO_DO_VALOR: Record<TipoDeAnuncio, string> = {
  trampo: 'valorCentavos',
  servico: 'precoBaseCentavos',
};

/** Chaves de erro (locais ou do 400) -> texto por campo da tela. */
function traduzir(
  tipo: TipoDeAnuncio,
  campos: Partial<Record<string, ChaveDeErro>>,
  geral?: ChaveDeErro,
): ErrosDoAnuncio {
  const erros: { -readonly [K in keyof ErrosDoAnuncio]: ErrosDoAnuncio[K] } =
    {};
  for (const campo of CAMPOS_DE_TEXTO) {
    const chave = campos[campo];
    if (chave !== undefined) erros[campo] = textos.erros[chave];
  }
  const chaveDoValor = campos[CAMPO_DO_VALOR[tipo]];
  if (chaveDoValor !== undefined) erros.valor = textos.erros[chaveDoValor];
  if (geral !== undefined) erros.geral = textos.erros[geral];
  return erros;
}

export interface ConfiguracaoDoAnuncio<TDados, TEntrada> {
  readonly tipo: TipoDeAnuncio;
  /** Validação local: uma chave de erro por campo da API (`validarTrampo`). */
  readonly validar: (
    valores: ValoresDoAnuncio,
  ) => Partial<Record<string, ChaveDeErro>>;
  /** Corpo do `POST` a partir dos valores já validados; `null` não envia. */
  readonly montarEntrada: (valores: ValoresDoAnuncio) => TEntrada | null;
  readonly mutacao: UseMutationResult<
    TDados,
    Error,
    TEntrada,
    ContextoDaMutacao
  >;
}

/** O que a rota ainda decide: a navegação. */
export type PropsDaRota =
  | 'onCompletarPerfil'
  | 'onAgoraNao'
  | 'onVerPublicado'
  | 'onVoltar';

export interface FormularioDeAnuncioEmUso {
  readonly props: Omit<PropsDoFormularioDeAnuncio, PropsDaRota>;
  /** Id do anúncio criado, depois da confirmação. */
  readonly publicadoId: string | null;
}

/**
 * Estado e envio dos formulários Publicar trampo e Ofertar serviço (CA4, CA5,
 * CA6, D9). O rascunho vive só na memória da tela. A rota passa o validador,
 * a mutação e a montagem do corpo, e cuida da navegação.
 *
 * - A cidade vem do perfil enquanto a pessoa não digitar nela (o perfil pode
 *   chegar depois da primeira digitação).
 * - O prazo ganha a máscara `dd/mm/aaaa` enquanto é digitado; valor e prazo
 *   são reformatados na saída do campo.
 * - Toque duplo no envio manda um `POST` só (guarda síncrona, antes do
 *   `isPending` chegar à tela).
 * - `tentativa` sobe a cada envio recusado (validação local ou erro da API),
 *   para a tela levar o foco ao primeiro erro de novo.
 * - 409 `perfil_incompleto`: aviso D9 até o perfil mudar de verdade.
 */
export function useFormularioDeAnuncio<
  TDados extends { id: string },
  TEntrada,
>({
  tipo,
  validar,
  montarEntrada,
  mutacao,
}: ConfiguracaoDoAnuncio<TDados, TEntrada>): FormularioDeAnuncioEmUso {
  const { online } = useConexao();
  const { categorias } = useCategorias();
  const meuPerfil = useMeuPerfil();
  const aviso = useAvisoDePerfil(meuPerfil);

  // Só o que a pessoa mexeu fica aqui.
  const [edicao, setEdicao] = useState<Partial<ValoresDoAnuncio>>({});
  const [erros, setErros] = useState<ErrosDoAnuncio>({});
  const [publicadoId, setPublicadoId] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // O `isPending` só chega à tela no próximo render: o toque duplo no
  // "Publicar" não pode disparar um segundo `POST`.
  const enviando = useRef(false);

  const valores: ValoresDoAnuncio = {
    ...VALORES_VAZIOS,
    cidade: meuPerfil.perfil?.cidade ?? '',
    ...edicao,
  };

  const recusarEnvio = () => setTentativa((n) => n + 1);

  const mudar = (parcial: Partial<ValoresDoAnuncio>, campo: CampoDoAnuncio) => {
    setEdicao((atual) => ({ ...atual, ...parcial }));
    setErros(({ [campo]: _, geral: __, ...resto }) => resto);
  };

  const sairDoCampo = (campo: CampoDoAnuncio) => {
    const reformatado: Partial<ValoresDoAnuncio> = {};
    if (campo === 'valor') {
      const centavos = lerValorEmCentavos(valores.valor);
      if (centavos !== null && centavos <= LIMITES.centavos.max) {
        reformatado.valor = centavosParaCampo(centavos);
      }
    }
    if (campo === 'prazo') {
      const iso = lerData(valores.prazo);
      if (iso !== null) reformatado.prazo = dataParaCampo(iso);
    }
    if (Object.keys(reformatado).length > 0) {
      setEdicao((atual) => ({ ...atual, ...reformatado }));
    }
    const locais = traduzir(tipo, validar({ ...valores, ...reformatado }));
    setErros(({ [campo]: _, ...resto }) =>
      locais[campo] === undefined
        ? resto
        : { ...resto, [campo]: locais[campo] },
    );
  };

  const enviar = () => {
    if (!online || enviando.current) return;
    const locais = validar(valores);
    if (Object.keys(locais).length > 0) {
      setErros(traduzir(tipo, locais));
      recusarEnvio();
      return;
    }
    const entrada = montarEntrada(valores);
    if (entrada === null) return;
    enviando.current = true;
    setErros({});
    mutacao.mutate(entrada, {
      onSuccess: (criado) => setPublicadoId(criado.id),
      onError: (erro) => {
        const { campos, geral } = chaveDoErro(erro, tipo);
        recusarEnvio();
        if (geral === 'perfil_incompleto') {
          aviso.recusar();
          setErros(traduzir(tipo, campos));
          return;
        }
        setErros(traduzir(tipo, campos, geral));
      },
      onSettled: () => {
        enviando.current = false;
      },
    });
  };

  return {
    publicadoId,
    props: {
      tipo,
      valores,
      erros,
      categorias,
      enviando: mutacao.isPending,
      semConexao: !online,
      perfilIncompleto: aviso.perfilIncompleto,
      publicado: publicadoId !== null,
      tentativa,
      onMudar: (campo, texto) =>
        mudar(
          { [campo]: campo === 'prazo' ? mascararData(texto) : texto },
          campo,
        ),
      onMudarCategoria: (categoria) => mudar({ categoria }, 'categoria'),
      onSairDoCampo: sairDoCampo,
      onEnviar: enviar,
      onPublicarOutro: () => {
        mutacao.reset();
        setEdicao({});
        setErros({});
        setPublicadoId(null);
      },
    },
  };
}
