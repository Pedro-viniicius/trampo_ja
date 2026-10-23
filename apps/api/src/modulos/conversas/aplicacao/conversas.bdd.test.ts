import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
  ErroProibido,
} from '../../../compartilhado/dominio/erros.js';
import { RelogioFixo } from '../../../compartilhado/dominio/relogio.js';
import { RepositorioDeConversasEmMemoria } from '../adaptadores/memoria/repositorio-memoria.js';
import { VerificadorDeVinculoEmMemoria } from '../adaptadores/memoria/verificador-vinculo-memoria.js';
import {
  type CasosDeUsoDeConversas,
  criarCasosDeUsoDeConversas,
  LIMITE_DE_MENSAGENS_POR_PAGINA,
} from './casos-de-uso.js';

const EMPREGADOR = 'conta-empregador';
const FREELANCER = 'conta-freelancer';
const ESTRANHO = 'conta-estranho';

let repositorio: RepositorioDeConversasEmMemoria;
let verificador: VerificadorDeVinculoEmMemoria;
let relogio: RelogioFixo;
let contador: number;
let casos: CasosDeUsoDeConversas;

beforeEach(() => {
  repositorio = new RepositorioDeConversasEmMemoria();
  // Vínculo: o freelancer se candidatou a um trampo do empregador.
  verificador = new VerificadorDeVinculoEmMemoria([[FREELANCER, EMPREGADOR]]);
  relogio = new RelogioFixo('2026-10-20T12:00:00.000Z');
  contador = 0;
  casos = criarCasosDeUsoDeConversas({
    repositorio,
    verificadorDeVinculo: verificador,
    relogio,
    gerarId: () => {
      contador += 1;
      return `id-${String(contador).padStart(3, '0')}`;
    },
  });
});

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava um erro');
}

/** Envia e avança o relógio 1 minuto. */
async function enviar(quem: string, conversaId: string, texto: string) {
  const enviada = await casos.enviarMensagem(quem, conversaId, texto);
  relogio.avancar(60_000);
  return enviada;
}

