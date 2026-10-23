/**
 * Apoio dos testes de QA da L3 (endurecimento): gravação direta de linhas
 * "órfãs" (escrita em voo depois da exclusão da conta), lápides e contagens.
 *
 * Tudo vai direto no banco de teste, sem passar pelo domínio: é a forma de
 * simular uma escrita que chegou depois da exclusão.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';
import { TABELAS } from './apoio.js';

/** As tabelas de sempre mais a lápide (`contas_excluidas`). */
export const TABELAS_L3 = [...TABELAS, 'contas_excluidas'];

export async function limparBancoL3(): Promise<void> {
  await truncarTabelas(TABELAS_L3);
}

export const MINUTO = 60_000;

export async function trampoDireto(
  autorId: string,
  titulo = 'Trampo gravado direto',
): Promise<string> {
  const id = randomUUID();
  await sql`insert into trampos (id, autor_id, titulo, descricao, categoria,
      cidade, cidade_normalizada, texto_busca, valor_centavos, status, versao,
      criado_em)
    values (${id}::uuid, ${autorId}::uuid, ${titulo}, 'Descrição direta',
      'reformas', 'Lavras', 'lavras', 'busca', 10000, 'aberto', 1, now())`.execute(
    bancoDeTeste(),
  );
  return id;
}

export async function candidaturaDireta(
  trampoId: string,
  freelancerId: string,
  status: 'pendente' | 'aceita' | 'recusada' = 'pendente',
): Promise<string> {
  const id = randomUUID();
  await sql`insert into candidaturas (id, trampo_id, freelancer_id, mensagem,
      valor_proposto_centavos, status, criada_em)
    values (${id}::uuid, ${trampoId}::uuid, ${freelancerId}::uuid,
      'Mensagem direta', 9000, ${status}, now())`.execute(bancoDeTeste());
  return id;
}

export async function servicoDireto(autorId: string): Promise<string> {
  const id = randomUUID();
  await sql`insert into servicos (id, autor_id, titulo, descricao, categoria,
      texto_busca, preco_base_centavos, status, criado_em)
    values (${id}::uuid, ${autorId}::uuid, 'Serviço direto', 'Descrição',
      'reformas', 'busca', 5000, 'ativo', now())`.execute(bancoDeTeste());
  return id;
}

export async function perfilDireto(contaId: string): Promise<void> {
  await sql`insert into perfis (conta_id, nome, cidade, cidade_normalizada,
      habilidades, atualizado_em)
    values (${contaId}::uuid, 'Perfil direto', 'Lavras', 'lavras',
      array['pintura'], now())`.execute(bancoDeTeste());
}

/** Conversa entre as duas contas (o banco exige `usuario_a_id < usuario_b_id`). */
export async function conversaDireta(
  conta1: string,
  conta2: string,
): Promise<string> {
  const [a, b] = [conta1, conta2].sort();
  const id = randomUUID();
  await sql`insert into conversas (id, usuario_a_id, usuario_b_id, criada_em)
    values (${id}::uuid, ${a}::uuid, ${b}::uuid, now())`.execute(
    bancoDeTeste(),
  );
  return id;
}

export async function mensagemDireta(
  conversaId: string,
  autorId: string,
  texto: string,
): Promise<string> {
  const id = randomUUID();
  await sql`insert into mensagens (id, conversa_id, autor_id, texto, enviada_em)
    values (${id}::uuid, ${conversaId}::uuid, ${autorId}::uuid, ${texto}, now())`.execute(
    bancoDeTeste(),
  );
  return id;
}

export async function gravarLapide(id: string, em: Date): Promise<void> {
  await sql`insert into contas_excluidas (id, excluida_em)
    values (${id}::uuid, ${em.toISOString()}::timestamptz)`.execute(
    bancoDeTeste(),
  );
}

export async function lapides(): Promise<{ id: string; excluidaEm: Date }[]> {
  const { rows } = await sql<{ id: string; excluida_em: Date }>`
    select id, excluida_em from contas_excluidas order by excluida_em, id`.execute(
    bancoDeTeste(),
  );
  return rows.map((r) => ({ id: r.id, excluidaEm: r.excluida_em }));
}

export async function contar(tabela: string): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`select count(*)::int as n from ${sql.table(tabela)}`.execute(
    bancoDeTeste(),
  );
  return rows[0]?.n ?? -1;
}

/**
 * Tudo o que referencia a conta, inclusive o que "pendura" nela sem ser dela:
 * candidaturas recebidas nos trampos dela e mensagens dos dois lados das
 * conversas de que ela participa.
 */
export async function restosDa(
  contaId: string,
): Promise<Record<string, number>> {
  const { rows } = await sql<Record<string, number>>`select
      (select count(*)::int from contas where id = ${contaId}::uuid) as contas,
      (select count(*)::int from sessoes where conta_id = ${contaId}::uuid) as sessoes,
      (select count(*)::int from perfis where conta_id = ${contaId}::uuid) as perfis,
      (select count(*)::int from trampos where autor_id = ${contaId}::uuid) as trampos,
      (select count(*)::int from servicos where autor_id = ${contaId}::uuid) as servicos,
      (select count(*)::int from candidaturas where freelancer_id = ${contaId}::uuid
         or trampo_id in (select id from trampos where autor_id = ${contaId}::uuid)) as candidaturas,
      (select count(*)::int from conversas where usuario_a_id = ${contaId}::uuid
         or usuario_b_id = ${contaId}::uuid) as conversas,
      (select count(*)::int from mensagens where autor_id = ${contaId}::uuid
         or conversa_id in (select id from conversas
           where usuario_a_id = ${contaId}::uuid or usuario_b_id = ${contaId}::uuid)) as mensagens`.execute(
    bancoDeTeste(),
  );
  return rows[0] ?? {};
}

export const SEM_RESTOS = {
  contas: 0,
  sessoes: 0,
  perfis: 0,
  trampos: 0,
  servicos: 0,
  candidaturas: 0,
  conversas: 0,
  mensagens: 0,
};
