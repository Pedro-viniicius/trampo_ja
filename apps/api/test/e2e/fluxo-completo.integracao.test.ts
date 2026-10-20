/**
 * Fluxo completo da API montada pela composição, com o Postgres de teste:
 * cadastro → publicar sem perfil (D9) → perfil → trampo → serviço → busca →
 * conversa sem vínculo → candidatura → aceite → conversa → mensagens → saída.
 *
 * Prova que as portas entre módulos estão ligadas de verdade em
 * `composicao.ts`: `perfis.perfilEstaCompleto` em `trampos` e `servicos` (D9)
 * e `trampos.existeVinculoEntre` em `conversas` (CA13).
 *
 * Os passos dependem uns dos outros e rodam em ordem, no mesmo banco.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Relogio } from '../../src/compartilhado/dominio/relogio.js';
import { type Aplicacao, montarAplicacao } from '../../src/composicao.js';
import { bancoDeTeste, truncarTabelas } from '../banco-teste.js';

const TABELAS = [
  'mensagens',
  'conversas',
  'candidaturas',
  'trampos',
  'servicos',
  'perfis',
  'sessoes',
  'contas',
];

// O hash de produção (scrypt N=2^17) leva ~0,6 s por cadastro ou entrada.
const TEMPO_LIMITE = 30_000;

const SENHA = 'senha-forte-123';
const EMAIL_EMPREGADOR = 'empregadora.ana@exemplo.com';
const EMAIL_FREELANCER = 'freela.bruno@exemplo.com';
const EMAIL_TERCEIRO = 'curioso.caio@exemplo.com';

/**
 * Cada leitura avança 1 s: datas distintas e crescentes, para a ordem da
 * busca e das mensagens não depender da velocidade da máquina.
 */
function relogioQueAvanca(): Relogio {
  let instante = Date.now();
  return {
    agora: () => {
      instante += 1000;
      return new Date(instante);
    },
  };
}

let aplicacao: Aplicacao;

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly texto: string;
}

