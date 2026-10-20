import { createHash, randomBytes } from 'node:crypto';
import {
  type CampoInvalido,
  ErroDeRegra,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  type Relogio,
  relogioDoSistema,
} from '../../../compartilhado/dominio/relogio.js';
import { Conta } from '../dominio/conta.js';
import { Email } from '../dominio/email.js';
import {
  type ContaId,
  ErroDeEmailDuplicado,
  type GeradorDeToken,
  geradorDeTokenPadrao,
  type HasherDeSenha,
  type RepositorioDeContas,
  type RepositorioDeSessoes,
} from '../dominio/portas.js';
import {
  SENHA_TAMANHO_MAXIMO,
  Senha,
  tamanhoDaSenha,
} from '../dominio/senha.js';

/** A sessão vale 30 dias a partir do cadastro ou da entrada. */
export const DURACAO_DA_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

// O token real tem 43 caracteres; acima disso nem se calcula o hash.
const TAMANHO_MAXIMO_DO_TOKEN = 256;

/** Dados enviados no cadastro e na entrada; o formato é checado aqui. */
export interface Credenciais {
  readonly email?: unknown;
  readonly senha?: unknown;
}

export interface SessaoAberta {
  readonly token: string;
}

export interface DependenciasDeContas {
  readonly contas: RepositorioDeContas;
  readonly sessoes: RepositorioDeSessoes;
  readonly hasher: HasherDeSenha;
  readonly relogio?: Relogio;
  readonly geradorDeToken?: GeradorDeToken;
}

export interface CasosDeUsoDeContas {
  /**
   * Cadastra e já abre a sessão (CA1). Recusa com `ErroDeValidacao` (todos os
   * campos inválidos juntos) ou `ErroDeRegra('email_em_uso')`, sem nenhum dado
   * da conta existente (CA2).
   */
  criarConta(credenciais: Credenciais): Promise<SessaoAberta>;
  /** Abre sessão; recusa sempre com `ErroDeRegra('credenciais_invalidas')`. */
  entrar(credenciais: Credenciais): Promise<SessaoAberta>;
  /** Encerra a sessão do token. Idempotente. */
  sair(token: string): Promise<void>;
  /** Conta dona do token, ou `null` se ausente, desconhecido ou expirado. */
  validarSessao(token: string): Promise<ContaId | null>;
}

/** Só o SHA-256 (hex) do token vai para o repositório. */
function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function tokenAceitavel(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token !== '' &&
    token.length <= TAMANHO_MAXIMO_DO_TOKEN
  );
}

function credenciaisInvalidas(): ErroDeRegra {
  return new ErroDeRegra('credenciais_invalidas');
}

export function criarCasosDeUsoDeContas(
  dependencias: DependenciasDeContas,
): CasosDeUsoDeContas {
  const {
    contas,
    sessoes,
    hasher,
    relogio = relogioDoSistema,
    geradorDeToken = geradorDeTokenPadrao,
  } = dependencias;

  // Hash de uma senha aleatória, com os mesmos parâmetros das contas novas.
  // Quando o e-mail não existe, `entrar` confere contra ele: o tempo de
  // resposta fica igual ao de um e-mail existente com senha errada.
  let hashFicticio = hasher.gerarHash(randomBytes(32).toString('base64url'));
  // Evita rejeição não tratada antes do primeiro `entrar`; quem aguarda a
  // promessa original ainda recebe o erro.
  hashFicticio.catch(() => undefined);

  async function obterHashFicticio(): Promise<string> {
    try {
      return await hashFicticio;
    } catch (erro) {
      // Gera de novo na próxima vez, em vez de falhar para sempre.
      hashFicticio = hasher.gerarHash(randomBytes(32).toString('base64url'));
      hashFicticio.catch(() => undefined);
      throw erro;
    }
  }

  async function abrirSessao(contaId: ContaId): Promise<SessaoAberta> {
    const token = geradorDeToken.gerar();
    const expiraEm = new Date(relogio.agora().getTime() + DURACAO_DA_SESSAO_MS);
    await sessoes.salvar(hashDoToken(token), contaId, expiraEm);
    return { token };
  }

  async function criarConta({
    email: emailInformado,
    senha: senhaInformada,
  }: Credenciais): Promise<SessaoAberta> {
    const recusados: CampoInvalido[] = [];
    const motivoDoEmail = Email.validar(emailInformado);
    if (motivoDoEmail !== null) {
      recusados.push({ campo: 'email', motivo: motivoDoEmail });
    }
    const motivoDaSenha = Senha.validar(senhaInformada);
    if (motivoDaSenha !== null) {
      recusados.push({ campo: 'senha', motivo: motivoDaSenha });
    }
    if (recusados.length > 0) {
      throw new ErroDeValidacao(recusados);
    }
    const email = Email.criar(emailInformado);
    const senha = Senha.criar(senhaInformada);

    if (await contas.existeEmail(email)) {
      throw new ErroDeRegra('email_em_uso');
    }
    const conta = Conta.criar({
      email,
      senhaHash: await hasher.gerarHash(senha.revelar()),
      criadaEm: relogio.agora(),
    });
    try {
      await contas.salvar(conta);
    } catch (erro) {
      // Corrida: outro cadastro gravou o mesmo e-mail depois da checagem.
      if (erro instanceof ErroDeEmailDuplicado) {
        throw new ErroDeRegra('email_em_uso');
      }
      throw erro;
    }
    return abrirSessao(conta.id);
  }

  async function entrar({
    email: emailInformado,
    senha,
  }: Credenciais): Promise<SessaoAberta> {
    // Entrada que nenhuma conta poderia ter: recusa sem consultar nada. Só o
    // teto da senha é checado, para não travar quem cadastrou com outra regra.
    if (
      Email.validar(emailInformado) !== null ||
      typeof senha !== 'string' ||
      senha === '' ||
      tamanhoDaSenha(senha) > SENHA_TAMANHO_MAXIMO
    ) {
      throw credenciaisInvalidas();
    }
    const conta = await contas.buscarPorEmail(Email.criar(emailInformado));
    const hash = conta?.senhaHash ?? (await obterHashFicticio());
    const senhaConfere = await hasher.verificar(senha, hash);
    if (conta === null || !senhaConfere) {
      throw credenciaisInvalidas();
    }
    return abrirSessao(conta.id);
  }

  async function sair(token: string): Promise<void> {
    if (!tokenAceitavel(token)) {
      return;
    }
    await sessoes.remover(hashDoToken(token));
  }

  async function validarSessao(token: string): Promise<ContaId | null> {
    if (!tokenAceitavel(token)) {
      return null;
    }
    return sessoes.buscarContaIdPorTokenHash(
      hashDoToken(token),
      relogio.agora(),
    );
  }

  return { criarConta, entrar, sair, validarSessao };
}
