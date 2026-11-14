import { ehErroDaApi } from '../api/erros';
import type {
  AvaliacaoFeita,
  PapelDoAvaliado,
  ResumoDeAvaliacoes,
} from '../api/tipos';
import type { NotaParaExibir } from '../telas/tipos';
import { type ChaveDeErro, textos } from '../textos/pt-BR';
import { chaveDoErro } from './erros';

/**
 * Nota (média e total) de uma conta no papel pedido (CA97), no formato das
 * telas. Sem resumo (ainda não chegou, ou o pedido falhou), sem avaliações
 * (`total` 0, `media` nula): `null`, e a tela não mostra nota.
 */
export function notaDoResumo(
  resumo: ResumoDeAvaliacoes | undefined,
  papel: PapelDoAvaliado,
): NotaParaExibir | null {
  const doPapel =
    resumo === undefined
      ? undefined
      : papel === 'freela'
        ? resumo.comoFreela
        : resumo.comoContratante;
  if (doPapel === undefined || doPapel.media === null || doPapel.total <= 0) {
    return null;
  }
  return { media: doPapel.media, total: doPapel.total };
}

/**
 * Papel de `?papel=` na URL. Ausente, repetido ou desconhecido, vale `freela`
 * (quem é avaliado pelo que faz; o link de um contratante manda `contratante`).
 */
export function papelDaUrl(
  valor: string | readonly string[] | undefined,
): PapelDoAvaliado {
  return valor === 'contratante' ? 'contratante' : 'freela';
}

/** Erros do favoritar que têm texto próprio; os demais usam o texto geral. */
const ERROS_DO_FAVORITO: ReadonlySet<ChaveDeErro> = new Set<ChaveDeErro>([
  'limite_de_favoritos',
  'favorito_invalido',
  'sem_conexao',
  'muitas_tentativas_acao',
]);

/**
 * Texto de um favoritar ou desfavoritar que falhou (CA98): o limite de 200, a
 * conta que é a própria pessoa, a falta de conexão, o excesso de pedidos e o
 * 404 (sem vínculo com a pessoa) têm texto próprio; o resto (5xx, erro
 * desconhecido) é "Não foi possível atualizar a equipe favorita". Nunca
 * `erro.message`.
 */
export function textoDoErroDoFavorito(erro: unknown): string {
  if (ehErroDaApi(erro) && erro.status === 404) {
    return textos.favoritos.semVinculo;
  }
  const { geral } = chaveDoErro(erro, 'nenhum');
  return geral !== undefined && ERROS_DO_FAVORITO.has(geral)
    ? textos.erros[geral]
    : textos.favoritos.erro;
}

/**
 * `notaDada` dos cartões "Avaliar" (CA96): `undefined` = não dá para avaliar
 * (ou ainda não se sabe), `null` = pode avaliar e ainda não avaliou, número =
 * já avaliou. Só um trampo `avaliavel` (encerrado, com candidatura aceita)
 * chega a "Avaliar", e só quando a consulta de `feitas` já cobre a lista
 * (`completa`): a ausência de uma avaliação só prova algo depois disso.
 */
export function notaDada(
  avaliavel: boolean,
  feita: AvaliacaoFeita | undefined,
  completa: boolean,
): number | null | undefined {
  if (!avaliavel) {
    return undefined;
  }
  if (feita !== undefined) {
    return feita.nota;
  }
  return completa ? null : undefined;
}
