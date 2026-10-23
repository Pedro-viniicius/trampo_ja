import type { UseMutationResult } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { ehErroDaApi } from '../api/erros';
import type {
  CampoDoAnuncio,
  EdicaoDeAnuncio,
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

const CAMPOS_DO_FORMULARIO = [
  'titulo',
  'descricao',
  'categoria',
  'cidade',
  'valor',
  'prazo',
] as const satisfies readonly (keyof ValoresDoAnuncio)[];

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

/** `id` do anúncio criado; a edição responde 204, sem corpo. */
function idDe(dados: unknown): string | null {
  if (typeof dados !== 'object' || dados === null || !('id' in dados)) {
    return null;
  }
  return typeof dados.id === 'string' ? dados.id : null;
}

export interface ConfiguracaoDoAnuncio<TDados, TEntrada> {
  readonly tipo: TipoDeAnuncio;
  /** Validação local: uma chave de erro por campo da API (`validarTrampo`). */
  readonly validar: (
    valores: ValoresDoAnuncio,
  ) => Partial<Record<string, ChaveDeErro>>;
  /**
   * Corpo do `POST` (ou do `PUT`) a partir dos valores já validados; `null`
   * não envia. Na edição, `versao` é a da base atual (a nova, depois de "Ver
   * versão atual"); ao publicar é `null`.
   */
  readonly montarEntrada: (
    valores: ValoresDoAnuncio,
    versao: number | null,
  ) => TEntrada | null;
  readonly mutacao: UseMutationResult<
    TDados,
    Error,
    TEntrada,
    ContextoDaMutacao
  >;
  /**
   * Liga o modo editar (L2): `undefined` publica; `null` edita, mas a base
   * ainda não chegou (ver `carregamento`); o objeto é a base lida. O hook
   * congela a primeira base que chega: o que a consulta traz depois (foco,
   * reconexão, outro aparelho) não entra por baixo do formulário, senão o
   * `PUT` sairia com a versão nova e sobrescreveria a edição alheia sem
   * conflito. A base só troca em `recarregar`.
   */
  readonly inicial?: BaseDaEdicao | null;
  /** O que a tela mostra enquanto `inicial` é `null`. Padrão: `carregando`. */
  readonly carregamento?: SituacaoDoCarregamento;
  /**
   * Recarrega a base ("Ver versão atual" e "Tentar de novo") e devolve a base
   * nova (`null` se o anúncio não tem base, por exemplo para quem não é o
   * autor). Se rejeitar, o aviso de conflito continua na tela e a base antiga
   * fica.
   */
  readonly recarregar?: () => Promise<BaseDaEdicao | null>;
}

/** Base do formulário de edição: o anúncio como a API devolveu. */
export interface BaseDaEdicao {
  readonly valores: ValoresDoAnuncio;
  /** Versão lida; vai no `PUT` (trava otimista). */
  readonly versao: number;
  /** O anúncio ainda pode ser editado. */
  readonly editavel: boolean;
  /** Por que não pode (`textos.anuncio.motivoEditar*`); a tela cai no texto genérico sem ele. */
  readonly motivoNaoEditavel?: string;
}

/** Situações em que a base ainda não está pronta. */
export type SituacaoDoCarregamento = Exclude<
  EdicaoDeAnuncio['situacao'],
  'pronta'
>;

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
  /** Edição: o `PUT` foi confirmado. A rota avisa e volta. */
  readonly salvo: boolean;
  /**
   * Algum campo difere da base e ainda não foi salvo ou publicado. Voltar
   * para a base original apaga a diferença.
   */
  readonly alterado: boolean;
  /**
   * Para o `beforeRemove` da rota: se há o que perder, abre o diálogo
   * "Descartar alterações?" e devolve `true` (a rota cancela a saída);
   * "Descartar" chama `continuar` e libera a saída. Sem o que perder, ou no
   * modo publicar, devolve `false` e não faz nada.
   */
  readonly perguntarDescarte: (continuar: () => void) => boolean;
}