async function pedir(
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token?: string,
  corpo?: Record<string, unknown>,
): Promise<Resposta> {
  const resposta = await aplicacao.app.inject({
    method: metodo,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(corpo ? { payload: corpo } : {}),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? undefined : resposta.json(),
    texto: resposta.body,
  };
}

/** CA14/CA15: nenhuma resposta de erro traz e-mail, senha ou outro dado. */
function esperarSemDadoPessoal(resposta: Resposta): void {
  for (const valor of [
    EMAIL_EMPREGADOR,
    EMAIL_FREELANCER,
    EMAIL_TERCEIRO,
    SENHA,
    '@',
  ]) {
    expect(resposta.texto).not.toContain(valor);
  }
}

function perfil(nome: string) {
  return {
    nome,
    cidade: 'Lavras',
    descricao: 'Trabalho com capricho.',
    habilidades: ['pintura', 'reparos'],
  };
}

const TRAMPO = {
  titulo: 'Pintura de muro externo',
  descricao: 'Pintura de um muro de 10 metros, tinta inclusa.',
  categoria: 'reformas',
  cidade: 'Lavras',
  valorCentavos: 35_000,
};

const SERVICO = {
  titulo: 'Pintura residencial',
  descricao: 'Pintura de paredes internas e externas.',
  categoria: 'reformas',
  cidade: 'Lavras',
  precoBaseCentavos: 20_000,
};

// Estado do fluxo, preenchido passo a passo.
let tokenEmpregador = '';
let tokenEmpregadorOutraSessao = '';
let tokenFreelancer = '';
let tokenTerceiro = '';
let empregadorId = '';
let freelancerId = '';
let trampoId = '';
let servicoId = '';
let candidaturaId = '';
let conversaId = '';

beforeAll(async () => {
  await truncarTabelas(TABELAS);
  aplicacao = await montarAplicacao({
    db: bancoDeTeste(),
    relogio: relogioQueAvanca(),
    rateLimit: false,
  });
});

afterAll(async () => {
  await aplicacao?.fechar();
  await truncarTabelas(TABELAS);
});

describe('fluxo completo da API (CA1–CA14, D9)', () => {
  it(
    'CA1 — empregador cria a conta e entra; CA2 — o mesmo e-mail de novo dá 409 sem dado da conta',
    async () => {
      const criada = await pedir('POST', '/contas', undefined, {
        email: EMAIL_EMPREGADOR,
        senha: SENHA,
      });
      expect(criada.status).toBe(201);
      expect(Object.keys(criada.corpo as object)).toEqual(['token']);
      tokenEmpregador = (criada.corpo as { token: string }).token;

      const repetida = await pedir('POST', '/contas', undefined, {
        email: EMAIL_EMPREGADOR.toUpperCase(),
        senha: 'outra-senha-456',
      });
      expect(repetida.status).toBe(409);
      expect(repetida.texto).toBe('{"erro":"email_em_uso"}');
      esperarSemDadoPessoal(repetida);

      const errada = await pedir('POST', '/sessoes', undefined, {
        email: EMAIL_EMPREGADOR,
        senha: 'senha-errada-789',
      });
      expect(errada.status).toBe(401);
      expect(errada.texto).toBe('{"erro":"credenciais_invalidas"}');

      const entrada = await pedir('POST', '/sessoes', undefined, {
        email: EMAIL_EMPREGADOR,
        senha: SENHA,
      });
      expect(entrada.status).toBe(200);
      tokenEmpregadorOutraSessao = (entrada.corpo as { token: string }).token;
      expect(tokenEmpregadorOutraSessao).not.toBe(tokenEmpregador);
    },
    TEMPO_LIMITE,
  );

  it('D9 — sem perfil completo, publicar trampo dá 409 perfil_incompleto; depois de PUT /perfis/eu, publica (CA3, CA4)', async () => {
    const semPerfil = await pedir('POST', '/trampos', tokenEmpregador, TRAMPO);
    expect(semPerfil.status).toBe(409);
    expect(semPerfil.texto).toBe('{"erro":"perfil_incompleto"}');

    const salvo = await pedir(
      'PUT',
      '/perfis/eu',
      tokenEmpregador,
      perfil('Ana Empregadora'),
    );
    expect(salvo.status).toBe(200);
    expect(salvo.corpo).toEqual({
      ...perfil('Ana Empregadora'),
      completo: true,
    });

    const publicado = await pedir('POST', '/trampos', tokenEmpregador, TRAMPO);
    expect(publicado.status).toBe(201);
    expect(publicado.corpo).toEqual({
      id: expect.any(String),
      status: 'aberto',
    });
    trampoId = (publicado.corpo as { id: string }).id;

    const detalhe = await pedir('GET', `/trampos/${trampoId}`, tokenEmpregador);
    expect(detalhe.status).toBe(200);
    expect(detalhe.corpo).toMatchObject({ ...TRAMPO, status: 'aberto' });
    empregadorId = (detalhe.corpo as { autorId: string }).autorId;

    const meus = await pedir('GET', '/trampos/meus', tokenEmpregador);
    expect((meus.corpo as { id: string }[]).map((t) => t.id)).toEqual([
      trampoId,
    ]);
  });

  it(
    'D9 e CA6 — freelancer sem perfil não candidata nem oferta; com perfil, oferta o serviço',
    async () => {
      const criada = await pedir('POST', '/contas', undefined, {
        email: EMAIL_FREELANCER,
        senha: SENHA,
      });
      expect(criada.status).toBe(201);
      tokenFreelancer = (criada.corpo as { token: string }).token;

      const candidaturaSemPerfil = await pedir(
        'POST',
        `/trampos/${trampoId}/candidaturas`,
        tokenFreelancer,
        { mensagem: 'Posso fazer amanhã.', valorPropostoCentavos: 30_000 },
      );
      expect(candidaturaSemPerfil.status).toBe(409);
      expect(candidaturaSemPerfil.corpo).toEqual({ erro: 'perfil_incompleto' });

      const servicoSemPerfil = await pedir(
        'POST',
        '/servicos',
        tokenFreelancer,
        SERVICO,
      );
      expect(servicoSemPerfil.status).toBe(409);
      expect(servicoSemPerfil.corpo).toEqual({ erro: 'perfil_incompleto' });

      const salvo = await pedir(
        'PUT',
        '/perfis/eu',
        tokenFreelancer,
        perfil('Bruno Freelancer'),
      );
      expect(salvo.status).toBe(200);

      const ofertado = await pedir(
        'POST',
        '/servicos',
        tokenFreelancer,
        SERVICO,
      );
      expect(ofertado.status).toBe(201);
      expect(ofertado.corpo).toEqual({
        id: expect.any(String),
        status: 'ativo',
      });
      servicoId = (ofertado.corpo as { id: string }).id;

      const detalhe = await pedir(
        'GET',
        `/servicos/${servicoId}`,
        tokenEmpregador,
      );
      expect(detalhe.status).toBe(200);
      expect(detalhe.corpo).toMatchObject(SERVICO);
      freelancerId = (detalhe.corpo as { autorId: string }).autorId;
      expect(freelancerId).not.toBe(empregadorId);
    },
    TEMPO_LIMITE,
  );

  it('CA7 — a busca traz o serviço e o trampo, mais recentes primeiro, e as categorias', async () => {
    const busca = await pedir(
      'GET',
      '/busca?texto=pintura&cidade=lavras&limite=5',
      tokenEmpregador,
    );
    expect(busca.status).toBe(200);
    const { itens, proximoCursor } = busca.corpo as {
      itens: { tipo: string; id: string }[];
      proximoCursor: string | null;
    };
    expect(itens.map(({ tipo, id }) => ({ tipo, id }))).toEqual([
      { tipo: 'servico', id: servicoId },
      { tipo: 'trampo', id: trampoId },
    ]);
    expect(proximoCursor).toBeNull();

    const soTrampos = await pedir(
      'GET',
      '/busca?texto=pintura&tipo=trampos',
      tokenFreelancer,
    );
    expect(
      (soTrampos.corpo as { itens: { id: string }[] }).itens.map((i) => i.id),
    ).toEqual([trampoId]);

    const nada = await pedir('GET', '/busca?texto=encanador', tokenFreelancer);
    expect(nada.corpo).toEqual({ itens: [], proximoCursor: null });

    const limiteInvalido = await pedir(
      'GET',
      '/busca?limite=abc',
      tokenFreelancer,
    );
    expect(limiteInvalido.status).toBe(400);

    const categorias = await pedir('GET', '/categorias', tokenFreelancer);
    expect(categorias.status).toBe(200);
    expect(categorias.corpo).toHaveLength(10);
    expect(categorias.corpo).toContainEqual({
      id: 'reformas',
      rotulo: 'Reformas e reparos',
    });
  });

  it('CA3 — o perfil público do freelancer não traz e-mail nem dado da conta', async () => {
    const publico = await pedir(
      'GET',
      `/perfis/${freelancerId}`,
      tokenEmpregador,
    );
    expect(publico.status).toBe(200);
    expect(publico.corpo).toEqual({
      contaId: freelancerId,
      ...perfil('Bruno Freelancer'),
    });
    esperarSemDadoPessoal(publico);
  });

  it('CA13 — sem candidatura entre os dois, o freelancer não abre conversa com o empregador (403 sem_vinculo)', async () => {
    const conversa = await pedir('POST', '/conversas', tokenFreelancer, {
      outroUsuarioId: empregadorId,
    });
    expect(conversa.status).toBe(403);
    expect(conversa.texto).toBe('{"erro":"sem_vinculo"}');
  });

  it('CA8 e CA9 — o freelancer se candidata; só o autor vê as candidaturas', async () => {
    const candidatura = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas`,
      tokenFreelancer,
      { mensagem: 'Posso fazer amanhã.', valorPropostoCentavos: 30_000 },
    );
    expect(candidatura.status).toBe(201);
    expect(candidatura.corpo).toEqual({
      id: expect.any(String),
      status: 'pendente',
    });

    const repetida = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas`,
      tokenFreelancer,
      { mensagem: 'De novo.', valorPropostoCentavos: 30_000 },
    );
    expect(repetida.status).toBe(409);
    expect(repetida.corpo).toEqual({ erro: 'candidatura_duplicada' });

    const doAutor = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas`,
      tokenEmpregador,
      { mensagem: 'Eu mesmo.', valorPropostoCentavos: 30_000 },
    );
    expect(doAutor.corpo).toEqual({ erro: 'autor_nao_pode_candidatar' });

    const lista = await pedir(
      'GET',
      `/trampos/${trampoId}/candidaturas`,
      tokenEmpregador,
    );
    expect(lista.status).toBe(200);
    expect(lista.corpo).toEqual([
      expect.objectContaining({
        freelancerId,
        mensagem: 'Posso fazer amanhã.',
        valorPropostoCentavos: 30_000,
        status: 'pendente',
      }),
    ]);
    candidaturaId = (lista.corpo as { id: string }[])[0]?.id ?? '';

    const deOutro = await pedir(
      'GET',
      `/trampos/${trampoId}/candidaturas`,
      tokenFreelancer,
    );
    expect(deOutro.status).toBe(404);
    expect(deOutro.corpo).toEqual({ erro: 'nao_encontrado' });
  });

  it('CA10 e CA11 — o empregador aceita; o trampo fica em andamento e o freelancer vê a candidatura aceita', async () => {
    const pelaOutraParte = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas/${candidaturaId}/aceitar`,
      tokenFreelancer,
    );
    expect(pelaOutraParte.status).toBe(404);

    const aceite = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas/${candidaturaId}/aceitar`,
      tokenEmpregador,
    );
    expect(aceite.status).toBe(200);
    expect(aceite.corpo).toEqual({ status: 'aceita' });

    const outroAceite = await pedir(
      'POST',
      `/trampos/${trampoId}/candidaturas/${candidaturaId}/aceitar`,
      tokenEmpregador,
    );
    expect(outroAceite.status).toBe(409);
    expect(outroAceite.corpo).toEqual({ erro: 'trampo_nao_aberto' });

    const detalhe = await pedir('GET', `/trampos/${trampoId}`, tokenFreelancer);
    expect(detalhe.corpo).toMatchObject({ status: 'em_andamento' });

    const minhas = await pedir('GET', '/candidaturas/minhas', tokenFreelancer);
    expect(minhas.status).toBe(200);
    expect(minhas.corpo).toEqual([
      expect.objectContaining({ trampoId, status: 'aceita' }),
    ]);

    // CA7: trampo em andamento sai da busca; o serviço continua.
    const busca = await pedir('GET', '/busca?texto=pintura', tokenEmpregador);
    expect(
      (busca.corpo as { itens: { id: string }[] }).itens.map((i) => i.id),
    ).toEqual([servicoId]);
  });

  it('CA12 e CA13 — com vínculo, a conversa abre e as mensagens saem em ordem cronológica para os dois', async () => {
    const aberta = await pedir('POST', '/conversas', tokenFreelancer, {
      outroUsuarioId: empregadorId,
    });
    expect(aberta.status).toBe(201);
    conversaId = (aberta.corpo as { conversaId: string }).conversaId;

    const deNovo = await pedir('POST', '/conversas', tokenEmpregador, {
      outroUsuarioId: freelancerId,
    });
    expect(deNovo.status).toBe(200);
    expect(deNovo.corpo).toEqual({ conversaId });

    const enviadas: [string, string][] = [
      [tokenFreelancer, 'Olá! Posso começar amanhã cedo?'],
      [tokenEmpregador, 'Pode sim, às 8h.'],
      [tokenFreelancer, 'Combinado.'],
    ];
    for (const [token, texto] of enviadas) {
      const envio = await pedir(
        'POST',
        `/conversas/${conversaId}/mensagens`,
        token,
        { texto },
      );
      expect(envio.status).toBe(201);
    }

    const vazia = await pedir(
      'POST',
      `/conversas/${conversaId}/mensagens`,
      tokenEmpregador,
      { texto: '   ' },
    );
    expect(vazia.status).toBe(400);
    expect(vazia.corpo).toEqual({
      erro: 'dados_invalidos',
      campos: [{ campo: 'texto', motivo: 'obrigatorio' }],
    });

    const esperadas = [
      { autorId: freelancerId, texto: 'Olá! Posso começar amanhã cedo?' },
      { autorId: empregadorId, texto: 'Pode sim, às 8h.' },
      { autorId: freelancerId, texto: 'Combinado.' },
    ];
    for (const token of [tokenFreelancer, tokenEmpregador]) {
      const lidas = await pedir(
        'GET',
        `/conversas/${conversaId}/mensagens`,
        token,
      );
      expect(lidas.status).toBe(200);
      const mensagens = lidas.corpo as {
        autorId: string;
        texto: string;
        enviadaEm: string;
      }[];
      expect(
        mensagens.map(({ autorId, texto }) => ({ autorId, texto })),
      ).toEqual(esperadas);
      const datas = mensagens.map((m) => Date.parse(m.enviadaEm));
      expect(datas).toEqual([...datas].sort((a, b) => a - b));
    }

    const conversas = await pedir('GET', '/conversas', tokenEmpregador);
    expect(conversas.corpo).toEqual([
      expect.objectContaining({
        conversaId,
        outroUsuarioId: freelancerId,
        ultimaMensagem: expect.objectContaining({ texto: 'Combinado.' }),
      }),
    ]);
  });

  it(
    'CA12 — um terceiro, mesmo com perfil completo, não lê nem escreve na conversa (404) e não conversa sem vínculo (403)',
    async () => {
      const criada = await pedir('POST', '/contas', undefined, {
        email: EMAIL_TERCEIRO,
        senha: SENHA,
      });
      tokenTerceiro = (criada.corpo as { token: string }).token;
      expect(
        (
          await pedir(
            'PUT',
            '/perfis/eu',
            tokenTerceiro,
            perfil('Caio Curioso'),
          )
        ).status,
      ).toBe(200);

      const leitura = await pedir(
        'GET',
        `/conversas/${conversaId}/mensagens`,
        tokenTerceiro,
      );
      expect(leitura.status).toBe(404);
      expect(leitura.texto).toBe('{"erro":"nao_encontrado"}');

      const escrita = await pedir(
        'POST',
        `/conversas/${conversaId}/mensagens`,
        tokenTerceiro,
        { texto: 'Oi?' },
      );
      expect(escrita.status).toBe(404);

      const semVinculo = await pedir('POST', '/conversas', tokenTerceiro, {
        outroUsuarioId: empregadorId,
      });
      expect(semVinculo.status).toBe(403);
      expect(semVinculo.corpo).toEqual({ erro: 'sem_vinculo' });

      expect((await pedir('GET', '/conversas', tokenTerceiro)).corpo).toEqual(
        [],
      );
    },
    TEMPO_LIMITE,
  );

  it('CA1 e CA14 — depois de DELETE /sessoes, o mesmo token recebe 401; a outra sessão segue válida', async () => {
    const saida = await pedir('DELETE', '/sessoes', tokenEmpregador);
    expect(saida.status).toBe(204);
    expect(saida.texto).toBe('');

    for (const [metodo, url] of [
      ['GET', '/categorias'],
      ['GET', `/trampos/${trampoId}`],
      ['GET', `/conversas/${conversaId}/mensagens`],
      ['DELETE', '/sessoes'],
    ] as const) {
      const negada = await pedir(metodo, url, tokenEmpregador);
      expect(negada.status, `${metodo} ${url}`).toBe(401);
      expect(negada.texto).toBe('{"erro":"nao_autenticado"}');
    }

    const outraSessao = await pedir(
      'GET',
      '/categorias',
      tokenEmpregadorOutraSessao,
    );
    expect(outraSessao.status).toBe(200);
  });
});
