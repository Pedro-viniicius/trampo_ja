import { randomUUID } from 'node:crypto';
import {
  ErroDeValidacao,
  ErroNaoEncontrado,
  ErroProibido,
} from '../../../compartilhado/dominio/erros.js';
import type { Relogio } from '../../../compartilhado/dominio/relogio.js';
import { Conversa } from '../dominio/conversa.js';
import { criarMensagem, type Mensagem } from '../dominio/mensagem.js';
import type {
  CursorDeMensagens,
  RepositorioDeConversas,
  UltimaMensagem,
  VerificadorDeVinculo,
} from '../dominio/portas.js';

/** Tamanho da página de `listarMensagens`. */
export const LIMITE_DE_MENSAGENS_POR_PAGINA = 50;

export interface DependenciasDeConversas {
  readonly repositorio: RepositorioDeConversas;
  readonly verificadorDeVinculo: VerificadorDeVinculo;
  readonly relogio: Relogio;
  /** Gerador de id; o padrão é `crypto.randomUUID`. Injetável em teste. */
  readonly gerarId?: () => string;
}

export interface ConversaAberta {
  readonly conversaId: string;
  /** `false` quando o par já tinha conversa: a existente é devolvida. */
  readonly nova: boolean;
}

/** Item de `listarConversas`, do ponto de vista de quem pediu. */
export interface ResumoDeConversa {
  readonly conversaId: string;
  readonly outroUsuarioId: string;
  readonly criadaEm: Date;
  readonly ultimaMensagem: UltimaMensagem | null;
}

export interface MensagemEnviada {
  readonly id: string;
  readonly enviadaEm: Date;
}

export interface OpcoesDeListarMensagens {
  /** Id da última mensagem já lida; vem a página seguinte a ela. */
  readonly depoisDe?: unknown;
}

/**
 * Id do outro usuário como chegou da borda. Os ids de conta são `uuid` e o
 * Postgres os devolve em minúsculas; um id em maiúsculas é o mesmo usuário
 * para o banco, então é normalizado aqui para a ordem do par (e a checagem de
 * "consigo mesmo") coincidir com a do banco.
 */
function lerOutroUsuarioId(valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') {
    throw ErroDeValidacao.doCampo('outroUsuarioId', 'obrigatorio');
  }
  if (typeof valor !== 'string') {
    throw ErroDeValidacao.doCampo('outroUsuarioId', 'invalido');
  }
  return valor.toLowerCase();
}

