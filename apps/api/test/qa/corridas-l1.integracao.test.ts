/**
 * QA da L1 — janelas de corrida da exclusão (D25) reproduzidas de forma
 * determinística: o "gancho" roda a exclusão da conta exatamente entre dois
 * passos do caso de uso, no Postgres de teste.
 */
import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErroNaoEncontrado } from '../../src/compartilhado/dominio/erros.js';
import { relogioDoSistema } from '../../src/compartilhado/dominio/relogio.js';
import {
  excluirDadosDaConta,
  RepositorioDeConversasPostgres,
} from '../../src/modulos/conversas/adaptadores/postgres/repositorio-postgres.js';
import type { TabelasDeConversas } from '../../src/modulos/conversas/adaptadores/postgres/tabelas.js';
import { criarCasosDeUsoDeConversas } from '../../src/modulos/conversas/aplicacao/casos-de-uso.js';
import type { Conversa } from '../../src/modulos/conversas/dominio/conversa.js';
import { bancoDeTeste } from '../banco-teste.js';
import { limparBanco } from './apoio.js';

/** Repositório real que executa `gancho` uma vez, logo depois de achar a conversa. */
class RepositorioComGancho extends RepositorioDeConversasPostgres {
  gancho: (() => Promise<void>) | undefined;

  override async buscarConversaPorId(id: string): Promise<Conversa | null> {
    const conversa = await super.buscarConversaPorId(id);
    const gancho = this.gancho;
    this.gancho = undefined;
    await gancho?.();
    return conversa;
  }
}

function db(): Kysely<TabelasDeConversas> {
  return bancoDeTeste<TabelasDeConversas>();
}

beforeEach(async () => {
  await limparBanco();
});

describe('CA18 — conversa apagada entre a checagem de participação e a leitura do cursor', () => {
  it('Dado o outro participante lendo com `depoisDe` quando a conta é excluída no meio, então 404 (ErroNaoEncontrado), nunca o 400 de cursor', async () => {
    const ana = randomUUID();
    const bruno = randomUUID();
    const repositorio = new RepositorioComGancho(db());
    const casos = criarCasosDeUsoDeConversas({
      repositorio,
      verificadorDeVinculo: { existeVinculoEntre: async () => true },
      relogio: relogioDoSistema,
    });
    const { conversaId } = await casos.abrirConversa(bruno, ana);
    const primeira = await casos.enviarMensagem(ana, conversaId, 'um');
    await casos.enviarMensagem(ana, conversaId, 'dois');

    repositorio.gancho = () =>
      db()
        .transaction()
        .execute((trx) => excluirDadosDaConta(trx, ana));
    const leitura = casos.listarMensagens(bruno, conversaId, {
      depoisDe: primeira.id,
    });

    await expect(leitura).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });
});
