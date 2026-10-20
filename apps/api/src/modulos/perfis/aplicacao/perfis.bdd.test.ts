import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroDeValidacao,
  ErroNaoEncontrado,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDePerfisEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import { type EntradaDePerfil, Perfil } from '../dominio/perfil.js';
import {
  type CasosDeUsoDePerfis,
  criarCasosDeUsoDePerfis,
} from './casos-de-uso.js';

const MARIA = 'conta-maria';
const JOAO = 'conta-joao';

const PERFIL_COMPLETO: EntradaDePerfil = {
  nome: 'Maria Aparecida Souza',
  cidade: 'São Paulo',
  descricao: 'Pintora e gesseira.',
  habilidades: ['Pintura', 'Gesso'],
};

let repositorio: RepositorioDePerfisEmMemoria;
let relogio: RelogioFixo;
let casos: CasosDeUsoDePerfis;

beforeEach(() => {
  repositorio = new RepositorioDePerfisEmMemoria();
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  casos = criarCasosDeUsoDePerfis({ repositorio, relogio });
});

describe('CA3 — perfil completo e visível', () => {
  it('CA3 — Dado um usuário autenticado, quando ele preenche nome, cidade e ao menos uma habilidade, então o perfil fica completo e visível para outros usuários', async () => {
    const salvo = await casos.salvarMeuPerfil(MARIA, PERFIL_COMPLETO);

    expect(salvo.completo).toBe(true);
    const meu = await casos.obterMeuPerfil(MARIA);
    expect(meu.completo).toBe(true);
    expect(meu.nome).toBe('Maria Aparecida Souza');

    // Visível a outra conta: o caso de uso público não depende de quem pede.
    const publico = await casos.obterPerfilPublico(MARIA);
    expect(publico.contaId).toBe(MARIA);
    expect(publico.nome).toBe('Maria Aparecida Souza');
    expect(publico.cidade).toBe('São Paulo');
    expect(publico.descricao).toBe('Pintora e gesseira.');
    expect(publico.habilidades).toEqual(['Pintura', 'Gesso']);
  });

  it('CA3 — Dado um usuário sem perfil, quando ele consulta o próprio perfil, então recebe "não encontrado"', async () => {
    await expect(casos.obterMeuPerfil(MARIA)).rejects.toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });

  it('CA3 — Dado um usuário sem perfil, quando outro usuário consulta o perfil dele, então recebe "não encontrado"', async () => {
    await casos.salvarMeuPerfil(JOAO, PERFIL_COMPLETO);

    await expect(casos.obterPerfilPublico(MARIA)).rejects.toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });

  it('CA3 — Dado um perfil salvo, quando o usuário salva de novo, então o perfil é substituído (sem descrição, nova data)', async () => {
    await casos.salvarMeuPerfil(MARIA, PERFIL_COMPLETO);
    relogio.avancar(60_000);

    await casos.salvarMeuPerfil(MARIA, {
      nome: 'Maria Souza',
      cidade: 'Recife',
      habilidades: ['Elétrica'],
    });

    const meu = await casos.obterMeuPerfil(MARIA);
    expect(meu.nome).toBe('Maria Souza');
    expect(meu.cidade).toBe('Recife');
    expect(meu.descricao).toBeUndefined();
    expect(meu.habilidades).toEqual(['Elétrica']);
    expect(meu.atualizadoEm).toEqual(new Date('2026-10-20T12:01:00.000Z'));
    expect(repositorio.tamanho).toBe(1);
  });

  it('CA3 — Dado um usuário autenticado, quando ele omite nome, cidade e habilidades, então recebe todos os campos apontados e nada é salvo', async () => {
    const erro = await casos
      .salvarMeuPerfil(MARIA, { descricao: 'Só a descrição.' })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'nome', motivo: 'obrigatorio' },
      { campo: 'cidade', motivo: 'obrigatorio' },
      { campo: 'habilidades', motivo: 'obrigatorio' },
    ]);
    expect(repositorio.tamanho).toBe(0);
  });

  it('CA3 — Dado um perfil salvo, quando a nova versão é inválida, então o perfil anterior continua', async () => {
    await casos.salvarMeuPerfil(MARIA, PERFIL_COMPLETO);

    await expect(
      casos.salvarMeuPerfil(MARIA, { ...PERFIL_COMPLETO, habilidades: [] }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);

    expect((await casos.obterMeuPerfil(MARIA)).habilidades).toEqual([
      'Pintura',
      'Gesso',
    ]);
  });
});

describe('D9 — perfilEstaCompleto', () => {
  it('D9 — Dado um usuário sem perfil, quando o sistema verifica, então o perfil não está completo', async () => {
    expect(await casos.perfilEstaCompleto(MARIA)).toBe(false);
  });

  it('D9 — Dado um usuário com nome, cidade e uma habilidade, quando o sistema verifica, então o perfil está completo', async () => {
    await casos.salvarMeuPerfil(MARIA, {
      nome: 'Maria',
      cidade: 'Recife',
      habilidades: ['Gesso'],
    });

    expect(await casos.perfilEstaCompleto(MARIA)).toBe(true);
    expect(await casos.perfilEstaCompleto(JOAO)).toBe(false);
  });

  it('D9 — Dado um perfil gravado sem habilidades, quando o sistema verifica, então o perfil não está completo e não é público', async () => {
    // Só uma linha gravada fora do domínio chegaria a este estado.
    await repositorio.salvar(
      Perfil.reconstituir({
        contaId: MARIA,
        nome: 'Maria',
        cidade: 'Recife',
        cidadeNormalizada: 'recife',
        habilidades: [],
        atualizadoEm: relogio.agora(),
      }),
    );

    expect(await casos.perfilEstaCompleto(MARIA)).toBe(false);
    await expect(casos.obterPerfilPublico(MARIA)).rejects.toBeInstanceOf(
      ErroNaoEncontrado,
    );
  });

  it('D9 — Dado um perfil completo, quando a tentativa de esvaziá-lo é recusada, então ele continua completo', async () => {
    await casos.salvarMeuPerfil(MARIA, PERFIL_COMPLETO);

    await expect(
      casos.salvarMeuPerfil(MARIA, { nome: 'Maria', cidade: 'Recife' }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);

    expect(await casos.perfilEstaCompleto(MARIA)).toBe(true);
  });
});
