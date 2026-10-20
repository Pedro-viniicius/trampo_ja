import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

/**
 * Configuração lida de variáveis de ambiente (documentadas em `apps/api/.env.example`).
 *
 * Regra de segredo: nenhuma mensagem de erro daqui traz o valor da variável, só o nome.
 * A URL do banco tem senha; nunca a imprima nem a registre em log.
 */

export interface Config {
  readonly databaseUrl: string;
  readonly porta: number;
  /**
   * `trustProxy` do Fastify: `false` (padrão) usa o IP da conexão; uma lista
   * de IPs/CIDRs confia só nesses proxies; `true` confia em qualquer um.
   */
  readonly trustProxy: string | boolean;
}

type Ambiente = Readonly<Record<string, string | undefined>>;

const PORTA_PADRAO = 3000;

/** Falha de configuração. A mensagem cita a variável, nunca o valor. */
export class ErroDeConfiguracao extends Error {
  readonly variavel: string;

  constructor(variavel: string, problema: string) {
    super(`${variavel} ${problema}`);
    this.name = 'ErroDeConfiguracao';
    this.variavel = variavel;
  }
}

/**
 * Carrega `.env` do diretório atual (`apps/api` nos scripts do pnpm), se existir.
 * Variáveis já definidas no ambiente têm prioridade sobre o arquivo.
 */
export function carregarArquivoEnv(
  caminho = resolve(process.cwd(), '.env'),
): void {
  if (existsSync(caminho)) {
    process.loadEnvFile(caminho);
  }
}

function lerObrigatoria(env: Ambiente, nome: string): string {
  const valor = env[nome]?.trim();
  if (!valor) {
    throw new ErroDeConfiguracao(nome, 'ausente (veja apps/api/.env.example)');
  }
  return valor;
}

/** Lê e valida uma URL `postgres://` (ou `postgresql://`) com nome de banco. */
export function lerUrlDoBanco(env: Ambiente, nome: string): string {
  const valor = lerObrigatoria(env, nome);
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    // O TypeError do `URL` guarda a entrada em `input`; não o propagamos.
    throw new ErroDeConfiguracao(
      nome,
      'inválida: esperado postgres://usuario:senha@host:porta/banco',
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ErroDeConfiguracao(
      nome,
      'inválida: o protocolo deve ser postgres://',
    );
  }
  if (nomeDoBanco(url) === '') {
    throw new ErroDeConfiguracao(
      nome,
      'inválida: falta o nome do banco no caminho',
    );
  }
  return valor;
}

/**
 * Lê a URL do banco de teste (`DATABASE_URL_TESTE`). Exige que o nome do banco termine
 * em `_teste`, porque os testes de integração truncam tabelas: assim um engano de
 * configuração nunca aponta a suíte para o banco de desenvolvimento.
 */
export function lerUrlDoBancoDeTeste(env: Ambiente = process.env): string {
  const valor = lerUrlDoBanco(env, 'DATABASE_URL_TESTE');
  if (!nomeDoBanco(new URL(valor)).endsWith('_teste')) {
    throw new ErroDeConfiguracao(
      'DATABASE_URL_TESTE',
      'inválida: o nome do banco deve terminar em _teste',
    );
  }
  return valor;
}

/** Lê `PORT`; sem valor, usa 3000. */
export function lerPorta(env: Ambiente = process.env): number {
  const valor = env.PORT?.trim();
  if (!valor) {
    return PORTA_PADRAO;
  }
  const porta = Number(valor);
  if (!/^\d+$/.test(valor) || porta < 1 || porta > 65535) {
    throw new ErroDeConfiguracao(
      'PORT',
      'inválida: use um inteiro de 1 a 65535',
    );
  }
  return porta;
}

// Nomes que o `proxy-addr` (usado pelo Fastify) entende como faixas prontas.
const FAIXAS_NOMEADAS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function ehEnderecoOuFaixa(item: string): boolean {
  if (FAIXAS_NOMEADAS.has(item)) {
    return true;
  }
  const [endereco = '', prefixo, ...resto] = item.split('/');
  const versao = isIP(endereco);
  if (versao === 0 || resto.length > 0) {
    return false;
  }
  if (prefixo === undefined) {
    return true;
  }
  const bits = Number(prefixo);
  return /^\d{1,3}$/.test(prefixo) && bits <= (versao === 4 ? 32 : 128);
}

/**
 * Lê `TRUST_PROXY`. Vazio ou ausente: desligado (o IP é o da conexão).
 * `true`, escrito assim: confia em qualquer proxy, o que só é seguro quando
 * nada além do proxy alcança a porta da API. Fora isso, uma lista de IPs ou
 * CIDRs separada por vírgula (ex.: `10.0.0.1,10.0.1.0/24`), devolvida já
 * aparada no formato que o Fastify aceita.
 */
export function lerTrustProxy(env: Ambiente = process.env): string | boolean {
  const valor = env.TRUST_PROXY?.trim();
  if (!valor || valor === 'false') {
    return false;
  }
  if (valor === 'true') {
    return true;
  }
  const itens = valor.split(',').map((item) => item.trim());
  if (!itens.every(ehEnderecoOuFaixa)) {
    throw new ErroDeConfiguracao(
      'TRUST_PROXY',
      'inválida: use true ou uma lista de IPs/CIDRs separada por vírgula',
    );
  }
  return itens.join(',');
}

/** Configuração da aplicação (servidor e script de migração no banco de desenvolvimento). */
export function carregarConfig(env: Ambiente = process.env): Config {
  return {
    databaseUrl: lerUrlDoBanco(env, 'DATABASE_URL'),
    porta: lerPorta(env),
    trustProxy: lerTrustProxy(env),
  };
}

function nomeDoBanco(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}
