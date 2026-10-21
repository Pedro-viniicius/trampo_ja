import {
  redirectSystemPath,
  TAMANHO_MAXIMO_DO_LINK,
} from '../app/+native-intent';

const redirecionar = (path: string, initial = true) =>
  redirectSystemPath({ path, initial });

describe('redirectSystemPath (link do sistema)', () => {
  it.each([
    'trampoja://trampos/t1',
    '/trampos/t1',
    '/perfis/c%2F1',
    '/buscar?texto=pintor%20de%20parede',
    '/',
  ])('%j segue como veio', (link) => {
    expect(redirecionar(link)).toBe(link);
    expect(redirecionar(link, false)).toBe(link);
  });

  it('link no limite de tamanho segue; um caractere a mais abre o Início', () => {
    const base = 'trampoja://buscar?texto=';
    const noLimite = base + 'a'.repeat(TAMANHO_MAXIMO_DO_LINK - base.length);
    expect(noLimite).toHaveLength(TAMANHO_MAXIMO_DO_LINK);
    expect(redirecionar(noLimite)).toBe(noLimite);
    expect(redirecionar(`${noLimite}a`)).toBe('/');
  });

  it('link enorme (1 MB) abre o Início', () => {
    expect(redirecionar(`/trampos/${'x'.repeat(1024 * 1024)}`)).toBe('/');
  });

  it.each([
    '/trampos/%',
    '/trampos/%E0%A4%A',
    '/buscar?texto=100%',
    '/perfis/%zz',
    '/perfis/%4',
  ])('escape %% malformado (%j) abre o Início', (link) => {
    expect(redirecionar(link)).toBe('/');
  });

  it('escape bem formado que não é UTF-8 válido abre o Início', () => {
    expect(redirecionar('/trampos/%E0%A4')).toBe('/');
    expect(redirecionar('/trampos/%FF')).toBe('/');
  });

  it('entrada que não é texto não lança: abre o Início', () => {
    expect(
      redirectSystemPath({
        path: undefined as unknown as string,
        initial: true,
      }),
    ).toBe('/');
  });
});
