import { ErroDaApi, ErroDeRede } from '../api/erros';
import type { CampoInvalido, MotivoDeCampo } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import { chaveDoErro, type Formulario, mensagemDoErro } from './erros';

type ItemDeCampo = readonly [string, MotivoDeCampo];

const campos = (...itens: readonly ItemDeCampo[]): CampoInvalido[] =>
  itens.map(([campo, motivo]) => ({ campo, motivo }));

describe('chaveDoErro: erros gerais', () => {
  it.each([
    ['rede, falha', new ErroDeRede('falha'), 'entrar', 'sem_conexao'],
    ['rede, tempo', new ErroDeRede('tempo_esgotado'), 'perfil', 'sem_conexao'],
    [
      '401 credenciais_invalidas',
      new ErroDaApi(401, 'credenciais_invalidas'),
      'entrar',
      'credenciais_invalidas',
    ],
    [
      '401 nao_autenticado',
      new ErroDaApi(401, 'nao_autenticado'),
      'perfil',
      'sessao_expirada',
    ],
    [
      '401 sessao_expirada',
      new ErroDaApi(401, 'sessao_expirada'),
      'nenhum',
      'sessao_expirada',
    ],
    [
      '409 email_em_uso',
      new ErroDaApi(409, 'email_em_uso'),
      'cadastro',
      'email_em_uso',
    ],
    ['429 sem corpo', new ErroDaApi(429, ''), 'entrar', 'muitas_tentativas'],
    [
      '429 com código',
      new ErroDaApi(429, 'muitas_requisicoes'),
      'cadastro',
      'muitas_tentativas',
    ],
    ['404', new ErroDaApi(404, 'nao_encontrado'), 'nenhum', 'nao_encontrado'],
    ['500', new ErroDaApi(500, 'erro_interno'), 'perfil', 'erro_servidor'],
    ['503', new ErroDaApi(503, ''), 'nenhum', 'erro_servidor'],
    [
      '409 de outro código',
      new ErroDaApi(409, 'conflito_de_versao'),
      'perfil',
      'erro_servidor',
    ],
    ['403', new ErroDaApi(403, 'proibido'), 'nenhum', 'erro_servidor'],
    [
      '400 sem campos',
      new ErroDaApi(400, 'dados_invalidos'),
      'perfil',
      'erro_servidor',
    ],
    [
      '400 só com campo desconhecido',
      new ErroDaApi(400, 'dados_invalidos', campos(['titulo', 'tamanho'])),
      'perfil',
      'erro_servidor',
    ],
    ['Error comum', new Error('falhou'), 'entrar', 'erro_servidor'],
    ['string', 'boom', 'entrar', 'erro_servidor'],
    ['null', null, 'nenhum', 'erro_servidor'],
    ['undefined', undefined, 'nenhum', 'erro_servidor'],
    [
      'objeto parecido',
      { status: 429, codigo: 'x' },
      'entrar',
      'erro_servidor',
    ],
  ] as const)('%s', (_nome, erro, formulario, geral) => {
    expect(chaveDoErro(erro, formulario)).toEqual({ geral, campos: {} });
  });
});

