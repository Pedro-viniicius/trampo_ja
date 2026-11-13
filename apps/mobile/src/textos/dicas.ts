/**
 * Conteúdo de "Dicas & minicursos" (V2, quadro 11; CA81). Fica no app, sem
 * rede: a lista, o filtro e a leitura abrem sem nenhuma requisição. Textos
 * escritos pelo designer, para revisão do dono (plano visual-v2, premissas).
 * Linguagem neutra de gênero; nada de promessa de pagamento ou de vaga.
 */
import type { textos } from './pt-BR';

/** Chaves das categorias; o rótulo fica em `textos.dicas.categoria`. */
export type CategoriaDaDica = keyof typeof textos.dicas.categoria;

export type TipoDaDica = 'dica' | 'minicurso';

export interface Dica {
  readonly id: string;
  readonly categoria: CategoriaDaDica;
  readonly tipo: TipoDaDica;
  /** Tempo de leitura, em minutos. */
  readonly minutos: number;
  readonly titulo: string;
  /** Até duas linhas no cartão. */
  readonly resumo: string;
  readonly paragrafos: readonly string[];
  /** Lista "Para lembrar". */
  readonly lembrar: readonly string[];
}

/** Ordem de exibição dos chips (depois de "Todos"). */
export const CATEGORIAS_DAS_DICAS: readonly CategoriaDaDica[] = [
  'conseguir_trabalho',
  'atendimento',
  'garcom_e_cozinha',
  'eventos',
  'comercio_e_estoque',
  'seguranca',
];

