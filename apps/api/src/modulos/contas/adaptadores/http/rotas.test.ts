import { request as pedirHttp } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelogioFixo } from '../../../../compartilhado/dominio/relogio.js';
import { criarLogger } from '../../../../compartilhado/http/logger.js';
import { criarServidor } from '../../../../compartilhado/http/servidor.js';
import {
  type CasosDeUsoDeContas,
  criarCasosDeUsoDeContas,
  ESPERA_MAXIMA_NA_FILA_MS,
  TETO_DA_EXPORTACAO_BYTES,
} from '../../aplicacao/casos-de-uso.js';
import { Email } from '../../dominio/email.js';
import { HasherScrypt } from '../../dominio/hasher.js';
import type {
  PartesExportadas,
  RepositorioDeContas,
} from '../../dominio/portas.js';
import { Semaforo } from '../../dominio/semaforo.js';
import {
  DadosDaContaEmMemoria,
  RepositorioDeContasEmMemoria,
  RepositorioDeContasExcluidasEmMemoria,
  RepositorioDeSessoesEmMemoria,
  RepositorioDeTentativasDeEntradaEmMemoria,
} from '../memoria/repositorios-memoria.js';
import {
  criarRotasDeContas,
  type OpcoesDasRotasDeContas,
  RESPOSTA_DA_EXPORTACAO,
} from './rotas.js';

const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'segredo-123';

interface Montagem {
  readonly app: FastifyInstance;
  readonly contas: RepositorioDeContasEmMemoria;
  readonly sessoes: RepositorioDeSessoesEmMemoria;
  readonly dados: DadosDaContaEmMemoria;
  readonly hasher: HasherScrypt;
  readonly casos: CasosDeUsoDeContas;
  /** Linhas JSON escritas pelo logger (nível trace). */
  readonly linhasDoLog: string[];
}

interface OpcoesDaMontagem {
  readonly contasSubstitutas?: RepositorioDeContas;
  readonly partes?: PartesExportadas;
  readonly rotas?: OpcoesDasRotasDeContas;
  /** Fila do scrypt; padrão, a do processo. */
  readonly semaforoDoScrypt?: Semaforo;
  /** Fila da coleta da exportação; padrão, a do processo. */
  readonly semaforoDaExportacao?: Semaforo;
}

const AGORA = '2026-10-20T12:00:00.000Z';

