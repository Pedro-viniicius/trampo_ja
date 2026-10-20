import type { FastifyInstance } from 'fastify';
import { DatabaseError } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { ErroDeRegra, ErroDeValidacao } from '../dominio/erros.js';
import {
  CENSURA,
  caminhosDoRedact,
  criarLogger,
  PROFUNDIDADE_DO_REDACT,
  serializarErro,
  URL_DE_ROTA_INEXISTENTE,
} from './logger.js';
import { criarServidor } from './servidor.js';

// Dados fictícios que nunca podem aparecer no log (CA15).
const EMAIL = 'maria.silva@exemplo.com';
const SENHA = 'segredo-da-maria-123';
const NOME = 'Maria Aparecida da Silva';
const TELEFONE = '(11) 98888-7777';
const TOKEN = 'tokenSecretoDaSessao0123456789abcdef';

function coletor() {
  const linhas: string[] = [];
  return {
    linhas,
    destino: { write: (linha: string) => void linhas.push(linha) },
    texto: () => linhas.join(''),
    registros: () =>
      linhas.map((linha) => JSON.parse(linha) as Record<string, unknown>),
  };
}

function erroDoPgSimulado(): Error {
  // Formato do `DatabaseError` do pg numa violação de unicidade.
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "contas_email_key"',
    ),
    {
      code: '23505',
      severity: 'ERROR',
      detail: `Key (email)=(${EMAIL}) already exists.`,
      where: `valor ${EMAIL}`,
      hint: `tente ${EMAIL}`,
      query: 'insert into contas (email, senha_hash) values ($1, $2)',
      parameters: [EMAIL, SENHA],
      constraint: 'contas_email_key',
    },
  );
}

function esperarSemDadoPessoal(texto: string): void {
  for (const valor of [EMAIL, SENHA, NOME, TELEFONE, TOKEN, 'maria']) {
    expect(texto).not.toContain(valor);
  }
}

describe('criarLogger', () => {
  it('usa o nível pedido, a censura [redigido] e os serializers seguros', () => {
    const opcoes = criarLogger({ nivel: 'warn' });

    expect(opcoes.level).toBe('warn');
    expect(opcoes.redact).toEqual({
      paths: caminhosDoRedact(),
      censor: CENSURA,
    });
    expect(CENSURA).toBe('[redigido]');
    expect(opcoes.serializers?.err).toBe(serializarErro);
    expect(opcoes).not.toHaveProperty('stream');
  });

  it('cobre cada chave sensível da raiz até a profundidade máxima', () => {
    const caminhos = caminhosDoRedact();
    for (const chave of ['authorization', 'senha', 'email', 'nome']) {
      expect(caminhos).toContain(chave);
      expect(caminhos).toContain('*.'.repeat(PROFUNDIDADE_DO_REDACT) + chave);
    }
    expect(caminhos).toContain('*.telefone');
    for (const chave of [
      'cidade',
      'descricao',
      'habilidades',
      'texto',
      'mensagem',
      'titulo',
    ]) {
      expect(caminhos).toContain(chave);
      expect(caminhos).toContain('*.'.repeat(PROFUNDIDADE_DO_REDACT) + chave);
    }
  });
});