describe('CA12 — conversa entre usuários com vínculo', () => {
  it('CA12 — Dado dois usuários com uma candidatura ou contratação entre eles, quando um envia mensagem de texto não vazia, então ela aparece na conversa dos dois em ordem cronológica', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);

    await enviar(EMPREGADOR, conversaId, 'Olá! Vi sua candidatura.');
    await enviar(FREELANCER, conversaId, '  Oi, posso começar amanhã.  ');
    await enviar(EMPREGADOR, conversaId, 'Combinado.');

    const esperado = [
      {
        autorId: EMPREGADOR,
        texto: 'Olá! Vi sua candidatura.',
        enviadaEm: new Date('2026-10-20T12:00:00.000Z'),
      },
      {
        autorId: FREELANCER,
        texto: 'Oi, posso começar amanhã.',
        enviadaEm: new Date('2026-10-20T12:01:00.000Z'),
      },
      {
        autorId: EMPREGADOR,
        texto: 'Combinado.',
        enviadaEm: new Date('2026-10-20T12:02:00.000Z'),
      },
    ];
    for (const quem of [EMPREGADOR, FREELANCER]) {
      const mensagens = await casos.listarMensagens(quem, conversaId);
      expect(mensagens).toMatchObject(esperado);
    }
  });

  it('CA12 — quem tem vínculo pode abrir a conversa pelos dois lados e é a mesma conversa', async () => {
    const primeira = await casos.abrirConversa(FREELANCER, EMPREGADOR);
    const segunda = await casos.abrirConversa(EMPREGADOR, FREELANCER);

    expect(primeira).toEqual({ conversaId: 'id-001', nova: true });
    expect(segunda).toEqual({ conversaId: 'id-001', nova: false });
  });

  it('CA12 — duas aberturas simultâneas do mesmo par dão a mesma conversa (uma nova, outra existente)', async () => {
    const resultados = await Promise.allSettled([
      casos.abrirConversa(EMPREGADOR, FREELANCER),
      casos.abrirConversa(FREELANCER, EMPREGADOR),
    ]);

    const valores = resultados.map((r) => {
      if (r.status !== 'fulfilled') {
        throw r.reason;
      }
      return r.value;
    });
    expect(new Set(valores.map((v) => v.conversaId)).size).toBe(1);
    expect(valores.map((v) => v.nova).sort()).toEqual([false, true]);
    expect(await casos.listarConversas(EMPREGADOR)).toHaveLength(1);
  });

  it('CA12 — mensagens com o mesmo instante saem na ordem de envio, mesmo com ids decrescentes, e o cursor no empate não pula nem repete', async () => {
    let restante = 1000;
    const comIdsDecrescentes = criarCasosDeUsoDeConversas({
      repositorio,
      verificadorDeVinculo: verificador,
      relogio,
      gerarId: () => {
        restante -= 1;
        return `id-${restante}`;
      },
    });
    const { conversaId } = await comIdsDecrescentes.abrirConversa(
      EMPREGADOR,
      FREELANCER,
    );
    const textos = ['primeira', 'segunda', 'terceira', 'quarta'];
    for (const texto of textos) {
      await comIdsDecrescentes.enviarMensagem(EMPREGADOR, conversaId, texto);
    }

    const todas = await casos.listarMensagens(FREELANCER, conversaId);
    expect(todas.map((m) => m.texto)).toEqual(textos);
    const depoisDaSegunda = await casos.listarMensagens(
      FREELANCER,
      conversaId,
      { depoisDe: todas[1]?.id },
    );
    expect(depoisDaSegunda.map((m) => m.texto)).toEqual(['terceira', 'quarta']);
  });

  it('CA12 — Dado uma conversa, quando alguém envia texto vazio ou só espaços, então é recusado com texto obrigatório e nada aparece', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);

    for (const texto of ['', '   ', '\n', undefined, null]) {
      const erro = await erroDe(
        casos.enviarMensagem(EMPREGADOR, conversaId, texto),
      );
      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'texto', motivo: 'obrigatorio' },
      ]);
    }
    const erro = await erroDe(
      casos.enviarMensagem(EMPREGADOR, conversaId, 'a'.repeat(2001)),
    );
    expect((erro as ErroDeValidacao).campos).toEqual([
      { campo: 'texto', motivo: 'tamanho' },
    ]);
    expect(await casos.listarMensagens(EMPREGADOR, conversaId)).toEqual([]);
  });

  it('CA12 — quem não participa não lê nem escreve: não encontrado, sem confirmar que a conversa existe', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    await enviar(EMPREGADOR, conversaId, 'só para nós dois');

    for (const promessa of [
      casos.listarMensagens(ESTRANHO, conversaId),
      casos.enviarMensagem(ESTRANHO, conversaId, 'intruso'),
      casos.listarMensagens(ESTRANHO, 'nao-existe'),
      casos.enviarMensagem(EMPREGADOR, 'nao-existe', 'oi'),
    ]) {
      const erro = await erroDe(promessa);
      expect(erro).toBeInstanceOf(ErroNaoEncontrado);
      expect((erro as ErroNaoEncontrado).codigo).toBe('nao_encontrado');
    }
    const mensagens = await casos.listarMensagens(FREELANCER, conversaId);
    expect(mensagens.map((m) => m.texto)).toEqual(['só para nós dois']);
  });

  it('CA12 — 404 vem antes da validação do texto para quem não participa', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);

    expect(
      await erroDe(casos.enviarMensagem(ESTRANHO, conversaId, '')),
    ).toBeInstanceOf(ErroNaoEncontrado);
  });
});

