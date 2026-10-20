import { describe, expect, it } from 'vitest';
import {
  type CampoInvalido,
  ErroDeValidacao,
} from '../../../compartilhado/dominio/erros.js';
import {
  type ContextoDaMensagem,
  criarMensagem,
  LIMITES_DA_MENSAGEM,
} from './mensagem.js';

const CONTEXTO: ContextoDaMensagem = {
  id: 'mensagem-1',
  conversaId: 'conversa-1',
  autorId: 'conta-a',
  agora: new Date('2026-10-20T12:00:00.000Z'),
};

function campoDoErro(texto: unknown): readonly CampoInvalido[] {
  try {
    criarMensagem(texto, CONTEXTO);
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDeValidacao);
    return (erro as ErroDeValidacao).campos;
  }
  throw new Error('esperava ErroDeValidacao');
}

describe('criarMensagem', () => {
  it('cria a mensagem com o texto aparado nas pontas', () => {
    const mensagem = criarMensagem('  Oi, tudo bem?\n', CONTEXTO);

    expect(mensagem).toEqual({
      id: 'mensagem-1',
      conversaId: 'conversa-1',
      autorId: 'conta-a',
      texto: 'Oi, tudo bem?',
      enviadaEm: CONTEXTO.agora,
    });
    expect(mensagem.enviadaEm).not.toBe(CONTEXTO.agora);
  });

  it('mantém espaços e quebras de linha do meio', () => {
    expect(criarMensagem('linha 1\n\nlinha  2', CONTEXTO).texto).toBe(
      'linha 1\n\nlinha  2',
    );
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['vazio', ''],
    ['só espaços', '   '],
    ['só quebras e tabulações', '\n\t \r\n'],
  ])('texto %s → obrigatorio', (_caso, texto) => {
    expect(campoDoErro(texto)).toEqual([
      { campo: 'texto', motivo: 'obrigatorio' },
    ]);
  });

  it.each([
    ['número', 42],
    ['objeto', { texto: 'oi' }],
    ['lista', ['oi']],
    ['com caractere nulo', 'oi\u0000tchau'],
  ])('texto %s → invalido', (_caso, texto) => {
    expect(campoDoErro(texto)).toEqual([
      { campo: 'texto', motivo: 'invalido' },
    ]);
  });

  it('aceita exatamente 1 e 2000 caracteres e recusa 2001 com tamanho', () => {
    const { max } = LIMITES_DA_MENSAGEM.texto;
    expect(max).toBe(2000);

    expect(criarMensagem('a', CONTEXTO).texto).toBe('a');
    expect(criarMensagem('a'.repeat(max), CONTEXTO).texto).toHaveLength(max);
    expect(campoDoErro('a'.repeat(max + 1))).toEqual([
      { campo: 'texto', motivo: 'tamanho' },
    ]);
  });

  it('os espaços das pontas não contam no limite', () => {
    const texto = `   ${'a'.repeat(2000)}   `;
    expect(criarMensagem(texto, CONTEXTO).texto).toHaveLength(2000);
  });

  it('conta emoji como um caractere (pontos de código)', () => {
    const emojis = '😀'.repeat(2000);
    expect(emojis.length).toBe(4000);
    expect(Array.from(criarMensagem(emojis, CONTEXTO).texto)).toHaveLength(
      2000,
    );
    expect(campoDoErro(`${emojis}😀`)).toEqual([
      { campo: 'texto', motivo: 'tamanho' },
    ]);
  });

  it('CA15 — o erro nunca carrega o texto digitado', () => {
    const segredo = `texto-secreto-${'x'.repeat(2000)}`;
    try {
      criarMensagem(segredo, CONTEXTO);
      throw new Error('esperava erro');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeValidacao);
      expect(JSON.stringify(erro)).not.toContain('texto-secreto');
      expect((erro as Error).message).not.toContain('texto-secreto');
      expect((erro as Error).stack).not.toContain('texto-secreto');
    }
  });
});
