import { createHash, randomBytes } from 'node:crypto';
import {
  type CampoInvalido,
  ErroDeRegra,
  ErroDeValidacao,
  ErroIndisponivel,
  ErroLimiteExcedido,
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
  type PartesExportadas,
  type RepositorioDeContas,
  type RepositorioDeContasExcluidas,
  type RepositorioDeSessoes,
  type RepositorioDeTentativasDeEntrada,
  type SessaoDaConta,
} from '../dominio/portas.js';
import {
  EsperaCancelada,
  EsperaEsgotada,
  type OpcoesDeExecucao,
  Semaforo,
} from '../dominio/semaforo.js';
import {
  formasDaSenha,
  SENHA_TAMANHO_MAXIMO,
  Senha,
  tamanhoDaSenha,
} from '../dominio/senha.js';

/** A sessão vale 30 dias a partir do cadastro ou da entrada. */
export const DURACAO_DA_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

// O token real tem 43 caracteres; acima disso nem se calcula o hash.
const TAMANHO_MAXIMO_DO_TOKEN = 256;

/**
 * Exportações rodando ao mesmo tempo, por processo (S1). Cada uma mede, monta
 * em memória tudo o que a conta tem e serializa; as demais esperam numa fila
 * FIFO, no máximo `ESPERA_MAXIMA_NA_FILA_MS`.
 */
export const EXPORTACOES_SIMULTANEAS = 1;

/**
 * Espera máxima por uma vaga na fila do scrypt ou na da exportação (D42).
 * Passou disso, o pedido sai da fila sem rodar e recebe 503
 * `servico_ocupado` com `retry-after` de `TENTAR_DE_NOVO_EM_S`.
 */
export const ESPERA_MAXIMA_NA_FILA_MS = 10_000;
/** `retry-after` do 503 `servico_ocupado`: fixo, nunca o tamanho da fila. */
export const TENTAR_DE_NOVO_EM_S = 10;

// Um só para o processo inteiro: vale para todas as instâncias dos casos de
// uso (cada `montarAplicacao` cria a sua), como o semáforo do scrypt.
const semaforoDaExportacaoDoProcesso = new Semaforo(EXPORTACOES_SIMULTANEAS);

/**
 * Teto da exportação (D41): acima disso, medido no banco antes de carregar
 * qualquer dado, a resposta é 409 `exportacao_grande`, sem coletar nada, e a
 * pessoa pede a cópia pelo e-mail de contato. O limite é inclusivo.
 */
export const TETO_DA_EXPORTACAO_BYTES = 10 * 1024 * 1024;
/**
 * Medida da parte de `contas` na exportação: cada sessão sai como duas datas
 * ISO (~80 bytes de JSON) e a conta, com `formato`, `geradoEm`, id e e-mail
 * (até 320), cabe em 1 KiB. Valores folgados: a medida nunca fica abaixo do
 * que é serializado.
 */
export const BYTES_POR_SESSAO_NA_MEDIDA = 128;
export const BYTES_DA_CONTA_NA_MEDIDA = 1024;

/**
 * Limpeza periódica (D40, ADR-007). Sessões expiradas saem em lotes de
 * `SESSOES_POR_LOTE`, até `LOTES_DE_SESSOES_POR_RODADA` por rodada (o resto
 * fica para a próxima). Cada lápide com pelo menos `ESPERA_DA_LAPIDE_MS` de
 * idade tem a exclusão refeita e é esquecida, até `LAPIDES_POR_RODADA`.
 */
export const SESSOES_POR_LOTE = 1000;
export const LOTES_DE_SESSOES_POR_RODADA = 20;
export const ESPERA_DA_LAPIDE_MS = 10 * 60 * 1000;
export const LAPIDES_POR_RODADA = 100;

/** Quantas tentativas cabem numa janela de tempo. */
export interface TetoDeTentativas {
  readonly max: number;
  readonly janelaMs: number;
}

