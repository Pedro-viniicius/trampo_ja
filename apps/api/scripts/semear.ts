/**
 * Semeia o banco de desenvolvimento com dados fictícios para usar o app local.
 *
 *   pnpm --filter api semear              # banco de desenvolvimento (`DATABASE_URL`)
 *   pnpm --filter api semear -- --teste   # banco de teste (`DATABASE_URL_TESTE`)
 *
 * Aplica as migrações pendentes antes. Tudo é criado pela própria API montada
 * (`montarAplicacao` + `app.inject`), nunca por SQL direto: passa pelas mesmas
 * validações e regras de domínio de uma requisição real (ex.: D9, perfil
 * completo antes de publicar, ofertar e candidatar).
 *
 * Idempotente: se a primeira conta da semente já existir (409 `email_em_uso`),
 * encerra sem criar nada. Todas as contas usam a senha `SENHA_DA_SEMENTE`,
 * documentada no README; só serve para desenvolvimento.
 *
 * A saída mostra só contagens: nunca e-mails, nomes, tokens nem a URL do banco
 * (ela traz a senha), nem a mensagem do driver.
 */

import type { Kysely } from 'kysely';
import {
  type BancoBase,
  criarConexao,
} from '../src/compartilhado/banco/conexao.js';
import {
  ErroDeMigracao,
  migrarParaOFim,
} from '../src/compartilhado/banco/migrador.js';
import { type Aplicacao, montarAplicacao } from '../src/composicao.js';
import {
  carregarArquivoEnv,
  ErroDeConfiguracao,
  lerUrlDoBanco,
  lerUrlDoBancoDeTeste,
} from '../src/config.js';

const DICA_BANCO =
  'O banco está no ar e a URL está certa? Rode na raiz: docker compose up -d banco';
const OPCOES_VALIDAS = new Set(['--teste']);

/** Senha de todas as contas da semente. Só para desenvolvimento local. */
const SENHA_DA_SEMENTE = 'Semente#2026';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

type Apelido = 'ana' | 'bruno' | 'carla' | 'diego';

interface PessoaDaSemente {
  readonly email: string;
  readonly perfil: {
    readonly nome: string;
    readonly cidade: string;
    readonly descricao: string;
    readonly habilidades: readonly string[];
  };
}

// Pessoas fictícias; os e-mails usam o domínio reservado `exemplo.test`.
const PESSOAS: Readonly<Record<Apelido, PessoaDaSemente>> = {
  ana: {
    email: 'ana.empregadora@exemplo.test',
    perfil: {
      nome: 'Ana Fictícia',
      cidade: 'Lavras',
      descricao: 'Reformo imóveis para alugar e contrato serviços avulsos.',
      habilidades: ['gestão de obras', 'pintura'],
    },
  },
  bruno: {
    email: 'bruno.freela@exemplo.test',
    perfil: {
      nome: 'Bruno Fictício',
      cidade: 'Belo Horizonte',
      descricao: 'Pintor e eletricista com dez anos de experiência.',
      habilidades: ['pintura', 'reparos elétricos', 'montagem de móveis'],
    },
  },
  carla: {
    email: 'carla.design@exemplo.test',
    perfil: {
      nome: 'Carla Fictícia',
      cidade: 'São Paulo',
      descricao: 'Designer gráfica e fotógrafa de eventos.',
      habilidades: ['design gráfico', 'fotografia'],
    },
  },
  diego: {
    email: 'diego.aulas@exemplo.test',
    perfil: {
      nome: 'Diego Fictício',
      cidade: 'Lavras',
      descricao: 'Professor de matemática para o ensino médio.',
      habilidades: ['aulas de matemática', 'reforço escolar'],
    },
  },
};

/** Ordem de criação; a primeira conta decide se a semente já foi aplicada. */
const APELIDOS: readonly Apelido[] = ['ana', 'bruno', 'carla', 'diego'];

/** Falha de uma requisição da semente: só método, rota, status e código. */
class ErroDaSemente extends Error {
  constructor(passo: string, status: number, codigo: string | undefined) {
    super(
      `${passo} respondeu ${status}${codigo ? ` (${codigo})` : ''}; nada foi desfeito, veja o README`,
    );
    this.name = 'ErroDaSemente';
  }
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
}

