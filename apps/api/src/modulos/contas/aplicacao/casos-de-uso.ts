import { createHash, randomBytes } from 'node:crypto';
import {
  type CampoInvalido,
  ErroDeRegra,
  ErroDeValidacao,
  ErroNaoEncontrado,
  ErroProibido,
} from '../../../compartilhado/dominio/erros.js';
import {
  type Relogio,
  relogioDoSistema,
} from '../../../compartilhado/dominio/relogio.js';
import { Conta } from '../dominio/conta.js';
import { Email } from '../dominio/email.js';
import {
  type ContaId,
  type DadosDaConta,
  ErroDeEmailDuplicado,
  type ExportacaoV1,
  FORMATO_DA_EXPORTACAO,
  type GeradorDeToken,
  geradorDeTokenPadrao,
  type HasherDeSenha,
  type RepositorioDeContas,
  type RepositorioDeSessoes,
} from '../dominio/portas.js';
import { Semaforo } from '../dominio/semaforo.js';
import {
  SENHA_TAMANHO_MAXIMO,
  Senha,
  tamanhoDaSenha,
} from '../dominio/senha.js';

/** A sessão vale 30 dias a partir do cadastro ou da entrada. */
export const DURACAO_DA_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

// O token real tem 43 caracteres; acima disso nem se calcula o hash.
const TAMANHO_MAXIMO_DO_TOKEN = 256;

/**
 * Exportações coletando ao mesmo tempo, por processo (S1). Cada uma monta em
 * memória tudo o que a conta tem; as demais esperam numa fila FIFO sem teto.
 */
export const EXPORTACOES_SIMULTANEAS = 1;

// Um só para o processo inteiro: vale para todas as instâncias dos casos de
// uso (cada `montarAplicacao` cria a sua), como o semáforo do scrypt.
const semaforoDaExportacaoDoProcesso = new Semaforo(EXPORTACOES_SIMULTANEAS);

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
  /** Dados da conta nos outros módulos (ADR-005); a composição liga. */
  readonly dadosDaConta: DadosDaConta;
  /**
   * Fila da coleta da exportação. Padrão: o semáforo do processo, com
   * `EXPORTACOES_SIMULTANEAS` vagas. Injetável em teste.
   */
  readonly semaforoDaExportacao?: Semaforo;
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
  /**
   * Exclui a conta e todos os dados dela na hora (D25, CA17); as sessões de
   * todos os aparelhos caem junto. Senha errada, ausente ou acima do teto:
   * `ErroProibido('senha_incorreta')`, sem tocar em nada. Conta inexistente:
   * `ErroNaoEncontrado`.
   */
  excluirConta(contaId: ContaId, senha: unknown): Promise<void>;
  /**
   * Exportação `trampo-ja.exportacao.v1` (D26, CA19), com as mesmas recusas
   * de `excluirConta`. Única saída da API com o e-mail da conta. Depois da
   * senha, a coleta espera vaga no semáforo da exportação (S1).
   */
  exportarDados(contaId: ContaId, senha: unknown): Promise<ExportacaoV1>;
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

/** 403, e não 401: o app trataria 401 como sessão expirada. */
function senhaIncorreta(): ErroProibido {
  return new ErroProibido('senha_incorreta');
}

/**
 * Senha que alguma conta poderia ter. As demais (ausente, vazia, que não é
 * texto ou acima do teto) são recusadas sem rodar o scrypt.
 */
function senhaVerificavel(senha: unknown): senha is string {
  return (
    typeof senha === 'string' &&
    senha !== '' &&
    tamanhoDaSenha(senha) <= SENHA_TAMANHO_MAXIMO
  );
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
    dadosDaConta,
    semaforoDaExportacao = semaforoDaExportacaoDoProcesso,
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

  /**
   * Confere a senha da conta autenticada antes de excluir ou exportar. Só o
   * teto da senha é checado antes do hash, como em `entrar`.
   */
  async function contaComSenhaConferida(
    contaId: ContaId,
    senha: unknown,
  ): Promise<Conta> {
    if (!senhaVerificavel(senha)) {
      throw senhaIncorreta();
    }
    const conta = await contas.buscarPorId(contaId);
    if (conta === null) {
      throw new ErroNaoEncontrado();
    }
    if (!(await hasher.verificar(senha, conta.senhaHash))) {
      throw senhaIncorreta();
    }
    return conta;
  }

  async function excluirConta(contaId: ContaId, senha: unknown): Promise<void> {
    const conta = await contaComSenhaConferida(contaId, senha);
    await dadosDaConta.excluirTudo(conta.id);
  }

  async function exportarDados(
    contaId: ContaId,
    senha: unknown,
  ): Promise<ExportacaoV1> {
    const conta = await contaComSenhaConferida(contaId, senha);
    // A senha é conferida fora da fila (o scrypt tem o semáforo dele); só a
    // coleta, que junta tudo em memória, ocupa a vaga, liberada também em erro.
    const [sessoesDaConta, partes] = await semaforoDaExportacao.executar(() =>
      Promise.all([
        sessoes.listarDaConta(conta.id),
        dadosDaConta.coletarDosOutrosModulos(conta.id),
      ]),
    );
    // Campo a campo: nada além do contrato v1 sai daqui (o schema da
    // resposta também é fechado).
    return {
      formato: FORMATO_DA_EXPORTACAO,
      geradoEm: relogio.agora().toISOString(),
      conta: {
        id: conta.id,
        email: conta.email.valor,
        criadaEm: conta.criadaEm.toISOString(),
      },
      sessoes: sessoesDaConta.map((sessao) => ({
        criadaEm: sessao.criadaEm.toISOString(),
        expiraEm: sessao.expiraEm.toISOString(),
      })),
      perfil: partes.perfil,
      trampos: partes.trampos,
      servicos: partes.servicos,
      candidaturas: partes.candidaturas,
      conversas: partes.conversas,
    };
  }

  return {
    criarConta,
    entrar,
    sair,
    validarSessao,
    excluirConta,
    exportarDados,
  };
}
