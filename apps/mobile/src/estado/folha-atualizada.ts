import type { PropsDaFolhaDeAcoes } from '../telas/tipos';
import { textos } from '../textos/pt-BR';
import type { ConflitoDaFolha } from './acoes-do-anuncio';

/**
 * Folha "Mais opções" depois do 409 `trampo_nao_aberto` (CA61, spec 3.4),
 * pelo sinal `conflito` de `useAcoesDoAnuncio`. A folha continua aberta e:
 *
 * - `relendo`: as ações ficam desabilitadas (`atualizando`) e o aviso é o do
 *   409, que o hook já pôs em `erro`;
 * - `relido`: o aviso diz que o anúncio mudou e as opções foram atualizadas
 *   (as ações já seguem o dado novo, pelo `anuncioAtual`);
 * - `falhou`: fica o aviso do 409; afirmar "Atualizamos as opções" com o
 *   dado velho na tela enganaria.
 *
 * Sem `conflito`, a folha passa sem mudança.
 */
export function folhaDepoisDoConflito(
  folha: PropsDaFolhaDeAcoes,
  conflito: ConflitoDaFolha | null,
): PropsDaFolhaDeAcoes {
  if (conflito === 'relendo') {
    return { ...folha, atualizando: true };
  }
  if (conflito === 'relido') {
    return { ...folha, erro: textos.anuncio.folhaAtualizada };
  }
  return folha;
}
