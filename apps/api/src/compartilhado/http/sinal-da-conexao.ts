import type { FastifyReply } from 'fastify';

/**
 * Sinal que aborta quando a conexão do pedido cai antes de a resposta sair
 * (S3, D42): quem espera numa fila (scrypt, exportação) sai dela sem rodar.
 *
 * Não use o `request.signal` do Fastify 5.12: ele ouve o `close` do
 * `IncomingMessage`, que no Node 22 dispara assim que o corpo é lido, com o
 * cliente ainda conectado (conferido com servidor real na etapa 14 da L3).
 * Aqui o ouvinte fica na própria resposta (`ServerResponse`), que existe só
 * para este pedido: nada se acumula no socket de uma conexão keep-alive.
 *
 * Recebe a resposta, e não a requisição, porque é ela que sabe se a conexão
 * caiu antes do fim. Depois que a resposta terminou, o sinal nunca aborta.
 */
export function sinalDaConexao(resposta: FastifyReply): AbortSignal {
  const saida = resposta.raw;
  const controle = new AbortController();
  if (saida.writableFinished) {
    return controle.signal;
  }
  if (saida.destroyed) {
    // A conexão caiu antes de o handler pedir o sinal.
    controle.abort();
    return controle.signal;
  }
  saida.once('close', () => {
    if (!saida.writableFinished) {
      controle.abort();
    }
  });
  return controle.signal;
}
