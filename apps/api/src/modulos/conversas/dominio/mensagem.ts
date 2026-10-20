import { ErroDeValidacao } from '../../../compartilhado/dominio/erros.js';
import { contemCaractereNulo } from '../../../compartilhado/dominio/texto.js';

/**
 * Limite do texto da mensagem (plano, "Limites de domínio"): 1 a 2000
 * caracteres, sem contar os espaços nas pontas.
 */
export const LIMITES_DA_MENSAGEM = Object.freeze({
  texto: Object.freeze({ min: 1, max: 2000 }),
});

/**
 * Mensagem de uma conversa (CA12). O `texto` é dado pessoal (LGPD): nunca vai
 * para log nem para mensagem de erro.
 */
export interface Mensagem {
  readonly id: string;
  readonly conversaId: string;
  readonly autorId: string;
  /** Já aparado nas pontas. */
  readonly texto: string;
  readonly enviadaEm: Date;
}

export interface ContextoDaMensagem {
  readonly id: string;
  readonly conversaId: string;
  readonly autorId: string;
  readonly agora: Date;
}

/**
 * Cria a mensagem a partir do texto como chegou da borda (`unknown`).
 * Ausente, nulo ou só espaços → `obrigatorio`; acima do limite → `tamanho`;
 * outro tipo ou caractere nulo → `invalido`. O erro só leva o nome do campo,
 * nunca o texto (CA15).
 */
export function criarMensagem(
  texto: unknown,
  contexto: ContextoDaMensagem,
): Mensagem {
  if (texto === undefined || texto === null) {
    throw ErroDeValidacao.doCampo('texto', 'obrigatorio');
  }
  if (typeof texto !== 'string' || contemCaractereNulo(texto)) {
    throw ErroDeValidacao.doCampo('texto', 'invalido');
  }
  const aparado = texto.trim();
  if (aparado === '') {
    throw ErroDeValidacao.doCampo('texto', 'obrigatorio');
  }
  // Conta pontos de código, não unidades UTF-16 (um emoji conta como 1), como
  // o `char_length` do Postgres no `check` da tabela.
  const tamanho = Array.from(aparado).length;
  if (
    tamanho < LIMITES_DA_MENSAGEM.texto.min ||
    tamanho > LIMITES_DA_MENSAGEM.texto.max
  ) {
    throw ErroDeValidacao.doCampo('texto', 'tamanho');
  }
  return Object.freeze({
    id: contexto.id,
    conversaId: contexto.conversaId,
    autorId: contexto.autorId,
    texto: aparado,
    enviadaEm: new Date(contexto.agora.getTime()),
  });
}