export const DICAS: readonly Dica[] = [
  {
    id: 'entrevista',
    categoria: 'conseguir_trabalho',
    tipo: 'dica',
    minutos: 3,
    titulo: 'Como mandar bem na entrevista?',
    resumo:
      'Prepare-se para responder perguntas e apresentar suas habilidades.',
    paragrafos: [
      'Antes da conversa, leia de novo o anúncio do trampo. Veja o que a pessoa precisa, o horário e o local, e pense em como você pode ajudar.',
      'Separe dois ou três exemplos de trabalhos que você já fez. Contar uma situação real vale mais do que dizer "sou esforçado" ou "sou esforçada".',
      'Chegue alguns minutos antes, com roupa limpa e adequada ao tipo de trampo. Se a conversa for por mensagem, responda com calma e com frases completas.',
      'No fim, pergunte o que ficou faltando: horário, valor combinado, o que levar no dia. Sair com tudo claro evita mal-entendido depois.',
    ],
    lembrar: [
      'Releia o anúncio antes de conversar.',
      'Tenha exemplos reais do que você já fez.',
      'Combine horário, valor e local antes de aceitar.',
    ],
  },
  {
    id: 'apresentacao',
    categoria: 'conseguir_trabalho',
    tipo: 'minicurso',
    minutos: 4,
    titulo: 'Como se apresentar para um contratante',
    resumo: 'Monte um perfil e uma mensagem de candidatura que chamam atenção.',
    paragrafos: [
      'Seu perfil é a primeira coisa que o contratante vê. Use seu nome, a cidade onde você trabalha e um resumo curto sobre o que você sabe fazer.',
      'Nas habilidades, escreva coisas concretas: "atendimento no caixa", "montagem de mesas", "limpeza pós-obra". Isso ajuda quem procura a encontrar você.',
      'Na mensagem da candidatura, diga por que esse trampo combina com você e quando pode começar. Três ou quatro frases bastam.',
      'Revise antes de enviar. Uma mensagem sem erros e educada mostra cuidado, e cuidado é o que todo contratante procura.',
    ],
    lembrar: [
      'Perfil completo: nome, cidade, resumo e habilidades.',
      'Mensagem curta, específica e educada.',
      'Diga quando você pode começar.',
    ],
  },
  {
    id: 'atendimento-cordial',
    categoria: 'atendimento',
    tipo: 'dica',
    minutos: 3,
    titulo: 'Atendimento que faz o cliente voltar',
    resumo: 'Pequenos gestos que deixam qualquer atendimento melhor.',
    paragrafos: [
      'Cumprimente o cliente olhando para ele, mesmo quando o movimento está grande. Um "já atendo você" mostra que a pessoa foi vista.',
      'Escute o pedido até o fim antes de responder. Se não entendeu, pergunte de novo: é melhor do que entregar a coisa errada.',
      'Quando algo der errado, peça desculpas, diga o que vai fazer para resolver e cumpra. Chame a pessoa responsável se a solução não depender de você.',
    ],
    lembrar: [
      'Cumprimente e mostre que viu o cliente.',
      'Escute até o fim e confirme o pedido.',
      'Problema: desculpa, solução e retorno.',
    ],
  },
  {
    id: 'salao-e-cozinha',
    categoria: 'garcom_e_cozinha',
    tipo: 'minicurso',
    minutos: 5,
    titulo: 'Primeiro dia no salão ou na cozinha',
    resumo: 'O que observar para trabalhar bem desde o primeiro turno.',
    paragrafos: [
      'Chegue cedo e peça para conhecer o espaço: onde ficam os pratos, os talheres, o caixa e a saída de emergência.',
      'Pergunte como funcionam os pedidos: se vão por comanda, por sistema ou de boca. Anote os números das mesas, se for o caso.',
      'Na cozinha, siga a ordem de quem coordena e mantenha a bancada limpa. Lave as mãos sempre que trocar de tarefa.',
      'No salão, leve poucas coisas por vez e avise quando passar atrás de alguém. Segurança vem antes da pressa.',
    ],
    lembrar: [
      'Conheça o espaço antes do movimento começar.',
      'Entenda como os pedidos chegam.',
      'Mãos limpas e bancada organizada.',
    ],
  },
  {
    id: 'trampo-em-evento',
    categoria: 'eventos',
    tipo: 'dica',
    minutos: 3,
    titulo: 'Como se preparar para um evento',
    resumo: 'Festas e feiras pedem pontualidade e combinação prévia.',
    paragrafos: [
      'Confirme com antecedência o endereço, o horário de chegada, o horário de saída e o traje. Em evento, o atraso de uma pessoa atrasa todo mundo.',
      'Leve água, um lanche leve e o que foi pedido no anúncio. Celular com bateria ajuda a resolver imprevistos.',
      'Durante o evento, saiba quem é a pessoa responsável por você e a quem recorrer se algo sair do combinado.',
    ],
    lembrar: [
      'Confirme endereço, horários e traje.',
      'Leve água e o que foi pedido.',
      'Saiba quem coordena o evento.',
    ],
  },
  {
    id: 'estoque-organizado',
    categoria: 'comercio_e_estoque',
    tipo: 'dica',
    minutos: 4,
    titulo: 'Organização de estoque sem mistério',
    resumo: 'Como repor, contar e guardar produtos do jeito certo.',
    paragrafos: [
      'Na reposição, coloque os produtos que vencem antes na frente. Assim nada fica parado até perder a validade.',
      'Ao contar mercadoria, anote na hora e confira duas vezes os itens de maior valor. Contar de cabeça é pedir para errar.',
      'Mantenha corredores livres e caixas pesadas embaixo. Uma prateleira organizada é mais rápida e mais segura para todo mundo.',
    ],
    lembrar: [
      'O que vence primeiro vai na frente.',
      'Anote a contagem na hora.',
      'Peso embaixo, corredor livre.',
    ],
  },
  {
    id: 'seguranca-basica',
    categoria: 'seguranca',
    tipo: 'minicurso',
    minutos: 4,
    titulo: 'Segurança no trabalho: o básico',
    resumo: 'Cuidados simples que evitam acidentes em qualquer trampo.',
    paragrafos: [
      'Antes de começar, pergunte se há equipamento de proteção para a tarefa: luva, bota, óculos ou protetor auricular. Use sempre que houver.',
      'Para levantar peso, dobre os joelhos e mantenha a coluna reta. Peça ajuda para cargas grandes: ninguém precisa carregar sozinho.',
      'Se perceber algo perigoso, como fio solto, piso molhado ou escada bamba, avise a pessoa responsável e não arrisque.',
      'Combine antes onde fica o kit de primeiros socorros e qual é o telefone de emergência do lugar.',
    ],
    lembrar: [
      'Use o equipamento de proteção.',
      'Joelhos dobrados e coluna reta.',
      'Viu perigo? Avise e não arrisque.',
    ],
  },
];

/** Conteúdo pelo id, para a leitura; `null` se não existir. */
export function encontrarDica(id: string): Dica | null {
  return DICAS.find((dica) => dica.id === id) ?? null;
}
