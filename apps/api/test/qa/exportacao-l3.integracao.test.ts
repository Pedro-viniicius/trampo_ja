/**
 * QA da L3 — teto da exportação (CA48, D41): a borda exata de 10 MiB medida
 * no banco, o 409 sem coletar nada, a ordem das recusas (senha antes do
 * tamanho), dado de terceiros fora da medida e a medida nunca abaixo do que
 * é serializado em texto comum.
 *
 * As linhas de mensagem são gravadas direto no banco (o domínio limita cada
 * texto a 2000 caracteres, então milhares de linhas são necessárias).
 */
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type BancoBase,
  opcoesDoPool,
} from '../../src/compartilhado/banco/conexao.js';
import {
  type Aplicacao,
  BYTES_DO_PERFIL_NA_MEDIDA,
  montarAplicacao,
} from '../../src/composicao.js';
import { lerUrlDoBancoDeTeste } from '../../src/config.js';
import {
  BYTES_DA_CONTA_NA_MEDIDA,
  BYTES_POR_SESSAO_NA_MEDIDA,
  TETO_DA_EXPORTACAO_BYTES,
} from '../../src/modulos/contas/aplicacao/casos-de-uso.js';
import { medirExportacao as medirConversas } from '../../src/modulos/conversas/adaptadores/postgres/repositorio-postgres.js';
import { medirExportacao as medirServicos } from '../../src/modulos/servicos/adaptadores/postgres/repositorio-postgres.js';
import { medirExportacao as medirTrampos } from '../../src/modulos/trampos/adaptadores/postgres/repositorio-postgres.js';
import { bancoDeTeste } from '../banco-teste.js';
import { pedir, TEMPO_COM_HASH } from './apoio.js';
import { criarUsuarioComSenha, exportar } from './apoio-l1.js';
import {
  candidaturaDireta,
  conversaDireta,
  limparBancoL3,
  mensagemDireta,
  trampoDireto,
} from './apoio-l3.js';

let aplicacao: Aplicacao | undefined;
let bancoComLog: Kysely<BancoBase> | undefined;
let consultas: string[] = [];

beforeEach(async () => {
  await limparBancoL3();
  consultas = [];
  // Conexão própria só para registrar o SQL que a API manda ao banco.
  bancoComLog = new Kysely<BancoBase>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ ...opcoesDoPool(lerUrlDoBancoDeTeste()), max: 4 }),
    }),
    log: (evento) => {
      if (evento.level === 'query') {
        consultas.push(evento.query.sql);
      }
    },
  });
  aplicacao = await montarAplicacao({ db: bancoComLog, rateLimit: false });
});

afterEach(async () => {
  await aplicacao?.fechar();
  await bancoComLog?.destroy();
  aplicacao = undefined;
  bancoComLog = undefined;
});

function app(): Aplicacao {
  if (!aplicacao) {
    throw new Error('monte a aplicação antes');
  }
  return aplicacao;
}

/** Bytes que a medida soma além das mensagens, para uma conta com 1 sessão. */
const FIXO_DA_MEDIDA =
  BYTES_DO_PERFIL_NA_MEDIDA +
  BYTES_DA_CONTA_NA_MEDIDA +
  BYTES_POR_SESSAO_NA_MEDIDA;
const POR_LINHA = 256;

/** `quantas` mensagens ASCII de `tamanho` caracteres, de uma só vez. */
async function mensagensEmMassa(
  conversaId: string,
  autorId: string,
  quantas: number,
  tamanho: number,
): Promise<void> {
  await sql`insert into mensagens (id, conversa_id, autor_id, texto, enviada_em)
    select gen_random_uuid(), ${conversaId}::uuid, ${autorId}::uuid,
      repeat('a', ${tamanho}::int), now()
    from generate_series(1, ${quantas}::int)`.execute(bancoDeTeste());
}

/**
 * Grava mensagens da conta de modo que a medida do banco seja exatamente
 * `TETO + deslocamento` (a conta tem 1 sessão, 1 conversa e nada mais além
 * das mensagens).
 */
async function medidaEm(
  conversaId: string,
  autorId: string,
  deslocamento: number,
): Promise<void> {
  // Desde o R2 da rodada 1 da L3, a linha da conversa também entra (256).
  const alvo =
    TETO_DA_EXPORTACAO_BYTES + deslocamento - FIXO_DA_MEDIDA - POR_LINHA;
  const cheias = Math.ceil((alvo - POR_LINHA - 2000) / (1000 + POR_LINHA));
  const resto = alvo - POR_LINHA - cheias * (1000 + POR_LINHA);
  expect(resto).toBeGreaterThan(0);
  expect(resto).toBeLessThanOrEqual(2000);
  await mensagensEmMassa(conversaId, autorId, cheias, 1000);
  await mensagensEmMassa(conversaId, autorId, 1, resto);
}

