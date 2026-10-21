import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeuPerfil } from '../api/tipos';
import type { PerfilIncompleto } from '../telas/tipos';
import { textos } from '../textos/pt-BR';

/**
 * Campos que faltam quando a API ainda não tem perfil (404 em
 * `GET /perfis/eu`): todos os obrigatórios, com os rótulos já traduzidos,
 * para o aviso D9 dos formulários de publicação e candidatura.
 */
export const CAMPOS_DO_PERFIL_NOVO: readonly string[] = Object.freeze([
  textos.perfil.camposNome,
  textos.perfil.camposCidade,
  textos.perfil.camposHabilidades,
]);

/** O que o contêiner sabe do próprio perfil (ver `useMeuPerfil`). */
export interface SituacaoDoMeuPerfil {
  readonly perfil: MeuPerfil | null;
  /** A API respondeu 404: o perfil ainda não foi salvo. */
  readonly semPerfil: boolean;
}

/**
 * O que listar no "Falta: …" do aviso D9. O 409 `perfil_incompleto` não diz
 * o que falta: só o 404 de `GET /perfis/eu` garante que faltam todos os
 * campos. Com o perfil salvo, carregando ou com erro, o aviso sai sem a
 * lista (nunca uma lista inventada).
 */
export function faltaNoPerfil({
  semPerfil,
}: SituacaoDoMeuPerfil): readonly string[] {
  return semPerfil ? CAMPOS_DO_PERFIL_NOVO : [];
}

// Assinatura do perfil 404: diferente de qualquer perfil salvo.
const SEM_PERFIL = 'sem-perfil';

/**
 * Resumo do perfil para saber se ele mudou de verdade (conteúdo, não a
 * referência nem a hora da última leitura). `null` enquanto não há resposta.
 */
export function assinaturaDoPerfil(
  situacao: SituacaoDoMeuPerfil,
): string | null {
  if (situacao.semPerfil) {
    return SEM_PERFIL;
  }
  if (situacao.perfil === null) {
    return null;
  }
  const { nome, cidade, descricao, habilidades, completo } = situacao.perfil;
  return JSON.stringify([nome, cidade, descricao, habilidades, completo]);
}

/**
 * Recusa por `perfil_incompleto`: a assinatura do perfil que a API recusou,
 * ou `null` se ele ainda não tinha chegado quando o 409 veio.
 */
export interface RecusaPorPerfil {
  readonly assinatura: string | null;
}

/**
 * Aviso D9 dos formulários: sem perfil (404), sempre, com todos os campos;
 * depois de um 409 `perfil_incompleto`, até o perfil mudar de verdade. O
 * perfil que só termina de carregar não conta como mudança.
 */
export function avisoDePerfil(
  situacao: SituacaoDoMeuPerfil,
  recusa: RecusaPorPerfil | null,
): PerfilIncompleto | null {
  if (situacao.semPerfil) {
    return { falta: CAMPOS_DO_PERFIL_NOVO };
  }
  if (recusa === null) {
    return null;
  }
  const atual = assinaturaDoPerfil(situacao);
  const mudou =
    recusa.assinatura !== null && atual !== null && atual !== recusa.assinatura;
  return mudou ? null : { falta: faltaNoPerfil(situacao) };
}

export interface AvisoDePerfil {
  readonly perfilIncompleto: PerfilIncompleto | null;
  /** Chame no 409 `perfil_incompleto`: guarda o perfil recusado. */
  readonly recusar: () => void;
  /** Esquece a recusa (ex.: a folha reaberta tenta de novo). */
  readonly esquecer: () => void;
}

/**
 * Estado do aviso D9 de um formulário (publicar, ofertar, candidatar). Se o
 * 409 chegou antes do perfil, o primeiro perfil que chegar passa a ser o
 * recusado: o aviso só some quando ele mudar depois disso.
 */
export function useAvisoDePerfil(situacao: SituacaoDoMeuPerfil): AvisoDePerfil {
  const [recusa, setRecusa] = useState<RecusaPorPerfil | null>(null);
  const atual = assinaturaDoPerfil(situacao);
  // O `onError` da mutação roda depois do render: lê a assinatura de agora.
  const atualRef = useRef(atual);
  atualRef.current = atual;

  useEffect(() => {
    if (recusa !== null && recusa.assinatura === null && atual !== null) {
      setRecusa({ assinatura: atual });
    }
  }, [recusa, atual]);

  const recusar = useCallback(() => {
    setRecusa({ assinatura: atualRef.current });
  }, []);
  const esquecer = useCallback(() => setRecusa(null), []);

  return {
    perfilIncompleto: avisoDePerfil(situacao, recusa),
    recusar,
    esquecer,
  };
}
