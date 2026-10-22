import type { Mensagem, PerfilPublico, ResumoDeConversa } from '../api/tipos';
import type { ConversaParaExibir, MensagemParaExibir } from '../telas/tipos';
import type { MapaPorId } from './consultas/anuncios';
import { formatarHoraDaMensagem } from './formatacao';

/**
 * Estado puro das conversas (ADR-004): validação do texto, mensagens em envio
 * (pendentes) e o que as telas mostram. Nada aqui registra nem devolve em erro
 * o texto de uma mensagem (CA15).
 */

/** Limite da API: 1 a 2000 pontos de código, depois de aparar. */
export const MAXIMO_DA_MENSAGEM = 2000;

/**
 * Texto pronto para `POST /conversas/:id/mensagens` (aparado), ou `null` se a
 * API vai recusar: vazio ou só espaços, acima de 2000 pontos de código (um
 * emoji conta 1) ou com caractere nulo. Mesma regra do domínio da API.
 */
export function textoEnviavel(texto: string): string | null {
  if (texto.includes('\0')) {
    return null;
  }
  const aparado = texto.trim();
  if (aparado === '' || Array.from(aparado).length > MAXIMO_DA_MENSAGEM) {
    return null;
  }
  return aparado;
}

/** Mensagem minha que ainda não veio no `GET` das mensagens. */
export interface Pendente {
  /** Chave local da lista: `local-<n>`. Nunca o texto. */
  readonly chave: string;
  /** Já aparado (`textoEnviavel`). */
  readonly texto: string;
  readonly situacao: 'enviando' | 'enviada' | 'falhou';
  /** Id devolvido pelo 201; `null` com o envio no ar ou falho. */
  readonly id: string | null;
  /** ISO 8601 do 201; `null` até lá. */
  readonly enviadaEm: string | null;
  /**
   * Id da última confirmada quando a pendente foi criada (ou da última
   * reconciliação em que ela ficou sem par); `null` sem nenhuma. A mensagem
   * dela só pode estar nas confirmadas depois deste id. É um id, não uma
   * posição, porque o cache corta as mais antigas (S1) e as posições andam.
   */
  readonly ancora: string | null;
}

/**
 * Pendente nova, em `enviando`. `sequencia` é um contador da tela que nunca
 * se repete; `confirmadas` é a lista que a tela tem naquele momento (a
 * âncora é a última dela).
 */
export function criarPendente(
  sequencia: number,
  texto: string,
  confirmadas: readonly Mensagem[],
): Pendente {
  return {
    chave: `local-${sequencia}`,
    texto,
    situacao: 'enviando',
    id: null,
    enviadaEm: null,
    ancora: ultimoId(confirmadas),
  };
}

function ultimoId(confirmadas: readonly Mensagem[]): string | null {
  return confirmadas[confirmadas.length - 1]?.id ?? null;
}

/**
 * Primeira posição de `confirmadas` depois da âncora. Âncora fora da lista
 * (o corte do cache já a tirou, S1) conta como anterior a todas: o corte só
 * tira as mais antigas.
 */
function inicioDepoisDa(
  ancora: string | null,
  confirmadas: readonly Mensagem[],
): number {
  if (ancora === null) {
    return 0;
  }
  const posicao = confirmadas.findIndex((mensagem) => mensagem.id === ancora);
  return posicao < 0 ? 0 : posicao + 1;
}

function ehMinha(mensagem: Mensagem, outroId: string): boolean {
  // ADR-003: a mensagem não traz "minha"; é minha a que não é do outro.
  return mensagem.autorId !== outroId;
}

/**
 * Tira das pendentes as que já chegaram ao servidor, sem idempotência na API
 * (D21). Rode a cada resposta do `GET` e guarde o resultado como as novas
 * pendentes, na ordem de criação:
 *
 * 1. sai a pendente cujo `id` já veio nas confirmadas;
 * 2. a pendente sem `id` (envio no ar ou falho) sai se, depois da `ancora`,
 *    houver uma confirmada minha com o mesmo texto aparado, que não seja o
 *    `id` de outra pendente e não tenha sido casada antes. Cada confirmada
 *    casa uma pendente só. O casamento é em duas passadas: primeiro as
 *    pendentes em `enviando`, depois as em `falhou`, cada passada na ordem de
 *    criação. O POST no ar vai chegar; o que falhou talvez não. Se a que
 *    falhou casasse primeiro a mensagem da que está no ar, sumiria como
 *    entregue sem ter chegado (R3/S2).
 *
 * A pendente sem `id` que fica volta com a `ancora` na última confirmada:
 * o que ela não casou agora já é de outra pendente (casada ou com aquele
 * `id`), e sem isso a próxima chamada, que não vê mais as pendentes que
 * saíram, casaria de novo a mesma confirmada e daria por entregue uma
 * mensagem que falhou. As que ficam voltam na ordem de criação.
 *
 * O cursor vem só do GET, nunca do id do 201: pularia mensagens do outro.
 */
