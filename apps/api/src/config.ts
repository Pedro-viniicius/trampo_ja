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

/**
 * Lê e valida uma URL `postgres://` (ou `postgresql://`) com nome de banco.
 * Banco fora desta máquina (ver `ehBancoLocal`) só com `sslmode=verify-full`
 * e sem `NODE_TLS_REJECT_UNAUTHORIZED=0` no ambiente. Toda leitura da URL do
 * banco (servidor, `migrar`, `semear` e banco de teste) passa por aqui, então
 * nenhum caminho conecta sem essas conferências.
 */
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
  // D42: os tempos do pool são fixos no código (`conexao.ts`). O `pg` deixa
  // o parâmetro da URL sobrescrever a configuração do pool, então recusamos.
  if (PARAMETROS_DE_TEMPO.some((p) => url.searchParams.has(p))) {
    throw new ErroDeConfiguracao(
      nome,
      'inválida: os tempos do banco são fixos no código; tire statement_timeout, idle_in_transaction_session_timeout e connectionTimeoutMillis da URL',
    );
  }
  // D44 (S10): fora da máquina, só com TLS e certificado conferido.
  if (!ehBancoLocal(valor) && !exigeVerifyFull(url)) {
    throw new ErroDeConfiguracao(
      nome,
      'inválida: banco fora desta máquina exige sslmode=verify-full (veja apps/api/.env.example)',
    );
  }
  recusarTlsSemConferencia(env, valor);
  return valor;
}

const PARAMETROS_DE_TEMPO = [
  'statement_timeout',
  'idle_in_transaction_session_timeout',
  'connectionTimeoutMillis',
] as const;

// Repetir `sslmode` faria o `pg` usar o último valor: só vale um, exato.
function exigeVerifyFull(url: URL): boolean {
  const modos = url.searchParams.getAll('sslmode');
  return modos.length === 1 && modos[0] === 'verify-full';
}

/**
 * Diz se a URL aponta para um banco nesta máquina: host `localhost`,
 * IPv4 em `127.0.0.0/8`, `::1` ou socket Unix (caminho começando em `/`).
 *
 * Segue a leitura do `pg`: o parâmetro `host` da query vale mais que o host
 * da URL, e todos os que vierem precisam ser locais. Na dúvida, devolve
 * `false`: URL inválida, host vazio (o `pg` cairia no `PGHOST`), IPv4 escrito
 * de forma abreviada (`127.1`) ou nome que só o DNS resolveria.
 */
export function ehBancoLocal(url: string): boolean {
  let lida: URL;
  try {
    lida = new URL(url);
  } catch {
    return false;
  }
  const daQuery = lida.searchParams.getAll('host');
  const hosts =
    daQuery.length > 0 ? daQuery : [decodificar(lida.hostname) ?? ''];
  return hosts.every(ehHostLocal);
}

function decodificar(texto: string): string | undefined {
  try {
    return decodeURIComponent(texto);
  } catch {
    return undefined;
  }
}

function ehHostLocal(host: string): boolean {
  if (host.startsWith('/')) {
    return true;
  }
  const semColchetes = host.replace(/^\[(.+)\]$/, '$1').toLowerCase();
  if (semColchetes === 'localhost') {
    return true;
  }
  if (isIP(semColchetes) === 4) {
    return semColchetes.split('.')[0] === '127';
  }
  return isIP(semColchetes) === 6 && ehLoopbackIpv6(semColchetes);
}

// `::1` em qualquer grafia (`::1`, `0:0:0:0:0:0:0:1`, `0::1`).
function ehLoopbackIpv6(endereco: string): boolean {
  if (endereco.includes('.')) {
    return false;
  }
  const [inicio = '', fim] = endereco.split('::');
  const grupos = (parte: string | undefined) =>
    parte ? parte.split(':').map((g) => Number.parseInt(g, 16)) : [];
  const esquerda = grupos(inicio);
  const direita = grupos(fim);
  const zeros = 8 - esquerda.length - direita.length;
  const todos =
    fim === undefined
      ? esquerda
      : [...esquerda, ...Array<number>(zeros).fill(0), ...direita];
  return (
    todos.length === 8 &&
    todos.slice(0, 7).every((g) => g === 0) &&
    todos[7] === 1
  );
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

/**
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` desliga, no processo inteiro, a conferência
 * do certificado que o `sslmode=verify-full` exige do banco remoto. Com banco
 * local não há TLS em jogo; com remoto, recusamos. O Node só desliga com `0`
 * exato, então a comparação também é exata.
 */
function recusarTlsSemConferencia(env: Ambiente, url: string) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0' && !ehBancoLocal(url)) {
    throw new ErroDeConfiguracao(
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'inválida: desliga a conferência do certificado que o banco fora desta máquina exige; remova a variável (veja o README)',
    );
  }
}

/** Configuração da aplicação (servidor e script de migração no banco de desenvolvimento). */
export function carregarConfig(env: Ambiente = process.env): Config {
  const databaseUrl = lerUrlDoBanco(env, 'DATABASE_URL');
  return {
    databaseUrl,
    porta: lerPorta(env),
    trustProxy: lerTrustProxy(env),
  };
}

function nomeDoBanco(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}
