import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EstadoDoConversar } from '../../telas/tipos';
import { type ChaveDeErro, textos } from '../../textos/pt-BR';
import { chaveDoErro, mensagemDoErro } from '../erros';
import { useAbrirConversa } from './conversas';

/** Erros da abertura que valem até a tela ser aberta de novo (CA13). */
const RECUSAS_DA_CONVERSA: ReadonlySet<ChaveDeErro> = new Set([
  'sem_vinculo',
  'conversa_consigo_mesmo',
]);

/**
 * "Conversar" com uma ou mais contas na mesma tela (CA12, CA13, D22, D23).
 * Quem decide o vínculo é a API: o 403 `sem_vinculo` e o 409
 * `conversa_consigo_mesmo` recusam aquela conta, e `motivoDe(contaId)` passa
 * a devolver o texto (o botão dela fica desabilitado) até a tela ser aberta
 * de novo. Sem conexão, `motivoDe` devolve o motivo para toda conta. Outra
 * falha vai para `falha` (aviso) e deixa tocar de novo.
 *
 * Uma abertura por vez, em toda a tela: o `abrindoCom` só chega à tela no
 * próximo render, por isso o `ref`. Se a tela fechou durante o `POST`, ou a
 * sessão mudou (`descartada`), nada navega. A rota da conversa recebe só o
 * `conversaId`.
 */
export function useConversarPorConta(semConexao: boolean) {
  const router = useRouter();
  const { abrir } = useAbrirConversa();
  const emVoo = useRef(false);
  const montada = useRef(true);
  const [abrindoCom, setAbrindoCom] = useState<string | null>(null);
  const [recusas, setRecusas] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  const motivoDe = useCallback(
    (contaId: string): string | null =>
      recusas.get(contaId) ??
      (semConexao ? textos.conversas.semConexaoParaConversar : null),
    [recusas, semConexao],
  );

  const conversar = (contaId: string) => {
    if (emVoo.current || motivoDe(contaId) !== null) {
      return;
    }
    emVoo.current = true;
    setAbrindoCom(contaId);
    setFalha(null);
    void abrir(contaId).then((resultado) => {
      emVoo.current = false;
      // Saiu da tela durante o POST: não navega por cima de outra rota.
      if (!montada.current) {
        return;
      }
      setAbrindoCom(null);
      if (resultado.tipo === 'descartada') {
        return;
      }
      if (resultado.tipo === 'aberta') {
        router.push({
          pathname: '/conversas/[id]',
          params: { id: resultado.conversaId },
        });
        return;
      }
      const texto = mensagemDoErro(resultado.erro);
      const chave = chaveDoErro(resultado.erro, 'nenhum').geral;
      if (chave !== undefined && RECUSAS_DA_CONVERSA.has(chave)) {
        setRecusas((atuais) => new Map(atuais).set(contaId, texto));
      } else {
        setFalha(texto);
      }
    });
  };

  return { abrindoCom, falha, motivoDe, conversar };
}

/**
 * "Conversar" com uma conta só, no rodapé de um detalhe (trampo do
 * candidatado, serviço de outra pessoa). Mesmas regras de
 * `useConversarPorConta`, no formato do botão (`EstadoDoConversar`).
 */
export function useConversar(contaId: string, semConexao: boolean) {
  const { abrindoCom, falha, motivoDe, conversar } =
    useConversarPorConta(semConexao);
  const estado: EstadoDoConversar = {
    abrindo: abrindoCom === contaId,
    motivo: motivoDe(contaId),
  };
  return { estado, falha, conversar: () => conversar(contaId) };
}
