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

  /** Cursor a partir do id informado; tem de ser mensagem desta conversa. */
  async function lerCursor(
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
      throw ErroDeValidacao.doCampo('depoisDe', 'invalido');
    }
    return { enviadaEm: mensagem.enviadaEm, id: mensagem.id };
  }

  return {
    /**
     * CA13. Abre (ou reabre) a conversa de `quem` com `outroUsuarioId`:
     * - consigo mesmo → `ErroDeRegra('conversa_consigo_mesmo')` (409);
     * - sem vínculo entre os dois → `ErroProibido('sem_vinculo')` (403);
     * - par que já tem conversa → a existente, com `nova: false`.
     * Corrida: se outra requisição criar a conversa do par entre a busca e a
     * inserção, o repositório avisa (`par_ja_existe`) e a existente é
     * devolvida.
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
      if (!(await verificadorDeVinculo.existeVinculoEntre(quem, outro))) {
        throw new ErroProibido('sem_vinculo');
      }

      const existente = await repositorio.buscarConversaDoPar(quem, outro);
      if (existente) {
        return { conversaId: existente.id, nova: false };
      }
      if ((await repositorio.inserirConversa(candidata)) === 'inserida') {
        return { conversaId: candidata.id, nova: true };
      }
      const vencedora = await repositorio.buscarConversaDoPar(quem, outro);
      if (!vencedora) {
        // Só acontece se a conversa sumir entre o 23505 e a releitura, o que o
        // módulo não faz (não há exclusão de conversa no MVP).
        throw new Error('conversa do par não encontrada após conflito');
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
     * texto vazio ou só espaços → 400 `texto` `obrigatorio`.
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
     * `depoisDe` que não é mensagem desta conversa → 400 `depoisDe` `invalido`.
     */
    async listarMensagens(
      quem: string,
      conversaId: string,
      opcoes: OpcoesDeListarMensagens = {},
    ): Promise<readonly Mensagem[]> {
      const conversa = await conversaDoParticipante(quem, conversaId);
      const depoisDe = await lerCursor(conversa.id, opcoes.depoisDe);
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