/**
 * Estado e envio dos formulários Publicar trampo, Ofertar serviço e, no modo
 * editar (L2), Editar trampo e Editar serviço (CA4, CA5, CA6, CA32, D9, D37).
 * O rascunho vive só na memória da tela. A rota passa o validador, a mutação
 * e a montagem do corpo, e cuida da navegação.
 *
 * - A cidade vem do perfil enquanto a pessoa não digitar nela (o perfil pode
 *   chegar depois da primeira digitação). Ao editar, a base é a primeira
 *   `inicial` que chega (congelada; ver `ConfiguracaoDoAnuncio.inicial`).
 * - O prazo ganha a máscara `dd/mm/aaaa` enquanto é digitado; valor e prazo
 *   são reformatados na saída do campo.
 * - Sair com o `PUT` em andamento não pergunta nem sai: espera o resultado.
 * - Toque duplo no envio manda um `POST` (ou `PUT`) só (guarda síncrona,
 *   antes do `isPending` chegar à tela).
 * - `tentativa` sobe a cada envio recusado (validação local ou erro da API),
 *   para a tela levar o foco ao primeiro erro de novo.
 * - 409 `perfil_incompleto`: aviso D9 até o perfil mudar de verdade.
 * - Editar: só o que a pessoa mexeu fica em `edicao`, por cima da base, então
 *   uma base nova (depois do 409 `conflito_de_versao` e de "Ver versão
 *   atual") traz os campos que ela não mexeu e mantém os que ela mexeu. Erro
 *   de campo, falta de conexão e 429 não tocam no rascunho. O 409 é lido do
 *   `ErroDaApi`: `conflito_de_versao` abre o aviso e `trampo_nao_editavel`
 *   desabilita os campos.
 * - Nada do rascunho vai para log, erro ou URL (CA35); a mutação só leva o
 *   corpo ao `PUT`.
 */