/** Casos de uso do módulo `conversas`, com as portas injetadas. */
export function criarCasosDeUsoDeConversas(deps: DependenciasDeConversas) {
  const { repositorio, verificadorDeVinculo, relogio } = deps;
  const gerarId = deps.gerarId ?? randomUUID;

  /**
   * A conversa, se `quem` participa dela. Inexistente e alheia dão o mesmo
   * 404, para não confirmar que a conversa existe (plano, "Pontos para o
   * seguranca").
   */
  async function conversaDoParticipante(
    quem: string,
    conversaId: string,
  ): Promise<Conversa> {
    const conversa = await repositorio.buscarConversaPorId(conversaId);
    if (!conversa?.participa(quem)) {
      throw new ErroNaoEncontrado();
    }
    return conversa;
  }

  /**
   * Cursor a partir do id informado; tem de ser mensagem desta conversa. Se
   * não for, confere de novo a participação antes do 400: a conversa pode ter
   * sumido depois da primeira checagem (a exclusão de conta de um dos dois a
   * apaga com as mensagens, D25), e aí a resposta é o 404 de conversa
   * inexistente, não o 400 do cursor (Q2).
   */
  async function lerCursor(
    quem: string,
    conversaId: string,
    depoisDe: unknown,
  ): Promise<CursorDeMensagens | undefined> {
    // Em branco equivale a "sem cursor" (primeira página).
    if (depoisDe === undefined || depoisDe === null || depoisDe === '') {
      return undefined;
    }
    if (typeof depoisDe !== 'string') {
      throw ErroDeValidacao.doCampo('depoisDe', 'invalido');
    }
    const mensagem = await repositorio.buscarMensagemDaConversa(
      conversaId,
      depoisDe,
    );
    if (!mensagem) {
      await conversaDoParticipante(quem, conversaId);
      throw ErroDeValidacao.doCampo('depoisDe', 'invalido');
    }
    return { enviadaEm: mensagem.enviadaEm, id: mensagem.id };
  }

  return {
    /**
     * CA13. Abre (ou reabre) a conversa de `quem` com `outroUsuarioId`:
     * - consigo mesmo → `ErroDeRegra('conversa_consigo_mesmo')` (409);
     * - par que já tem conversa → a existente, com `nova: false`, mesmo sem
     *   vínculo restante: a conversa sobrevive à candidatura retirada e ao
     *   trampo excluído (D35), então o vínculo não é conferido de novo;
     * - sem conversa e sem vínculo entre os dois → `ErroProibido('sem_vinculo')`
     *   (403).
     * Corrida: se outra requisição criar a conversa do par entre a busca e a
     * inserção, o repositório avisa (`par_ja_existe`) e a existente é
     * devolvida. Se ela sumir antes da releitura (a exclusão de conta de um
     * dos dois apaga a conversa e o vínculo, D25), `ErroProibido('sem_vinculo')`.
     * Exclusão concorrente: o vínculo é conferido de novo dentro da inserção,
     * sob a trava das duas contas; se a exclusão terminou antes, nada é
     * gravado e a resposta é o mesmo `sem_vinculo` (Q1).
     */
    async abrirConversa(
      quem: string,
      outroUsuarioId: unknown,
    ): Promise<ConversaAberta> {
      const outro = lerOutroUsuarioId(outroUsuarioId);
      const candidata = Conversa.criar(quem, outro, {
        id: gerarId(),
        agora: relogio.agora(),
      });
      // A existente vem antes do vínculo (D35). A validação do id e a recusa
      // de "consigo mesmo" ficam antes dela.
      const existente = await repositorio.buscarConversaDoPar(quem, outro);
      if (existente) {
        return { conversaId: existente.id, nova: false };
      }
      if (!(await verificadorDeVinculo.existeVinculoEntre(quem, outro))) {
        throw new ErroProibido('sem_vinculo');
      }
      const resultado = await repositorio.inserirConversa(
        candidata,
        (transacao) =>
          verificadorDeVinculo.existeVinculoEntre(quem, outro, transacao),
      );
      if (resultado === 'inserida') {
        return { conversaId: candidata.id, nova: true };
      }
      if (resultado === 'sem_vinculo') {
        throw new ErroProibido('sem_vinculo');
      }
      const vencedora = await repositorio.buscarConversaDoPar(quem, outro);
      if (!vencedora) {
        // A conversa sumiu entre o 23505 e a releitura: só a exclusão da
        // conta de um dos dois a apaga, e ela leva junto as candidaturas que
        // davam o vínculo. É o mesmo 403 de quem não tem vínculo, não um 500.
        throw new ErroProibido('sem_vinculo');
      }
      return { conversaId: vencedora.id, nova: false };
    },

    /** CA12: conversas de `quem`, pela última atividade, mais recente primeiro. */
    async listarConversas(quem: string): Promise<readonly ResumoDeConversa[]> {
      const conversas = await repositorio.listarConversasDoUsuario(quem);
      return conversas.flatMap(({ conversa, ultimaMensagem }) => {
        const outroUsuarioId = conversa.outroParticipante(quem);
        return outroUsuarioId === null
          ? []
          : [
              {
                conversaId: conversa.id,
                outroUsuarioId,
                criadaEm: conversa.criadaEm,
                ultimaMensagem,
              },
            ];
      });
    },

    /**
     * CA12. Conversa inexistente ou alheia → 404 (antes de olhar o texto);
     * texto vazio ou só espaços → 400 `texto` `obrigatorio`. Conversa apagada
     * entre a checagem e a gravação (exclusão de conta, D25) → o repositório
     * lança `ErroNaoEncontrado`, o mesmo 404.
     */
    async enviarMensagem(
      quem: string,
      conversaId: string,
      texto: unknown,
    ): Promise<MensagemEnviada> {
      const conversa = await conversaDoParticipante(quem, conversaId);
      const mensagem = criarMensagem(texto, {
        id: gerarId(),
        conversaId: conversa.id,
        autorId: quem,
        agora: relogio.agora(),
      });
      await repositorio.salvarMensagem(mensagem);
      return { id: mensagem.id, enviadaEm: mensagem.enviadaEm };
    },

    /**
     * CA12: mensagens em ordem de envio (`enviadaEm` asc e, no empate, a
     * ordem de gravação), em páginas de até `LIMITE_DE_MENSAGENS_POR_PAGINA`. A primeira
     * página traz as mais antigas; para a seguinte (ou para buscar as novas),
     * passe em `depoisDe` o id da última mensagem recebida. Página com menos
     * itens que o limite significa que não há mais nada por agora.
     * `depoisDe` que não é mensagem desta conversa → 400 `depoisDe` `invalido`,
     * a não ser que a conversa tenha sumido nesse meio-tempo (404).
     */
    async listarMensagens(
      quem: string,
      conversaId: string,
      opcoes: OpcoesDeListarMensagens = {},
    ): Promise<readonly Mensagem[]> {
      const conversa = await conversaDoParticipante(quem, conversaId);
      const depoisDe = await lerCursor(quem, conversa.id, opcoes.depoisDe);
      return repositorio.listarMensagens(conversa.id, {
        ...(depoisDe !== undefined ? { depoisDe } : {}),
        limite: LIMITE_DE_MENSAGENS_POR_PAGINA,
      });
    },
  };
}

export type CasosDeUsoDeConversas = ReturnType<
  typeof criarCasosDeUsoDeConversas
>;
