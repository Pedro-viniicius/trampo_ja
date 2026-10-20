import { ErroNaoEncontrado } from '../../../compartilhado/dominio/erros.js';
import type { Relogio } from '../../../compartilhado/dominio/relogio.js';
import { type EntradaDePerfil, Perfil } from '../dominio/perfil.js';
import type { RepositorioDePerfis } from '../dominio/portas.js';

export interface DependenciasDePerfis {
  readonly repositorio: RepositorioDePerfis;
  readonly relogio: Relogio;
}

/** Casos de uso do módulo `perfis`, com as portas injetadas. */
export function criarCasosDeUsoDePerfis(deps: DependenciasDePerfis) {
  const { repositorio, relogio } = deps;

  return {
    /** Perfil da própria conta; 404 se ela ainda não salvou nenhum. */
    async obterMeuPerfil(contaId: string): Promise<Perfil> {
      const perfil = await repositorio.buscarPorConta(contaId);
      if (!perfil) {
        throw new ErroNaoEncontrado();
      }
      return perfil;
    },

    /**
     * CA3: cria ou substitui o perfil da conta. Nome, cidade e ao menos uma
     * habilidade são obrigatórios, então o perfil salvo é sempre completo.
     * Entrada inválida lança `ErroDeValidacao` e nada é gravado.
     */
    async salvarMeuPerfil(
      contaId: string,
      dados: EntradaDePerfil,
    ): Promise<Perfil> {
      const perfil = Perfil.criar(dados, { contaId, agora: relogio.agora() });
      await repositorio.salvar(perfil);
      return perfil;
    },

    /**
     * CA3 e D8: perfil visível a outros usuários, só com login. Inexistente
     * ou incompleto responde 404, sem distinguir os dois casos.
     */
    async obterPerfilPublico(contaId: string): Promise<Perfil> {
      const perfil = await repositorio.buscarPorConta(contaId);
      if (!perfil?.completo) {
        throw new ErroNaoEncontrado();
      }
      return perfil;
    },

    /** D9: verdadeiro só com nome, cidade e ao menos uma habilidade. */
    async perfilEstaCompleto(contaId: string): Promise<boolean> {
      const perfil = await repositorio.buscarPorConta(contaId);
      return perfil?.completo ?? false;
    },
  };
}

export type CasosDeUsoDePerfis = ReturnType<typeof criarCasosDeUsoDePerfis>;