/**
 * D31: teto de 100 tentativas de entrada por conta a cada hora, venha de
 * onde vier, numa janela fixa que começa na primeira tentativa. É contado no
 * banco por conta existente (`RepositorioDeTentativasDeEntrada`), depois de
 * achar a conta e antes do scrypt; o contador por e-mail+IP (10 a cada
 * 15 min) fica na borda HTTP (`limite-de-entrada.ts`) e a recusa dele não
 * chega aqui, então não gasta o teto. Constante, não variável de ambiente:
 * mudar o teto é decisão de produto.
 */
export const TETO_PADRAO_POR_EMAIL: TetoDeTentativas = Object.freeze({
  max: 100,
  janelaMs: 60 * 60 * 1000,
});

// Maior janela aceita: o `retry-after` do 429 vai até um dia.
const JANELA_MAXIMA_DO_TETO_MS = 24 * 60 * 60 * 1000;

/** Dados enviados no cadastro e na entrada; o formato é checado aqui. */
export interface Credenciais {
  readonly email?: unknown;
  readonly senha?: unknown;
}

export interface SessaoAberta {
  readonly token: string;
}

export interface OpcoesDaExportacao {
  /**
   * Transforma a exportação no texto da resposta. Roda dentro da vaga da
   * exportação, logo depois da coleta: a rota passa o serializador do schema
   * fechado da resposta, que descarta qualquer chave fora do contrato v1.
   */
  readonly serializar: (exportacao: ExportacaoV1) => string;
  /** Abortado (a conexão caiu) antes da vaga: sai da fila sem coletar. */
  readonly sinal?: AbortSignal;
}

/** O que uma rodada de `limparRegistrosVencidos` apagou. */
export interface ResultadoDaLimpeza {
  /** Sessões expiradas apagadas. */
  readonly sessoes: number;
  /** Lápides cuja exclusão foi refeita e que foram esquecidas. */
  readonly contasRevarridas: number;
}

