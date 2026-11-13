import { ErroDeRegra } from '../../../compartilhado/dominio/erros.js';

/** Teto de favoritos por conta (CA92): o 201º responde `limite_de_favoritos`. */
export const LIMITE_DE_FAVORITOS = 200;

/**
 * Conta da equipe favorita de outra (CA92). A lista é privada do dono: a
 * pessoa favoritada não é avisada nem a vê.
 */
export interface Favorito {
  readonly donoId: string;
  readonly favoritoId: string;
  readonly criadoEm: Date;
}

/**
 * Cria o favorito. Os ids chegam válidos (uuid); a comparação é em
 * minúsculas, como o banco guarda. Favoritar a si mesmo →
 * `ErroDeRegra('favorito_invalido')` (409).
 */
export function criarFavorito(
  donoId: string,
  favoritoId: string,
  agora: Date,
): Favorito {
  const dono = donoId.toLowerCase();
  const favorito = favoritoId.toLowerCase();
  if (dono === favorito) {
    throw new ErroDeRegra('favorito_invalido');
  }
  return Object.freeze({
    donoId: dono,
    favoritoId: favorito,
    criadoEm: new Date(agora.getTime()),
  });
}