/** Cliente mínimo sobre `app.inject`; recusa qualquer status inesperado. */
function criarCliente(aplicacao: Aplicacao) {
  return async function pedir(
    metodo: 'GET' | 'POST' | 'PUT',
    url: string,
    opcoes: {
      token?: string;
      corpo?: object;
      esperado?: readonly number[];
      passo: string;
    },
  ): Promise<Resposta> {
    const resposta = await aplicacao.app.inject({
      method: metodo,
      url,
      headers: opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : {},
      ...(opcoes.corpo ? { payload: opcoes.corpo } : {}),
    });
    const corpo =
      resposta.body === '' ? {} : (resposta.json() as Record<string, unknown>);
    const esperado = opcoes.esperado ?? [200, 201];
    if (!esperado.includes(resposta.statusCode)) {
      const codigo = typeof corpo.erro === 'string' ? corpo.erro : undefined;
      throw new ErroDaSemente(opcoes.passo, resposta.statusCode, codigo);
    }
    return { status: resposta.statusCode, corpo };
  };
}

function texto(corpo: Record<string, unknown>, chave: string): string {
  const valor = corpo[chave];
  if (typeof valor !== 'string' || valor === '') {
    throw new Error(`resposta sem o campo ${chave}`);
  }
  return valor;
}

/** `YYYY-MM-DD` daqui a `dias` dias (UTC). */
function dataDaquiA(dias: number): string {
  return new Date(Date.now() + dias * UM_DIA_MS).toISOString().slice(0, 10);
}

interface Contagens {
  contas: number;
  perfis: number;
  trampos: number;
  servicos: number;
  candidaturas: number;
  aceitas: number;
  conversas: number;
  mensagens: number;
}

