import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import {
  RepositorioDeContasEmMemoria,
  RepositorioDeSessoesEmMemoria,
} from '../adaptadores/memoria/repositorios-memoria.js';
import { Email } from '../dominio/email.js';
import { HasherScrypt } from '../dominio/hasher.js';
import { ErroDeEmailDuplicado } from '../dominio/portas.js';
import {
  type CasosDeUsoDeContas,
  criarCasosDeUsoDeContas,
  DURACAO_DA_SESSAO_MS,
} from './casos-de-uso.js';

const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'segredo-123';

/** Captura o erro lançado pela promessa (falha se ela resolver). */
async function erroDe(promessa: Promise<unknown>): Promise<Error> {
  try {
    await promessa;
  } catch (erro) {
    return erro as Error;
  }
  throw new Error('era esperada uma recusa');
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

describe('contas: cadastro, entrada e sessão', () => {
  let contas: RepositorioDeContasEmMemoria;
  let sessoes: RepositorioDeSessoesEmMemoria;
  let hasher: HasherScrypt;
  let relogio: RelogioFixo;
  let casos: CasosDeUsoDeContas;

  beforeEach(() => {
    contas = new RepositorioDeContasEmMemoria();
    sessoes = new RepositorioDeSessoesEmMemoria();
    // Hasher real com custo baixo, para o BDD rodar rápido.
    hasher = new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 });
    relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
    casos = criarCasosDeUsoDeContas({ contas, sessoes, hasher, relogio });
  });

  describe('cadastro', () => {
    it('CA1 — Dado um visitante, quando ele informa e-mail válido e senha com ao menos 8 caracteres, então a conta é criada, a senha é guardada só como hash e ele entra autenticado', async () => {
      const { token } = await casos.criarConta({
        email: EMAIL,
        senha: SENHA,
      });

      const conta = await contas.buscarPorEmail(Email.criar(EMAIL));
      expect(conta).not.toBeNull();
      expect(conta?.senhaHash).toMatch(/^scrypt\$/);
      expect(conta?.senhaHash).not.toContain(SENHA);
      expect(await hasher.verificar(SENHA, conta?.senhaHash ?? '')).toBe(true);

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await casos.validarSessao(token)).toBe(conta?.id);
      // O token não é gravado: só o SHA-256 dele.
      expect(sessoes.hashesGravados()).toEqual([sha256(token)]);
    });

    it('CA1 — senha com exatamente 8 caracteres é aceita', async () => {
      await casos.criarConta({ email: EMAIL, senha: '12345678' });
      expect(contas.quantidade).toBe(1);
    });

    it('CA1 — senha com 7 caracteres é recusada no campo senha, motivo tamanho', async () => {
      const erro = await erroDe(
        casos.criarConta({ email: EMAIL, senha: '1234567' }),
      );

      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'senha', motivo: 'tamanho' },
      ]);
      expect(contas.quantidade).toBe(0);
      expect(sessoes.hashesGravados()).toEqual([]);
    });

    it('CA1 — e-mail inválido é recusado no campo email, motivo invalido', async () => {
      const erro = await erroDe(
        casos.criarConta({ email: 'maria.silva@exemplo', senha: SENHA }),
      );

      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'email', motivo: 'invalido' },
      ]);
      expect(erro.message).not.toContain('maria');
      expect(contas.quantidade).toBe(0);
    });

    it('CA1 — e-mail e senha inválidos vêm juntos num único erro', async () => {
      const erro = await erroDe(
        casos.criarConta({ email: 'sem-arroba', senha: 'curta' }),
      );

      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'email', motivo: 'invalido' },
        { campo: 'senha', motivo: 'tamanho' },
      ]);
    });

    it('CA1 — campos ausentes são recusados como obrigatorio', async () => {
      const erro = await erroDe(casos.criarConta({}));

      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'email', motivo: 'obrigatorio' },
        { campo: 'senha', motivo: 'obrigatorio' },
      ]);
    });

    it('CA1 — e-mail com maiúsculas e espaços vira o mesmo e-mail', async () => {
      await casos.criarConta({
        email: '  Maria.Silva@Exemplo.COM ',
        senha: SENHA,
      });

      expect(await contas.existeEmail(Email.criar(EMAIL))).toBe(true);
      const { token } = await casos.entrar({ email: EMAIL, senha: SENHA });
      expect(await casos.validarSessao(token)).not.toBeNull();
    });

    it('CA2 — Dado um e-mail já cadastrado, quando alguém tenta criar conta com ele, então o cadastro é recusado com mensagem clara e sem revelar dados da conta existente', async () => {
      await casos.criarConta({ email: EMAIL, senha: SENHA });
      const existente = await contas.buscarPorEmail(Email.criar(EMAIL));
      const id = existente?.id ?? 'sem-id';

      const erro = await erroDe(
        casos.criarConta({ email: EMAIL, senha: 'outra-senha-456' }),
      );

      expect(erro).toBeInstanceOf(ErroDeRegra);
      expect((erro as ErroDeRegra).codigo).toBe('email_em_uso');
      for (const texto of [
        erro.message,
        JSON.stringify(erro),
        erro.stack ?? '',
      ]) {
        expect(texto).not.toContain('maria');
        expect(texto).not.toContain(id);
        expect(texto).not.toContain('scrypt');
      }
      expect(contas.quantidade).toBe(1);
      expect(sessoes.hashesGravados()).toHaveLength(1);
    });

    it('CA2 — o mesmo e-mail com outra caixa e espaços também é recusado', async () => {
      await casos.criarConta({ email: EMAIL, senha: SENHA });

      const erro = await erroDe(
        casos.criarConta({ email: ' MARIA.SILVA@exemplo.com', senha: SENHA }),
      );

      expect((erro as ErroDeRegra).codigo).toBe('email_em_uso');
    });

    it('CA2 — dois cadastros simultâneos: a duplicidade ao salvar vira email_em_uso', async () => {
      // A checagem diz que o e-mail está livre, mas outro cadastro grava antes.
      vi.spyOn(contas, 'existeEmail').mockResolvedValue(false);
      await casos.criarConta({ email: EMAIL, senha: SENHA });

      const erro = await erroDe(
        casos.criarConta({ email: EMAIL, senha: SENHA }),
      );

      expect(erro).toBeInstanceOf(ErroDeRegra);
      expect((erro as ErroDeRegra).codigo).toBe('email_em_uso');
      expect(erro).not.toBeInstanceOf(ErroDeEmailDuplicado);
      expect(sessoes.hashesGravados()).toHaveLength(1);
    });

    it('falha inesperada do repositório segue adiante sem virar email_em_uso', async () => {
      vi.spyOn(contas, 'salvar').mockRejectedValue(new Error('banco fora'));

      const erro = await erroDe(
        casos.criarConta({ email: EMAIL, senha: SENHA }),
      );

      expect(erro.message).toBe('banco fora');
      expect(sessoes.hashesGravados()).toEqual([]);
    });
  });

  describe('entrada', () => {
    beforeEach(async () => {
      await casos.criarConta({ email: EMAIL, senha: SENHA });
    });

    it('CA1 — com e-mail e senha corretos, devolve um token válido', async () => {
      const { token } = await casos.entrar({
        email: ' Maria.Silva@exemplo.com ',
        senha: SENHA,
      });
      const conta = await contas.buscarPorEmail(Email.criar(EMAIL));

      expect(await casos.validarSessao(token)).toBe(conta?.id);
    });

    it('dois entrar dão tokens diferentes, e os dois valem', async () => {
      const primeiro = await casos.entrar({ email: EMAIL, senha: SENHA });
      const segundo = await casos.entrar({ email: EMAIL, senha: SENHA });

      expect(primeiro.token).not.toBe(segundo.token);
      expect(await casos.validarSessao(primeiro.token)).not.toBeNull();
      expect(await casos.validarSessao(segundo.token)).not.toBeNull();
    });

    it('senha errada e e-mail inexistente recebem a mesma recusa genérica', async () => {
      const senhaErrada = await erroDe(
        casos.entrar({ email: EMAIL, senha: 'senha-errada' }),
      );
      const semConta = await erroDe(
        casos.entrar({ email: 'joao@exemplo.com', senha: SENHA }),
      );

      for (const erro of [senhaErrada, semConta]) {
        expect(erro).toBeInstanceOf(ErroDeRegra);
        expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
        expect(JSON.stringify(erro)).toBe(JSON.stringify(senhaErrada));
        expect(`${erro.message} ${erro.stack}`).not.toMatch(/maria|joao/);
      }
    });

    it('e-mail inexistente também roda a verificação de senha (contra o hash fictício), para igualar o tempo', async () => {
      const verificar = vi.spyOn(hasher, 'verificar');

      await erroDe(casos.entrar({ email: 'joao@exemplo.com', senha: SENHA }));
      await erroDe(casos.entrar({ email: EMAIL, senha: 'senha-errada' }));

      expect(verificar).toHaveBeenCalledTimes(2);
      const hashFicticio = verificar.mock.calls[0]?.[1] ?? '';
      expect(hashFicticio).toMatch(/^scrypt\$16\$8\$1\$/);
      // O fictício é gerado uma vez e reaproveitado.
      await erroDe(casos.entrar({ email: 'ana@exemplo.com', senha: SENHA }));
      expect(verificar.mock.calls[2]?.[1]).toBe(hashFicticio);
    });

    it.each([
      { email: 'sem-arroba', senha: SENHA },
      { email: undefined, senha: SENHA },
      { email: EMAIL, senha: '' },
      { email: EMAIL, senha: undefined },
      { email: EMAIL, senha: 12345678 },
      { email: EMAIL, senha: 'a'.repeat(129) },
    ])(
      'entrada fora do formato é recusada como credenciais_invalidas: %j',
      async (credenciais) => {
        const erro = await erroDe(casos.entrar(credenciais));

        expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
      },
    );

    it('CA1 — senha de 100 emojis (200 unidades UTF-16, 100 caracteres) cadastra e entra; 129 emojis é recusada', async () => {
      const senha = '😀'.repeat(100);
      await casos.criarConta({ email: 'emoji@exemplo.com', senha });

      const sessao = await casos.entrar({ email: 'emoji@exemplo.com', senha });
      expect(sessao.token).toEqual(expect.any(String));
      const erro = await erroDe(
        casos.entrar({ email: 'emoji@exemplo.com', senha: '😀'.repeat(129) }),
      );
      expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
    });

    it('nenhuma recusa abre sessão', async () => {
      const antes = sessoes.hashesGravados().length;
      await erroDe(casos.entrar({ email: EMAIL, senha: 'senha-errada' }));
      await erroDe(casos.entrar({ email: 'joao@exemplo.com', senha: SENHA }));

      expect(sessoes.hashesGravados()).toHaveLength(antes);
    });
  });

  describe('sessão', () => {
    let token: string;

    beforeEach(async () => {
      ({ token } = await casos.criarConta({ email: EMAIL, senha: SENHA }));
    });

    it('vale até um instante antes de 30 dias e expira em 30 dias', async () => {
      relogio.avancar(DURACAO_DA_SESSAO_MS - 1);
      expect(await casos.validarSessao(token)).not.toBeNull();

      relogio.avancar(1);
      expect(await casos.validarSessao(token)).toBeNull();
    });

    it('sair invalida o token e é idempotente', async () => {
      const outro = await casos.entrar({ email: EMAIL, senha: SENHA });

      await casos.sair(token);
      expect(await casos.validarSessao(token)).toBeNull();
      await expect(casos.sair(token)).resolves.toBeUndefined();
      // Só a sessão encerrada cai; a outra continua.
      expect(await casos.validarSessao(outro.token)).not.toBeNull();
    });

    it.each(['', 'token-desconhecido', 'a'.repeat(257), undefined])(
      'token ausente, desconhecido ou longo demais não vale: %j',
      async (invalido) => {
        expect(await casos.validarSessao(invalido as string)).toBeNull();
        await expect(casos.sair(invalido as string)).resolves.toBeUndefined();
        expect(await casos.validarSessao(token)).not.toBeNull();
      },
    );
  });
});