export interface DependenciasDeContas {
  readonly contas: RepositorioDeContas;
  readonly sessoes: RepositorioDeSessoes;
  /** Lápides das contas excluídas (ADR-007), lidas pela limpeza. */
  readonly contasExcluidas: RepositorioDeContasExcluidas;
  /** Contador do teto de entrada por conta (D31), no banco. */
  readonly tentativasDeEntrada: RepositorioDeTentativasDeEntrada;
  /**
   * Teto de entrada por conta (D31). Padrão: `TETO_PADRAO_POR_EMAIL`.
   * Injetável em teste, para não precisar de 100 tentativas.
   */
  readonly tetoDeTentativas?: TetoDeTentativas;
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

/**
 * Todo caso de uso que roda o scrypt (ou coleta a exportação) espera a vaga
 * no máximo `ESPERA_MAXIMA_NA_FILA_MS` e recusa com
 * `ErroIndisponivel('servico_ocupado')` quando a espera esgota ou quando
 * `sinal` aborta antes da vaga (a conexão caiu): nada é derivado nem coletado.
 * A senha é conferida em NFC e, se diferente, também na forma recebida (S8).
 */
export interface CasosDeUsoDeContas {
  /**
   * Cadastra e já abre a sessão (CA1), gravando a conta e a sessão juntas
   * (S7). Recusa com `ErroDeValidacao` (todos os campos inválidos juntos) ou
   * `ErroDeRegra('email_em_uso')`, sem nenhum dado da conta existente (CA2).
   */
  criarConta(
    credenciais: Credenciais,
    sinal?: AbortSignal,
  ): Promise<SessaoAberta>;
  /**
   * Abre sessão; recusa com `ErroDeRegra('credenciais_invalidas')`. Com a
   * conta achada, soma a tentativa ao teto dela (D31) antes do scrypt: acima
   * do teto, recusa com `ErroLimiteExcedido` (429) sem derivar, mesmo com a
   * senha certa. E-mail inexistente não grava contador.
   */
  entrar(credenciais: Credenciais, sinal?: AbortSignal): Promise<SessaoAberta>;
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
  excluirConta(
    contaId: ContaId,
    senha: unknown,
    sinal?: AbortSignal,
  ): Promise<void>;
  /**
   * Exportação `trampo-ja.exportacao.v1` (D26, CA19), já serializada por
   * `opcoes.serializar`, com as mesmas recusas de `excluirConta`. Única saída
   * da API com o e-mail da conta. Depois da senha, espera vaga no semáforo da
   * exportação (S1) e, dentro dela: mede no banco, recusa acima de
   * `TETO_DA_EXPORTACAO_BYTES` com `ErroDeRegra('exportacao_grande')` sem
   * coletar nada (D41), coleta e serializa.
   */
  exportarDados(
    contaId: ContaId,
    senha: unknown,
    opcoes: OpcoesDaExportacao,
  ): Promise<string>;
  /**
   * Limpeza periódica (D40, ADR-007): apaga as sessões expiradas em lotes e
   * os contadores do teto de entrada com a janela vencida e, para cada lápide
   * com `ESPERA_DA_LAPIDE_MS` ou mais, refaz a exclusão da conta (o que uma
   * escrita em voo gravou depois some) e esquece a lápide.
   * Idempotente: pode rodar em várias réplicas. Uma falha não impede o resto
   * da rodada; a primeira sobe no fim, e a lápide que falhou fica para a
   * próxima.
   */
  limparRegistrosVencidos(): Promise<ResultadoDaLimpeza>;
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
 * Recusa na criação um teto que não seja inteiro positivo, ou com janela
 * acima de um dia (o `retry-after` do 429 não passaria disso).
 */
function validarTeto(teto: TetoDeTentativas): void {
  if (!Number.isSafeInteger(teto.max) || teto.max < 1) {
    throw new Error('teto de tentativas de entrada inválido: max');
  }
  if (
    !Number.isSafeInteger(teto.janelaMs) ||
    teto.janelaMs < 1 ||
    teto.janelaMs > JANELA_MAXIMA_DO_TETO_MS
  ) {
    throw new Error('teto de tentativas de entrada inválido: janelaMs');
  }
}

/** Opções da fila para um pedido de cliente (D42). */
function naFila(sinal: AbortSignal | undefined): OpcoesDeExecucao {
  return { esperaMaximaMs: ESPERA_MAXIMA_NA_FILA_MS, sinal };
}

/**
 * Saída da fila sem vaga (espera esgotada ou conexão caída) vira 503
 * `servico_ocupado`; o resto sobe como está. A tarefa não rodou.
 */
async function comVaga<T>(operacao: Promise<T>): Promise<T> {
  try {
    return await operacao;
  } catch (erro) {
    if (erro instanceof EsperaEsgotada || erro instanceof EsperaCancelada) {
      throw new ErroIndisponivel('servico_ocupado', TENTAR_DE_NOVO_EM_S);
    }
    throw erro;
  }
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
    contasExcluidas,
    tentativasDeEntrada,
    tetoDeTentativas = TETO_PADRAO_POR_EMAIL,
    hasher,
    relogio = relogioDoSistema,
    geradorDeToken = geradorDeTokenPadrao,
    dadosDaConta,
    semaforoDaExportacao = semaforoDaExportacaoDoProcesso,
  } = dependencias;
  validarTeto(tetoDeTentativas);

  // Hash de uma senha aleatória, com os mesmos parâmetros das contas novas.
  // Quando o e-mail não existe, `entrar` confere contra ele: o tempo de
  // resposta fica igual ao de um e-mail existente com senha errada. Sem
  // espera máxima nem sinal: um 503 só no e-mail inexistente o revelaria.
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

  function novaSessao() {
    const token = geradorDeToken.gerar();
    const expiraEm = new Date(relogio.agora().getTime() + DURACAO_DA_SESSAO_MS);
    return { token, inicial: { tokenHash: hashDoToken(token), expiraEm } };
  }

  async function abrirSessao(contaId: ContaId): Promise<SessaoAberta> {
    const { token, inicial } = novaSessao();
    await sessoes.salvar(inicial.tokenHash, contaId, inicial.expiraEm);
    return { token };
  }

