import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { bancoDeTeste } from '../../../test/banco-teste.js';

describe('conexão com o banco de teste', () => {
  it('conecta e executa select 1', async () => {
    const { rows } = await sql<{ um: number }>`select 1 as um`.execute(
      bancoDeTeste(),
    );
    expect(rows).toEqual([{ um: 1 }]);
  });

  it('está no banco de teste, não no de desenvolvimento', async () => {
    const { rows } = await sql<{
      banco: string;
    }>`select current_database() as banco`.execute(bancoDeTeste());
    expect(rows[0]?.banco).toBe('trampoja_teste');
  });
});
