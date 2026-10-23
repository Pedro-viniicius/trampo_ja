/**
 * Agendador de tarefa periódica dentro do processo da API (D40, ADR-007).
 *
 * A primeira execução sai `atrasoInicialMs` depois de agendar; cada uma das
 * seguintes sai `intervaloMs` depois de a anterior **terminar** (atraso fixo,
 * não ritmo fixo). Por isso duas execuções da mesma tarefa nunca se
 * sobrepõem, por mais que uma demore.
 *
 * - Uma falha (promessa rejeitada ou exceção síncrona) vai para `aoFalhar` e a
 *   tarefa continua agendada. O agendador não registra nada no log: quem
 *   agenda decide o que registrar (só o código do erro, nunca dado pessoal).
 * - Os timers usam `unref`: uma tarefa agendada nunca segura o processo vivo.
 * - `parar()` cancela a próxima execução e espera a que estiver em curso,
 *   para que quem encerra o servidor possa fechar o banco depois.
 *
 * Com várias réplicas, a tarefa roda em cada uma: ela precisa ser idempotente.
 */

export interface OpcoesDoAgendamento {
  /** A tarefa. Não chame `parar()` de dentro dela: esperaria por si mesma. */
  readonly executar: () => Promise<unknown>;
  /** Espera entre o fim de uma execução e o início da seguinte. */
  readonly intervaloMs: number;
  /** Espera entre o agendamento e a primeira execução (0 é permitido). */
  readonly atrasoInicialMs: number;
  /**
   * Recebe o erro de uma execução que falhou. Se ela mesma lançar, o erro é
   * descartado e a tarefa segue agendada: uma rejeição sem tratamento
   * derrubaria o processo.
   */
  readonly aoFalhar: (erro: unknown) => void;
}

export interface TarefaAgendada {
  /**
   * Cancela as próximas execuções e resolve quando a execução em curso (se
   * houver) terminar. Nunca rejeita e pode ser chamado mais de uma vez.
   */
  parar(): Promise<void>;
}

/**
 * Maior espera aceita pelo `setTimeout` do Node (2^31 - 1 ms, ~24,8 dias).
 * Acima disso o Node troca o valor por 1 ms, e a tarefa rodaria em laço.
 */
const ESPERA_MAXIMA_MS = 2_147_483_647;

function validarEspera(nome: string, valor: number, minimo: number): void {
  if (
    !Number.isSafeInteger(valor) ||
    valor < minimo ||
    valor > ESPERA_MAXIMA_MS
  ) {
    throw new Error(`agendamento inválido: ${nome}`);
  }
}

/**
 * Agenda `executar` para rodar depois de `atrasoInicialMs` e, a partir daí,
 * `intervaloMs` depois do fim de cada execução, até `parar()`.
 *
 * Lança erro na hora se `intervaloMs` não for inteiro entre 1 e 2^31 - 1 ou
 * se `atrasoInicialMs` não for inteiro entre 0 e 2^31 - 1.
 *
 * @example
 * const limpeza = agendarTarefa({
 *   executar: () => aplicacao.limparRegistrosVencidos(),
 *   atrasoInicialMs: 60_000,
 *   intervaloMs: 60 * 60_000,
 *   aoFalhar: registrarSoOCodigo, // nunca a mensagem nem dado pessoal
 * });
 * // no encerramento:
 * await limpeza.parar();
 * await db.destroy();
 */
export function agendarTarefa(opcoes: OpcoesDoAgendamento): TarefaAgendada {
  const { executar, intervaloMs, atrasoInicialMs, aoFalhar } = opcoes;
  validarEspera('intervaloMs', intervaloMs, 1);
  validarEspera('atrasoInicialMs', atrasoInicialMs, 0);

  let parada = false;
  let proxima: ReturnType<typeof setTimeout> | undefined;
  let emCurso: Promise<void> | undefined;

  const avisarFalha = (erro: unknown): void => {
    try {
      aoFalhar(erro);
    } catch {
      // Descartado de propósito (ver `aoFalhar`).
    }
  };

  const executarUmaVez = async (): Promise<void> => {
    try {
      await executar();
    } catch (erro) {
      avisarFalha(erro);
    }
  };

  const agendar = (esperaMs: number): void => {
    proxima = setTimeout(rodar, esperaMs);
    proxima.unref();
  };

  function rodar(): void {
    proxima = undefined;
    // `executarUmaVez` nunca rejeita, então `emCurso` também não.
    emCurso = executarUmaVez().finally(() => {
      emCurso = undefined;
      if (!parada) {
        agendar(intervaloMs);
      }
    });
  }

  agendar(atrasoInicialMs);

  return {
    parar(): Promise<void> {
      parada = true;
      if (proxima !== undefined) {
        clearTimeout(proxima);
        proxima = undefined;
      }
      return emCurso ?? Promise.resolve();
    },
  };
}