describe('CA48 — a borda do teto de 10 MiB, medida no banco', () => {
  it(
    'Dada a medida exatamente no teto, então a exportação sai (200); com 1 byte a mais, 409 exportacao_grande',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const conversa = await conversaDireta(ana.contaId, bruno.contaId);
      await medidaEm(conversa, ana.contaId, 0);

      const noTeto = await exportar(app(), ana, ana.senha);

      expect(noTeto.status, noTeto.texto.slice(0, 200)).toBe(200);
      const corpo = noTeto.corpo as {
        conversas: { minhasMensagens: unknown[] }[];
      };
      expect(corpo.conversas[0]?.minhasMensagens.length).toBeGreaterThan(8000);

      // Mais 1 byte: a última mensagem é maior (limite do domínio: 2000).
      await sql`update mensagens set texto = texto || 'a'
        where id = (select id from mensagens where autor_id = ${ana.contaId}::uuid
          order by char_length(texto) desc, id limit 1)`.execute(
        bancoDeTeste(),
      );
      consultas.length = 0;
      const acima = await exportar(app(), ana, ana.senha);

      expect(acima.status, acima.texto.slice(0, 200)).toBe(409);
      expect(acima.corpo).toEqual({ erro: 'exportacao_grande' });
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada a conta acima do teto, então o 409 traz só o código, com no-store e sem tamanho, e nenhuma consulta carrega os textos',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const conversa = await conversaDireta(ana.contaId, bruno.contaId);
      await trampoDireto(ana.contaId, 'Título que só a coleta leria');
      await medidaEm(conversa, ana.contaId, 1);
      consultas.length = 0;

      const resposta = await exportar(app(), ana, ana.senha);

      expect(resposta.status).toBe(409);
      expect(resposta.texto).toBe('{"erro":"exportacao_grande"}');
      expect(resposta.cabecalhos['cache-control']).toBe('no-store');
      expect(String(resposta.cabecalhos['content-type'])).toContain(
        'application/json',
      );
      // Só a medida (octet_length) lê as tabelas de dado da conta.
      const carregaDado = consultas.filter(
        (c) =>
          /from "(mensagens|trampos|servicos|candidaturas|perfis|conversas)"/.test(
            c,
          ) && !c.includes('octet_length'),
      );
      expect(carregaDado).toEqual([]);
      expect(consultas.some((c) => c.includes('octet_length'))).toBe(true);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dada a conta acima do teto, então senha errada é 403 senha_incorreta (o tamanho só é revelado a quem sabe a senha) e sem token é 401',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const conversa = await conversaDireta(ana.contaId, bruno.contaId);
      await medidaEm(conversa, ana.contaId, 1);

      const errada = await exportar(app(), ana, 'senha-errada-qualquer');
      const semToken = await pedir(app(), 'POST', '/contas/eu/exportacao', {
        corpo: { senha: ana.senha },
      });

      expect(errada.status).toBe(403);
      expect(errada.corpo).toEqual({ erro: 'senha_incorreta' });
      expect(semToken.status).toBe(401);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dado o 409, então a vaga da exportação é liberada: depois de apagar o excesso, a mesma conta exporta; e vários 409 seguidos não travam a fila',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const conversa = await conversaDireta(ana.contaId, bruno.contaId);
      await medidaEm(conversa, ana.contaId, 1);

      const varios = await Promise.all(
        [1, 2, 3, 4].map(() => exportar(app(), ana, ana.senha)),
      );
      expect(varios.map((r) => r.status)).toEqual([409, 409, 409, 409]);

      await sql`delete from mensagens where autor_id = ${ana.contaId}::uuid`.execute(
        bancoDeTeste(),
      );
      await mensagemDireta(conversa, ana.contaId, 'Sobrou uma só');
      const depois = await exportar(app(), ana, ana.senha);

      expect(depois.status, depois.texto.slice(0, 200)).toBe(200);
      expect(
        (depois.corpo as { conversas: { minhasMensagens: unknown[] }[] })
          .conversas[0]?.minhasMensagens,
      ).toHaveLength(1);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dado o texto enorme do outro lado da conversa, então ele não entra na medida de quem exporta: a Ana exporta (200, sem o texto do Bruno) e o Bruno recebe 409',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const conversa = await conversaDireta(ana.contaId, bruno.contaId);
      await mensagemDireta(conversa, ana.contaId, 'Mensagem pequena da Ana');
      await medidaEm(conversa, bruno.contaId, 1);

      const daAna = await exportar(app(), ana, ana.senha);
      const doBruno = await exportar(app(), bruno, bruno.senha);

      expect(daAna.status, daAna.texto.slice(0, 200)).toBe(200);
      expect(daAna.texto).toContain('Mensagem pequena da Ana');
      expect(daAna.texto.length).toBeLessThan(20_000);
      expect(doBruno.status).toBe(409);
    },
    TEMPO_COM_HASH,
  );

  it(
    'Dadas candidaturas e trampos enormes de terceiros ligados à conta, então só o que é dela conta: a candidatura recebida de outro não pesa no autor',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const trampoDaAna = await trampoDireto(ana.contaId, 'Trampo da Ana');
      // A candidatura do Bruno, com texto longo, no trampo da Ana não é da Ana.
      await candidaturaDireta(trampoDaAna, bruno.contaId);
      await sql`update candidaturas set mensagem = repeat('c', 4000)`.execute(
        bancoDeTeste(),
      );

      const medidaDaAna = await medirTrampos(
        bancoDeTeste() as never,
        ana.contaId,
      );
      const exportada = await exportar(app(), ana, ana.senha);

      expect(exportada.status).toBe(200);
      expect(exportada.texto).not.toContain('cccc');
      // Só o trampo (texto + 256), nada das 4000 letras da candidatura do Bruno.
      expect(medidaDaAna).toBeLessThan(1000);
    },
    TEMPO_COM_HASH,
  );
});