/** Cria tudo; devolve `null` se a semente já tinha sido aplicada. */
async function semear(aplicacao: Aplicacao): Promise<Contagens | null> {
  const pedir = criarCliente(aplicacao);
  const contagens: Contagens = {
    contas: 0,
    perfis: 0,
    trampos: 0,
    servicos: 0,
    candidaturas: 0,
    aceitas: 0,
    conversas: 0,
    mensagens: 0,
  };

  // Contas.
  const tokens = {} as Record<Apelido, string>;
  for (const apelido of APELIDOS) {
    const criada = await pedir('POST', '/contas', {
      corpo: { email: PESSOAS[apelido].email, senha: SENHA_DA_SEMENTE },
      esperado: [201, 409],
      passo: 'POST /contas',
    });
    if (criada.status === 409) {
      if (apelido === APELIDOS[0]) {
        return null;
      }
      // Uma execução anterior parou no meio: não dá para seguir sem duplicar.
      throw new ErroDaSemente('POST /contas', 409, 'email_em_uso');
    }
    tokens[apelido] = texto(criada.corpo, 'token');
    contagens.contas += 1;
  }

  // Perfis completos (D9): nome, cidade e ao menos uma habilidade.
  for (const apelido of APELIDOS) {
    const salvo = await pedir('PUT', '/perfis/eu', {
      token: tokens[apelido],
      corpo: PESSOAS[apelido].perfil,
      passo: 'PUT /perfis/eu',
    });
    if (salvo.corpo.completo !== true) {
      throw new ErroDaSemente('PUT /perfis/eu', salvo.status, 'incompleto');
    }
    contagens.perfis += 1;
  }

  // Ids das contas, lidos pela própria API (a resposta do cadastro só tem o token).
  const ids = {} as Record<Apelido, string>;

  // Trampos: categorias e cidades variadas, um com prazo.
  const trampos = [
    {
      autor: 'ana',
      titulo: 'Pintura de muro externo',
      descricao: 'Muro de 10 metros, tinta inclusa. Preciso até o fim do mês.',
      categoria: 'reformas',
      cidade: 'Lavras',
      valorCentavos: 35_000,
      prazo: dataDaquiA(14),
    },
    {
      autor: 'ana',
      titulo: 'Faxina pós-obra em apartamento',
      descricao: 'Apartamento de dois quartos, retirada de pó e respingos.',
      categoria: 'limpeza',
      cidade: 'Lavras',
      valorCentavos: 25_000,
    },
    {
      autor: 'diego',
      titulo: 'Logo para curso de reforço escolar',
      descricao: 'Logo simples, com versões colorida e em preto e branco.',
      categoria: 'design',
      cidade: 'Lavras',
      valorCentavos: 50_000,
    },
    {
      autor: 'carla',
      titulo: 'Entrega de convites de casamento',
      descricao: 'Cerca de 40 convites na zona sul, num sábado.',
      categoria: 'entregas',
      cidade: 'São Paulo',
      valorCentavos: 8_000,
    },
    {
      autor: 'bruno',
      titulo: 'Fotos para catálogo de móveis',
      descricao: 'Dez peças, fundo branco, fotos tratadas.',
      categoria: 'fotografia',
      cidade: 'Belo Horizonte',
      valorCentavos: 40_000,
    },
  ] as const;
  const idsDosTrampos: string[] = [];
  for (const { autor, ...trampo } of trampos) {
    const publicado = await pedir('POST', '/trampos', {
      token: tokens[autor],
      corpo: trampo,
      passo: 'POST /trampos',
    });
    const id = texto(publicado.corpo, 'id');
    idsDosTrampos.push(id);
    const detalhe = await pedir('GET', `/trampos/${id}`, {
      token: tokens[autor],
      passo: 'GET /trampos/:id',
    });
    ids[autor] = texto(detalhe.corpo, 'autorId');
    contagens.trampos += 1;
  }
  const [pintura, , logo] = idsDosTrampos as [string, string, string];

  // Serviços: um sem cidade (D7).
  const servicos = [
    {
      autor: 'bruno',
      titulo: 'Pintura residencial',
      descricao: 'Paredes internas e externas, com material ou sem.',
      categoria: 'reformas',
      cidade: 'Belo Horizonte',
      precoBaseCentavos: 20_000,
    },
    {
      autor: 'carla',
      titulo: 'Identidade visual para pequenos negócios',
      descricao:
        'Logo, paleta de cores e cartão de visita. Atendo a distância.',
      categoria: 'design',
      precoBaseCentavos: 60_000,
    },
    {
      autor: 'diego',
      titulo: 'Aulas particulares de matemática',
      descricao: 'Ensino médio e preparação para o vestibular.',
      categoria: 'aulas',
      cidade: 'Lavras',
      precoBaseCentavos: 7_000,
    },
    {
      autor: 'carla',
      titulo: 'Fotografia de eventos',
      descricao: 'Aniversários e casamentos, com fotos tratadas em uma semana.',
      categoria: 'fotografia',
      cidade: 'São Paulo',
      precoBaseCentavos: 90_000,
    },
  ] as const;
  for (const { autor, ...servico } of servicos) {
    await pedir('POST', '/servicos', {
      token: tokens[autor],
      corpo: servico,
      passo: 'POST /servicos',
    });
    contagens.servicos += 1;
  }

  // Candidaturas: Bruno e Diego na pintura, Carla no logo.
  const candidaturas = [
    {
      freelancer: 'bruno',
      trampoId: pintura,
      mensagem: 'Faço em dois dias, com tinta acrílica.',
      valorPropostoCentavos: 32_000,
    },
    {
      freelancer: 'diego',
      trampoId: pintura,
      mensagem: 'Tenho os fins de semana livres.',
      valorPropostoCentavos: 30_000,
    },
    {
      freelancer: 'carla',
      trampoId: logo,
      mensagem: 'Mando três propostas em uma semana.',
      valorPropostoCentavos: 45_000,
    },
  ] as const;
  const idsDasCandidaturas: string[] = [];
  for (const { freelancer, trampoId, ...corpo } of candidaturas) {
    const criada = await pedir('POST', `/trampos/${trampoId}/candidaturas`, {
      token: tokens[freelancer],
      corpo,
      passo: 'POST /trampos/:id/candidaturas',
    });
    idsDasCandidaturas.push(texto(criada.corpo, 'id'));
    contagens.candidaturas += 1;
  }

  // Ana aceita o Bruno: a pintura fica em andamento e a do Diego, recusada.
  const [candidaturaDoBruno] = idsDasCandidaturas as [string];
  await pedir(
    'POST',
    `/trampos/${pintura}/candidaturas/${candidaturaDoBruno}/aceitar`,
    { token: tokens.ana, passo: 'POST /trampos/:id/candidaturas/:cid/aceitar' },
  );
  contagens.aceitas += 1;

  // Conversas (CA13: só entre quem tem candidatura), com algumas mensagens.
  const conversas = [
    {
      quemAbre: 'bruno',
      outro: 'ana',
      mensagens: [
        ['bruno', 'Oi, Ana! Posso começar na segunda?'],
        ['ana', 'Pode sim. O portão fica aberto a partir das 8h.'],
        ['bruno', 'Combinado, levo a tinta.'],
      ],
    },
    {
      quemAbre: 'carla',
      outro: 'diego',
      mensagens: [
        ['carla', 'Diego, você tem alguma referência de estilo para o logo?'],
        ['diego', 'Gosto de cores vivas e letras arredondadas.'],
      ],
    },
  ] as const;
  for (const { quemAbre, outro, mensagens } of conversas) {
    const aberta = await pedir('POST', '/conversas', {
      token: tokens[quemAbre],
      corpo: { outroUsuarioId: ids[outro] },
      passo: 'POST /conversas',
    });
    const conversaId = texto(aberta.corpo, 'conversaId');
    contagens.conversas += 1;
    for (const [autor, conteudo] of mensagens) {
      await pedir('POST', `/conversas/${conversaId}/mensagens`, {
        token: tokens[autor],
        corpo: { texto: conteudo },
        passo: 'POST /conversas/:id/mensagens',
      });
      contagens.mensagens += 1;
    }
  }

  return contagens;
}