describe('chaveDoErro: 400 com campos', () => {
  const dadosInvalidos = (...itens: readonly ItemDeCampo[]) =>
    new ErroDaApi(400, 'dados_invalidos', campos(...itens));

  it.each([['obrigatorio'], ['tamanho'], ['invalido']] as const)(
    'email com %s vira email_invalido',
    (motivo) => {
      expect(
        chaveDoErro(dadosInvalidos(['email', motivo]), 'cadastro'),
      ).toEqual({
        campos: { email: 'email_invalido' },
      });
    },
  );

  it.each([['obrigatorio'], ['tamanho'], ['invalido']] as const)(
    'senha com %s vira senha_curta',
    (motivo) => {
      expect(chaveDoErro(dadosInvalidos(['senha', motivo]), 'entrar')).toEqual({
        campos: { senha: 'senha_curta' },
      });
    },
  );

  it('devolve os dois campos do cadastro juntos', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(['email', 'invalido'], ['senha', 'tamanho']),
        'cadastro',
      ),
    ).toEqual({
      campos: { email: 'email_invalido', senha: 'senha_curta' },
    });
  });

  it.each([
    ['nome', 'obrigatorio', 'nome_obrigatorio'],
    ['nome', 'tamanho', 'nome_tamanho'],
    ['nome', 'invalido', 'nome_tamanho'],
    ['cidade', 'obrigatorio', 'cidade_obrigatoria'],
    ['cidade', 'tamanho', 'cidade_tamanho'],
    ['cidade', 'invalido', 'cidade_tamanho'],
    ['descricao', 'tamanho', 'descricao_tamanho'],
    ['descricao', 'invalido', 'descricao_tamanho'],
    ['habilidades', 'obrigatorio', 'habilidade_obrigatoria'],
    ['habilidades', 'tamanho', 'habilidades_demais'],
    ['habilidades', 'invalido', 'habilidade_invalida'],
    ['habilidades.0', 'tamanho', 'habilidade_tamanho'],
    ['habilidades.3', 'invalido', 'habilidade_invalida'],
    ['habilidades.12', 'obrigatorio', 'habilidade_invalida'],
  ] as const)('perfil: %s %s vira %s', (campo, motivo, chave) => {
    const grupo = campo.startsWith('habilidades') ? 'habilidades' : campo;
    expect(chaveDoErro(dadosInvalidos([campo, motivo]), 'perfil')).toEqual({
      campos: { [grupo]: chave },
    });
  });

  it('agrupa itens de habilidade na chave habilidades (o primeiro decide)', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(
          ['habilidades.3', 'invalido'],
          ['habilidades.1', 'tamanho'],
        ),
        'perfil',
      ),
    ).toEqual({ campos: { habilidades: 'habilidade_invalida' } });
  });

  it('o erro da lista inteira vale mais que o de item, em qualquer ordem', () => {
    const esperado = { campos: { habilidades: 'habilidades_demais' } };
    expect(
      chaveDoErro(
        dadosInvalidos(
          ['habilidades.0', 'tamanho'],
          ['habilidades', 'tamanho'],
        ),
        'perfil',
      ),
    ).toEqual(esperado);
    expect(
      chaveDoErro(
        dadosInvalidos(
          ['habilidades', 'tamanho'],
          ['habilidades.0', 'tamanho'],
        ),
        'perfil',
      ),
    ).toEqual(esperado);
  });

  it('mantém os campos conhecidos e ignora os desconhecidos', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(['titulo', 'tamanho'], ['nome', 'obrigatorio']),
        'perfil',
      ),
    ).toEqual({ campos: { nome: 'nome_obrigatorio' } });
  });

  it('ignora campo que não pertence ao formulário', () => {
    expect(chaveDoErro(dadosInvalidos(['nome', 'tamanho']), 'entrar')).toEqual({
      geral: 'erro_servidor',
      campos: {},
    });
    expect(
      chaveDoErro(dadosInvalidos(['email', 'invalido']), 'perfil'),
    ).toEqual({
      geral: 'erro_servidor',
      campos: {},
    });
    expect(
      chaveDoErro(dadosInvalidos(['habilidades.1', 'invalido']), 'cadastro'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
    expect(chaveDoErro(dadosInvalidos(['nome', 'tamanho']), 'nenhum')).toEqual({
      geral: 'erro_servidor',
      campos: {},
    });
  });

  it('não confunde campo parecido com habilidades.N', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(
          ['habilidades.x', 'invalido'],
          ['habilidades.1.a', 'tamanho'],
        ),
        'perfil',
      ),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
  });

  it('não cai em chaves herdadas do Object (__proto__, constructor)', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(['__proto__', 'invalido'], ['constructor', 'tamanho']),
        'perfil',
      ),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
  });
});

describe('chaveDoErro: CA15 (só chaves, nunca o que foi digitado)', () => {
  const chavesValidas = new Set(Object.keys(textos.erros));
  const formularios: Formulario[] = ['entrar', 'cadastro', 'perfil', 'nenhum'];
  const SEGREDO = 'maria.silva@exemplo.com senha-secreta-123';

  it('não inclui erro.message nem o código na resposta', () => {
    const erros: unknown[] = [
      new ErroDaApi(401, SEGREDO),
      new ErroDaApi(
        400,
        SEGREDO,
        campos([SEGREDO, 'invalido'], ['nome', 'tamanho']),
      ),
      new ErroDaApi(500, SEGREDO),
      new ErroDeRede('falha'),
      new Error(SEGREDO),
      SEGREDO,
    ];
    for (const erro of erros) {
      for (const formulario of formularios) {
        const resultado = chaveDoErro(erro, formulario);
        expect(JSON.stringify(resultado)).not.toContain('secret');
        expect(JSON.stringify(resultado)).not.toContain('maria');
        const valores = [resultado.geral, ...Object.values(resultado.campos)];
        for (const valor of valores) {
          if (valor !== undefined) {
            expect(chavesValidas.has(valor)).toBe(true);
          }
        }
      }
    }
  });
});

describe('mensagemDoErro', () => {
  it.each([
    ['rede', new ErroDeRede('falha'), textos.erros.sem_conexao],
    ['404', new ErroDaApi(404, 'nao_encontrado'), textos.erros.nao_encontrado],
    [
      '429',
      new ErroDaApi(429, 'muitas_requisicoes'),
      textos.erros.muitas_tentativas,
    ],
    ['500', new ErroDaApi(500, 'interno'), textos.erros.erro_servidor],
    [
      '400 sem campo de formulário',
      new ErroDaApi(400, 'dados_invalidos', [
        { campo: 'nome', motivo: 'obrigatorio' },
      ]),
      textos.erros.erro_servidor,
    ],
    ['desconhecido', new Error('segredo da URL'), textos.erros.erro_servidor],
  ])('%s vira o texto traduzido', (_nome, erro, esperado) => {
    expect(mensagemDoErro(erro)).toBe(esperado);
  });

  it('nunca devolve a mensagem crua do erro', () => {
    expect(mensagemDoErro(new Error('token-123 em https://x'))).not.toMatch(
      /token-123|https/,
    );
  });
});