describe('CA15 — logs da API sem dado pessoal', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function montar() {
    const log = coletor();
    app = criarServidor({
      logger: criarLogger({ nivel: 'trace', destino: log.destino }),
    });
    return { app, log };
  }

  it('Dado uma rota que loga corpo e cabeçalhos por descuido, então e-mail, senha, nome, telefone e Authorization saem como [redigido]', async () => {
    const { app, log } = montar();
    app.post('/descuido', async (requisicao) => {
      requisicao.log.info(
        {
          req: requisicao,
          body: requisicao.body,
          headers: requisicao.headers,
        },
        'log descuidado',
      );
      return { ok: true };
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/descuido',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        email: EMAIL,
        senha: SENHA,
        perfil: { nome: NOME, contato: { telefone: TELEFONE } },
        lista: [{ email: EMAIL }],
      },
    });

    expect(resposta.statusCode).toBe(200);
    esperarSemDadoPessoal(log.texto());
    const registro = log
      .registros()
      .find((r) => r.msg === 'log descuidado') as {
      body: {
        email: string;
        senha: string;
        perfil: { nome: string; contato: { telefone: string } };
        lista: { email: string }[];
      };
      headers: { authorization: string };
    };
    expect(registro.body.email).toBe(CENSURA);
    expect(registro.body.senha).toBe(CENSURA);
    expect(registro.body.perfil.nome).toBe(CENSURA);
    expect(registro.body.perfil.contato.telefone).toBe(CENSURA);
    expect(registro.body.lista[0]?.email).toBe(CENSURA);
    expect(registro.headers.authorization).toBe(CENSURA);
  });

  it('Dado uma rota que loga perfil, trampo, candidatura e mensagem por descuido, então cidade, descrição, habilidades, título, mensagem e texto saem como [redigido]', async () => {
    const { app, log } = montar();
    const CIDADE = 'Lavras do Sul';
    const DESCRICAO = 'Conserto portões na rua das Flores, 123';
    const HABILIDADE = 'serralheria artística';
    const TEXTO = 'me liga no fim da tarde, por favor';
    const TITULO = 'Portão da casa da Dona Cida';
    const MENSAGEM = 'Sou vizinho, moro no 125';
    app.post('/descuido', async (requisicao) => {
      requisicao.log.info({ body: requisicao.body }, 'log descuidado');
      return { ok: true };
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/descuido',
      payload: {
        cidade: CIDADE,
        descricao: DESCRICAO,
        habilidades: [HABILIDADE, 'solda'],
        titulo: TITULO,
        mensagem: MENSAGEM,
        conversa: { texto: TEXTO },
      },
    });

    expect(resposta.statusCode).toBe(200);
    const texto = log.texto();
    for (const valor of [
      CIDADE,
      DESCRICAO,
      HABILIDADE,
      'solda',
      TEXTO,
      TITULO,
      MENSAGEM,
    ]) {
      expect(texto).not.toContain(valor);
    }
    const registro = log
      .registros()
      .find((r) => r.msg === 'log descuidado') as {
      body: Record<string, unknown> & { conversa: { texto: unknown } };
    };
    expect(registro.body.cidade).toBe(CENSURA);
    expect(registro.body.descricao).toBe(CENSURA);
    expect(registro.body.habilidades).toBe(CENSURA);
    expect(registro.body.titulo).toBe(CENSURA);
    expect(registro.body.mensagem).toBe(CENSURA);
    expect(registro.body.conversa.texto).toBe(CENSURA);
  });

  it('redige a chave sensível no nível mais fundo coberto', async () => {
    const { app, log } = montar();
    // Raiz → n1 → … → n5 → email: nível 6.
    const fundo = { n1: { n2: { n3: { n4: { n5: { email: EMAIL } } } } } };
    app.get('/fundo', async (requisicao) => {
      requisicao.log.info(fundo, 'fundo');
      return {};
    });

    await app.inject({ method: 'GET', url: '/fundo' });

    expect(log.texto()).not.toContain(EMAIL);
    expect(log.texto()).toContain(CENSURA);
  });

  it('Dado um erro do pg com o e-mail no detail, quando ele chega ao tratador, então o log tem o código 23505 e nenhum dado da query', async () => {
    const { app, log } = montar();
    app.post('/contas', async () => {
      throw erroDoPgSimulado();
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/contas',
      payload: { email: EMAIL, senha: SENHA },
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: 'interno' });
    esperarSemDadoPessoal(resposta.body);
    esperarSemDadoPessoal(log.texto());
    const comErro = log.registros().find((r) => r.err) as {
      level: number;
      err: Record<string, unknown>;
    };
    expect(comErro.level).toBe(50);
    expect(comErro.err.code).toBe('23505');
    for (const campo of ['detail', 'where', 'hint', 'query', 'parameters']) {
      expect(comErro.err).not.toHaveProperty(campo);
    }
    expect(comErro.err.message).not.toContain('contas_email_key');
  });

  it('Dado um erro de domínio, então o log traz só código e campos, nunca o valor', async () => {
    const { app, log } = montar();
    app.post('/perfis', async () => {
      throw ErroDeValidacao.doCampo('nome', 'tamanho');
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/perfis',
      payload: { nome: NOME },
    });

    expect(resposta.statusCode).toBe(400);
    esperarSemDadoPessoal(log.texto());
    const comErro = log.registros().find((r) => r.err) as {
      level: number;
      err: Record<string, unknown>;
    };
    expect(comErro.level).toBe(30);
    expect(comErro.err).toMatchObject({
      type: 'ErroDeValidacao',
      codigo: 'dados_invalidos',
      campos: [{ campo: 'nome', motivo: 'tamanho' }],
    });
  });

  it('Dado dado pessoal no caminho, então o log de requisição registra o modelo da rota, nunca o valor do parâmetro', async () => {
    const { app, log } = montar();
    app.get('/perfis/:contaId', async () => ({}));
    app.get('/conversas/:id/mensagens', async () => []);

    await app.inject({ method: 'GET', url: `/perfis/${EMAIL}` });
    await app.inject({
      method: 'GET',
      url: `/conversas/${encodeURIComponent(NOME)}/mensagens?depoisDe=${EMAIL}`,
    });

    esperarSemDadoPessoal(log.texto());
    expect(log.texto()).not.toContain('Aparecida');
    const urls = log
      .registros()
      .filter((r) => r.msg === 'incoming request')
      .map((r) => (r.req as { url: string }).url);
    expect(urls).toEqual(['/perfis/:contaId', '/conversas/:id/mensagens']);
  });

  it('Dado uma rota inexistente ou um caminho malformado, então o log traz o marcador fixo, sem o caminho', async () => {
    const { app, log } = montar();

    const inexistente = await app.inject({
      method: 'GET',
      url: `/rota-que-nao-existe/${EMAIL}?nome=${encodeURIComponent(NOME)}`,
    });
    const malformado = await app.inject({
      method: 'GET',
      url: `/perfis/${EMAIL}%E0%A4%A`,
    });

    expect(inexistente.statusCode).toBe(404);
    expect(malformado.statusCode).toBeLessThan(500);
    esperarSemDadoPessoal(log.texto());
    const urls = log
      .registros()
      .filter((r) => r.msg === 'incoming request')
      .map((r) => (r.req as { url: string }).url);
    // O caminho malformado é recusado pelo Fastify (400) antes do log de
    // requisição; a rota inexistente sai com o marcador.
    expect(urls).toEqual([URL_DE_ROTA_INEXISTENTE]);
    expect(URL_DE_ROTA_INEXISTENTE).toBe('/(rota inexistente)');
  });

  it('o log de requisição registra o caminho sem a query string', async () => {
    const { app, log } = montar();
    app.get('/busca', async () => ({ itens: [] }));

    await app.inject({
      method: 'GET',
      url: `/busca?texto=${encodeURIComponent(NOME)}&email=${EMAIL}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    esperarSemDadoPessoal(log.texto());
    expect(log.texto()).not.toContain('Aparecida');
    const entrada = log
      .registros()
      .find((r) => r.msg === 'incoming request') as {
      req: { url: string; method: string };
    };
    expect(entrada.req).toMatchObject({ method: 'GET', url: '/busca' });
  });

  it('Dado um 401 por token desconhecido, então o token não aparece no log', async () => {
    const { app, log } = montar();
    app.get('/privado', async () => {
      throw Object.assign(new Error('nao autenticado'), { statusCode: 401 });
    });

    await app.inject({
      method: 'GET',
      url: '/privado',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(log.texto()).not.toContain(TOKEN);
  });
});

describe('serializarErro', () => {
  it('erro do pg real (DatabaseError): mantém classe e code, descarta mensagem, detail e pilha com mensagem', () => {
    const erro = Object.assign(
      new DatabaseError(
        `invalid input syntax for type uuid: "${EMAIL}"`,
        100,
        'error',
      ),
      {
        code: '22P02',
        severity: 'ERROR',
        detail: `Key (email)=(${EMAIL}) already exists.`,
        where: `parametro $1 = '${EMAIL}'`,
        routine: 'string_to_uuid',
      },
    );

    const serializado = serializarErro(erro);

    expect(serializado.type).toBe('DatabaseError');
    expect(serializado.code).toBe('22P02');
    expect(JSON.stringify(serializado)).not.toContain('maria');
    expect(serializado.stack).not.toContain('invalid input syntax');
    expect(Object.keys(serializado).sort()).toEqual([
      'code',
      'message',
      'stack',
      'type',
    ]);
  });

  it('erro do pg simulado (code 23505 e detail): nada do detail nem da mensagem', () => {
    const serializado = serializarErro(erroDoPgSimulado());

    expect(serializado).toMatchObject({ type: 'Error', code: '23505' });
    expect(serializado.message).toBe('[omitido: erro do banco 23505]');
    esperarSemDadoPessoal(JSON.stringify(serializado));
    expect(JSON.stringify(serializado)).not.toContain('duplicate key');
  });

  it('ErroDeRegra: classe e código', () => {
    expect(serializarErro(new ErroDeRegra('email_em_uso'))).toMatchObject({
      type: 'ErroDeRegra',
      codigo: 'email_em_uso',
      message: 'email_em_uso',
    });
  });

  it('erro comum: copia só tipo, mensagem, pilha, code e statusCode, nunca outras propriedades', () => {
    // O TypeError do `new URL` guarda a entrada em `input`.
    let erroDeUrl: unknown;
    try {
      new URL(`nao-e-url ${EMAIL}`);
    } catch (erro) {
      erroDeUrl = erro;
    }
    const erro = Object.assign(new Error('falhou ao chamar o serviço'), {
      code: 'ECONNREFUSED',
      statusCode: 503,
      corpo: { email: EMAIL },
    });

    expect(serializarErro(erro)).toEqual({
      type: 'Error',
      message: 'falhou ao chamar o serviço',
      stack: erro.stack,
      code: 'ECONNREFUSED',
      statusCode: 503,
    });
    expect(JSON.stringify(serializarErro(erroDeUrl))).not.toContain('maria');
  });

  it('serializa a causa com as mesmas regras', () => {
    const erro = new Error('falha ao gravar a conta', {
      cause: erroDoPgSimulado(),
    });

    const serializado = serializarErro(erro);

    expect(serializado.cause).toMatchObject({ code: '23505' });
    esperarSemDadoPessoal(JSON.stringify(serializado));
  });

  it('valor lançado que não é Error não tem o conteúdo registrado', () => {
    expect(serializarErro(EMAIL)).toEqual({
      type: 'string',
      message: '[valor lançado não é Error]',
      stack: '',
    });
    expect(JSON.stringify(serializarErro({ email: EMAIL }))).not.toContain(
      'maria',
    );
  });
});
