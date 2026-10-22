import { Botao, Motivo } from '../componentes';
import { textos } from '../textos/pt-BR';
import type { EstadoDoConversar, PropsDoRodapeDoServico } from './tipos';

/** Botão "Conversar" com "Abrindo…" e motivo (motivo abaixo do botão desabilitado). */
export function BotaoDeConversar({
  estado,
  onConversar,
  variante = 'primario',
}: {
  estado: EstadoDoConversar;
  onConversar: () => void;
  variante?: 'primario' | 'secundario';
}) {
  const bloqueado = estado.motivo !== null;
  return (
    <>
      <Botao
        texto={textos.detalheServico.conversar}
        variante={variante}
        carregando={estado.abrindo}
        textoCarregando={textos.conversas.abrindo}
        desabilitado={bloqueado}
        accessibilityHint={estado.motivo ?? undefined}
        onPress={onConversar}
      />
      {estado.motivo ? <Motivo texto={estado.motivo} /> : null}
    </>
  );
}

/** Rodapé do detalhe do serviço (vai no slot `rodape`). */
export function RodapeDoServico({
  conversar,
  onConversar,
}: PropsDoRodapeDoServico) {
  return <BotaoDeConversar estado={conversar} onConversar={onConversar} />;
}
