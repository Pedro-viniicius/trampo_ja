/**
 * Entrypoint da API (`pnpm --filter api dev` e `start`): lê a configuração,
 * abre a conexão, monta a aplicação e escuta na porta `PORT` (padrão 3000).
 * Depois de subir, agenda a limpeza periódica (D40, ADR-007): a primeira
 * rodada 1 min depois e as seguintes 1 h depois do fim da anterior.
 * Em `SIGINT`/`SIGTERM`, para de aceitar requisições, cancela a próxima
 * limpeza, espera as requisições e a limpeza em andamento e fecha a conexão
 * com o banco. Um segundo sinal derruba na hora.
 *
 * Nunca registra a URL do banco (traz a senha) nem a mensagem de um erro da
 * limpeza (pode trazer o id de uma conta excluída). Os testes da API usam
 * `montarAplicacao` de `composicao.ts`; só `servidor.test.ts` importa este
 * arquivo, com a composição e o banco simulados.
 */
import type { Kysely } from 'kysely';
import {
  agendarTarefa,
  type TarefaAgendada,
} from './compartilhado/agendar-tarefa.js';
import { type BancoBase, criarConexao } from './compartilhado/banco/conexao.js';
import { criarLogger } from './compartilhado/http/logger.js';
import { type Aplicacao, montarAplicacao } from './composicao.js';
import {
  carregarArquivoEnv,
  carregarConfig,
  ErroDeConfiguracao,
} from './config.js';

const SINAIS_DE_ENCERRAMENTO = ['SIGINT', 'SIGTERM'] as const;
// Códigos do Node e do Postgres (ex.: EADDRINUSE, 28P01): sem texto livre.
const FORMATO_DE_CODIGO = /^[A-Za-z0-9_.-]{1,64}$/;

/** Espera entre a partida e a primeira rodada da limpeza (D40). */
const ATRASO_INICIAL_DA_LIMPEZA_MS = 60_000;
/** Espera entre o fim de uma rodada da limpeza e o início da seguinte (D40). */
const INTERVALO_DA_LIMPEZA_MS = 60 * 60_000;

async function iniciar(): Promise<void> {
  carregarArquivoEnv();
  const config = carregarConfig();
  const db = criarConexao(config.databaseUrl);

  let aplicacao: Aplicacao | undefined;
  try {
    aplicacao = await montarAplicacao({
      db,
      logger: criarLogger({ nivel: 'info' }),
      trustProxy: config.trustProxy,
    });
    await aplicacao.app.listen({ port: config.porta, host: '0.0.0.0' });
  } catch (erro) {
    await aplicacao?.fechar();
    await db.destroy();
    throw erro;
  }

  aoReceberSinal(aplicacao, db, agendarLimpeza(aplicacao));
}

/**
 * Código de um erro do Node ou do Postgres (ex.: `57014`), se tiver o
 * formato de código; qualquer outra coisa pode ser texto livre e é descartada.
 */
function codigoSeguro(erro: unknown): string | undefined {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return typeof codigo === 'string' && FORMATO_DE_CODIGO.test(codigo)
    ? codigo
    : undefined;
}

/**
 * Agenda a limpeza periódica (D40, ADR-007). Cada rodada registra só as
 * contagens e a duração (a premissa do plano: índice em `sessoes.expira_em`
 * quando passar de 1 s). Uma falha registra só o código do erro: a mensagem e
 * o `detail` de um erro do `pg` podem trazer os parâmetros da consulta, como o
 * id da conta excluída.
 */
function agendarLimpeza(aplicacao: Aplicacao): TarefaAgendada {
  const { log } = aplicacao.app;
  return agendarTarefa({
    executar: async () => {
      const inicio = performance.now();
      const { sessoes, contasRevarridas } =
        await aplicacao.limparRegistrosVencidos();
      log.info(
        {
          sessoes,
          contasRevarridas,
          duracaoMs: Math.round(performance.now() - inicio),
        },
        'limpeza periódica concluída',
      );
    },
    atrasoInicialMs: ATRASO_INICIAL_DA_LIMPEZA_MS,
    intervaloMs: INTERVALO_DA_LIMPEZA_MS,
    aoFalhar: (erro) => {
      log.error(
        { codigo: codigoSeguro(erro) ?? 'sem_codigo' },
        'falha na limpeza periódica',
      );
    },
  });
}

function aoReceberSinal(
  aplicacao: Aplicacao,
  db: Kysely<BancoBase>,
  limpeza: TarefaAgendada,
): void {
  let encerrando = false;
  const encerrar = async (sinal: string): Promise<void> => {
    if (encerrando) {
      return;
    }
    encerrando = true;
    const { log } = aplicacao.app;
    log.info({ sinal }, 'encerrando o servidor');
    // Cancela a próxima limpeza já; a rodada em curso (se houver) termina
    // antes de o banco fechar. O `parar` nunca rejeita.
    const limpezaParada = limpeza.parar();
    try {
      await aplicacao.fechar();
      await limpezaParada;
      await db.destroy();
      log.info('servidor encerrado');
    } catch (erro) {
      log.error({ err: erro }, 'falha ao encerrar o servidor');
      process.exitCode = 1;
    }
  };
  for (const sinal of SINAIS_DE_ENCERRAMENTO) {
    // `once`: depois do primeiro sinal, o seguinte volta ao padrão do Node
    // (encerra o processo na hora), útil se o fechamento travar.
    process.once(sinal, (recebido) => {
      void encerrar(recebido);
    });
  }
}

/**
 * Falha na partida. A mensagem só é impressa para `ErroDeConfiguracao`, que
 * cita o nome da variável e nunca o valor; de qualquer outro erro sai só a
 * classe e o código (ex.: `EADDRINUSE`), porque a mensagem de um erro do
 * driver pode trazer dados da conexão.
 */
function relatarFalhaNaPartida(erro: unknown): void {
  if (erro instanceof ErroDeConfiguracao) {
    console.error(`[servidor] configuração inválida: ${erro.message}`);
    return;
  }
  const tipo = erro instanceof Error ? erro.constructor.name : typeof erro;
  const codigo = codigoSeguro(erro);
  const comCodigo = codigo === undefined ? '' : `, código: ${codigo}`;
  console.error(`[servidor] falha ao iniciar (${tipo}${comCodigo})`);
}

iniciar().catch((erro: unknown) => {
  relatarFalhaNaPartida(erro);
  process.exitCode = 1;
});
