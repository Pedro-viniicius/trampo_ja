// R5 (V2b): a tela Avaliar e a camada de API guardam, cada uma, a sua cópia do
// limite do comentário e da lista de destaques (as telas não importam de
// `api/`). Este teste falha se as cópias se separarem.
import { DESTAQUES_POR_PAPEL, LIMITE_DO_COMENTARIO } from '../api/avaliacoes';
import type { PapelDoAvaliado } from '../api/tipos';
import {
  destaquesDoPapel,
  LIMITE_DO_COMENTARIO as LIMITE_DA_TELA,
} from '../telas/Avaliar';

describe('Avaliar: a tela e a API combinam', () => {
  it.each<PapelDoAvaliado>(['freela', 'contratante'])(
    'os destaques do papel %s são os mesmos, na mesma ordem',
    (papel) => {
      expect(destaquesDoPapel(papel)).toEqual(DESTAQUES_POR_PAPEL[papel]);
    },
  );

  it('o limite do comentário é o mesmo', () => {
    expect(LIMITE_DA_TELA).toBe(LIMITE_DO_COMENTARIO);
  });
});
