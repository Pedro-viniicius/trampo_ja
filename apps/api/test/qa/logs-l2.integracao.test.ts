/**
 * QA da L2, CA35 na API: os textos do `PUT` (trampo e serviço) e a mensagem da
 * candidatura retirada nunca aparecem no log nem na resposta de erro, em
 * nenhum caminho (204, 400, 404, 409, 401 e JSON quebrado). Logger em `trace`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarLogger } from '../../src/compartilhado/http/logger.js';
import type { Aplicacao } from '../../src/composicao.js';
import {
  candidatar,
  criarUsuario,
  limparBanco,
  montar,
  ofertarServico,
  pedir,
  publicarTrampo,
  type Resposta,
} from './apoio.js';

const escritas: string[] = [];
const destino = {
  write(linha: string): void {
    escritas.push(linha);
  },
};

const TITULO = 'TituloSentinelaL2PUT';
const DESCRICAO = 'DescricaoSentinelaL2PUT';
const CIDADE = 'CidadeSentinelaL2';
const MENSAGEM = 'MensagemSentinelaL2Retirada';
const CHAVE_EXTRA = 'ChaveExtraSentinelaL2';
const VERSAO_TEXTO = 'VersaoTextoSentinelaL2';
const SENTINELAS = [
  TITULO,
  DESCRICAO,
  CIDADE,
  MENSAGEM,
  CHAVE_EXTRA,
  VERSAO_TEXTO,
];

let app: Aplicacao;

beforeAll(async () => {
  await limparBanco();
  app = await montar({ logger: criarLogger({ nivel: 'trace', destino }) });
});

afterAll(async () => {
  await app?.fechar();
  await limparBanco();
});

const log = () => escritas.join('');

function semSentinela(r: Resposta, onde: string): void {
  for (const s of SENTINELAS) {
    expect(r.texto, `${onde} (resposta)`).not.toContain(s);
  }
}

describe('CA35 — texto do PUT e da candidatura fora de log e de erro', () => {
  it('trampo: nenhum dos caminhos do PUT, de encerrar, excluir e retirar deixa texto no log ou na resposta', async () => {
    const autor = await criarUsuario(app);
    const terceiro = await criarUsuario(app);
    const freela = await criarUsuario(app);
    const id = await publicarTrampo(app, autor);
    const corpo = (versao: unknown, extra: Record<string, unknown> = {}) => ({
      titulo: TITULO,
      descricao: DESCRICAO,
      categoria: 'reformas',
      cidade: CIDADE,
      valorCentavos: 10_000,
      versao,
      ...extra,
    });
    const caminhos: [string, Resposta, number][] = [];
    const tentar = async (
      nome: string,
      esperado: number,
      pedido: Promise<Resposta>,
    ) => caminhos.push([nome, await pedido, esperado]);

    // 400 por campo inválido do domínio, com os outros textos válidos.
    await tentar(
      '400 campo',
      400,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpo: corpo(1, { valorCentavos: 0 }),
      }),
    );
    // 400 por schema: chave extra com nome sentinela, versão em texto.
    await tentar(
      '400 chave extra',
      400,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpo: corpo(1, { [CHAVE_EXTRA]: DESCRICAO }),
      }),
    );
    await tentar(
      '400 versao texto',
      400,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpo: corpo(VERSAO_TEXTO),
      }),
    );
    await tentar(
      '400 json quebrado',
      400,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpoBruto: `{"titulo":"${TITULO}","descricao":"${DESCRICAO}"`,
      }),
    );
    await tentar(
      '404 terceiro',
      404,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: terceiro.token,
        corpo: corpo(1),
      }),
    );
    await tentar(
      '404 id lixo',
      404,
      pedir(app, 'PUT', `/trampos/${DESCRICAO}`, {
        token: autor.token,
        corpo: corpo(1),
      }),
    );
    await tentar(
      '401 sem sessão',
      401,
      pedir(app, 'PUT', `/trampos/${id}`, { corpo: corpo(1) }),
    );
    await tentar(
      '409 conflito',
      409,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpo: corpo(9),
      }),
    );
    // 204 (edição vale) e depois candidatura com mensagem sentinela.
    await tentar(
      '204 edição',
      204,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpo: corpo(1),
      }),
    );
    const cand = await candidatar(app, freela, id, { mensagem: MENSAGEM });
    expect(cand.status, cand.texto).toBe(201);
    await tentar(
      '409 não editável',
      409,
      pedir(app, 'PUT', `/trampos/${id}`, {
        token: autor.token,
        corpo: corpo(3),
      }),
    );
    // Retirar de outra conta (404), retirar (204), de novo (404).
    const candId = (cand.corpo as { id: string }).id;
    await tentar(
      '404 retirar de outro',
      404,
      pedir(app, 'DELETE', `/candidaturas/${candId}`, {
        token: terceiro.token,
      }),
    );
    // Aceita a candidatura: depois retirar dá 409.
    await tentar(
      'aceite',
      200,
      pedir(app, 'POST', `/trampos/${id}/candidaturas/${candId}/aceitar`, {
        token: autor.token,
      }),
    );
    await tentar(
      '409 retirar aceita',
      409,
      pedir(app, 'DELETE', `/candidaturas/${candId}`, { token: freela.token }),
    );
    await tentar(
      '204 encerrar',
      204,
      pedir(app, 'POST', `/trampos/${id}/encerrar`, { token: autor.token }),
    );
    await tentar(
      '409 excluir encerrado',
      409,
      pedir(app, 'DELETE', `/trampos/${id}`, { token: autor.token }),
    );

    for (const [nome, r, esperado] of caminhos) {
      expect(r.status, `${nome}: ${r.texto}`).toBe(esperado);
      semSentinela(r, nome);
    }
    const saida = log();
    expect(saida.length).toBeGreaterThan(0);
    for (const s of SENTINELAS) {
      expect(saida, `log contém ${s}`).not.toContain(s);
    }
  });

  it('retirar e excluir trampo com candidaturas: a mensagem do candidato não vai ao log nem à resposta', async () => {
    const autor = await criarUsuario(app);
    const freela = await criarUsuario(app);
    const id = await publicarTrampo(app, autor);
    const c = (await candidatar(app, freela, id, { mensagem: MENSAGEM })) as {
      corpo: { id: string };
    };
    const retirada = await pedir(app, 'DELETE', `/candidaturas/${c.corpo.id}`, {
      token: freela.token,
    });
    expect(retirada.status).toBe(204);
    await candidatar(app, freela, id, { mensagem: MENSAGEM });
    const excluido = await pedir(app, 'DELETE', `/trampos/${id}`, {
      token: autor.token,
    });
    expect(excluido.status).toBe(204);
    semSentinela(retirada, 'retirar');
    semSentinela(excluido, 'excluir');
    expect(log()).not.toContain(MENSAGEM);
  });

  it('serviço: PUT em 204, 400, 404, 409 e JSON quebrado não deixa texto no log nem na resposta', async () => {
    const autor = await criarUsuario(app);
    const terceiro = await criarUsuario(app);
    const id = await ofertarServico(app, autor);
    const corpo = (versao: unknown, extra: Record<string, unknown> = {}) => ({
      titulo: TITULO,
      descricao: DESCRICAO,
      categoria: 'reformas',
      cidade: CIDADE,
      precoBaseCentavos: 5_000,
      versao,
      ...extra,
    });
    const respostas: [string, Resposta, number][] = [
      [
        '400 campo',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: autor.token,
          corpo: corpo(1, { precoBaseCentavos: 0 }),
        }),
        400,
      ],
      [
        '400 chave extra',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: autor.token,
          corpo: corpo(1, { [CHAVE_EXTRA]: DESCRICAO }),
        }),
        400,
      ],
      [
        '400 versao texto',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: autor.token,
          corpo: corpo(VERSAO_TEXTO),
        }),
        400,
      ],
      [
        '400 json quebrado',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: autor.token,
          corpoBruto: `{"titulo":"${TITULO}"`,
        }),
        400,
      ],
      [
        '404 terceiro',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: terceiro.token,
          corpo: corpo(1),
        }),
        404,
      ],
      [
        '409 conflito',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: autor.token,
          corpo: corpo(8),
        }),
        409,
      ],
      [
        '204',
        await pedir(app, 'PUT', `/servicos/${id}`, {
          token: autor.token,
          corpo: corpo(1),
        }),
        204,
      ],
      [
        '204 excluir',
        await pedir(app, 'DELETE', `/servicos/${id}`, { token: autor.token }),
        204,
      ],
    ];
    for (const [nome, r, esperado] of respostas) {
      expect(r.status, `${nome}: ${r.texto}`).toBe(esperado);
      semSentinela(r, nome);
    }
    for (const s of SENTINELAS) {
      expect(log(), `log contém ${s}`).not.toContain(s);
    }
  });
});
