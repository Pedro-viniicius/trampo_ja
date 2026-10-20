/**
 * Aplica as migrações pendentes no banco de desenvolvimento (`DATABASE_URL`).
 *
 *   pnpm --filter api migrar                 # sobe todas as pendentes
 *   pnpm --filter api migrar -- --baixar     # reverte só a última
 *   pnpm --filter api migrar -- --teste      # usa o banco de teste (`DATABASE_URL_TESTE`)
 *
 * A saída nunca mostra a URL do banco (ela traz a senha) nem a mensagem do driver.
 */

import { criarConexao } from '../src/compartilhado/banco/conexao.js';
import {
  ErroDeMigracao,
  migrarParaOFim,
  reverterUma,
} from '../src/compartilhado/banco/migrador.js';
import {
  carregarArquivoEnv,
  ErroDeConfiguracao,
  lerUrlDoBanco,
  lerUrlDoBancoDeTeste,
} from '../src/config.js';

const DICA_BANCO =
  'O banco está no ar e a URL está certa? Rode na raiz: docker compose up -d banco';
const OPCOES_VALIDAS = new Set(['--baixar', '--teste']);

async function principal(argumentos: readonly string[]): Promise<number> {
  // O pnpm repassa o `--` separador; ele não é opção.
  const opcoes = argumentos.filter((a) => a !== '--');
  const desconhecidas = opcoes.filter((a) => !OPCOES_VALIDAS.has(a));
  if (desconhecidas.length > 0) {
    console.error('Opção desconhecida. Use: migrar [--baixar] [--teste]');
    return 2;
  }
  const baixar = opcoes.includes('--baixar');
  const teste = opcoes.includes('--teste');

  carregarArquivoEnv();
  const url = teste
    ? lerUrlDoBancoDeTeste()
    : lerUrlDoBanco(process.env, 'DATABASE_URL');
  const db = criarConexao(url, { maximoDeConexoes: 1 });
  try {
    console.log(
      `Banco de ${teste ? 'teste' : 'desenvolvimento'}: ${baixar ? 'revertendo a última migração' : 'aplicando migrações pendentes'}.`,
    );
    const executadas = baixar
      ? await reverterUma(db)
      : await migrarParaOFim(db);
    if (executadas.length === 0) {
      console.log(
        baixar
          ? 'Nenhuma migração aplicada para reverter.'
          : 'Nenhuma migração pendente.',
      );
    }
    for (const { nome, direcao } of executadas) {
      console.log(`  ok  ${nome} (${direcao})`);
    }
    return 0;
  } finally {
    await db.destroy();
  }
}

try {
  process.exitCode = await principal(process.argv.slice(2));
} catch (erro) {
  if (erro instanceof ErroDeConfiguracao || erro instanceof ErroDeMigracao) {
    console.error(`Erro: ${erro.message}`);
    if (erro instanceof ErroDeMigracao && erro.migracao === undefined) {
      // Falhou antes de rodar qualquer migração: quase sempre conexão ou senha.
      console.error(DICA_BANCO);
    }
  } else {
    // Erro de conexão ou inesperado: mostra só o tipo e o código, nunca a mensagem do driver.
    const { name, code } = erro as { name?: unknown; code?: unknown };
    console.error(
      `Erro ao acessar o banco (${String(name ?? 'desconhecido')}${code ? `, código ${String(code)}` : ''}).`,
    );
    console.error(DICA_BANCO);
  }
  process.exitCode = 1;
}