describe('CA13 — sem vínculo, sem conversa', () => {
  it('CA13 — Dado um usuário sem relação (candidatura ou contratação) com outro, quando tenta abrir conversa com ele, então é recusado (sem_vinculo)', async () => {
    const erro = await erroDe(casos.abrirConversa(ESTRANHO, EMPREGADOR));

    expect(erro).toBeInstanceOf(ErroProibido);
    expect((erro as ErroProibido).codigo).toBe('sem_vinculo');
    expect(await casos.listarConversas(ESTRANHO)).toEqual([]);
    expect(await casos.listarConversas(EMPREGADOR)).toEqual([]);
  });

  it('CA13 — o vínculo vale nos dois sentidos e é checado a cada abertura', async () => {
    expect((await casos.abrirConversa(EMPREGADOR, FREELANCER)).nova).toBe(true);
    verificador.desvincular(EMPREGADOR, FREELANCER);

    expect(
      await erroDe(casos.abrirConversa(FREELANCER, EMPREGADOR)),
    ).toBeInstanceOf(ErroProibido);
  });

  it('conversa consigo mesmo é recusada antes de consultar o vínculo', async () => {
    const consulta = vi.spyOn(verificador, 'existeVinculoEntre');
    const erro = await erroDe(casos.abrirConversa(EMPREGADOR, EMPREGADOR));

    expect(erro).toBeInstanceOf(ErroDeRegra);
    expect((erro as ErroDeRegra).codigo).toBe('conversa_consigo_mesmo');
    expect(consulta).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'obrigatorio'],
    [null, 'obrigatorio'],
    ['', 'obrigatorio'],
    [123, 'invalido'],
  ] as const)(
    'outroUsuarioId %j → dados_invalidos (%s)',
    async (outro, motivo) => {
      const erro = await erroDe(casos.abrirConversa(EMPREGADOR, outro));

      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'outroUsuarioId', motivo },
      ]);
    },
  );

  it('id do outro em maiúsculas é o mesmo usuário (uuid canônico minúsculo)', async () => {
    const a = 'aaaaaaaa-0000-4000-8000-000000000000';
    const b = 'bbbbbbbb-0000-4000-8000-000000000000';
    verificador.vincular(a, b);

    const primeira = await casos.abrirConversa(a, b.toUpperCase());
    const segunda = await casos.abrirConversa(a, b);
    expect(segunda).toEqual({ conversaId: primeira.conversaId, nova: false });
    expect(
      await erroDe(casos.abrirConversa(a, a.toUpperCase())),
    ).toBeInstanceOf(ErroDeRegra);
  });
});

