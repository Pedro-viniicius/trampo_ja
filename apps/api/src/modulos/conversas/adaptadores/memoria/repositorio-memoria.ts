import { ErroNaoEncontrado } from '../../../../compartilhado/dominio/erros.js';
import { Conversa } from '../../dominio/conversa.js';
import type { Mensagem } from '../../dominio/mensagem.js';
import type {
  ConferirVinculo,
  ConversaComUltimaMensagem,
  OpcoesDaListagemDeMensagens,
  RepositorioDeConversas,
  ResultadoDaInsercao,
} from '../../dominio/portas.js';

function copiarMensagem(mensagem: Mensagem): Mensagem {
  return { ...mensagem, enviadaEm: new Date(mensagem.enviadaEm.getTime()) };
}

function chaveDoPar(usuario1: string, usuario2: string): string {
  const [a, b] = Conversa.ordenarPar(usuario1, usuario2);
  return `${a}|${b}`;
}

/** Mensagem guardada com a ordem de gravação, como a coluna `ordem` do banco. */
interface MensagemGuardada {
  readonly mensagem: Mensagem;
  readonly ordem: number;
}

// Ordem de envio: `enviadaEm` asc e, no empate, a ordem de gravação.
function deEnvio(a: MensagemGuardada, b: MensagemGuardada): number {
  const diferenca =
    a.mensagem.enviadaEm.getTime() - b.mensagem.enviadaEm.getTime();
  return diferenca !== 0 ? diferenca : a.ordem - b.ordem;
}

/**
 * Adaptador de teste: conversas e mensagens em `Map`s, sem banco. Imita o
 * `unique` do par: inserir um par que já tem conversa devolve `par_ja_existe`.
 * Na inserção, confere o vínculo antes de tudo (sem transação: `undefined`),
 * como o adaptador Postgres faz depois de travar as contas.
 */
export class RepositorioDeConversasEmMemoria implements RepositorioDeConversas {
  readonly #conversas = new Map<string, Conversa>();
  readonly #idPorPar = new Map<string, string>();
  readonly #mensagens: MensagemGuardada[] = [];

  async inserirConversa(
    conversa: Conversa,
    conferirVinculo: ConferirVinculo,
  ): Promise<ResultadoDaInsercao> {
    if (!(await conferirVinculo(undefined))) {
      return 'sem_vinculo';
    }
    const chave = chaveDoPar(conversa.usuarioAId, conversa.usuarioBId);
    if (this.#idPorPar.has(chave)) {
      return 'par_ja_existe';
    }
    if (this.#conversas.has(conversa.id)) {
      throw new Error('id de conversa repetido');
    }
    this.#conversas.set(conversa.id, Conversa.reconstituir(conversa.dados()));
    this.#idPorPar.set(chave, conversa.id);
    return 'inserida';
  }

  async buscarConversaPorId(id: string): Promise<Conversa | null> {
    const conversa = this.#conversas.get(id);
    return conversa ? Conversa.reconstituir(conversa.dados()) : null;
  }

  async buscarConversaDoPar(
    usuario1: string,
    usuario2: string,
  ): Promise<Conversa | null> {
    if (usuario1 === usuario2) {
      return null;
    }
    const id = this.#idPorPar.get(chaveDoPar(usuario1, usuario2));
    return id === undefined ? null : this.buscarConversaPorId(id);
  }

  async listarConversasDoUsuario(
    usuarioId: string,
  ): Promise<readonly ConversaComUltimaMensagem[]> {
    const itens = [...this.#conversas.values()]
      .filter((conversa) => conversa.participa(usuarioId))
      .map((conversa) => {
        const ultima = this.#mensagens
          .filter((g) => g.mensagem.conversaId === conversa.id)
          .sort(deEnvio)
          .at(-1)?.mensagem;
        return {
          conversa: Conversa.reconstituir(conversa.dados()),
          ultimaMensagem: ultima
            ? {
                texto: ultima.texto,
                enviadaEm: new Date(ultima.enviadaEm.getTime()),
              }
            : null,
        };
      });
    const atividade = (item: ConversaComUltimaMensagem) =>
      (item.ultimaMensagem?.enviadaEm ?? item.conversa.criadaEm).getTime();
    return itens.sort((x, y) => {
      const diferenca = atividade(y) - atividade(x);
      if (diferenca !== 0) {
        return diferenca;
      }
      const [idX, idY] = [x.conversa.id, y.conversa.id];
      return idX < idY ? 1 : idX > idY ? -1 : 0;
    });
  }

  async salvarMensagem(mensagem: Mensagem): Promise<void> {
    if (!this.#conversas.has(mensagem.conversaId)) {
      // Como a FK no Postgres (23503), que o repositório converte em 404.
      throw new ErroNaoEncontrado();
    }
    this.#mensagens.push({
      mensagem: copiarMensagem(mensagem),
      ordem: this.#mensagens.length + 1,
    });
  }

  async buscarMensagemDaConversa(
    conversaId: string,
    mensagemId: string,
  ): Promise<Mensagem | null> {
    const guardada = this.#mensagemDaConversa(conversaId, mensagemId);
    return guardada ? copiarMensagem(guardada.mensagem) : null;
  }

  async listarMensagens(
    conversaId: string,
    opcoes: OpcoesDaListagemDeMensagens,
  ): Promise<readonly Mensagem[]> {
    const { depoisDe, limite } = opcoes;
    const cursor =
      depoisDe === undefined
        ? undefined
        : this.#mensagemDaConversa(conversaId, depoisDe.id);
    if (depoisDe !== undefined && cursor === undefined) {
      return [];
    }
    return this.#mensagens
      .filter(
        (g) =>
          g.mensagem.conversaId === conversaId &&
          (cursor === undefined || deEnvio(g, cursor) > 0),
      )
      .sort(deEnvio)
      .slice(0, limite)
      .map((g) => copiarMensagem(g.mensagem));
  }

  #mensagemDaConversa(
    conversaId: string,
    mensagemId: string,
  ): MensagemGuardada | undefined {
    return this.#mensagens.find(
      (g) =>
        g.mensagem.id === mensagemId && g.mensagem.conversaId === conversaId,
    );
  }
}