  /**
   * Confere cada forma da senha (`formasDaSenha`: NFC e, se diferente, a
   * recebida) contra o hash, até uma conferir. Errada, roda todas: o mesmo
   * número de derivações contra o hash real ou o fictício.
   */
  async function algumaFormaConfere(
    senha: string,
    hash: string,
    sinal: AbortSignal | undefined,
  ): Promise<boolean> {
    for (const forma of formasDaSenha(senha)) {
      if (await comVaga(hasher.verificar(forma, hash, naFila(sinal)))) {
        return true;
      }
    }
    return false;
  }

  async function criarConta(
    { email: emailInformado, senha: senhaInformada }: Credenciais,
    sinal?: AbortSignal,
  ): Promise<SessaoAberta> {
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
      senhaHash: await comVaga(
        hasher.gerarHash(senha.revelar(), naFila(sinal)),
      ),
      criadaEm: relogio.agora(),
    });
    const { token, inicial } = novaSessao();
    try {
      // Conta e sessão numa transação: sem sessão, nada de conta (S7).
      await contas.salvar(conta, inicial);
    } catch (erro) {
      // Corrida: outro cadastro gravou o mesmo e-mail depois da checagem.
      if (erro instanceof ErroDeEmailDuplicado) {
        throw new ErroDeRegra('email_em_uso');
      }
      throw erro;
    }
    return { token };
  }

  /**
   * Soma a tentativa ao teto da conta (D31). Acima dele, lança
   * `ErroLimiteExcedido` com o tempo até a janela vencer, sem dizer a
   * contagem. Devolve `false` se a conta sumiu desde a busca (excluída no
   * meio): quem chama a trata como inexistente.
   */
  async function contarTentativa(contaId: ContaId): Promise<boolean> {
    const agora = relogio.agora();
    const contagem = await tentativasDeEntrada.registrar(
      contaId,
      agora,
      tetoDeTentativas.janelaMs,
    );
    if (contagem === null) {
      return false;
    }
    if (contagem.tentativas > tetoDeTentativas.max) {
      const restanteMs =
        contagem.inicioDaJanela.getTime() +
        tetoDeTentativas.janelaMs -
        agora.getTime();
      // Entre 1 s e a janela inteira, mesmo com relógios fora de passo
      // entre réplicas.
      const segundos = Math.min(
        Math.max(Math.ceil(restanteMs / 1000), 1),
        Math.ceil(tetoDeTentativas.janelaMs / 1000),
      );
      throw new ErroLimiteExcedido(segundos);
    }
    return true;
  }

  async function entrar(
    { email: emailInformado, senha }: Credenciais,
    sinal?: AbortSignal,
  ): Promise<SessaoAberta> {
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
    let conta = await contas.buscarPorEmail(Email.criar(emailInformado));
    // O teto é conferido antes da fila do scrypt: a recusa não deriva nada.
    if (conta !== null && !(await contarTentativa(conta.id))) {
      conta = null;
    }
    const hash = conta?.senhaHash ?? (await obterHashFicticio());
    const senhaConfere = await algumaFormaConfere(senha, hash, sinal);
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
   * teto da senha é checado antes do hash, na forma recebida, como em
   * `entrar`.
   */
  async function contaComSenhaConferida(
    contaId: ContaId,
    senha: unknown,
    sinal: AbortSignal | undefined,
  ): Promise<Conta> {
    if (!senhaVerificavel(senha)) {
      throw senhaIncorreta();
    }
    const conta = await contas.buscarPorId(contaId);
    if (conta === null) {
      throw new ErroNaoEncontrado();
    }
    if (!(await algumaFormaConfere(senha, conta.senhaHash, sinal))) {
      throw senhaIncorreta();
    }
    return conta;
  }

  async function excluirConta(
    contaId: ContaId,
    senha: unknown,
    sinal?: AbortSignal,
  ): Promise<void> {
    const conta = await contaComSenhaConferida(contaId, senha, sinal);
    await dadosDaConta.excluirTudo(conta.id);
  }

  /**
   * Tamanho estimado da exportação, medido no banco sem carregar os textos:
   * os outros módulos (porta) mais as sessões e a conta.
   */
  async function medirExportacao(contaId: ContaId): Promise<number> {
    const [dosOutrosModulos, quantasSessoes] = await Promise.all([
      dadosDaConta.medirDosOutrosModulos(contaId),
      sessoes.contarDaConta(contaId),
    ]);
    return (
      dosOutrosModulos +
      quantasSessoes * BYTES_POR_SESSAO_NA_MEDIDA +
      BYTES_DA_CONTA_NA_MEDIDA
    );
  }

  /**
   * Campo a campo: nada além do contrato v1 sai daqui (e o serializador da
   * rota, do schema fechado, descarta o que vier a mais das partes).
   */
  function montarExportacao(
    conta: Conta,
    sessoesDaConta: readonly SessaoDaConta[],
    partes: PartesExportadas,
  ): ExportacaoV1 {
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

  async function exportarDados(
    contaId: ContaId,
    senha: unknown,
    { serializar, sinal }: OpcoesDaExportacao,
  ): Promise<string> {
    const conta = await contaComSenhaConferida(contaId, senha, sinal);
    // A senha é conferida fora da fila (o scrypt tem o semáforo dele). A
    // vaga cobre a medida, a coleta e a serialização, tudo o que pesa em
    // memória; ela é liberada também em erro.
    return comVaga(
      semaforoDaExportacao.executar(async () => {
        const tamanho = await medirExportacao(conta.id);
        // `!(<=)`: uma medida inválida (NaN) também recusa (falha fechada).
        // O 409 não diz o tamanho.
        if (!(tamanho <= TETO_DA_EXPORTACAO_BYTES)) {
          throw new ErroDeRegra('exportacao_grande');
        }
        const [sessoesDaConta, partes] = await Promise.all([
          sessoes.listarDaConta(conta.id),
          dadosDaConta.coletarDosOutrosModulos(conta.id),
        ]);
        return serializar(montarExportacao(conta, sessoesDaConta, partes));
      }, naFila(sinal)),
    );
  }

  /** Apaga as sessões expiradas em lotes, até o teto de lotes da rodada. */
  async function apagarSessoesExpiradas(agora: Date): Promise<number> {
    let apagadas = 0;
    for (let lote = 0; lote < LOTES_DE_SESSOES_POR_RODADA; lote += 1) {
      const doLote = await sessoes.apagarExpiradas(agora, SESSOES_POR_LOTE);
      apagadas += doLote;
      if (doLote < SESSOES_POR_LOTE) {
        break;
      }
    }
    return apagadas;
  }

  async function limparRegistrosVencidos(): Promise<ResultadoDaLimpeza> {
    const agora = relogio.agora();
    const falhas: unknown[] = [];
    let sessoesApagadas = 0;
    try {
      sessoesApagadas = await apagarSessoesExpiradas(agora);
    } catch (erro) {
      falhas.push(erro);
    }
    try {
      // Janelas vencidas do teto de entrada: a próxima tentativa recomeçaria
      // do zero de todo jeito. Fica fora do resultado (só contagens de
      // sessões e lápides vão para o log).
      await tentativasDeEntrada.apagarVencidas(
        new Date(agora.getTime() - tetoDeTentativas.janelaMs),
      );
    } catch (erro) {
      falhas.push(erro);
    }
    let contasRevarridas = 0;
    try {
      const vencidas = await contasExcluidas.listarAntesDe(
        new Date(agora.getTime() - ESPERA_DA_LAPIDE_MS),
        LAPIDES_POR_RODADA,
      );
      for (const id of vencidas) {
        try {
          // Refaz a exclusão inteira (mesma transação e trava do ADR-005):
          // apaga o que uma escrita em voo gravou depois. Só então esquece a
          // lápide; se algo falhar, ela fica para a próxima rodada.
          await dadosDaConta.excluirTudo(id);
          await contasExcluidas.esquecer(id);
          contasRevarridas += 1;
        } catch (erro) {
          falhas.push(erro);
        }
      }
    } catch (erro) {
      falhas.push(erro);
    }
    if (falhas.length > 0) {
      throw falhas[0];
    }
    return { sessoes: sessoesApagadas, contasRevarridas };
  }

  return {
    criarConta,
    entrar,
    sair,
    validarSessao,
    excluirConta,
    exportarDados,
    limparRegistrosVencidos,
  };
}