export function useFormularioDeAnuncio<TDados, TEntrada>({
  tipo,
  validar,
  montarEntrada,
  mutacao,
  inicial,
  carregamento = 'carregando',
  recarregar,
}: ConfiguracaoDoAnuncio<TDados, TEntrada>): FormularioDeAnuncioEmUso {
  const { online } = useConexao();
  const { categorias } = useCategorias();
  const meuPerfil = useMeuPerfil();
  const aviso = useAvisoDePerfil(meuPerfil);
  const editando = inicial !== undefined;
  // A base que vale: a primeira que chegou, ou a que `recarregar` devolveu
  // por último. `inicial` (viva) só alimenta o primeiro valor.
  const [congelada, setCongelada] = useState<BaseDaEdicao | null>(null);
  let baseDaEdicao = congelada;
  if (baseDaEdicao === null && inicial !== undefined && inicial !== null) {
    baseDaEdicao = inicial;
    setCongelada(inicial);
  }

  // Só o que a pessoa mexeu fica aqui.
  const [edicao, setEdicao] = useState<Partial<ValoresDoAnuncio>>({});
  const [erros, setErros] = useState<ErrosDoAnuncio>({});
  const [publicadoId, setPublicadoId] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [recusadoPelaApi, setRecusadoPelaApi] = useState(false);
  const [descartarVisivel, setDescartarVisivel] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // O `isPending` só chega à tela no próximo render: o toque duplo no
  // "Publicar" não pode disparar um segundo `POST`.
  const enviando = useRef(false);
  const recarregando = useRef(false);
  const saidaPendente = useRef<(() => void) | null>(null);
  const saidaLiberada = useRef(false);

  const base: ValoresDoAnuncio =
    inicial === undefined
      ? { ...VALORES_VAZIOS, cidade: meuPerfil.perfil?.cidade ?? '' }
      : (baseDaEdicao?.valores ?? VALORES_VAZIOS);
  const valores: ValoresDoAnuncio = { ...base, ...edicao };

  const naoEditavel =
    baseDaEdicao !== null && (!baseDaEdicao.editavel || recusadoPelaApi);
  const mexido = CAMPOS_DO_FORMULARIO.some(
    (campo) => edicao[campo] !== undefined && edicao[campo] !== base[campo],
  );
  const alterado = mexido && !salvo && publicadoId === null;
  const perguntaAoSair = useRef(false);
  perguntaAoSair.current = editando && alterado;

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
    if (editando && (baseDaEdicao === null || naoEditavel || salvo)) return;
    const locais = validar(valores);
    if (Object.keys(locais).length > 0) {
      setErros(traduzir(tipo, locais));
      recusarEnvio();
      return;
    }
    const entrada = montarEntrada(valores, baseDaEdicao?.versao ?? null);
    if (entrada === null) return;
    enviando.current = true;
    setErros({});
    setConflito(false);
    mutacao.mutate(entrada, {
      onSuccess: (dados) => {
        if (editando) {
          setSalvo(true);
        } else {
          const id = idDe(dados);
          if (id !== null) setPublicadoId(id);
        }
      },
      onError: (erro) => {
        recusarEnvio();
        if (editando && ehErroDaApi(erro) && erro.status === 409) {
          if (erro.codigo === 'conflito_de_versao') {
            setConflito(true);
            return;
          }
          if (erro.codigo === 'trampo_nao_editavel') {
            setRecusadoPelaApi(true);
            return;
          }
        }
        const { campos, geral } = chaveDoErro(erro, tipo);
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

  /** Recarrega a base; `true` se deu certo. Nunca rejeita. */
  const recarregarBase = async (): Promise<boolean> => {
    if (recarregando.current) return false;
    recarregando.current = true;
    try {
      const nova = await recarregar?.();
      if (nova !== undefined && nova !== null) setCongelada(nova);
      return true;
    } catch {
      return false;
    } finally {
      recarregando.current = false;
    }
  };

  const perguntarDescarte = useCallback((continuar: () => void): boolean => {
    if (saidaLiberada.current || !perguntaAoSair.current) return false;
    // Com o `PUT` em andamento o servidor grava de qualquer jeito: "Descartar"
    // prometeria o que não dá. A saída espera o resultado, sem diálogo (no
    // sucesso a rota volta sozinha; na falha a pessoa segue no formulário).
    if (enviando.current) return true;
    saidaPendente.current = continuar;
    setDescartarVisivel(true);
    return true;
  }, []);

  const situacao: EdicaoDeAnuncio['situacao'] =
    baseDaEdicao === null ? carregamento : 'pronta';

  return {
    publicadoId,
    salvo,
    alterado,
    perguntarDescarte,
    props: {
      tipo,
      valores,
      erros,
      categorias,
      enviando: mutacao.isPending,
      semConexao: !online,
      perfilIncompleto: editando ? null : aviso.perfilIncompleto,
      publicado: publicadoId !== null,
      tentativa,
      ...(editando && {
        edicao: {
          situacao,
          naoEditavel,
          ...(naoEditavel &&
            baseDaEdicao?.motivoNaoEditavel !== undefined && {
              motivoNaoEditavel: baseDaEdicao.motivoNaoEditavel,
            }),
          conflito,
          descartarVisivel,
          onTentarDeNovo: () => {
            void recarregarBase();
          },
          onVerVersaoAtual: () => {
            void recarregarBase().then((recarregou) => {
              if (recarregou) setConflito(false);
            });
          },
          onDispensarConflito: () => setConflito(false),
          onDescartar: () => {
            const continuar = saidaPendente.current;
            saidaPendente.current = null;
            saidaLiberada.current = true;
            setDescartarVisivel(false);
            continuar?.();
          },
          onContinuarEditando: () => {
            saidaPendente.current = null;
            setDescartarVisivel(false);
          },
        },
      }),
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