describe('CA48 — a medida cobre o que a exportação serializa', () => {
  it(
    'Dados textos comuns com acento, emoji de 4 bytes e quebra de linha em trampo, serviço, candidatura e mensagem, então a medida do banco é maior ou igual ao corpo exportado em bytes',
    async () => {
      const ana = await criarUsuarioComSenha(app());
      const bruno = await criarUsuarioComSenha(app());
      const texto = 'Olá, açaí 😀 — preço R$ 10,00\nsegunda linha ✓ ';
      const longo = texto.repeat(30);
      const trampos = [];
      for (let i = 0; i < 5; i += 1) {
        trampos.push(await trampoDireto(bruno.contaId, `${longo} ${i}`));
      }
      await sql`update trampos set descricao = ${longo}`.execute(
        bancoDeTeste(),
      );
      for (const trampo of trampos) {
        await candidaturaDireta(trampo, ana.contaId);
      }
      await sql`update candidaturas set mensagem = ${longo}`.execute(
        bancoDeTeste(),
      );
      for (let i = 0; i < 4; i += 1) {
        await trampoDireto(ana.contaId, `${texto} ${i}`);
      }
      await sql`update trampos set descricao = ${longo} where autor_id = ${ana.contaId}::uuid`.execute(
        bancoDeTeste(),
      );
      await sql`insert into servicos (id, autor_id, titulo, descricao, categoria,
          texto_busca, preco_base_centavos, status, criado_em)
        select gen_random_uuid(), ${ana.contaId}::uuid, ${texto}, ${longo},
          'reformas', 'busca', 5000, 'ativo', now()
        from generate_series(1, 6)`.execute(bancoDeTeste());
      const conversa = await conversaDireta(ana.contaId, bruno.contaId);
      for (let i = 0; i < 20; i += 1) {
        await mensagemDireta(conversa, ana.contaId, `${texto}${i}`);
      }
      await sql`update perfis set nome = ${'N'.repeat(80)},
          cidade = ${'C'.repeat(80)}, descricao = ${'D'.repeat(300)},
          habilidades = ${sql`array[${sql.join(
            Array.from({ length: 10 }, (_, i) => `${'H'.repeat(29)}${i}`),
          )}]`}
        where conta_id = ${ana.contaId}::uuid`.execute(bancoDeTeste());

      const exportada = await exportar(app(), ana, ana.senha);
      expect(exportada.status, exportada.texto.slice(0, 200)).toBe(200);
      const db = bancoDeTeste();
      const medida =
        (await medirConversas(db as never, ana.contaId)) +
        (await medirTrampos(db as never, ana.contaId)) +
        (await medirServicos(db as never, ana.contaId)) +
        FIXO_DA_MEDIDA;

      const real = Buffer.byteLength(exportada.texto, 'utf8');
      expect(real).toBeGreaterThan(5000);
      expect(medida).toBeGreaterThanOrEqual(real);
    },
    TEMPO_COM_HASH,
  );

  it('Dadas conversas sem nenhuma mensagem, então cada uma pesa 256 bytes na medida de conversas (R2) e a conversa dos outros não pesa', async () => {
    const ana = await criarUsuarioComSenha(app());
    const bruno = await criarUsuarioComSenha(app());
    const carla = await criarUsuarioComSenha(app());
    const db = bancoDeTeste();
    expect(await medirConversas(db as never, ana.contaId)).toBe(0);

    await conversaDireta(ana.contaId, bruno.contaId);
    const comUma = await medirConversas(db as never, ana.contaId);
    await conversaDireta(ana.contaId, carla.contaId);
    const comDuas = await medirConversas(db as never, ana.contaId);
    const deBrunoAoLado = await medirConversas(db as never, bruno.contaId);

    expect(comUma).toBe(256);
    expect(comDuas).toBe(512);
    expect(deBrunoAoLado).toBe(256);
  });

  it('Dado um id que não é uuid, então as três medidas dão 0 sem erro do banco', async () => {
    const db = bancoDeTeste();
    for (const id of ['nao-e-uuid', '', "'; drop table contas; --"]) {
      expect(await medirConversas(db as never, id)).toBe(0);
      expect(await medirTrampos(db as never, id)).toBe(0);
      expect(await medirServicos(db as never, id)).toBe(0);
    }
    expect(randomUUID()).toBeTruthy();
  });
});
