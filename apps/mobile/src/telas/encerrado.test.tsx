import { render, screen } from '@testing-library/react-native';
import { textos } from '../textos/pt-BR';
import { CandidaturasRecebidas } from './CandidaturasRecebidas';
import { DetalheDoTrampo } from './DetalheDoTrampo';
import { MeusAnuncios } from './MeusAnuncios';
import type { MeuAnuncioParaExibir } from './tipos';

const noop = () => undefined;
const ok = <T,>(dados: T) => ({ situacao: 'ok', dados }) as const;

describe('selo "Encerrado"', () => {
  it('aparece no detalhe do trampo', async () => {
    await render(
      <DetalheDoTrampo
        estado={ok({
          titulo: 'Pintar a sala',
          descricao: 'Duas demãos.',
          categoria: 'Reformas e reparos',
          cidade: 'Lavras',
          valorFormatado: 'R$ 300,00',
          prazoFormatado: null,
          status: 'encerrado',
        })}
        autor={{ situacao: 'carregando' }}
        onVoltar={noop}
        onAbrirAutor={noop}
      />,
    );
    expect(
      screen.getByText(textos.detalheTrampo.seloEncerrado),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(textos.gerais.status('Encerrado')),
    ).toBeOnTheScreen();
  });

  it('aparece em Candidaturas recebidas, com aviso próprio', async () => {
    await render(
      <CandidaturasRecebidas
        trampo={ok({ titulo: 'Pintar a sala', status: 'encerrado' })}
        lista={{ situacao: 'vazio' }}
        aceitando={null}
        toast={null}
        onAceitar={noop}
        onAbrirPerfil={noop}
        onFecharToast={noop}
        onVoltar={noop}
      />,
    );
    expect(screen.getByText(textos.selos.encerrado)).toBeOnTheScreen();
    expect(
      screen.getByText(textos.candidaturasRecebidas.trampoEncerrado),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText(textos.candidaturasRecebidas.trampoEmAndamento),
    ).toBeNull();
  });

  it('aparece em Meus anúncios', async () => {
    const item: MeuAnuncioParaExibir = {
      tipo: 'trampo',
      id: 't1',
      titulo: 'Pintar a sala',
      categoria: 'Reformas e reparos',
      cidade: 'Lavras',
      valorFormatado: 'R$ 300,00',
      dataFormatada: '20/10/2026',
      status: 'encerrado',
    };
    await render(
      <MeusAnuncios
        tipo="trampo"
        lista={ok([item])}
        onAbrirItem={noop}
        onPublicar={noop}
        onVoltar={noop}
      />,
    );
    expect(screen.getByText(textos.selos.encerrado)).toBeOnTheScreen();
  });

  it('o erro trampo_nao_editavel tem texto', () => {
    expect(textos.erros.trampo_nao_editavel).toBe(
      'Este trampo não pode mais ser editado.',
    );
  });
});