export function reconciliar(
  confirmadas: readonly Mensagem[],
  pendentes: readonly Pendente[],
  outroId: string,
): Pendente[] {
  const idsConfirmados = new Set(confirmadas.map((mensagem) => mensagem.id));
  const idsDePendentes = new Set(
    pendentes.flatMap((pendente) =>
      pendente.id === null ? [] : [pendente.id],
    ),
  );
  const casadas = new Set<number>();
  // Pendentes (pela posição) que já chegaram ao servidor.
  const chegaram = new Set<number>();

  const casarPorTexto = (emEnvio: boolean) => {
    pendentes.forEach((pendente, posicao) => {
      if (
        pendente.id !== null ||
        (pendente.situacao !== 'falhou') !== emEnvio
      ) {
        return;
      }
      const texto = pendente.texto.trim();
      const inicio = inicioDepoisDa(pendente.ancora, confirmadas);
      const indice = confirmadas.findIndex(
        (mensagem, i) =>
          i >= inicio &&
          !casadas.has(i) &&
          ehMinha(mensagem, outroId) &&
          !idsDePendentes.has(mensagem.id) &&
          mensagem.texto.trim() === texto,
      );
      if (indice >= 0) {
        casadas.add(indice);
        chegaram.add(posicao);
      }
    });
  };
  casarPorTexto(true);
  casarPorTexto(false);

  const restantes: Pendente[] = [];
  pendentes.forEach((pendente, posicao) => {
    if (pendente.id !== null) {
      if (!idsConfirmados.has(pendente.id)) {
        restantes.push(pendente);
      }
      return;
    }
    if (chegaram.has(posicao)) {
      return;
    }
    const ancora = ultimoId(confirmadas);
    restantes.push(
      ancora === null || ancora === pendente.ancora
        ? pendente
        : { ...pendente, ancora },
    );
  });
  return restantes;
}

function horaOuNulo(iso: string | null, agora: Date): string | null {
  return iso === null ? null : formatarHoraDaMensagem(iso, agora);
}

/**
 * Mensagens da tela da conversa: as confirmadas na ordem de envio (como vêm
 * do GET), com a chave igual ao `id`, e depois as pendentes que ainda não
 * chegaram, na ordem de criação, com a chave local (`local-<n>`). Passa as
 * pendentes por `reconciliar` antes, para a mensagem não aparecer duas vezes
 * entre o GET e a tela guardar as pendentes reconciliadas.
 */
export function mensagensParaExibir(
  confirmadas: readonly Mensagem[],
  pendentes: readonly Pendente[],
  outroId: string,
  agora: Date,
): MensagemParaExibir[] {
  return [
    ...confirmadas.map(
      (mensagem): MensagemParaExibir => ({
        chave: mensagem.id,
        minha: ehMinha(mensagem, outroId),
        texto: mensagem.texto,
        horaFormatada: formatarHoraDaMensagem(mensagem.enviadaEm, agora),
        situacao: 'enviada',
      }),
    ),
    ...reconciliar(confirmadas, pendentes, outroId).map(
      (pendente): MensagemParaExibir => ({
        chave: pendente.chave,
        minha: true,
        texto: pendente.texto,
        horaFormatada: horaOuNulo(pendente.enviadaEm, agora),
        situacao: pendente.situacao,
      }),
    ),
  ];
}

/**
 * Item da lista de conversas. `nome` é `null` com o perfil em 404 ou ainda
 * carregando (a tela mostra "Perfil indisponível"); `previa` é `null` sem
 * mensagens ("Nenhuma mensagem ainda") e vem numa linha só. A hora é a da
 * última mensagem ou, sem ela, a da criação da conversa.
 */
export function conversaParaExibir(
  resumo: ResumoDeConversa,
  perfis: MapaPorId<PerfilPublico>,
  agora: Date,
): ConversaParaExibir {
  const ultima = resumo.ultimaMensagem;
  return {
    id: resumo.conversaId,
    nome: perfis.get(resumo.outroUsuarioId)?.nome ?? null,
    previa: ultima === null ? null : ultima.texto.replace(/\s+/g, ' ').trim(),
    horaFormatada: formatarHoraDaMensagem(
      ultima?.enviadaEm ?? resumo.criadaEm,
      agora,
    ),
  };
}
