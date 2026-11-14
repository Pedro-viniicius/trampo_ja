import { ErroDaApi, ErroDeRede } from '../api/erros';
import type { CampoInvalido, MotivoDeCampo } from '../api/tipos';
import { textos } from '../textos/pt-BR';
import {
  chaveDoErro,
  type Formulario,
  mensagemDoErro,
  textoDeErroDeAcao,
} from './erros';

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
      '409 de código desconhecido',
      new ErroDaApi(409, 'outro_conflito'),
      'perfil',
      'erro_servidor',
    ],
    [
      '409 com nome de propriedade do Object',
      new ErroDaApi(409, 'constructor'),
      'trampo',
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

describe('chaveDoErro: 409 da V2b (avaliações e equipe favorita)', () => {
  it.each([
    ['avaliacao_ja_feita'],
    ['trampo_nao_encerrado'],
    ['favorito_invalido'],
    ['limite_de_favoritos'],
  ] as const)(
    '409 %s vira geral com a mesma chave e o texto de textos.erros',
    (codigo) => {
      expect(chaveDoErro(new ErroDaApi(409, codigo), 'nenhum')).toEqual({
        geral: codigo,
        campos: {},
      });
      expect(mensagemDoErro(new ErroDaApi(409, codigo))).toBe(
        textos.erros[codigo],
      );
    },
  );

  it('os mesmos códigos fora do 409 continuam erro_servidor', () => {
    expect(
      chaveDoErro(new ErroDaApi(400, 'avaliacao_ja_feita'), 'nenhum'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
  });
});

describe('chaveDoErro: 409 da 2b', () => {
  const formularios: readonly Formulario[] = [
    'trampo',
    'servico',
    'candidatura',
    'nenhum',
  ];

  describe.each(formularios)('formulário %s', (formulario) => {
    it.each([
      ['perfil_incompleto'],
      ['autor_nao_pode_candidatar'],
      ['candidatura_duplicada'],
      ['trampo_nao_aberto'],
      ['candidatura_nao_pendente'],
      ['conflito_de_versao'],
      ['trampo_nao_editavel'],
    ] as const)('409 %s vira geral com a mesma chave', (codigo) => {
      expect(chaveDoErro(new ErroDaApi(409, codigo), formulario)).toEqual({
        geral: codigo,
        campos: {},
      });
    });
  });

  it.each([
    ['perfil_incompleto', textos.erros.perfil_incompleto],
    [
      'autor_nao_pode_candidatar',
      'Você não pode se candidatar ao seu próprio trampo.',
    ],
    ['candidatura_duplicada', 'Você já se candidatou a este trampo.'],
    ['trampo_nao_aberto', 'Este trampo não recebe mais candidaturas.'],
    ['candidatura_nao_pendente', textos.erros.candidatura_nao_pendente],
    ['conflito_de_versao', textos.erros.conflito_de_versao],
    ['trampo_nao_editavel', 'Este trampo não pode mais ser editado.'],
  ])('mensagemDoErro traduz o 409 %s', (codigo, texto) => {
    expect(mensagemDoErro(new ErroDaApi(409, codigo))).toBe(texto);
  });

  it('o 409 do e-mail continua valendo', () => {
    expect(chaveDoErro(new ErroDaApi(409, 'email_em_uso'), 'cadastro')).toEqual(
      { geral: 'email_em_uso', campos: {} },
    );
  });

  it('erro de rede nos formulários novos vira sem_conexao', () => {
    for (const formulario of formularios) {
      expect(chaveDoErro(new ErroDeRede('falha'), formulario)).toEqual({
        geral: 'sem_conexao',
        campos: {},
      });
    }
  });
});

describe('chaveDoErro: 429 por contexto (CA20, D29)', () => {
  it.each<Formulario>(['entrar', 'cadastro'])(
    'no formulário %s continua muitas_tentativas (limite de senha)',
    (formulario) => {
      for (const codigo of ['muitas_requisicoes', '']) {
        expect(chaveDoErro(new ErroDaApi(429, codigo), formulario)).toEqual({
          geral: 'muitas_tentativas',
          campos: {},
        });
      }
    },
  );

  it.each<Formulario>(['perfil', 'trampo', 'servico', 'candidatura', 'nenhum'])(
    'no formulário %s vira muitas_tentativas_acao',
    (formulario) => {
      for (const codigo of ['muitas_requisicoes', '']) {
        expect(chaveDoErro(new ErroDaApi(429, codigo), formulario)).toEqual({
          geral: 'muitas_tentativas_acao',
          campos: {},
        });
      }
    },
  );

  it('cobre todo formulário: só entrar e cadastro ficam com o texto de senha', () => {
    const todos: Record<Formulario, true> = {
      entrar: true,
      cadastro: true,
      perfil: true,
      trampo: true,
      servico: true,
      candidatura: true,
      nenhum: true,
    };
    const deSenha = (Object.keys(todos) as Formulario[]).filter(
      (formulario) =>
        chaveDoErro(new ErroDaApi(429, 'muitas_requisicoes'), formulario)
          .geral === 'muitas_tentativas',
    );
    expect(deSenha).toEqual(['entrar', 'cadastro']);
  });

  it('os dois textos existem e são diferentes', () => {
    expect(textos.erros.muitas_tentativas_acao).not.toBe(
      textos.erros.muitas_tentativas,
    );
    expect(textos.erros.muitas_tentativas_acao.length).toBeGreaterThan(0);
  });
});

describe('chaveDoErro: senha da exclusão e da exportação (CA17, CA19)', () => {
  it.each<Formulario>(['nenhum', 'perfil', 'entrar'])(
    '403 senha_incorreta vira geral senha_incorreta (formulário %s)',
    (formulario) => {
      expect(
        chaveDoErro(new ErroDaApi(403, 'senha_incorreta'), formulario),
      ).toEqual({ geral: 'senha_incorreta', campos: {} });
    },
  );

  it('senha_incorreta só vale no 403: no 401 é sessão expirada', () => {
    expect(
      chaveDoErro(new ErroDaApi(401, 'senha_incorreta'), 'nenhum'),
    ).toEqual({ geral: 'sessao_expirada', campos: {} });
    expect(
      chaveDoErro(new ErroDaApi(409, 'senha_incorreta'), 'nenhum'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
  });

  it.each([
    ['código parecido', 'senha_incorreta_x'],
    ['nome de propriedade do Object', 'toString'],
  ])('403 com %s continua erro_servidor', (_nome, codigo) => {
    expect(chaveDoErro(new ErroDaApi(403, codigo), 'nenhum')).toEqual({
      geral: 'erro_servidor',
      campos: {},
    });
  });
});

describe('chaveDoErro: exportação grande demais (CA48, D41)', () => {
  it.each<Formulario>(['nenhum', 'perfil', 'entrar'])(
    '409 exportacao_grande vira geral exportacao_grande (formulário %s)',
    (formulario) => {
      expect(
        chaveDoErro(new ErroDaApi(409, 'exportacao_grande'), formulario),
      ).toEqual({ geral: 'exportacao_grande', campos: {} });
    },
  );

  it('mensagemDoErro mostra o texto que orienta pedir os dados por e-mail', () => {
    expect(mensagemDoErro(new ErroDaApi(409, 'exportacao_grande'))).toBe(
      textos.erros.exportacao_grande,
    );
  });

  it.each([
    ['403', 403, 'erro_servidor'],
    ['400', 400, 'erro_servidor'],
    ['500', 500, 'erro_servidor'],
    ['401', 401, 'sessao_expirada'],
  ] as const)(
    'exportacao_grande só vale no 409: no %s não vira o texto da exportação',
    (_nome, status, geral) => {
      expect(
        chaveDoErro(new ErroDaApi(status, 'exportacao_grande'), 'nenhum'),
      ).toEqual({ geral, campos: {} });
    },
  );

  it('409 com código parecido continua erro_servidor', () => {
    expect(
      chaveDoErro(new ErroDaApi(409, 'exportacao_grande_x'), 'nenhum'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
  });
});

describe('chaveDoErro: conversas (2c)', () => {
  const formularios: readonly Formulario[] = ['nenhum', 'candidatura'];

  describe.each(formularios)('formulário %s', (formulario) => {
    it('403 sem_vinculo vira a chave sem_vinculo', () => {
      expect(
        chaveDoErro(new ErroDaApi(403, 'sem_vinculo'), formulario),
      ).toEqual({ geral: 'sem_vinculo', campos: {} });
    });

    it.each([
      ['outro código', 'proibido'],
      ['sem código', ''],
      ['código parecido', 'sem_vinculo_x'],
      ['nome de propriedade do Object', 'constructor'],
    ])('403 com %s continua erro_servidor', (_nome, codigo) => {
      expect(chaveDoErro(new ErroDaApi(403, codigo), formulario)).toEqual({
        geral: 'erro_servidor',
        campos: {},
      });
    });

    it('409 conversa_consigo_mesmo vira geral com a mesma chave', () => {
      expect(
        chaveDoErro(new ErroDaApi(409, 'conversa_consigo_mesmo'), formulario),
      ).toEqual({ geral: 'conversa_consigo_mesmo', campos: {} });
    });
  });

  it('sem_vinculo só vale no 403', () => {
    expect(chaveDoErro(new ErroDaApi(409, 'sem_vinculo'), 'nenhum')).toEqual({
      geral: 'erro_servidor',
      campos: {},
    });
    expect(chaveDoErro(new ErroDaApi(400, 'sem_vinculo'), 'nenhum')).toEqual({
      geral: 'erro_servidor',
      campos: {},
    });
  });

  it('mensagemDoErro do 403 sem_vinculo é o texto literal do CA13 (D4)', () => {
    expect(mensagemDoErro(new ErroDaApi(403, 'sem_vinculo'))).toBe(
      'Você só pode conversar com quem tem uma candidatura ou contratação com você.',
    );
    expect(mensagemDoErro(new ErroDaApi(403, 'sem_vinculo'))).toBe(
      textos.detalheServico.semRelacao,
    );
  });

  it('mensagemDoErro traduz o 409 conversa_consigo_mesmo', () => {
    expect(mensagemDoErro(new ErroDaApi(409, 'conversa_consigo_mesmo'))).toBe(
      textos.erros.conversa_consigo_mesmo,
    );
  });

  it('mensagemDoErro de outro 403 é o erro do servidor', () => {
    expect(mensagemDoErro(new ErroDaApi(403, 'proibido'))).toBe(
      textos.erros.erro_servidor,
    );
  });
});

describe('chaveDoErro: 400 dos formulários da 2b', () => {
  const dadosInvalidos = (...itens: readonly ItemDeCampo[]) =>
    new ErroDaApi(400, 'dados_invalidos', campos(...itens));

  it.each([
    ['trampo', 'titulo', 'obrigatorio', 'titulo_tamanho'],
    ['trampo', 'titulo', 'tamanho', 'titulo_tamanho'],
    ['trampo', 'titulo', 'invalido', 'titulo_tamanho'],
    ['trampo', 'descricao', 'obrigatorio', 'descricao_trampo_obrigatoria'],
    ['trampo', 'descricao', 'tamanho', 'descricao_anuncio_tamanho'],
    ['trampo', 'descricao', 'invalido', 'descricao_anuncio_tamanho'],
    ['trampo', 'categoria', 'obrigatorio', 'categoria_obrigatoria'],
    ['trampo', 'categoria', 'invalido', 'categoria_obrigatoria'],
    ['trampo', 'cidade', 'obrigatorio', 'cidade_anuncio_obrigatoria'],
    ['trampo', 'cidade', 'tamanho', 'cidade_tamanho'],
    ['trampo', 'cidade', 'invalido', 'cidade_tamanho'],
    ['trampo', 'valorCentavos', 'obrigatorio', 'valor_invalido'],
    ['trampo', 'valorCentavos', 'invalido', 'valor_invalido'],
    ['trampo', 'prazo', 'invalido', 'prazo_invalido'],
    ['servico', 'titulo', 'tamanho', 'titulo_tamanho'],
    ['servico', 'descricao', 'obrigatorio', 'descricao_servico_obrigatoria'],
    ['servico', 'descricao', 'tamanho', 'descricao_anuncio_tamanho'],
    ['servico', 'categoria', 'invalido', 'categoria_obrigatoria'],
    ['servico', 'cidade', 'tamanho', 'cidade_tamanho'],
    ['servico', 'cidade', 'invalido', 'cidade_tamanho'],
    ['servico', 'precoBaseCentavos', 'obrigatorio', 'valor_invalido'],
    ['servico', 'precoBaseCentavos', 'invalido', 'valor_invalido'],
    ['candidatura', 'mensagem', 'obrigatorio', 'mensagem_obrigatoria'],
    ['candidatura', 'mensagem', 'tamanho', 'mensagem_tamanho'],
    ['candidatura', 'mensagem', 'invalido', 'mensagem_tamanho'],
    [
      'candidatura',
      'valorPropostoCentavos',
      'obrigatorio',
      'valor_proposto_invalido',
    ],
    [
      'candidatura',
      'valorPropostoCentavos',
      'invalido',
      'valor_proposto_invalido',
    ],
  ] as const)('%s: %s %s vira %s', (formulario, campo, motivo, chave) => {
    expect(chaveDoErro(dadosInvalidos([campo, motivo]), formulario)).toEqual({
      campos: { [campo]: chave },
    });
  });

  it('devolve todos os campos do trampo de uma vez', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(
          ['titulo', 'tamanho'],
          ['descricao', 'obrigatorio'],
          ['categoria', 'invalido'],
          ['cidade', 'obrigatorio'],
          ['valorCentavos', 'invalido'],
          ['prazo', 'invalido'],
        ),
        'trampo',
      ),
    ).toEqual({
      campos: {
        titulo: 'titulo_tamanho',
        descricao: 'descricao_trampo_obrigatoria',
        categoria: 'categoria_obrigatoria',
        cidade: 'cidade_anuncio_obrigatoria',
        valorCentavos: 'valor_invalido',
        prazo: 'prazo_invalido',
      },
    });
  });

  it('ignora campo que pertence a outro formulário', () => {
    // `prazo` e `valorCentavos` não existem no serviço; `precoBaseCentavos`
    // não existe no trampo; o 400 só com eles cai em erro_servidor.
    expect(
      chaveDoErro(dadosInvalidos(['prazo', 'invalido']), 'servico'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
    expect(
      chaveDoErro(dadosInvalidos(['precoBaseCentavos', 'invalido']), 'trampo'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
    expect(
      chaveDoErro(dadosInvalidos(['titulo', 'tamanho']), 'candidatura'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
    expect(
      chaveDoErro(dadosInvalidos(['mensagem', 'tamanho']), 'trampo'),
    ).toEqual({ geral: 'erro_servidor', campos: {} });
  });

  it('o perfil mantém os textos próprios de cidade e descrição', () => {
    expect(
      chaveDoErro(
        dadosInvalidos(['cidade', 'obrigatorio'], ['descricao', 'tamanho']),
        'perfil',
      ),
    ).toEqual({
      campos: {
        cidade: 'cidade_obrigatoria',
        descricao: 'descricao_tamanho',
      },
    });
  });
});

describe('chaveDoErro: CA15 (só chaves, nunca o que foi digitado)', () => {
  const chavesValidas = new Set(Object.keys(textos.erros));
  const formularios: Formulario[] = [
    'entrar',
    'cadastro',
    'perfil',
    'trampo',
    'servico',
    'candidatura',
    'nenhum',
  ];
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
      '429 (fora do login e do cadastro, CA20)',
      new ErroDaApi(429, 'muitas_requisicoes'),
      textos.erros.muitas_tentativas_acao,
    ],
    [
      '403 senha_incorreta',
      new ErroDaApi(403, 'senha_incorreta'),
      textos.erros.senha_incorreta,
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

describe('textoDeErroDeAcao (D5)', () => {
  const PADRAO = 'texto padrão da ação';

  it.each([
    [
      '429',
      new ErroDaApi(429, 'muitas_requisicoes'),
      textos.erros.muitas_tentativas_acao,
    ],
    ['falta de rede', new ErroDeRede('falha'), textos.erros.sem_conexao],
    ['500', new ErroDaApi(500, 'interno'), PADRAO],
    ['409', new ErroDaApi(409, 'candidatura_nao_pendente'), PADRAO],
    ['desconhecido', new Error('segredo da URL'), PADRAO],
  ])('%s', (_nome, erro, esperado) => {
    expect(textoDeErroDeAcao(erro, PADRAO)).toBe(esperado);
  });
});
