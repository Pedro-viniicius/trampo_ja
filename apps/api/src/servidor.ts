/**
 * Entrypoint da API (`pnpm --filter api dev` e `start`): lê a configuração,
 * abre a conexão, monta a aplicação e escuta na porta `PORT` (padrão 3000).
 * Em `SIGINT`/`SIGTERM`, para de aceitar requisições, espera as em andamento
 * e fecha a conexão com o banco. Um segundo sinal derruba na hora.
 *
 * Nunca registra a URL do banco (traz a senha). Os testes não importam este
 * arquivo: usam `montarAplicacao` de `composicao.ts`.
 */
import type { Kysely } from 'kysely';
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

  aoReceberSinal(aplicacao, db);
}

function aoReceberSinal(aplicacao: Aplicacao, db: Kysely<BancoBase>): void {
  let encerrando = false;
  const encerrar = async (sinal: string): Promise<void> => {
    if (encerrando) {
      return;
    }
    encerrando = true;
    const { log } = aplicacao.app;
    log.info({ sinal }, 'encerrando o servidor');
    try {
      await aplicacao.fechar();
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
  const codigo = (erro as { code?: unknown } | null)?.code;
  const codigoSeguro =
    typeof codigo === 'string' && FORMATO_DE_CODIGO.test(codigo)
      ? `, código: ${codigo}`
      : '';
  console.error(`[servidor] falha ao iniciar (${tipo}${codigoSeguro})`);
}

iniciar().catch((erro: unknown) => {
  relatarFalhaNaPartida(erro);
  process.exitCode = 1;
});