async function principal(argumentos: readonly string[]): Promise<number> {
  // O pnpm repassa o `--` separador; ele não é opção.
  const opcoes = argumentos.filter((a) => a !== '--');
  if (opcoes.some((a) => !OPCOES_VALIDAS.has(a))) {
    console.error('Opção desconhecida. Use: semear [--teste]');
    return 2;
  }
  const teste = opcoes.includes('--teste');

  carregarArquivoEnv();
  const url = teste
    ? lerUrlDoBancoDeTeste()
    : lerUrlDoBanco(process.env, 'DATABASE_URL');
  const db: Kysely<BancoBase> = criarConexao(url, { maximoDeConexoes: 2 });
  let aplicacao: Aplicacao | undefined;
  try {
    console.log(`Banco de ${teste ? 'teste' : 'desenvolvimento'}: semeando.`);
    const migradas = await migrarParaOFim(db);
    if (migradas.length > 0) {
      console.log(`  ${migradas.length} migração(ões) aplicada(s) antes.`);
    }
    aplicacao = await montarAplicacao({ db, logger: false, rateLimit: false });
    const contagens = await semear(aplicacao);
    if (contagens === null) {
      console.log('Semente já aplicada: nada a fazer.');
      return 0;
    }
    console.log('Semente aplicada:');
    console.log(
      `  ${contagens.contas} contas e ${contagens.perfis} perfis completos`,
    );
    console.log(
      `  ${contagens.trampos} trampos (${contagens.aceitas} em andamento) e ${contagens.servicos} serviços`,
    );
    console.log(
      `  ${contagens.candidaturas} candidaturas (${contagens.aceitas} aceita)`,
    );
    console.log(
      `  ${contagens.conversas} conversas com ${contagens.mensagens} mensagens`,
    );
    console.log('A senha das contas está no README (seção Semente).');
    return 0;
  } finally {
    await aplicacao?.fechar();
    await db.destroy();
  }
}

try {
  process.exitCode = await principal(process.argv.slice(2));
} catch (erro) {
  if (
    erro instanceof ErroDeConfiguracao ||
    erro instanceof ErroDeMigracao ||
    erro instanceof ErroDaSemente
  ) {
    console.error(`Erro: ${erro.message}`);
    if (erro instanceof ErroDeMigracao && erro.migracao === undefined) {
      console.error(DICA_BANCO);
    }
  } else {
    // Erro de conexão ou inesperado: só o tipo e o código, nunca a mensagem do driver.
    const { name, code } = erro as { name?: unknown; code?: unknown };
    console.error(
      `Erro ao semear (${String(name ?? 'desconhecido')}${code ? `, código ${String(code)}` : ''}).`,
    );
    console.error(DICA_BANCO);
  }
  process.exitCode = 1;
}