describe('D25 — conversa apagada pela exclusão de conta durante o pedido', () => {
  it('CA18 — Dado que a outra requisição criou a conversa do par (par_ja_existe), quando ela some antes da releitura, então a abertura é recusada com sem_vinculo (403), não com erro interno', async () => {
    vi.spyOn(repositorio, 'inserirConversa').mockResolvedValueOnce(
      'par_ja_existe',
    );
    const releitura = vi.spyOn(repositorio, 'buscarConversaDoPar');

    const erro = await erroDe(casos.abrirConversa(EMPREGADOR, FREELANCER));

    expect(erro).toBeInstanceOf(ErroProibido);
    expect((erro as ErroProibido).codigo).toBe('sem_vinculo');
    // Busca antes de inserir e relê depois do conflito.
    expect(releitura).toHaveBeenCalledTimes(2);
    expect(await casos.listarConversas(EMPREGADOR)).toEqual([]);
  });

  it('Q1 — Dado o vínculo confirmado na checagem inicial, quando ele some antes da inserção (exclusão de conta concorrente), então a conferência dentro da inserção recusa com sem_vinculo e nada é gravado', async () => {
    const consulta = vi
      .spyOn(verificador, 'existeVinculoEntre')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const inserir = vi.spyOn(repositorio, 'inserirConversa');
    const buscaDoPar = vi.spyOn(repositorio, 'buscarConversaDoPar');

    const erro = await erroDe(casos.abrirConversa(EMPREGADOR, FREELANCER));

    expect(erro).toBeInstanceOf(ErroProibido);
    expect((erro as ErroProibido).codigo).toBe('sem_vinculo');
    expect(inserir).toHaveBeenCalledTimes(1);
    // Recusa direto, sem a releitura do caminho `par_ja_existe`.
    expect(buscaDoPar).toHaveBeenCalledTimes(1);
    // A segunda conferência é a de dentro da inserção, com a transação dela
    // (em memória, `undefined`), para o mesmo par.
    expect(consulta.mock.calls).toEqual([
      [EMPREGADOR, FREELANCER],
      [EMPREGADOR, FREELANCER, undefined],
    ]);
    expect(await casos.listarConversas(EMPREGADOR)).toEqual([]);
    expect(await casos.listarConversas(FREELANCER)).toEqual([]);
  });

  it('Q2 — Dado uma conversa que passa na checagem de participação, quando ela é apagada antes da leitura do cursor, então a leitura com depoisDe dá não encontrado (404), não o 400 do cursor', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    const { id: primeira } = await enviar(EMPREGADOR, conversaId, 'um');
    const conversa = await repositorio.buscarConversaPorId(conversaId);
    // Outro repositório, sem a conversa nem as mensagens: só a primeira
    // checagem ainda a vê (lida antes da exclusão).
    const semAConversa = new RepositorioDeConversasEmMemoria();
    const busca = vi
      .spyOn(semAConversa, 'buscarConversaPorId')
      .mockResolvedValueOnce(conversa);
    const casosDepoisDaExclusao = criarCasosDeUsoDeConversas({
      repositorio: semAConversa,
      verificadorDeVinculo: verificador,
      relogio,
    });

    const erro = await erroDe(
      casosDepoisDaExclusao.listarMensagens(FREELANCER, conversaId, {
        depoisDe: primeira,
      }),
    );

    expect(erro).toBeInstanceOf(ErroNaoEncontrado);
    expect(busca).toHaveBeenCalledTimes(2);
  });

  it('CA18 — Dado uma conversa que passa na checagem de participação, quando ela é apagada antes da gravação da mensagem, então o envio dá não encontrado (404) e nada é gravado', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    const conversa = await repositorio.buscarConversaPorId(conversaId);
    // Outro repositório, sem a conversa: a checagem vê a conversa (lida
    // antes da exclusão) e a gravação já não a encontra.
    const semAConversa = new RepositorioDeConversasEmMemoria();
    vi.spyOn(semAConversa, 'buscarConversaPorId').mockResolvedValue(conversa);
    const salvar = vi.spyOn(semAConversa, 'salvarMensagem');
    const casosDepoisDaExclusao = criarCasosDeUsoDeConversas({
      repositorio: semAConversa,
      verificadorDeVinculo: verificador,
      relogio,
    });

    const erro = await erroDe(
      casosDepoisDaExclusao.enviarMensagem(FREELANCER, conversaId, 'oi'),
    );

    expect(erro).toBeInstanceOf(ErroNaoEncontrado);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(
      await semAConversa.listarMensagens(conversaId, { limite: 50 }),
    ).toEqual([]);
  });
});