function montar(opcoes: OpcoesDaMontagem = {}): Montagem {
  const relogio = new RelogioFixo(AGORA);
  const sessoes = new RepositorioDeSessoesEmMemoria(relogio);
  const contas = new RepositorioDeContasEmMemoria(sessoes);
  const lapides = new RepositorioDeContasExcluidasEmMemoria();
  const dados = new DadosDaContaEmMemoria({
    contas,
    sessoes,
    lapides,
    relogio,
    ...(opcoes.partes ? { partes: opcoes.partes } : {}),
  });
  // Hasher real com custo baixo, para os testes rodarem rápido.
  const hasher = new HasherScrypt(
    { N: 2 ** 4, r: 8, p: 1 },
    opcoes.semaforoDoScrypt ? { semaforo: opcoes.semaforoDoScrypt } : {},
  );
  const casos = criarCasosDeUsoDeContas({
    contas: opcoes.contasSubstitutas ?? contas,
    sessoes,
    contasExcluidas: lapides,
    tentativasDeEntrada: new RepositorioDeTentativasDeEntradaEmMemoria(),
    hasher,
    relogio,
    dadosDaConta: dados,
    ...(opcoes.semaforoDaExportacao
      ? { semaforoDaExportacao: opcoes.semaforoDaExportacao }
      : {}),
  });
  const linhasDoLog: string[] = [];
  const app = criarServidor({
    logger: criarLogger({
      nivel: 'trace',
      destino: { write: (linha) => linhasDoLog.push(linha) },
    }),
  });
  app.register(criarRotasDeContas(casos, opcoes.rotas));
  return { app, contas, sessoes, dados, hasher, casos, linhasDoLog };
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

  describe('POST /contas/eu/exclusao', () => {
    async function excluir(token: string | null, payload?: unknown) {
      return m.app.inject({
        method: 'POST',
        url: '/contas/eu/exclusao',
        headers: token === null ? {} : bearer(token),
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
    }

    it('CA17 — senha certa: 204 sem corpo, com no-store, a conta some e todas as sessões caem; a outra conta fica', async () => {
      const { token } = (await cadastrar()).json();
      const { token: outroAparelho } = (
        await m.app.inject({
          method: 'POST',
          url: '/sessoes',
          payload: { email: EMAIL, senha: SENHA },
        })
      ).json();
      const { token: daOutra } = (
        await cadastrar('joao@exemplo.com', SENHA)
      ).json();
      const contaId = await m.casos.validarSessao(token);

      const resposta = await excluir(token, { senha: SENHA });

      expect(resposta.statusCode).toBe(204);
      expect(resposta.body).toBe('');
      expect(resposta.headers['cache-control']).toBe('no-store');
      expect(m.dados.exclusoes).toEqual([contaId]);
      expect(await m.contas.existeEmail(Email.criar(EMAIL))).toBe(false);
      expect(await m.casos.validarSessao(token)).toBeNull();
      expect(await m.casos.validarSessao(outroAparelho)).toBeNull();
      expect(await m.casos.validarSessao(daOutra)).not.toBeNull();
      // O aparelho que pediu recebe 401 no próximo pedido.
      expect((await excluir(token, { senha: SENHA })).statusCode).toBe(401);
    });

    it('CA17 — senha errada: 403 senha_incorreta com no-store, e nada muda', async () => {
      const { token } = (await cadastrar()).json();

      const resposta = await excluir(token, { senha: 'senha-errada-1' });

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toEqual({ erro: 'senha_incorreta' });
      expect(resposta.headers['cache-control']).toBe('no-store');
      expect(m.dados.exclusoes).toEqual([]);
      expect(await m.casos.validarSessao(token)).not.toBeNull();
      expect(m.contas.quantidade).toBe(1);
    });

    it.each([
      ['corpo vazio (senha ausente)', {}],
      ['senha nula', { senha: null }],
      ['senha vazia', { senha: '' }],
      ['senha com 129 caracteres', { senha: 'a'.repeat(129) }],
    ])(
      'CA17 — %s: 403 senha_incorreta sem rodar o scrypt nem chamar a porta',
      async (_, corpo) => {
        const { token } = (await cadastrar()).json();
        const verificar = vi.spyOn(m.hasher, 'verificar');

        const resposta = await excluir(token, corpo);

        expect(resposta.statusCode).toBe(403);
        expect(resposta.json()).toEqual({ erro: 'senha_incorreta' });
        expect(verificar).not.toHaveBeenCalled();
        expect(m.dados.exclusoes).toEqual([]);
      },
    );

    it.each([
      ['chave extra', { senha: SENHA, contaId: 'outra-conta' }],
      ['senha que não é texto', { senha: 12345678 }],
      ['senha em lista', { senha: [SENHA] }],
      ['corpo em lista', [SENHA]],
    ])(
      '%s: 400 dados_invalidos, sem ecoar nada e sem excluir',
      async (_, corpo) => {
        const { token } = (await cadastrar()).json();

        const resposta = await excluir(token, corpo);

        expect(resposta.statusCode).toBe(400);
        expect(resposta.json().erro).toBe('dados_invalidos');
        expect(resposta.body).not.toContain(SENHA);
        expect(resposta.body).not.toContain('outra-conta');
        expect(resposta.headers['cache-control']).toBe('no-store');
        expect(m.dados.exclusoes).toEqual([]);
      },
    );

    it('sem corpo nenhum: 400 dados_invalidos, sem excluir', async () => {
      const { token } = (await cadastrar()).json();

      const resposta = await excluir(token);

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'body', motivo: 'invalido' }],
      });
      expect(m.dados.exclusoes).toEqual([]);
    });

    it('conta inexistente com sessão ainda válida: 404 nao_encontrado, sem chamar a porta', async () => {
      const { token } = (await cadastrar()).json();
      const contaId = (await m.casos.validarSessao(token)) ?? '';
      m.contas.excluir(contaId);

      const resposta = await excluir(token, { senha: SENHA });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
      expect(m.dados.exclusoes).toEqual([]);
    });

    it.each([
      ['sem cabeçalho', null],
      ['token desconhecido', 'a'.repeat(43)],
    ])(
      'CA14 — %s: 401 nao_autenticado, sem rodar o scrypt nem chamar a porta',
      async (_, token) => {
        await cadastrar();
        const verificar = vi.spyOn(m.hasher, 'verificar');

        const resposta = await excluir(token, { senha: SENHA });

        expect(resposta.statusCode).toBe(401);
        expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
        expect(verificar).not.toHaveBeenCalled();
        expect(m.dados.exclusoes).toEqual([]);
        expect(m.contas.quantidade).toBe(1);
      },
    );
  });

  describe('POST /contas/eu/exportacao', () => {
    const CRIADO_EM = '2026-10-19T10:00:00.000Z';
    // Sentinelas: não podem aparecer no log (CA24).
    const PARTES: PartesExportadas = {
      perfil: {
        nome: 'Nome Sentinela',
        cidade: 'Lavras',
        descricao: null,
        habilidades: ['pintura'],
        atualizadoEm: CRIADO_EM,
      },
      trampos: [
        {
          id: 't1',
          titulo: 'Titulo Sentinela',
          descricao: 'Descricao Sentinela',
          categoria: 'reformas',
          cidade: 'Lavras',
          valorCentavos: 15000,
          prazo: '2026-11-30',
          status: 'aberto',
          criadoEm: CRIADO_EM,
          candidaturasRecebidas: 2,
        },
      ],
      servicos: [
        {
          id: 's1',
          titulo: 'Servico Sentinela',
          descricao: 'Faço pintura',
          categoria: 'reformas',
          cidade: null,
          precoBaseCentavos: 5000,
          status: 'ativo',
          criadoEm: CRIADO_EM,
        },
      ],
      candidaturas: [
        {
          id: 'c1',
          trampoId: 't9',
          mensagem: 'Mensagem Sentinela',
          valorPropostoCentavos: 1000,
          status: 'pendente',
          criadaEm: CRIADO_EM,
        },
      ],
      conversas: [
        {
          id: 'v1',
          outroUsuarioId: 'u2',
          criadaEm: CRIADO_EM,
          minhasMensagens: [
            { id: 'm1', texto: 'Texto Sentinela', enviadaEm: CRIADO_EM },
          ],
        },
      ],
    };

    /** As mesmas partes com uma chave a mais em cada nível. */
    function comExtras(partes: PartesExportadas): PartesExportadas {
      const extra = { senhaHash: 'scrypt$extra', texto_busca: 'derivado' };
      const comChavesAMais = {
        perfil: partes.perfil && {
          ...partes.perfil,
          cidadeNormalizada: 'lavras',
          ...extra,
        },
        trampos: partes.trampos.map((t) => ({ ...t, ...extra })),
        servicos: partes.servicos.map((s) => ({ ...s, ...extra })),
        candidaturas: partes.candidaturas.map((c) => ({
          ...c,
          freelancerId: 'f1',
          ...extra,
        })),
        conversas: partes.conversas.map((c) => ({
          ...c,
          usuarioAId: 'u1',
          ...extra,
          minhasMensagens: c.minhasMensagens.map((msg) => ({
            ...msg,
            autorId: 'u1',
            ...extra,
          })),
        })),
      };
      return comChavesAMais as PartesExportadas;
    }

    async function exportar(token: string | null, payload?: unknown) {
      return m.app.inject({
        method: 'POST',
        url: '/contas/eu/exportacao',
        headers: token === null ? {} : bearer(token),
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
    }

    it('CA19 — senha certa: 200 com o JSON v1 exato (conta, sessões e partes), no-store e sem hash nem token', async () => {
      await m.app.close();
      m = montar({ partes: comExtras(PARTES) });
      const { token } = (await cadastrar()).json();
      await m.app.inject({
        method: 'POST',
        url: '/sessoes',
        payload: { email: EMAIL, senha: SENHA },
      });
      const contaId = await m.casos.validarSessao(token);
      const conta = await m.contas.buscarPorEmail(Email.criar(EMAIL));

      const resposta = await exportar(token, { senha: SENHA });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['cache-control']).toBe('no-store');
      // A string pronta do serializador sai como está: JSON de objeto, não
      // uma string JSON serializada de novo.
      expect(resposta.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(resposta.body.startsWith('{"formato":')).toBe(true);
      const expiraEm = new Date(
        Date.parse(AGORA) + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      expect(resposta.json()).toStrictEqual({
        formato: 'trampo-ja.exportacao.v1',
        geradoEm: AGORA,
        conta: { id: contaId, email: EMAIL, criadaEm: AGORA },
        sessoes: [
          { criadaEm: AGORA, expiraEm },
          { criadaEm: AGORA, expiraEm },
        ],
        ...PARTES,
      });
      expect(m.dados.coletas).toEqual([contaId]);
      for (const proibido of [
        conta?.senhaHash ?? '-',
        'scrypt',
        token,
        'texto_busca',
        'cidadeNormalizada',
        'freelancerId',
        'autorId',
        'usuarioAId',
      ]) {
        expect(resposta.body).not.toContain(proibido);
      }
    });

    it('CA19 — sem nada nos outros módulos: perfil null e listas vazias', async () => {
      const { token } = (await cadastrar()).json();

      const corpo = (await exportar(token, { senha: SENHA })).json();

      expect(corpo.perfil).toBeNull();
      for (const lista of [
        'trampos',
        'servicos',
        'candidaturas',
        'conversas',
      ]) {
        expect(corpo[lista]).toEqual([]);
      }
      expect(corpo.sessoes).toHaveLength(1);
    });

    it('o schema da resposta é fechado na raiz: chave a mais não sai', async () => {
      const prova = criarServidor({ logger: false });
      prova.get(
        '/prova',
        { schema: { response: { 200: RESPOSTA_DA_EXPORTACAO } } },
        async () => ({
          formato: 'trampo-ja.exportacao.v1',
          geradoEm: AGORA,
          conta: { id: 'c', email: EMAIL, criadaEm: AGORA, senhaHash: 'x' },
          sessoes: [{ criadaEm: AGORA, expiraEm: AGORA, tokenHash: 'y' }],
          ...PARTES,
          senhaHash: 'scrypt$1',
          tokens: ['z'],
        }),
      );
      try {
        const corpo = (await prova.inject({ url: '/prova' })).json();
        expect(Object.keys(corpo)).toEqual([
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
        expect(Object.keys(corpo.conta)).toEqual(['id', 'email', 'criadaEm']);
        expect(Object.keys(corpo.sessoes[0])).toEqual(['criadaEm', 'expiraEm']);
      } finally {
        await prova.close();
      }
    });

    it('parte de outro módulo sem um campo do contrato: 500 interno, sem dado no corpo', async () => {
      const { titulo: _, ...semTitulo } = PARTES.trampos[0] ?? {};
      await m.app.close();
      m = montar({
        partes: {
          ...PARTES,
          trampos: [semTitulo as PartesExportadas['trampos'][number]],
        },
      });
      const { token } = (await cadastrar()).json();

      const resposta = await exportar(token, { senha: SENHA });

      expect(resposta.statusCode).toBe(500);
      expect(resposta.json()).toEqual({ erro: 'interno' });
    });

    it('CA48 — medida acima do teto: 409 exportacao_grande com no-store, só o código no corpo, sem coletar', async () => {
      const { token } = (await cadastrar()).json();
      m.dados.medida = TETO_DA_EXPORTACAO_BYTES;

      const resposta = await exportar(token, { senha: SENHA });

      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toStrictEqual({ erro: 'exportacao_grande' });
      expect(resposta.headers['cache-control']).toBe('no-store');
      expect(m.dados.medicoes).toHaveLength(1);
      expect(m.dados.coletas).toEqual([]);
      const log = m.linhasDoLog.join('\n');
      expect(log).not.toContain(String(TETO_DA_EXPORTACAO_BYTES));
      expect(log).not.toContain(EMAIL);
      expect(log).not.toContain(SENHA);
    });

    it('CA48 — a serialização é a do schema da rota, feita no caso de uso: o corpo é exatamente o que o serializador devolveu', async () => {
      const { token } = (await cadastrar()).json();
      const exportarDados = vi.spyOn(m.casos, 'exportarDados');

      const resposta = await exportar(token, { senha: SENHA });

      expect(resposta.statusCode).toBe(200);
      const texto = await exportarDados.mock.results[0]?.value;
      expect(resposta.body).toBe(texto);
      expect(JSON.parse(resposta.body).formato).toBe('trampo-ja.exportacao.v1');
    });

    it('senha errada: 403 senha_incorreta com no-store, sem coletar nada', async () => {
      const { token } = (await cadastrar()).json();

      const resposta = await exportar(token, { senha: 'senha-errada-1' });

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toEqual({ erro: 'senha_incorreta' });
      expect(resposta.headers['cache-control']).toBe('no-store');
      expect(m.dados.coletas).toEqual([]);
    });

    it.each([
      ['senha ausente', {}],
      ['senha com 129 caracteres', { senha: 'a'.repeat(129) }],
    ])('%s: 403 sem rodar o scrypt nem coletar', async (_, corpo) => {
      const { token } = (await cadastrar()).json();
      const verificar = vi.spyOn(m.hasher, 'verificar');

      const resposta = await exportar(token, corpo);

      expect(resposta.statusCode).toBe(403);
      expect(verificar).not.toHaveBeenCalled();
      expect(m.dados.coletas).toEqual([]);
    });

    it('chave extra no corpo: 400 dados_invalidos', async () => {
      const { token } = (await cadastrar()).json();

      const resposta = await exportar(token, { senha: SENHA, formato: 'v2' });

      expect(resposta.statusCode).toBe(400);
      expect(m.dados.coletas).toEqual([]);
    });

    it('CA14 — sem token: 401 nao_autenticado, sem coletar', async () => {
      await cadastrar();

      const resposta = await exportar(null, { senha: SENHA });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      expect(m.dados.coletas).toEqual([]);
    });
  });

  describe('sem a porta DadosDaConta ligada', () => {
    it('as rotas de exclusão e exportação não existem (404), mesmo com token válido', async () => {
      await m.app.close();
      m = montar({ rotas: { exclusaoEExportacao: false } });
      const { token } = (await cadastrar()).json();

      for (const url of ['/contas/eu/exclusao', '/contas/eu/exportacao']) {
        const resposta = await m.app.inject({
          method: 'POST',
          url,
          headers: bearer(token),
          payload: { senha: SENHA },
        });
        expect(resposta.statusCode, url).toBe(404);
        expect(resposta.json()).toEqual({ erro: 'nao_encontrado' });
      }
      expect(m.contas.quantidade).toBe(1);
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

    it('CA24 — exclusão e exportação não registram a senha, o e-mail nem o conteúdo exportado', async () => {
      const senhaErrada = 'senha-errada-sentinela';
      await m.app.close();
      m = montar({
        partes: {
          perfil: {
            nome: 'Nome Sentinela',
            cidade: 'Cidade Sentinela',
            descricao: 'Descricao Sentinela',
            habilidades: ['Habilidade Sentinela'],
            atualizadoEm: AGORA,
          },
          trampos: [],
          servicos: [],
          candidaturas: [],
          conversas: [],
        },
      });
      const { token } = (await cadastrar()).json();
      for (const url of ['/contas/eu/exportacao', '/contas/eu/exclusao']) {
        for (const payload of [
          { senha: senhaErrada },
          { senha: SENHA, extra: senhaErrada },
          { senha: SENHA },
        ]) {
          await m.app.inject({
            method: 'POST',
            url,
            headers: bearer(token),
            payload,
          });
        }
      }

      const log = m.linhasDoLog.join('\n');
      expect(log).toContain('requisição recusada');
      expect(log).toContain('/contas/eu/exclusao');
      for (const proibido of [
        SENHA,
        senhaErrada,
        'maria.silva',
        token,
        'Sentinela',
      ]) {
        expect(log).not.toContain(proibido);
      }
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
        buscarPorId: async () => null,
        existeEmail: async () => false,
      };
      await m.app.close();
      m = montar({ contasSubstitutas: contasQueFalham });

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

describe('CA45 — fila do scrypt e da exportação (HTTP)', () => {
  let m: Montagem;
  let scrypt: SemaforoContado;
  let exportacao: SemaforoContado;
  let token: string;

  /** Semáforo de 1 vaga que conta as tarefas que de fato rodaram. */
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

  /** Ocupa a única vaga até `liberar()` (a ocupação conta em `rodaram`). */
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

  /** Sem `vi.waitFor`: com timers falsos, ele avançaria o relógio. */
  async function esperarFila(semaforo: Semaforo, quantos: number) {
    const limite = Date.now() + 4_000;
    while (semaforo.naFila !== quantos && Date.now() < limite) {
      await new Promise((resolver) => setImmediate(resolver));
    }
    expect(semaforo.naFila).toBe(quantos);
  }

  beforeEach(async () => {
    scrypt = new SemaforoContado(1);
    exportacao = new SemaforoContado(1);
    m = montar({ semaforoDoScrypt: scrypt, semaforoDaExportacao: exportacao });
    const cadastro = await m.app.inject({
      method: 'POST',
      url: '/contas',
      payload: { email: EMAIL, senha: SENHA },
    });
    token = cadastro.json().token;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await m.app.close();
  });

  const ROTAS_COM_SENHA = [
    {
      url: '/contas',
      payload: { email: 'joao@exemplo.com', senha: SENHA },
      autenticada: false,
    },
    {
      url: '/sessoes',
      payload: { email: EMAIL, senha: SENHA },
      autenticada: false,
    },
    {
      url: '/contas/eu/exclusao',
      payload: { senha: SENHA },
      autenticada: true,
    },
    {
      url: '/contas/eu/exportacao',
      payload: { senha: SENHA },
      autenticada: true,
    },
  ];

  it.each(ROTAS_COM_SENHA)(
    'POST $url com a fila do scrypt cheia por 10 s: 503 servico_ocupado com retry-after 10, sem derivar e sem dado pessoal no log',
    async ({ url, payload, autenticada }) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const antes = scrypt.rodaram + 1;
      const vaga = ocupar(scrypt);

      const pedido = m.app.inject({
        method: 'POST',
        url,
        payload,
        headers: autenticada ? bearer(token) : {},
      });
      await esperarFila(scrypt, 1);
      await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_NA_FILA_MS);
      const resposta = await pedido;

      expect(resposta.statusCode).toBe(503);
      expect(resposta.json()).toEqual({ erro: 'servico_ocupado' });
      expect(resposta.headers['retry-after']).toBe('10');
      vaga.liberar();
      await vaga.ocupacao;
      expect(scrypt.rodaram).toBe(antes);
      expect(m.contas.quantidade).toBe(1);
      expect(m.dados.exclusoes).toEqual([]);
      expect(m.dados.coletas).toEqual([]);
      const log = m.linhasDoLog.join('\n');
      expect(log).toContain('serviço ocupado');
      expect(log).not.toContain(EMAIL);
      expect(log).not.toContain('joao@exemplo.com');
      expect(log).not.toContain(SENHA);
      expect(log).not.toContain(token);
    },
  );

  it('POST /contas/eu/exportacao com a fila da coleta cheia por 10 s: 503 com retry-after e no-store, sem coletar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const vaga = ocupar(exportacao);

    const pedido = m.app.inject({
      method: 'POST',
      url: '/contas/eu/exportacao',
      payload: { senha: SENHA },
      headers: bearer(token),
    });
    await esperarFila(exportacao, 1);
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_NA_FILA_MS);
    const resposta = await pedido;

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toEqual({ erro: 'servico_ocupado' });
    expect(resposta.headers['retry-after']).toBe('10');
    expect(resposta.headers['cache-control']).toBe('no-store');
    vaga.liberar();
    await vaga.ocupacao;
    expect(exportacao.rodaram).toBe(1);
    expect(m.dados.coletas).toEqual([]);
  });

  describe('socket fechado na fila (servidor real na porta 0)', () => {
    async function escutar(): Promise<number> {
      await m.app.listen({ port: 0, host: '127.0.0.1' });
      return (m.app.server.address() as AddressInfo).port;
    }

    /** Abre o pedido HTTP e devolve como derrubar a conexão. */
    function pedirDeVerdade(
      porta: number,
      url: string,
      payload: object,
      headers: Record<string, string>,
    ) {
      const corpo = JSON.stringify(payload);
      const cliente = pedirHttp({
        host: '127.0.0.1',
        port: porta,
        method: 'POST',
        path: url,
        headers: {
          ...headers,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(corpo)),
        },
      });
      cliente.on('error', () => {});
      cliente.end(corpo);
      return { derrubar: () => cliente.destroy() };
    }

    it.each(ROTAS_COM_SENHA)(
      'POST $url: a conexão cai com o pedido na fila do scrypt, ele sai da fila na hora e nada é derivado, gravado, excluído ou coletado',
      async ({ url, payload, autenticada }) => {
        const porta = await escutar();
        const antes = scrypt.rodaram + 1;
        const vaga = ocupar(scrypt);

        const pedido = pedirDeVerdade(
          porta,
          url,
          payload,
          autenticada ? bearer(token) : {},
        );
        await esperarFila(scrypt, 1);
        pedido.derrubar();
        // Sai da fila com a vaga ainda ocupada: foi o sinal, não a vez.
        await esperarFila(scrypt, 0);
        vaga.liberar();
        await vaga.ocupacao;

        expect(scrypt.rodaram).toBe(antes);
        expect(m.contas.quantidade).toBe(1);
        expect(m.sessoes.hashesGravados()).toHaveLength(1);
        expect(m.dados.exclusoes).toEqual([]);
        expect(m.dados.coletas).toEqual([]);
      },
    );

    it('POST /contas/eu/exportacao: a conexão cai com o pedido na fila da coleta, ele sai da fila e nada é coletado', async () => {
      const porta = await escutar();
      const vaga = ocupar(exportacao);

      const pedido = pedirDeVerdade(
        porta,
        '/contas/eu/exportacao',
        { senha: SENHA },
        bearer(token),
      );
      await esperarFila(exportacao, 1);
      pedido.derrubar();
      await esperarFila(exportacao, 0);
      vaga.liberar();
      await vaga.ocupacao;

      expect(exportacao.rodaram).toBe(1);
      expect(m.dados.coletas).toEqual([]);
    });

    it('com o cliente conectado, o pedido na fila espera a vaga e é atendido (o sinal não aborta à toa)', async () => {
      const porta = await escutar();
      const vaga = ocupar(scrypt);
      const corpo = JSON.stringify({ email: EMAIL, senha: SENHA });

      const status = new Promise<number>((resolver, rejeitar) => {
        const cliente = pedirHttp(
          {
            host: '127.0.0.1',
            port: porta,
            method: 'POST',
            path: '/sessoes',
            headers: {
              'content-type': 'application/json',
              'content-length': String(Buffer.byteLength(corpo)),
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolver(res.statusCode ?? 0));
          },
        );
        cliente.on('error', rejeitar);
        cliente.end(corpo);
      });
      await esperarFila(scrypt, 1);
      await new Promise((resolver) => setTimeout(resolver, 30));
      expect(scrypt.naFila).toBe(1);
      vaga.liberar();

      expect(await status).toBe(200);
    });
  });
});
