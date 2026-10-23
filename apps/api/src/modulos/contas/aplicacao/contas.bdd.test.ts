import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
  ErroProibido,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import {
  DadosDaContaEmMemoria,
  PARTES_VAZIAS,
  RepositorioDeContasEmMemoria,
  RepositorioDeSessoesEmMemoria,
} from '../adaptadores/memoria/repositorios-memoria.js';
import { Email } from '../dominio/email.js';
import { HasherScrypt } from '../dominio/hasher.js';
import {
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type PartesExportadas,
} from '../dominio/portas.js';
import { Semaforo } from '../dominio/semaforo.js';
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
  let dados: DadosDaContaEmMemoria;
  let casos: CasosDeUsoDeContas;

  /** Monta os casos de uso com as partes dos outros módulos na exportação. */
  function montarCasos(partes?: PartesExportadas): void {
    dados = new DadosDaContaEmMemoria({
      contas,
      sessoes,
      ...(partes ? { partes } : {}),
    });
    casos = criarCasosDeUsoDeContas({
      contas,
      sessoes,
      hasher,
      relogio,
      dadosDaConta: dados,
    });
  }

  beforeEach(() => {
    relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
    contas = new RepositorioDeContasEmMemoria();
    sessoes = new RepositorioDeSessoesEmMemoria(relogio);
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

      const exportacao = await casos.exportarDados(contaId, SENHA);

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

      const exportacao = await casos.exportarDados(
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
      const erro = await erroDe(casos.exportarDados(contaId, 'senha-errada'));

      expect(erro).toBeInstanceOf(ErroProibido);
      expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
      expect(dados.coletas).toEqual([]);
    });

    it.each(SENHAS_FORA_DO_FORMATO)(
      'senha %s: 403 sem rodar o scrypt nem coletar',
      async (_, senha) => {
        const verificar = vi.spyOn(hasher, 'verificar');

        const erro = await erroDe(casos.exportarDados(contaId, senha));

        expect((erro as ErroProibido).codigo).toBe('senha_incorreta');
        expect(verificar).not.toHaveBeenCalled();
        expect(dados.coletas).toEqual([]);
      },
    );

    it('conta inexistente: 404, sem coletar', async () => {
      const erro = await erroDe(casos.exportarDados('nao-e-uuid', SENHA));

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
        primeira.exportarDados(contaA, SENHA),
        segunda.exportarDados(contaB, SENHA),
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

      const erro = await erroDe(primeira.exportarDados(contaA, SENHA));

      expect(erro.message).toBe('banco fora');
      expect(semaforo.emUso).toBe(0);
      const depois = segunda.exportarDados(contaB, SENHA);
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

      await erroDe(primeira.exportarDados(contaA, 'senha-errada'));

      expect(executar).not.toHaveBeenCalled();
    });
  });
});