describe('listarConversas', () => {
  it('CA12 — lista as conversas de quem pede com o outro usuário e a última mensagem, pela última atividade', async () => {
    const OUTRO = 'conta-outro-freelancer';
    verificador.vincular(EMPREGADOR, OUTRO);

    const comFreelancer = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    relogio.avancar(60_000);
    const comOutro = await casos.abrirConversa(OUTRO, EMPREGADOR);
    relogio.avancar(60_000);

    // Sem mensagens, a mais recente é a criada por último.
    expect(
      (await casos.listarConversas(EMPREGADOR)).map((c) => c.conversaId),
    ).toEqual([comOutro.conversaId, comFreelancer.conversaId]);

    await enviar(FREELANCER, comFreelancer.conversaId, 'Bom dia!');

    expect(await casos.listarConversas(EMPREGADOR)).toEqual([
      {
        conversaId: comFreelancer.conversaId,
        outroUsuarioId: FREELANCER,
        criadaEm: new Date('2026-10-20T12:00:00.000Z'),
        ultimaMensagem: {
          texto: 'Bom dia!',
          enviadaEm: new Date('2026-10-20T12:02:00.000Z'),
        },
      },
      {
        conversaId: comOutro.conversaId,
        outroUsuarioId: OUTRO,
        criadaEm: new Date('2026-10-20T12:01:00.000Z'),
        ultimaMensagem: null,
      },
    ]);
    expect(await casos.listarConversas(FREELANCER)).toEqual([
      expect.objectContaining({
        conversaId: comFreelancer.conversaId,
        outroUsuarioId: EMPREGADOR,
      }),
    ]);
    expect(await casos.listarConversas(ESTRANHO)).toEqual([]);
  });
});

describe('listarMensagens — paginação', () => {
  it(`devolve no máximo ${LIMITE_DE_MENSAGENS_POR_PAGINA} por página e continua depois do cursor`, async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    const total = LIMITE_DE_MENSAGENS_POR_PAGINA + 5;
    for (let i = 1; i <= total; i++) {
      await enviar(EMPREGADOR, conversaId, `mensagem ${i}`);
    }

    const primeira = await casos.listarMensagens(FREELANCER, conversaId);
    expect(primeira).toHaveLength(LIMITE_DE_MENSAGENS_POR_PAGINA);
    expect(primeira[0]?.texto).toBe('mensagem 1');

    const ultimaLida = primeira.at(-1)?.id;
    const segunda = await casos.listarMensagens(FREELANCER, conversaId, {
      depoisDe: ultimaLida,
    });
    expect(segunda.map((m) => m.texto)).toEqual([
      'mensagem 51',
      'mensagem 52',
      'mensagem 53',
      'mensagem 54',
      'mensagem 55',
    ]);

    const nada = await casos.listarMensagens(FREELANCER, conversaId, {
      depoisDe: segunda.at(-1)?.id,
    });
    expect(nada).toEqual([]);
  });

  it('cursor em branco equivale a sem cursor', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    await enviar(EMPREGADOR, conversaId, 'oi');

    expect(
      await casos.listarMensagens(EMPREGADOR, conversaId, { depoisDe: '' }),
    ).toHaveLength(1);
  });

  it('Q2 — cursor inválido com a conversa ainda de pé: confere a participação de novo e responde o 400 do cursor', async () => {
    const { conversaId } = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    const busca = vi.spyOn(repositorio, 'buscarConversaPorId');

    const erro = await erroDe(
      casos.listarMensagens(EMPREGADOR, conversaId, { depoisDe: 'nao-existe' }),
    );

    expect(erro).toBeInstanceOf(ErroDeValidacao);
    expect(busca).toHaveBeenCalledTimes(2);
  });

  it('cursor que não é mensagem desta conversa → depoisDe invalido', async () => {
    const OUTRO = 'conta-outro-freelancer';
    verificador.vincular(EMPREGADOR, OUTRO);
    const conversa1 = await casos.abrirConversa(EMPREGADOR, FREELANCER);
    const conversa2 = await casos.abrirConversa(EMPREGADOR, OUTRO);
    const daOutra = await enviar(OUTRO, conversa2.conversaId, 'outra conversa');

    for (const depoisDe of ['nao-existe', daOutra.id, 42]) {
      const erro = await erroDe(
        casos.listarMensagens(EMPREGADOR, conversa1.conversaId, { depoisDe }),
      );
      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect((erro as ErroDeValidacao).campos).toEqual([
        { campo: 'depoisDe', motivo: 'invalido' },
      ]);
    }
  });
});
