import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroIndisponivel,
  ErroLimiteExcedido,
  ErroNaoEncontrado,
  ErroProibido,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import {
  DadosDaContaEmMemoria,
  PARTES_VAZIAS,
  RepositorioDeContasEmMemoria,
  RepositorioDeContasExcluidasEmMemoria,
  RepositorioDeSessoesEmMemoria,
  RepositorioDeTentativasDeEntradaEmMemoria,
} from '../adaptadores/memoria/repositorios-memoria.js';
import { Conta } from '../dominio/conta.js';
import { Email } from '../dominio/email.js';
import { HasherScrypt } from '../dominio/hasher.js';
import {
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type ExportacaoV1,
  type PartesExportadas,
} from '../dominio/portas.js';
import { Semaforo } from '../dominio/semaforo.js';
import {
  BYTES_DA_CONTA_NA_MEDIDA,
  BYTES_POR_SESSAO_NA_MEDIDA,
  type CasosDeUsoDeContas,
  criarCasosDeUsoDeContas,
  DURACAO_DA_SESSAO_MS,
  ESPERA_DA_LAPIDE_MS,
  ESPERA_MAXIMA_NA_FILA_MS,
  LAPIDES_POR_RODADA,
  LOTES_DE_SESSOES_POR_RODADA,
  type OpcoesDaExportacao,
  SESSOES_POR_LOTE,
  TENTAR_DE_NOVO_EM_S,
  TETO_DA_EXPORTACAO_BYTES,
  TETO_PADRAO_POR_EMAIL,
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

/** Serialização simples, para os testes que leem o objeto exportado. */
const EM_JSON: OpcoesDaExportacao = { serializar: (e) => JSON.stringify(e) };

/** Exporta com `EM_JSON` e devolve o objeto lido de volta. */
async function exportarObjeto(
  casosDeUso: CasosDeUsoDeContas,
  contaId: string,
  senha: unknown,
  sinal?: AbortSignal,
): Promise<ExportacaoV1> {
  const texto = await casosDeUso.exportarDados(contaId, senha, {
    ...EM_JSON,
    ...(sinal ? { sinal } : {}),
  });
  return JSON.parse(texto) as ExportacaoV1;
}

describe('contas: cadastro, entrada e sessão', () => {
  let contas: RepositorioDeContasEmMemoria;
  let sessoes: RepositorioDeSessoesEmMemoria;
  let hasher: HasherScrypt;
  let relogio: RelogioFixo;
  let lapides: RepositorioDeContasExcluidasEmMemoria;
  let tentativasDeEntrada: RepositorioDeTentativasDeEntradaEmMemoria;
  let dados: DadosDaContaEmMemoria;
  let casos: CasosDeUsoDeContas;

  /** Monta os casos de uso com as partes dos outros módulos na exportação. */
  function montarCasos(partes?: PartesExportadas): void {
    dados = new DadosDaContaEmMemoria({
      contas,
      sessoes,
      lapides,
      relogio,
      ...(partes ? { partes } : {}),
    });
    casos = criarCasosDeUsoDeContas({
      contas,
      sessoes,
      contasExcluidas: lapides,
      tentativasDeEntrada,
      hasher,
      relogio,
      dadosDaConta: dados,
    });
  }

  beforeEach(() => {
    relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
    sessoes = new RepositorioDeSessoesEmMemoria(relogio);
    // A sessão do cadastro é gravada junto com a conta (S7).
    contas = new RepositorioDeContasEmMemoria(sessoes);
    lapides = new RepositorioDeContasExcluidasEmMemoria();
    tentativasDeEntrada = new RepositorioDeTentativasDeEntradaEmMemoria(contas);
    // Hasher real com custo baixo, para o BDD rodar rápido.
    hasher = new HasherScrypt({ N: 2 ** 4, r: 8, p: 1 });
    montarCasos();
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

  describe('S1 (D31, CA42) — teto de entrada por conta, contado antes do scrypt', () => {
    const HORA_MS = 60 * 60 * 1000;
    const ERRADA = 'senha-errada';
    let contaId: string;

    beforeEach(async () => {
      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });
      contaId = (await casos.validarSessao(token)) ?? '';
    });

    /** Monta os casos de uso com outro teto (o resto igual). */
    function comTeto(max: number, janelaMs = HORA_MS): CasosDeUsoDeContas {
      return criarCasosDeUsoDeContas({
        contas,
        sessoes,
        contasExcluidas: lapides,
        tentativasDeEntrada,
        tetoDeTentativas: { max, janelaMs },
        hasher,
        relogio,
        dadosDaConta: dados,
      });
    }

    /** `vezes` entradas com senha errada; todas devem dar 401. */
    async function errar(vezes: number, casosDoTeste = casos): Promise<void> {
      for (let i = 0; i < vezes; i += 1) {
        const erro = await erroDe(
          casosDoTeste.entrar({ email: EMAIL, senha: ERRADA }),
        );
        expect((erro as ErroDeRegra).codigo, `tentativa ${i + 1}`).toBe(
          'credenciais_invalidas',
        );
      }
    }

    it('o teto padrão é 100 tentativas por conta a cada hora', () => {
      expect(TETO_PADRAO_POR_EMAIL).toEqual({ max: 100, janelaMs: HORA_MS });
    });

    it('Dadas 100 tentativas da conta na hora, então a 101ª dá 429 sem derivar, mesmo com a senha certa, com retry-after até o fim da janela', async () => {
      await errar(100);
      expect(tentativasDeEntrada.contagemDe(contaId)).toBe(100);
      relogio.avancar(20 * 60 * 1000);
      const verificar = vi.spyOn(hasher, 'verificar');

      const erro = await erroDe(casos.entrar({ email: EMAIL, senha: SENHA }));

      expect(erro).toBeInstanceOf(ErroLimiteExcedido);
      expect((erro as ErroLimiteExcedido).codigo).toBe('muitas_requisicoes');
      // A janela começou na 1ª tentativa: faltam 40 min.
      expect((erro as ErroLimiteExcedido).tentarDeNovoEmS).toBe(40 * 60);
      expect(verificar).not.toHaveBeenCalled();
      expect(sessoes.hashesGravados()).toHaveLength(1);
    });

    it('a janela vencida reinicia o contador: a dona volta a entrar e a contagem recomeça em 1', async () => {
      await errar(100);
      relogio.avancar(HORA_MS - 1);
      const aindaNaJanela = await erroDe(
        casos.entrar({ email: EMAIL, senha: SENHA }),
      );
      expect(aindaNaJanela).toBeInstanceOf(ErroLimiteExcedido);
      expect((aindaNaJanela as ErroLimiteExcedido).tentarDeNovoEmS).toBe(1);

      relogio.avancar(1);
      const { token } = await casos.entrar({ email: EMAIL, senha: SENHA });

      expect(await casos.validarSessao(token)).toBe(contaId);
      expect(tentativasDeEntrada.contagemDe(contaId)).toBe(1);
    });

    it('a senha certa também conta: o teto é de tentativas, não de erros', async () => {
      const casosDoTeste = comTeto(3);
      for (let i = 0; i < 3; i += 1) {
        await casosDoTeste.entrar({ email: EMAIL, senha: SENHA });
      }

      const erro = await erroDe(
        casosDoTeste.entrar({ email: EMAIL, senha: SENHA }),
      );

      expect(erro).toBeInstanceOf(ErroLimiteExcedido);
      expect((erro as ErroLimiteExcedido).tentarDeNovoEmS).toBe(3600);
    });

    it('o teto é da conta: o e-mail com caixa e espaços diferentes conta junto, e outra conta tem o seu', async () => {
      const casosDoTeste = comTeto(2);
      await erroDe(casosDoTeste.entrar({ email: EMAIL, senha: ERRADA }));
      await erroDe(
        casosDoTeste.entrar({
          email: ' MARIA.Silva@exemplo.com ',
          senha: ERRADA,
        }),
      );
      await casos.criarConta({ email: 'joao@exemplo.com', senha: SENHA });

      expect(
        await erroDe(casosDoTeste.entrar({ email: EMAIL, senha: SENHA })),
      ).toBeInstanceOf(ErroLimiteExcedido);
      const doJoao = await casosDoTeste.entrar({
        email: 'joao@exemplo.com',
        senha: SENHA,
      });
      expect(doJoao.token).toEqual(expect.any(String));
    });

    it('e-mail inexistente não grava contador e segue no scrypt fictício: a recusa é sempre a genérica', async () => {
      const casosDoTeste = comTeto(2);
      const verificar = vi.spyOn(hasher, 'verificar');

      for (let i = 0; i < 5; i += 1) {
        const erro = await erroDe(
          casosDoTeste.entrar({ email: 'ninguem@exemplo.com', senha: SENHA }),
        );
        expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
      }

      expect(verificar).toHaveBeenCalledTimes(5);
      expect(tentativasDeEntrada.quantidade).toBe(0);
    });

    it('entrada fora do formato é recusada antes de contar', async () => {
      await erroDe(casos.entrar({ email: EMAIL, senha: '' }));
      await erroDe(casos.entrar({ email: EMAIL, senha: 'a'.repeat(129) }));
      await erroDe(casos.entrar({ email: 'sem-arroba', senha: SENHA }));

      expect(tentativasDeEntrada.quantidade).toBe(0);
    });

    it('Dada a conta excluída entre a busca e a contagem, então ela é tratada como inexistente: 401 genérico, contra o hash fictício', async () => {
      vi.spyOn(tentativasDeEntrada, 'registrar').mockResolvedValue(null);
      const verificar = vi.spyOn(hasher, 'verificar');
      const conta = await contas.buscarPorEmail(Email.criar(EMAIL));

      const erro = await erroDe(casos.entrar({ email: EMAIL, senha: SENHA }));

      expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
      expect(verificar).toHaveBeenCalledTimes(1);
      expect(verificar.mock.calls[0]?.[1]).not.toBe(conta?.senhaHash);
      expect(sessoes.hashesGravados()).toHaveLength(1);
    });

    it('o 429 não traz o e-mail, o id da conta nem a contagem', async () => {
      const casosDoTeste = comTeto(1);
      await erroDe(casosDoTeste.entrar({ email: EMAIL, senha: ERRADA }));

      const erro = await erroDe(
        casosDoTeste.entrar({ email: EMAIL, senha: ERRADA }),
      );

      expect(erro).toBeInstanceOf(ErroLimiteExcedido);
      const texto = `${JSON.stringify(erro)} ${erro.message} ${erro.stack}`;
      for (const proibido of [EMAIL, 'maria', contaId, sha256(EMAIL)]) {
        expect(texto).not.toContain(proibido);
      }
      expect(Object.keys(erro).sort()).toEqual([
        'codigo',
        'name',
        'tentarDeNovoEmS',
      ]);
    });

    it.each([
      [{ max: 0, janelaMs: HORA_MS }, 'max'],
      [{ max: 1.5, janelaMs: HORA_MS }, 'max'],
      [{ max: 1, janelaMs: 0 }, 'janelaMs'],
      [{ max: 1, janelaMs: 1.5 }, 'janelaMs'],
      [{ max: 1, janelaMs: 24 * HORA_MS + 1 }, 'janelaMs'],
    ])('teto inválido recusa a criação: %j', (teto, campo) => {
      expect(() =>
        criarCasosDeUsoDeContas({
          contas,
          sessoes,
          contasExcluidas: lapides,
          tentativasDeEntrada,
          tetoDeTentativas: teto,
          hasher,
          relogio,
          dadosDaConta: dados,
        }),
      ).toThrow(`teto de tentativas de entrada inválido: ${campo}`);
    });

    it('CA46 — a limpeza apaga os contadores com a janela vencida e deixa os vigentes', async () => {
      await casos.criarConta({ email: 'joao@exemplo.com', senha: SENHA });
      await errar(1);
      relogio.avancar(30 * 60 * 1000);
      await erroDe(casos.entrar({ email: 'joao@exemplo.com', senha: ERRADA }));
      relogio.avancar(30 * 60 * 1000);
      const apagar = vi.spyOn(tentativasDeEntrada, 'apagarVencidas');

      // A da Maria fez 1 h agora; a do João, 30 min.
      expect(await casos.limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 0,
      });

      expect(apagar).toHaveBeenCalledWith(
        new Date(relogio.agora().getTime() - HORA_MS),
      );
      expect(tentativasDeEntrada.contagemDe(contaId)).toBeUndefined();
      expect(tentativasDeEntrada.quantidade).toBe(1);
      // Idempotente: a rodada seguinte não tem o que apagar.
      await casos.limparRegistrosVencidos();
      expect(tentativasDeEntrada.quantidade).toBe(1);
    });

    it('CA46 — a falha ao apagar contadores não impede o resto da limpeza e sobe no fim', async () => {
      lapides.gravar('ok', new Date(relogio.agora().getTime() - HORA_MS));
      vi.spyOn(tentativasDeEntrada, 'apagarVencidas').mockRejectedValue(
        new Error('contadores fora'),
      );

      const erro = await erroDe(casos.limparRegistrosVencidos());

      expect(erro.message).toBe('contadores fora');
      expect(dados.exclusoes).toEqual(['ok']);
      expect(lapides.gravadas()).toEqual({});
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

  // Recusas de senha que nenhuma conta poderia ter: nem o scrypt roda.
  const SENHAS_FORA_DO_FORMATO: [string, unknown][] = [
    ['ausente', undefined],
    ['nula', null],
    ['vazia', ''],
    ['que não é texto', 12345678],
    ['com 129 caracteres', 'a'.repeat(129)],
    ['com 129 emojis', '😀'.repeat(129)],
  ];

  describe('exclusão de conta (D25)', () => {
    let token: string;
    let contaId: string;

    beforeEach(async () => {
      ({ token } = await casos.criarConta({ email: EMAIL, senha: SENHA }));
      contaId = (await casos.validarSessao(token)) ?? '';
    });

    it('CA17 — Dada uma conta com sessões em dois aparelhos, quando ela confirma a exclusão com a senha certa, então a porta apaga tudo uma vez, a conta some e todas as sessões caem', async () => {
      const outroAparelho = await casos.entrar({ email: EMAIL, senha: SENHA });
      const outra = await casos.criarConta({
        email: 'joao@exemplo.com',
        senha: SENHA,
      });

      await casos.excluirConta(contaId, SENHA);

      expect(dados.exclusoes).toEqual([contaId]);
      expect(await contas.buscarPorId(contaId)).toBeNull();
      expect(await contas.existeEmail(Email.criar(EMAIL))).toBe(false);
      expect(await casos.validarSessao(token)).toBeNull();
      expect(await casos.validarSessao(outroAparelho.token)).toBeNull();
      // A outra conta fica intacta.
      expect(await casos.validarSessao(outra.token)).not.toBeNull();
      expect(contas.quantidade).toBe(1);
    });

    it('CA17 — senha errada: 403 senha_incorreta, sem chamar a porta, e nada muda', async () => {
      const verificar = vi.spyOn(hasher, 'verificar');

      const erro = await erroDe(casos.excluirConta(contaId, 'senha-errada'));

      expect(erro).toBeInstanceOf(ErroProibido);
      expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
      expect(verificar).toHaveBeenCalledTimes(1);
      expect(dados.exclusoes).toEqual([]);
      expect(await casos.validarSessao(token)).toBe(contaId);
      // O erro não carrega a senha nem a conta.
      for (const texto of [erro.message, JSON.stringify(erro), erro.stack]) {
        expect(texto).not.toContain('senha-errada');
        expect(texto).not.toContain(contaId);
      }
    });

    it.each(SENHAS_FORA_DO_FORMATO)(
      'CA17 — senha %s: 403 senha_incorreta sem rodar o scrypt, sem consultar a conta e sem chamar a porta',
      async (_, senha) => {
        const verificar = vi.spyOn(hasher, 'verificar');
        const buscarPorId = vi.spyOn(contas, 'buscarPorId');

        const erro = await erroDe(casos.excluirConta(contaId, senha));

        expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
        expect(erro).toBeInstanceOf(ErroProibido);
        expect(verificar).not.toHaveBeenCalled();
        expect(buscarPorId).not.toHaveBeenCalled();
        expect(dados.exclusoes).toEqual([]);
      },
    );

    it('CA17 — senha com exatamente 128 caracteres ainda é conferida (o teto é inclusivo)', async () => {
      const verificar = vi.spyOn(hasher, 'verificar');

      const erro = await erroDe(casos.excluirConta(contaId, 'a'.repeat(128)));

      expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
      expect(verificar).toHaveBeenCalledTimes(1);
    });

    it('CA17 — conta inexistente: 404, sem rodar o scrypt nem chamar a porta', async () => {
      const verificar = vi.spyOn(hasher, 'verificar');

      const erro = await erroDe(
        casos.excluirConta('00000000-0000-4000-8000-000000000000', SENHA),
      );

      expect(erro).toBeInstanceOf(ErroNaoEncontrado);
      expect(verificar).not.toHaveBeenCalled();
      expect(dados.exclusoes).toEqual([]);
    });

    it('CA17 — dois pedidos concorrentes com a senha certa: os dois terminam sem erro (o segundo encontra tudo vazio)', async () => {
      const resultados = await Promise.allSettled([
        casos.excluirConta(contaId, SENHA),
        casos.excluirConta(contaId, SENHA),
      ]);

      expect(resultados.map((r) => r.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      // Os dois passaram pela senha antes de qualquer exclusão.
      expect(dados.exclusoes).toEqual([contaId, contaId]);
      expect(contas.quantidade).toBe(0);
      expect(sessoes.hashesGravados()).toEqual([]);
    });

    it('falha da porta sobe como está e a conta continua', async () => {
      vi.spyOn(dados, 'excluirTudo').mockRejectedValue(new Error('banco fora'));

      const erro = await erroDe(casos.excluirConta(contaId, SENHA));

      expect(erro.message).toBe('banco fora');
      expect(await casos.validarSessao(token)).toBe(contaId);
    });
  });

  describe('exportação de dados (D26)', () => {
    const PARTES: PartesExportadas = {
      perfil: {
        nome: 'Maria Silva',
        cidade: 'Lavras',
        descricao: null,
        habilidades: ['pintura'],
        atualizadoEm: '2026-10-19T10:00:00.000Z',
      },
      trampos: [
        {
          id: 't1',
          titulo: 'Pintar muro',
          descricao: 'Muro de 10 m',
          categoria: 'reformas',
          cidade: 'Lavras',
          valorCentavos: 15000,
          prazo: null,
          status: 'aberto',
          criadoEm: '2026-10-19T10:00:00.000Z',
          candidaturasRecebidas: 0,
        },
      ],
      servicos: [],
      candidaturas: [],
      conversas: [
        {
          id: 'v1',
          outroUsuarioId: 'u2',
          criadaEm: '2026-10-19T10:00:00.000Z',
          minhasMensagens: [],
        },
      ],
    };

    let token: string;
    let contaId: string;

    beforeEach(async () => {
      montarCasos(PARTES);
      ({ token } = await casos.criarConta({ email: EMAIL, senha: SENHA }));
      contaId = (await casos.validarSessao(token)) ?? '';
    });

    it('CA19 — Dada uma conta com duas sessões, quando ela pede a exportação com a senha, então recebe o JSON v1 com a conta, as sessões e as partes dos outros módulos, sem hash nem token', async () => {
      relogio.avancar(60 * 60 * 1000);
      await casos.entrar({ email: EMAIL, senha: SENHA });
      relogio.avancar(60 * 1000);

      const exportacao = await exportarObjeto(casos, contaId, SENHA);

      expect(exportacao).toStrictEqual({
        formato: 'trampo-ja.exportacao.v1',
        geradoEm: '2026-10-20T13:01:00.000Z',
        conta: {
          id: contaId,
          email: EMAIL,
          criadaEm: '2026-10-20T12:00:00.000Z',
        },
        sessoes: [
          {
            criadaEm: '2026-10-20T12:00:00.000Z',
            expiraEm: '2026-11-19T12:00:00.000Z',
          },
          {
            criadaEm: '2026-10-20T13:00:00.000Z',
            expiraEm: '2026-11-19T13:00:00.000Z',
          },
        ],
        ...PARTES,
      });
      expect(dados.coletas).toEqual([contaId]);
      const texto = JSON.stringify(exportacao);
      expect(texto).not.toContain('scrypt');
      expect(texto).not.toContain(token);
      expect(texto).not.toContain(sha256(token));
    });

    it('CA19 — chave a mais na raiz das partes não entra na exportação', async () => {
      montarCasos({
        ...PARTES,
        senhaHash: 'scrypt$vazado',
      } as PartesExportadas);
      ({ token } = await casos.criarConta({
        email: 'joao@exemplo.com',
        senha: SENHA,
      }));

      const exportacao = await exportarObjeto(
        casos,
        (await casos.validarSessao(token)) ?? '',
        SENHA,
      );

      expect(Object.keys(exportacao)).toEqual([
        'formato',
        'geradoEm',
        'conta',
        'sessoes',
        'perfil',
        'trampos',
        'servicos',
        'candidaturas',
        'conversas',
      ]);
    });

    it('senha errada: 403 senha_incorreta, sem coletar nada', async () => {
      const erro = await erroDe(
        casos.exportarDados(contaId, 'senha-errada', EM_JSON),
      );

      expect(erro).toBeInstanceOf(ErroProibido);
      expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
      expect(dados.coletas).toEqual([]);
      expect(dados.medicoes).toEqual([]);
    });

    it.each(SENHAS_FORA_DO_FORMATO)(
      'senha %s: 403 sem rodar o scrypt nem coletar',
      async (_, senha) => {
        const verificar = vi.spyOn(hasher, 'verificar');

        const erro = await erroDe(casos.exportarDados(contaId, senha, EM_JSON));

        expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
        expect(verificar).not.toHaveBeenCalled();
        expect(dados.coletas).toEqual([]);
      },
    );

    it('conta inexistente: 404, sem coletar', async () => {
      const erro = await erroDe(
        casos.exportarDados('nao-e-uuid', SENHA, EM_JSON),
      );

      expect(erro).toBeInstanceOf(ErroNaoEncontrado);
      expect(dados.coletas).toEqual([]);
    });
  });
  describe('S1 — uma exportação coletando por vez, no processo', () => {
    /**
     * Coleta que só termina quando o teste libera; conta quantas estão
     * coletando ao mesmo tempo. A primeira chamada pode falhar, se pedido.
     */
    class ColetaControlada implements DadosDaConta {
      ativas = 0;
      maximoDeAtivas = 0;
      readonly pendentes: Array<() => void> = [];
      falharNaPrimeira = false;

      async excluirTudo(): Promise<void> {}

      async medirDosOutrosModulos(): Promise<number> {
        return 0;
      }

      async coletarDosOutrosModulos(): Promise<PartesExportadas> {
        if (this.falharNaPrimeira) {
          this.falharNaPrimeira = false;
          throw new Error('banco fora');
        }
        this.ativas += 1;
        this.maximoDeAtivas = Math.max(this.maximoDeAtivas, this.ativas);
        await new Promise<void>((liberar) => this.pendentes.push(liberar));
        this.ativas -= 1;
        return PARTES_VAZIAS;
      }

      liberarUma(): void {
        this.pendentes.shift()?.();
      }
    }

    async function aindaNaFila(): Promise<void> {
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolver) => setImmediate(resolver));
      }
    }

    /** Duas contas, cada uma com os próprios casos de uso (duas montagens). */
    async function duasMontagens(
      coleta: ColetaControlada,
      semaforoDaExportacao?: Semaforo,
    ) {
      const montagem = () =>
        criarCasosDeUsoDeContas({
          contas,
          sessoes,
          contasExcluidas: lapides,
          tentativasDeEntrada,
          hasher,
          relogio,
          dadosDaConta: coleta,
          ...(semaforoDaExportacao ? { semaforoDaExportacao } : {}),
        });
      const [primeira, segunda] = [montagem(), montagem()];
      const idDe = async (casosDaMontagem: CasosDeUsoDeContas, email: string) =>
        (await casosDaMontagem.validarSessao(
          (
            await casosDaMontagem.criarConta({ email, senha: SENHA })
          ).token,
        )) ?? '';
      return {
        primeira,
        segunda,
        contaA: await idDe(primeira, 'ana@exemplo.com'),
        contaB: await idDe(segunda, 'bruno@exemplo.com'),
      };
    }

    it('Dado duas exportações simultâneas de contas diferentes, em montagens diferentes, então a segunda só coleta quando a primeira termina', async () => {
      const coleta = new ColetaControlada();
      const { primeira, segunda, contaA, contaB } = await duasMontagens(coleta);
      const verificar = vi.spyOn(hasher, 'verificar');

      const exportacoes = Promise.all([
        exportarObjeto(primeira, contaA, SENHA),
        exportarObjeto(segunda, contaB, SENHA),
      ]);
      // As duas senhas conferidas: a segunda já pediu a vaga.
      await vi.waitFor(() => expect(verificar).toHaveBeenCalledTimes(2));
      await Promise.all(verificar.mock.results.map((r) => r.value));
      await vi.waitFor(() => expect(coleta.pendentes).toHaveLength(1));
      await aindaNaFila();

      expect(coleta.ativas).toBe(1);
      coleta.liberarUma();
      await vi.waitFor(() => expect(coleta.pendentes).toHaveLength(1));
      coleta.liberarUma();
      const [deA, deB] = await exportacoes;

      expect(coleta.maximoDeAtivas).toBe(1);
      expect([deA.conta.id, deB.conta.id]).toEqual([contaA, contaB]);
    });

    it('Dado a coleta falhando, então o erro sobe e a vaga é liberada para a próxima exportação', async () => {
      const coleta = new ColetaControlada();
      const semaforo = new Semaforo(1);
      const { primeira, segunda, contaA, contaB } = await duasMontagens(
        coleta,
        semaforo,
      );
      coleta.falharNaPrimeira = true;

      const erro = await erroDe(primeira.exportarDados(contaA, SENHA, EM_JSON));

      expect(erro.message).toBe('banco fora');
      expect(semaforo.emUso).toBe(0);
      const depois = exportarObjeto(segunda, contaB, SENHA);
      await vi.waitFor(() => expect(coleta.pendentes).toHaveLength(1));
      coleta.liberarUma();
      expect((await depois).conta.id).toBe(contaB);
      expect(semaforo.emUso).toBe(0);
      expect(semaforo.naFila).toBe(0);
    });

    it('senha errada não ocupa a vaga', async () => {
      const coleta = new ColetaControlada();
      const semaforo = new Semaforo(1);
      const executar = vi.spyOn(semaforo, 'executar');
      const { primeira, contaA } = await duasMontagens(coleta, semaforo);

      await erroDe(primeira.exportarDados(contaA, 'senha-errada', EM_JSON));

      expect(executar).not.toHaveBeenCalled();
    });
  });

  describe('S1-R — teto da exportação medido antes de coletar (CA48)', () => {
    let contaId: string;
    let semaforo: Semaforo;

    /** Medida dos outros módulos que leva o total exatamente a `total`. */
    function medidaParaTotal(total: number, sessoesDaConta = 1): number {
      return (
        total -
        BYTES_DA_CONTA_NA_MEDIDA -
        sessoesDaConta * BYTES_POR_SESSAO_NA_MEDIDA
      );
    }

    beforeEach(async () => {
      semaforo = new Semaforo(1);
      dados = new DadosDaContaEmMemoria({ contas, sessoes });
      casos = criarCasosDeUsoDeContas({
        contas,
        sessoes,
        contasExcluidas: lapides,
        tentativasDeEntrada,
        hasher,
        relogio,
        dadosDaConta: dados,
        semaforoDaExportacao: semaforo,
      });
      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });
      contaId = (await casos.validarSessao(token)) ?? '';
    });

    it('D41 — o teto é 10 MiB', () => {
      expect(TETO_DA_EXPORTACAO_BYTES).toBe(10 * 1024 * 1024);
    });

    it('CA48 — Dada uma conta cuja medida passa do teto, quando ela pede a exportação, então recebe 409 exportacao_grande sem coletar, listar sessões nem serializar, e a vaga é liberada', async () => {
      dados.medida = medidaParaTotal(TETO_DA_EXPORTACAO_BYTES + 1);
      const listar = vi.spyOn(sessoes, 'listarDaConta');
      const serializar = vi.fn((e: ExportacaoV1) => JSON.stringify(e));

      const erro = await erroDe(
        casos.exportarDados(contaId, SENHA, { serializar }),
      );

      expect(erro).toBeInstanceOf(ErroDeRegra);
      expect((erro as ErroDeRegra).codigo).toBe('exportacao_grande');
      // O 409 não revela o tamanho.
      expect(erro.message).not.toMatch(/\d{4,}/);
      expect(dados.medicoes).toEqual([contaId]);
      expect(dados.coletas).toEqual([]);
      expect(listar).not.toHaveBeenCalled();
      expect(serializar).not.toHaveBeenCalled();
      expect(semaforo.emUso).toBe(0);
    });

    it('CA48 — exatamente no teto (somando a conta e as sessões), a exportação sai; um byte acima, não', async () => {
      dados.medida = medidaParaTotal(TETO_DA_EXPORTACAO_BYTES);
      const exportacao = await exportarObjeto(casos, contaId, SENHA);
      expect(exportacao.conta.id).toBe(contaId);
      expect(dados.coletas).toEqual([contaId]);

      dados.medida += 1;
      const erro = await erroDe(casos.exportarDados(contaId, SENHA, EM_JSON));
      expect((erro as ErroDeRegra).codigo).toBe('exportacao_grande');
      expect(dados.coletas).toEqual([contaId]);
    });

    it('CA48 — as sessões gravadas entram na medida: uma sessão a mais passa do teto', async () => {
      dados.medida = medidaParaTotal(TETO_DA_EXPORTACAO_BYTES, 1);
      await casos.entrar({ email: EMAIL, senha: SENHA });

      const erro = await erroDe(casos.exportarDados(contaId, SENHA, EM_JSON));

      expect((erro as ErroDeRegra).codigo).toBe('exportacao_grande');
      expect(dados.coletas).toEqual([]);
    });

    it('CA48 — uma medida inválida (NaN) também recusa, sem coletar (falha fechada)', async () => {
      dados.medida = Number.NaN;

      const erro = await erroDe(casos.exportarDados(contaId, SENHA, EM_JSON));

      expect((erro as ErroDeRegra).codigo).toBe('exportacao_grande');
      expect(dados.coletas).toEqual([]);
    });

    it('CA48 — medida, coleta e serialização rodam nessa ordem, todas dentro da vaga da exportação', async () => {
      const passos: string[] = [];
      const medir = dados.medirDosOutrosModulos.bind(dados);
      const coletar = dados.coletarDosOutrosModulos.bind(dados);
      vi.spyOn(dados, 'medirDosOutrosModulos').mockImplementation((id) => {
        passos.push(`medir:${semaforo.emUso}`);
        return medir(id);
      });
      vi.spyOn(dados, 'coletarDosOutrosModulos').mockImplementation((id) => {
        passos.push(`coletar:${semaforo.emUso}`);
        return coletar(id);
      });

      const texto = await casos.exportarDados(contaId, SENHA, {
        serializar: (e) => {
          passos.push(`serializar:${semaforo.emUso}`);
          return `serializado:${e.conta.id}`;
        },
      });

      expect(passos).toEqual(['medir:1', 'coletar:1', 'serializar:1']);
      // O texto devolvido é o do serializador, sem tocar.
      expect(texto).toBe(`serializado:${contaId}`);
      expect(semaforo.emUso).toBe(0);
    });

    it('CA48 — com a vaga ocupada, nem a medida roda: a exportação espera a vaga para medir', async () => {
      let liberar = () => {};
      const ocupacao = semaforo.executar(
        () =>
          new Promise<void>((resolver) => {
            liberar = resolver;
          }),
      );

      const pedido = exportarObjeto(casos, contaId, SENHA);
      await vi.waitFor(() => expect(semaforo.naFila).toBe(1));
      expect(dados.medicoes).toEqual([]);
      liberar();
      await ocupacao;

      expect((await pedido).conta.id).toBe(contaId);
      expect(dados.medicoes).toEqual([contaId]);
    });

    it('a serialização que falha sobe como está e libera a vaga', async () => {
      const erro = await erroDe(
        casos.exportarDados(contaId, SENHA, {
          serializar: () => {
            throw new Error('fora do contrato');
          },
        }),
      );

      expect(erro.message).toBe('fora do contrato');
      expect(semaforo.emUso).toBe(0);
      expect(semaforo.naFila).toBe(0);
    });
  });

  describe('S5 — limpeza periódica com relógio fixo (CA46, CA47)', () => {
    const MINUTO_MS = 60 * 1000;

    /** Grava `quantas` sessões de uma conta qualquer expirando em `expiraEm`. */
    async function gravarSessoes(
      quantas: number,
      expiraEm: Date,
      prefixo: string,
    ): Promise<void> {
      for (let i = 0; i < quantas; i += 1) {
        await sessoes.salvar(sha256(`${prefixo}-${i}`), 'conta-x', expiraEm);
      }
    }

    function emMs(ms: number): Date {
      return new Date(relogio.agora().getTime() + ms);
    }

    it('CA46 — Dadas sessões expiradas (inclusive a que expira agora) e válidas, quando a limpeza roda, então só as expiradas somem', async () => {
      await sessoes.salvar(sha256('vencida'), 'conta-x', emMs(-1));
      await sessoes.salvar(sha256('expira-agora'), 'conta-x', emMs(0));
      await sessoes.salvar(sha256('valida'), 'conta-x', emMs(1));
      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });

      const resultado = await casos.limparRegistrosVencidos();

      expect(resultado).toEqual({ sessoes: 2, contasRevarridas: 0 });
      expect(sessoes.hashesGravados().sort()).toEqual(
        [sha256('valida'), sha256(token)].sort(),
      );
      expect(await casos.validarSessao(token)).not.toBeNull();
    });

    it(`CA46 — apaga em lotes de ${SESSOES_POR_LOTE}: com 2500 expiradas, três lotes e nenhuma sobra`, async () => {
      await gravarSessoes(2500, emMs(-1), 'v');
      await gravarSessoes(3, emMs(MINUTO_MS), 'ok');
      const apagar = vi.spyOn(sessoes, 'apagarExpiradas');

      const resultado = await casos.limparRegistrosVencidos();

      expect(resultado.sessoes).toBe(2500);
      expect(apagar.mock.calls.map(([, lote]) => lote)).toEqual([
        SESSOES_POR_LOTE,
        SESSOES_POR_LOTE,
        SESSOES_POR_LOTE,
      ]);
      expect(sessoes.quantidade).toBe(3);
    });

    it(`CA46 — no máximo ${LOTES_DE_SESSOES_POR_RODADA} lotes por rodada: o resto fica para a próxima`, async () => {
      const total = SESSOES_POR_LOTE * LOTES_DE_SESSOES_POR_RODADA + 500;
      await gravarSessoes(total, emMs(-1), 'v');
      const apagar = vi.spyOn(sessoes, 'apagarExpiradas');

      const primeira = await casos.limparRegistrosVencidos();

      expect(apagar).toHaveBeenCalledTimes(LOTES_DE_SESSOES_POR_RODADA);
      expect(primeira.sessoes).toBe(total - 500);
      expect(sessoes.quantidade).toBe(500);
      expect((await casos.limparRegistrosVencidos()).sessoes).toBe(500);
      expect(sessoes.quantidade).toBe(0);
    });

    it('CA47 — Dada uma conta excluída, então a lápide guarda só o id e a hora da exclusão', async () => {
      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });
      const contaId = (await casos.validarSessao(token)) ?? '';

      await casos.excluirConta(contaId, SENHA);

      expect(lapides.gravadas()).toEqual({
        [contaId]: '2026-10-20T12:00:00.000Z',
      });
    });

    it('CA47 — Dado um registro gravado por escrita em voo depois da exclusão, quando a limpeza roda 10 min depois, então ele é apagado e a lápide também; antes disso, nada muda', async () => {
      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });
      const contaId = (await casos.validarSessao(token)) ?? '';
      await casos.excluirConta(contaId, SENHA);
      // Escrita em voo que terminou depois da exclusão: uma sessão órfã.
      await sessoes.salvar(sha256('orfa'), contaId, emMs(DURACAO_DA_SESSAO_MS));
      expect(ESPERA_DA_LAPIDE_MS).toBe(10 * MINUTO_MS);

      relogio.avancar(ESPERA_DA_LAPIDE_MS - 1);
      expect(await casos.limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 0,
      });
      expect(dados.exclusoes).toEqual([contaId]);
      expect(await sessoes.listarDaConta(contaId)).toHaveLength(1);
      expect(Object.keys(lapides.gravadas())).toEqual([contaId]);

      relogio.avancar(1);
      expect(await casos.limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 1,
      });
      expect(dados.exclusoes).toEqual([contaId, contaId]);
      expect(await sessoes.listarDaConta(contaId)).toEqual([]);
      expect(lapides.gravadas()).toEqual({});

      // A rodada seguinte não tem mais nada da conta.
      expect(await casos.limparRegistrosVencidos()).toEqual({
        sessoes: 0,
        contasRevarridas: 0,
      });
      expect(dados.exclusoes).toEqual([contaId, contaId]);
    });

    it(`CA47 — no máximo ${LAPIDES_POR_RODADA} lápides por rodada, das mais antigas para as mais novas`, async () => {
      const ids = Array.from(
        { length: LAPIDES_POR_RODADA + 1 },
        (_, i) => `conta-${String(i).padStart(3, '0')}`,
      );
      // A última da lista é a mais antiga.
      ids.forEach((id, i) => {
        lapides.gravar(id, emMs(-ESPERA_DA_LAPIDE_MS - (i + 1) * 1000));
      });

      const resultado = await casos.limparRegistrosVencidos();

      expect(resultado.contasRevarridas).toBe(LAPIDES_POR_RODADA);
      expect(dados.exclusoes[0]).toBe(ids.at(-1));
      expect(Object.keys(lapides.gravadas())).toEqual([ids[0]]);
    });

    it('CA47 — uma lápide cuja exclusão falha fica para a próxima rodada, as outras seguem, e o erro sobe no fim', async () => {
      lapides.gravar('falha', emMs(-ESPERA_DA_LAPIDE_MS - 2000));
      lapides.gravar('ok', emMs(-ESPERA_DA_LAPIDE_MS - 1000));
      await sessoes.salvar(sha256('vencida'), 'conta-x', emMs(-1));
      const excluir = dados.excluirTudo.bind(dados);
      vi.spyOn(dados, 'excluirTudo').mockImplementation(async (id) => {
        if (id === 'falha') {
          throw new Error('banco fora');
        }
        return excluir(id);
      });

      const erro = await erroDe(casos.limparRegistrosVencidos());

      expect(erro.message).toBe('banco fora');
      expect(Object.keys(lapides.gravadas())).toEqual(['falha']);
      expect(dados.exclusoes).toEqual(['ok']);
      expect(sessoes.quantidade).toBe(0);
    });

    it('CA47 — a falha ao apagar sessões não impede a varredura das lápides', async () => {
      lapides.gravar('ok', emMs(-ESPERA_DA_LAPIDE_MS));
      vi.spyOn(sessoes, 'apagarExpiradas').mockRejectedValue(
        new Error('sessoes fora'),
      );

      const erro = await erroDe(casos.limparRegistrosVencidos());

      expect(erro.message).toBe('sessoes fora');
      expect(dados.exclusoes).toEqual(['ok']);
      expect(lapides.gravadas()).toEqual({});
    });
  });

  describe('S8 — senha normalizada em NFC (CA43)', () => {
    // "é" composto (NFC) e "e" + acento combinante (NFD): mesma senha digitada
    // em teclados diferentes.
    const NFC = 'café-com-pão';
    const NFD = NFC.normalize('NFD');

    it('a senha de teste está em NFC e a outra forma difere dela', () => {
      expect(NFC.normalize('NFC')).toBe(NFC);
      expect(NFD).not.toBe(NFC);
    });

    it.each([
      { cadastro: 'NFD', entrada: 'NFC', cadastrada: NFD, digitada: NFC },
      { cadastro: 'NFC', entrada: 'NFD', cadastrada: NFC, digitada: NFD },
    ])(
      'CA43 — Dado o cadastro em $cadastro, quando a pessoa entra digitando $entrada, então a sessão abre',
      async ({ cadastrada, digitada }) => {
        await casos.criarConta({ email: EMAIL, senha: cadastrada });

        const { token } = await casos.entrar({ email: EMAIL, senha: digitada });

        const conta = await contas.buscarPorEmail(Email.criar(EMAIL));
        expect(await casos.validarSessao(token)).toBe(conta?.id);
        // O hash novo é sempre da forma NFC.
        expect(await hasher.verificar(NFC, conta?.senhaHash ?? '')).toBe(true);
      },
    );

    it.each([
      { cadastrada: NFD, digitada: NFC },
      { cadastrada: NFC, digitada: NFD },
    ])(
      'CA43 — a exclusão e a exportação conferem a senha na outra forma (%#)',
      async ({ cadastrada, digitada }) => {
        const { token } = await casos.criarConta({
          email: EMAIL,
          senha: cadastrada,
        });
        const contaId = (await casos.validarSessao(token)) ?? '';

        const exportacao = await exportarObjeto(casos, contaId, digitada);
        expect(exportacao.conta.id).toBe(contaId);
        await casos.excluirConta(contaId, digitada);
        expect(dados.exclusoes).toEqual([contaId]);
      },
    );

    it('CA43 — Dada uma conta com o hash gravado sobre a forma crua (antes da L3), quando a pessoa digita essa forma, então entra, exclui e exporta', async () => {
      const antiga = Conta.criar({
        email: Email.criar(EMAIL),
        senhaHash: await hasher.gerarHash(NFD),
        criadaEm: relogio.agora(),
      });
      await contas.salvar(antiga);

      const { token } = await casos.entrar({ email: EMAIL, senha: NFD });
      expect(await casos.validarSessao(token)).toBe(antiga.id);
      expect((await exportarObjeto(casos, antiga.id, NFD)).conta.id).toBe(
        antiga.id,
      );
      await casos.excluirConta(antiga.id, NFD);
      expect(dados.exclusoes).toEqual([antiga.id]);
    });

    it('CA43 — a normalização é a canônica (NFC), não a de compatibilidade: a ligadura "ﬁ" não vira "fi"', async () => {
      await casos.criarConta({ email: EMAIL, senha: 'senha-ﬁna-1' });

      const erro = await erroDe(
        casos.entrar({ email: EMAIL, senha: 'senha-fina-1' }),
      );
      expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
    });

    it.each([
      { forma: 'NFD (fora de NFC)', digitada: NFD, formas: [NFC, NFD] },
      { forma: 'NFC', digitada: NFC, formas: [NFC] },
    ])(
      'CA43 — senha errada digitada em $forma: o e-mail inexistente roda as mesmas derivações que a conta existente',
      async ({ digitada, formas }) => {
        await casos.criarConta({ email: EMAIL, senha: SENHA });
        const verificar = vi.spyOn(hasher, 'verificar');

        await erroDe(casos.entrar({ email: EMAIL, senha: digitada }));
        const naConta = verificar.mock.calls.map(([senha]) => senha);
        verificar.mockClear();
        await erroDe(
          casos.entrar({ email: 'joao@exemplo.com', senha: digitada }),
        );
        const semConta = verificar.mock.calls.map(([senha]) => senha);

        expect(naConta).toEqual(formas);
        expect(semConta).toEqual(formas);
        // Contra o hash fictício, que deriva de verdade (formato válido).
        for (const [, hash] of verificar.mock.calls) {
          expect(hash).toMatch(/^scrypt\$16\$8\$1\$/);
        }
      },
    );

    it('CA43 — senha certa em NFC confere na primeira forma, sem uma segunda derivação', async () => {
      await casos.criarConta({ email: EMAIL, senha: NFD });
      const verificar = vi.spyOn(hasher, 'verificar');

      await casos.entrar({ email: EMAIL, senha: NFD });

      expect(verificar).toHaveBeenCalledTimes(1);
      expect(verificar.mock.calls[0]?.[0]).toBe(NFC);
    });

    it('CA43 — o teto de 128 vale para a forma recebida: 128 em NFD (que vira menos em NFC) ainda é conferida; 129 é recusada sem derivar', async () => {
      const verificar = vi.spyOn(hasher, 'verificar');
      const limite = 'é'.repeat(64);
      expect([...limite]).toHaveLength(128);

      await erroDe(casos.entrar({ email: EMAIL, senha: limite }));
      expect(verificar).toHaveBeenCalledTimes(2);
      verificar.mockClear();
      await erroDe(casos.entrar({ email: EMAIL, senha: `${limite}x` }));
      expect(verificar).not.toHaveBeenCalled();
    });
  });

  describe('S7 — conta e primeira sessão gravadas juntas (CA44)', () => {
    it('CA44 — o cadastro entrega a sessão ao repositório de contas, numa só gravação, e não grava sessão à parte', async () => {
      const salvarConta = vi.spyOn(contas, 'salvar');
      const salvarSessao = vi.spyOn(sessoes, 'salvar');

      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });

      expect(salvarConta).toHaveBeenCalledTimes(1);
      const [conta, inicial] = salvarConta.mock.calls[0] ?? [];
      expect(inicial).toEqual({
        tokenHash: sha256(token),
        expiraEm: new Date(relogio.agora().getTime() + DURACAO_DA_SESSAO_MS),
      });
      expect(salvarSessao).not.toHaveBeenCalled();
      expect(await casos.validarSessao(token)).toBe(conta?.id);
    });

    it('CA44 — Dada uma falha ao gravar a sessão, então o erro sobe e a conta não fica gravada', async () => {
      vi.spyOn(sessoes, 'gravar').mockImplementation(() => {
        throw new Error('sessão fora');
      });

      const erro = await erroDe(
        casos.criarConta({ email: EMAIL, senha: SENHA }),
      );

      expect(erro.message).toBe('sessão fora');
      expect(contas.quantidade).toBe(0);
      expect(await contas.existeEmail(Email.criar(EMAIL))).toBe(false);
    });
  });

  describe('S3 — espera máxima na fila e conexão caída (CA45)', () => {
    /** Semáforo que conta as tarefas que de fato rodaram (derivações). */
    class SemaforoContado extends Semaforo {
      rodaram = 0;

      override executar<T>(
        tarefa: () => Promise<T>,
        opcoes?: Parameters<Semaforo['executar']>[1],
      ): Promise<T> {
        return super.executar(() => {
          this.rodaram += 1;
          return tarefa();
        }, opcoes);
      }
    }

    /**
     * Ocupa a única vaga até `liberar()`. A ocupação também conta em
     * `rodaram`: quem compara as derivações mede antes de ocupar e soma 1.
     */
    function ocupar(semaforo: Semaforo) {
      let liberar = () => {};
      const ocupacao = semaforo.executar(
        () =>
          new Promise<void>((resolver) => {
            liberar = resolver;
          }),
      );
      return { liberar: () => liberar(), ocupacao };
    }

    /**
     * Espera o pedido chegar à fila. Sem `vi.waitFor`: com timers falsos, ele
     * avança o relógio a cada volta e gastaria parte da espera máxima.
     */
    async function esperarFila(semaforo: Semaforo, quantos: number) {
      const limite = Date.now() + 4_000;
      while (semaforo.naFila !== quantos && Date.now() < limite) {
        await new Promise((resolver) => setImmediate(resolver));
      }
      expect(semaforo.naFila).toBe(quantos);
    }

    function confereOcupado(erro: Error): void {
      expect(erro).toBeInstanceOf(ErroIndisponivel);
      expect((erro as ErroIndisponivel).codigo).toBe('servico_ocupado');
      expect((erro as ErroIndisponivel).tentarDeNovoEmS).toBe(10);
    }

    let scrypt: SemaforoContado;
    let exportacao: SemaforoContado;
    let contaId: string;

    beforeEach(async () => {
      scrypt = new SemaforoContado(1);
      exportacao = new SemaforoContado(1);
      hasher = new HasherScrypt(
        { N: 2 ** 4, r: 8, p: 1 },
        { semaforo: scrypt },
      );
      dados = new DadosDaContaEmMemoria({ contas, sessoes });
      casos = criarCasosDeUsoDeContas({
        contas,
        sessoes,
        contasExcluidas: lapides,
        tentativasDeEntrada,
        hasher,
        relogio,
        dadosDaConta: dados,
        semaforoDaExportacao: exportacao,
      });
      const { token } = await casos.criarConta({ email: EMAIL, senha: SENHA });
      contaId = (await casos.validarSessao(token)) ?? '';
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('D42 — a espera máxima é 10 s e o retry-after, 10 s', () => {
      expect(ESPERA_MAXIMA_NA_FILA_MS).toBe(10_000);
      expect(TENTAR_DE_NOVO_EM_S).toBe(10);
    });

    const PEDIDOS_COM_SCRYPT = [
      {
        nome: 'cadastro',
        pedir: (c: CasosDeUsoDeContas) =>
          c.criarConta({ email: 'joao@exemplo.com', senha: SENHA }),
      },
      {
        nome: 'entrada',
        pedir: (c: CasosDeUsoDeContas) =>
          c.entrar({ email: EMAIL, senha: SENHA }),
      },
      {
        nome: 'entrada com e-mail inexistente',
        pedir: (c: CasosDeUsoDeContas) =>
          c.entrar({ email: 'ana@exemplo.com', senha: SENHA }),
      },
      {
        nome: 'exclusão',
        pedir: (c: CasosDeUsoDeContas, id: string) => c.excluirConta(id, SENHA),
      },
      {
        nome: 'exportação',
        pedir: (c: CasosDeUsoDeContas, id: string) =>
          c.exportarDados(id, SENHA, EM_JSON),
      },
    ];

    it.each(PEDIDOS_COM_SCRYPT)(
      'CA45 — Dada a fila do scrypt cheia, quando a $nome espera 10 s, então recebe servico_ocupado sem derivar nem gravar',
      async ({ pedir }) => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const antes = scrypt.rodaram + 1;
        const vaga = ocupar(scrypt);
        const quantasContas = contas.quantidade;

        const resultado = pedir(casos, contaId).then(
          () => null,
          (erro: Error) => erro,
        );
        await esperarFila(scrypt, 1);
        await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_NA_FILA_MS - 1);
        expect(scrypt.naFila).toBe(1);
        await vi.advanceTimersByTimeAsync(1);

        const erro = await resultado;
        confereOcupado(erro as Error);
        expect(scrypt.naFila).toBe(0);
        vaga.liberar();
        await vaga.ocupacao;
        expect(scrypt.rodaram).toBe(antes);
        expect(contas.quantidade).toBe(quantasContas);
        expect(dados.exclusoes).toEqual([]);
        expect(dados.coletas).toEqual([]);
      },
    );

    it.each(PEDIDOS_COM_SCRYPT)(
      'CA45 — Dada a $nome na fila do scrypt, quando a conexão cai, então sai da fila na hora, sem derivar',
      async ({ pedir }) => {
        const antes = scrypt.rodaram + 1;
        const vaga = ocupar(scrypt);
        const conexao = new AbortController();

        const resultado = pedirComSinal(pedir, conexao.signal).then(
          () => null,
          (erro: Error) => erro,
        );
        await esperarFila(scrypt, 1);
        conexao.abort();

        confereOcupado((await resultado) as Error);
        expect(scrypt.naFila).toBe(0);
        vaga.liberar();
        await vaga.ocupacao;
        expect(scrypt.rodaram).toBe(antes);
        expect(dados.exclusoes).toEqual([]);
        expect(dados.coletas).toEqual([]);
      },
    );

    /** O mesmo pedido da tabela, com o sinal da conexão. */
    function pedirComSinal(
      pedir: (c: CasosDeUsoDeContas, id: string) => Promise<unknown>,
      sinal: AbortSignal,
    ): Promise<unknown> {
      // Repassa o sinal a cada caso de uso chamado pelo pedido.
      const comSinal: CasosDeUsoDeContas = {
        ...casos,
        criarConta: (credenciais) => casos.criarConta(credenciais, sinal),
        entrar: (credenciais) => casos.entrar(credenciais, sinal),
        excluirConta: (id, senha) => casos.excluirConta(id, senha, sinal),
        exportarDados: (id, senha, opcoes) =>
          casos.exportarDados(id, senha, { ...opcoes, sinal }),
      };
      return pedir(comSinal, contaId);
    }

    it('CA45 — Dada a fila da exportação cheia, quando a coleta espera 10 s, então recebe servico_ocupado sem coletar', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const vaga = ocupar(exportacao);

      const resultado = casos.exportarDados(contaId, SENHA, EM_JSON).then(
        () => null,
        (erro: Error) => erro,
      );
      await esperarFila(exportacao, 1);
      await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_NA_FILA_MS);

      confereOcupado((await resultado) as Error);
      vaga.liberar();
      await vaga.ocupacao;
      expect(exportacao.rodaram).toBe(1);
      expect(dados.coletas).toEqual([]);
    });

    it('CA45 — Dada a exportação esperando a vaga da coleta, quando a conexão cai, então sai da fila sem coletar', async () => {
      const vaga = ocupar(exportacao);
      const conexao = new AbortController();

      const resultado = casos
        .exportarDados(contaId, SENHA, { ...EM_JSON, sinal: conexao.signal })
        .then(
          () => null,
          (erro: Error) => erro,
        );
      await esperarFila(exportacao, 1);
      conexao.abort();

      confereOcupado((await resultado) as Error);
      expect(exportacao.naFila).toBe(0);
      vaga.liberar();
      await vaga.ocupacao;
      expect(exportacao.rodaram).toBe(1);
      expect(dados.coletas).toEqual([]);
    });

    it('a vaga livre não espera: com a fila vazia, o pedido roda na hora mesmo com o sinal', async () => {
      const conexao = new AbortController();

      const sessao = await casos.entrar(
        { email: EMAIL, senha: SENHA },
        conexao.signal,
      );

      expect(await casos.validarSessao(sessao.token)).toBe(contaId);
    });

    it('a conexão que cai depois da vaga não interrompe: a senha conferida abre a sessão', async () => {
      const conexao = new AbortController();
      const verificar = vi.spyOn(hasher, 'verificar');

      const pedido = casos.entrar(
        { email: EMAIL, senha: SENHA },
        conexao.signal,
      );
      await vi.waitFor(() => expect(verificar).toHaveBeenCalled());
      conexao.abort();

      const { token } = await pedido;
      expect(await casos.validarSessao(token)).toBe(contaId);
    });

    it('o hash fictício da partida não tem espera máxima: com a fila cheia por mais de 10 s, o e-mail inexistente ainda recebe credenciais_invalidas', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const vaga = ocupar(scrypt);
      // Montagem nova: o hash fictício entra na fila atrás da vaga ocupada.
      const nova = criarCasosDeUsoDeContas({
        contas,
        sessoes,
        contasExcluidas: lapides,
        tentativasDeEntrada,
        hasher,
        relogio,
        dadosDaConta: dados,
      });
      await esperarFila(scrypt, 1);
      await vi.advanceTimersByTimeAsync(3 * ESPERA_MAXIMA_NA_FILA_MS);
      expect(scrypt.naFila).toBe(1);

      vaga.liberar();
      const erro = await erroDe(
        nova.entrar({ email: 'ana@exemplo.com', senha: SENHA }),
      );
      expect((erro as ErroDeRegra).codigo).toBe('credenciais_invalidas');
    });
  });
});
