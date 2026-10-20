import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import {
  type CasosDeUsoDeContas,
  criarCasosDeUsoDeContas,
} from '../../aplicacao/casos-de-uso.js';
import { Email } from '../../dominio/email.js';
import { HasherScrypt } from '../../dominio/hasher.js';
import type { RepositorioDeContas } from '../../dominio/portas.js';
import {
  RepositorioDeContasEmMemoria,
  RepositorioDeSessoesEmMemoria,
} from '../memoria/repositorios-memoria.js';
import { criarRotasDeContas } from './rotas.js';

const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'segredo-123';

interface Montagem {
  readonly app: FastifyInstance;
  readonly contas: RepositorioDeContasEmMemoria;
  readonly sessoes: RepositorioDeSessoesEmMemoria;
  readonly casos: CasosDeUsoDeContas;
  /** Linhas JSON escritas pelo logger (nível trace). */
  readonly linhasDoLog: string[];
}

function montar(contasSubstitutas?: RepositorioDeContas): Montagem {
  const contas = new RepositorioDeContasEmMemoria();
  const sessoes = new RepositorioDeSessoesEmMemoria();
  const casos = criarCasosDeUsoDeContas({
    contas: contasSubstitutas ?? contas,
    sessoes,
    // Hasher real com custo baixo, para os testes rodarem rápido.
    hasher: new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 }),
    relogio: new RelogioFixo('2026-10-20T12:00:00.000Z'),
  });
  const linhasDoLog: string[] = [];
  const app = criarServidor({
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => linhasDoLog.push(linha) },
    }),
  });
  app.register(criarRotasDeContas(casos));
  return { app, contas, sessoes, casos, linhasDoLog };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe('rotas de contas (HTTP)', () => {
  let m: Montagem;

  beforeEach(() => {
    m = montar();
  });

  afterEach(async () => {
    await m.app.close();
  });

  async function cadastrar(email = EMAIL, senha = SENHA) {
    return m.app.inject({
      method: 'POST',
      url: '/contas',
      payload: { email, senha },
    });
  }

  describe('POST /contas', () => {
    it('CA1 — cria a conta, guarda só o hash da senha e responde 201 com um token que já autentica', async () => {
      const resposta = await cadastrar();

      expect(resposta.statusCode).toBe(201);
      const corpo = resposta.json();
      expect(Object.keys(corpo)).toEqual(['token']);
      expect(corpo.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const conta = await m.contas.buscarPorEmail(Email.criar(EMAIL));
      expect(conta?.senhaHash).toMatch(/^scrypt\$/);
      expect(conta?.senhaHash).not.toContain(SENHA);
      expect(await m.casos.validarSessao(corpo.token)).toBe(conta?.id);
    });

    it('CA1 — senha curta: 400 dados_invalidos no campo senha, motivo tamanho', async () => {
      const resposta = await cadastrar(EMAIL, '1234567');

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'senha', motivo: 'tamanho' }],
      });
      expect(m.contas.quantidade).toBe(0);
    });

    it('CA1 — e-mail inválido: 400 no campo email, sem ecoar o valor', async () => {
      const resposta = await cadastrar('maria-sem-arroba', SENHA);

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'email', motivo: 'invalido' }],
      });
      expect(resposta.body).not.toContain('maria-sem-arroba');
    });

    it('CA1 — e-mail e senha inválidos voltam juntos', async () => {
      const resposta = await cadastrar('x', '');

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().campos).toEqual([
        { campo: 'email', motivo: 'invalido' },
        { campo: 'senha', motivo: 'obrigatorio' },
      ]);
    });

    it('corpo sem os campos: 400 com o campo obrigatório', async () => {
      const resposta = await m.app.inject({
        method: 'POST',
        url: '/contas',
        payload: {},
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'email', motivo: 'obrigatorio' }],
      });
    });

    it('sem a senha: 400 no campo senha, motivo obrigatorio', async () => {
      const resposta = await m.app.inject({
        method: 'POST',
        url: '/contas',
        payload: { email: EMAIL },
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'senha', motivo: 'obrigatorio' }],
      });
    });

    it('sem corpo: 400 dados_invalidos', async () => {
      const resposta = await m.app.inject({ method: 'POST', url: '/contas' });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('dados_invalidos');
      expect(m.contas.quantidade).toBe(0);
    });

    it('propriedade extra: 400, sem ecoar a chave, e nenhuma conta criada', async () => {
      const resposta = await m.app.inject({
        method: 'POST',
        url: '/contas',
        payload: { email: EMAIL, senha: SENHA, papelSecreto: 'admin' },
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('dados_invalidos');
      expect(resposta.body).not.toContain('papelSecreto');
      expect(m.contas.quantidade).toBe(0);
    });

    it('e-mail que não é texto: 400 dados_invalidos', async () => {
      const resposta = await m.app.inject({
        method: 'POST',
        url: '/contas',
        payload: { email: { $ne: '' }, senha: SENHA },
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().erro).toBe('dados_invalidos');
    });

    it('CA2 — e-mail já cadastrado: 409 email_em_uso sem nenhum dado da conta', async () => {
      await cadastrar();
      const conta = await m.contas.buscarPorEmail(Email.criar(EMAIL));

      const resposta = await cadastrar(
        ' Maria.Silva@EXEMPLO.com ',
        'outra-senha-1',
      );

      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toEqual({ erro: 'email_em_uso' });
      expect(resposta.body.toLowerCase()).not.toContain(EMAIL);
      expect(resposta.body).not.toContain(conta?.id ?? '-');
      expect(m.contas.quantidade).toBe(1);
    });
  });

  describe('POST /sessoes', () => {
    it('CA1 — e-mail e senha corretos: 200 com um token novo e válido', async () => {
      const { token: doCadastro } = (await cadastrar()).json();

      const resposta = await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: EMAIL, senha: SENHA },
      });

      expect(resposta.statusCode).toBe(200);
      const corpo = resposta.json();
      expect(Object.keys(corpo)).toEqual(['token']);
      expect(corpo.token).not.toBe(doCadastro);
      expect(await m.casos.validarSessao(corpo.token)).not.toBeNull();
    });

    it('senha errada e e-mail inexistente: o mesmo 401 credenciais_invalidas', async () => {
      await cadastrar();

      const senhaErrada = await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: EMAIL, senha: 'senha-errada' },
      });
      const emailInexistente = await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: 'ninguem@exemplo.com', senha: SENHA },
      });
      const emailInvalido = await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: 'sem-arroba', senha: SENHA },
      });

      for (const resposta of [senhaErrada, emailInexistente, emailInvalido]) {
        expect(resposta.statusCode).toBe(401);
        expect(resposta.json()).toEqual({ erro: 'credenciais_invalidas' });
      }
      expect(m.sessoes.hashesGravados()).toHaveLength(1);
    });

    it('corpo sem os campos: 400 dados_invalidos', async () => {
      const resposta = await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { senha: SENHA },
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'email', motivo: 'obrigatorio' }],
      });
    });
  });

  describe('DELETE /sessoes', () => {
    it('CA14 — com token válido: 204 e, depois de sair, o mesmo token recebe 401', async () => {
      const { token } = (await cadastrar()).json();

      const saida = await m.app.inject({
        method: 'DELETE',
        url: '/sessoes',
        headers: bearer(token),
      });
      expect(saida.statusCode).toBe(204);
      expect(saida.body).toBe('');
      expect(await m.casos.validarSessao(token)).toBeNull();

      const denovo = await m.app.inject({
        method: 'DELETE',
        url: '/sessoes',
        headers: bearer(token),
      });
      expect(denovo.statusCode).toBe(401);
      expect(denovo.json()).toEqual({ erro: 'nao_autenticado' });
    });

    it('CA14 — sair encerra só a sessão do token enviado', async () => {
      const { token: primeiro } = (await cadastrar()).json();
      const { token: segundo } = (
        await m.app.inject({
          method: 'POST',
          url: '/sessoes',
          payload: { email: EMAIL, senha: SENHA },
        })
      ).json();

      await m.app.inject({
        method: 'DELETE',
        url: '/sessoes',
        headers: bearer(primeiro),
      });

      expect(await m.casos.validarSessao(primeiro)).toBeNull();
      expect(await m.casos.validarSessao(segundo)).not.toBeNull();
    });

    it.each([
      ['sem cabeçalho', {}],
      ['token desconhecido', bearer('a'.repeat(43))],
      ['esquema errado', { authorization: 'Basic abc' }],
    ])('CA14 — %s: 401 nao_autenticado sem nenhum dado', async (_, headers) => {
      await cadastrar();

      const resposta = await m.app.inject({
        method: 'DELETE',
        url: '/sessoes',
        headers,
      });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      expect(m.sessoes.hashesGravados()).toHaveLength(1);
    });
  });

  describe('CA15 — logs sem dado pessoal', () => {
    it('cadastro, duplicidade, entrada errada, validação e saída não registram e-mail, senha nem token', async () => {
      const { token } = (await cadastrar()).json();
      await cadastrar();
      await cadastrar('MARIA.SILVA@exemplo.com', SENHA);
      await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: EMAIL, senha: 'senha-errada-123' },
      });
      const { token: daEntrada } = (
        await m.app.inject({
          method: 'POST',
          url: '/sessoes',
          payload: { email: EMAIL, senha: SENHA },
        })
      ).json();
      await cadastrar(EMAIL, 'curta');
      await m.app.inject({
        method: 'POST',
        url: '/contas',
        payload: { email: EMAIL, senha: SENHA, extra: EMAIL },
      });
      await m.app.inject({
        method: 'DELETE',
        url: '/sessoes',
        headers: bearer(token),
      });

      const log = m.linhasDoLog.join('\n');
      // O log foi de fato capturado (respostas e recusas registradas).
      expect(log).toContain('requisição recusada');
      expect(log).toContain('entrada recusada');
      expect(log.toLowerCase()).not.toContain('maria.silva');
      expect(log).not.toContain(SENHA);
      expect(log).not.toContain('senha-errada-123');
      expect(log).not.toContain(token);
      expect(log).not.toContain(daEntrada);
    });

    it('falha inesperada do banco com o e-mail no detalhe: 500 interno e o log não traz o e-mail', async () => {
      const erroDoDriver = Object.assign(
        new Error(`duplicate key value: Key (email)=(${EMAIL}) already exists`),
        {
          code: '23502',
          severity: 'ERROR',
          detail: `Failing row contains (${EMAIL}).`,
        },
      );
      const contasQueFalham: RepositorioDeContas = {
        salvar: async () => {
          throw erroDoDriver;
        },
        buscarPorEmail: async () => null,
        existeEmail: async () => false,
      };
      await m.app.close();
      m = montar(contasQueFalham);

      const resposta = await cadastrar();

      expect(resposta.statusCode).toBe(500);
      expect(resposta.json()).toEqual({ erro: 'interno' });
      const log = m.linhasDoLog.join('\n');
      expect(log).toContain('erro interno não tratado');
      expect(log).not.toContain(EMAIL);
      expect(log).not.toContain(SENHA);
    });
  });
});
