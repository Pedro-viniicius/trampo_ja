import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { EntradaDePerfil } from '../../../api/tipos';
import { useConexao } from '../../../estado/conexao';
import {
  useMeuPerfil,
  useSalvarPerfil,
} from '../../../estado/consultas/perfil';
import { chaveDoErro } from '../../../estado/erros';
import {
  LIMITES,
  normalizarHabilidade,
  validarPerfil,
} from '../../../estado/validacao';
import {
  EditarPerfil,
  type ErrosDoPerfil,
  type ValoresDoPerfil,
} from '../../../telas';
import { type ChaveDeErro, textos } from '../../../textos/pt-BR';

const VALORES_VAZIOS: ValoresDoPerfil = {
  nome: '',
  cidade: '',
  descricao: '',
  habilidades: [],
};

function traduzir(
  campos: Partial<Record<string, ChaveDeErro>>,
  geral?: ChaveDeErro,
): ErrosDoPerfil {
  const erros: {
    -readonly [K in keyof ErrosDoPerfil]: ErrosDoPerfil[K];
  } = {};
  for (const campo of ['nome', 'cidade', 'descricao', 'habilidades'] as const) {
    const chave = campos[campo];
    if (chave !== undefined) erros[campo] = textos.erros[chave];
  }
  if (geral !== undefined) erros.geral = textos.erros[geral];
  return erros;
}

function tamanhoDe(texto: string): number {
  return Array.from(texto).length;
}

/** Aparada e com espaços colapsados; caixa e acentos ficam como a pessoa digitou. */
function aparar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Erro ao adicionar `nova` (já aparada) à lista, ou `null` se pode entrar. */
function erroDaHabilidade(
  nova: string,
  habilidades: readonly string[],
): ChaveDeErro | null {
  if (nova === '') {
    return 'habilidade_obrigatoria';
  }
  if (habilidades.length >= LIMITES.habilidades.max) {
    return 'habilidades_demais';
  }
  const tamanho = tamanhoDe(nova);
  if (tamanho < LIMITES.habilidade.min || tamanho > LIMITES.habilidade.max) {
    return 'habilidade_tamanho';
  }
  // Repetida se igual depois de normalizar ("Elétrica" = " ELETRICA "), como a
  // API compara; só de marcas combinantes some ao normalizar e é inválida.
  const normalizada = normalizarHabilidade(nova);
  if (
    normalizada === '' ||
    habilidades.some((h) => normalizarHabilidade(h) === normalizada)
  ) {
    return 'habilidade_invalida';
  }
  return null;
}

export default function RotaDeEditarPerfil() {
  const { completar } = useLocalSearchParams<{
    completar?: string | string[];
  }>();
  const modoCompletar =
    (Array.isArray(completar) ? completar[0] : completar) === '1';
  const router = useRouter();
  const { online } = useConexao();
  const meuPerfil = useMeuPerfil();
  const salvar = useSalvarPerfil();

  // Só os campos que a pessoa mexeu ficam na cópia local (o rascunho fica só
  // na memória); os outros vêm do perfil salvo. Assim, digitar antes de o
  // perfil chegar não apaga os outros campos quando ele chega.
  const [edicao, setEdicao] = useState<Partial<ValoresDoPerfil>>({});
  const [erros, setErros] = useState<ErrosDoPerfil>({});
  const [sucesso, setSucesso] = useState(false);

  const salvos: ValoresDoPerfil =
    meuPerfil.perfil === null
      ? VALORES_VAZIOS
      : {
          nome: meuPerfil.perfil.nome,
          cidade: meuPerfil.perfil.cidade,
          descricao: meuPerfil.perfil.descricao ?? '',
          habilidades: meuPerfil.perfil.habilidades,
        };
  const valores: ValoresDoPerfil = { ...salvos, ...edicao };

  const alterar = (
    parcial: Partial<ValoresDoPerfil>,
    campoDoErro: keyof ErrosDoPerfil,
  ) => {
    setEdicao((atual) => ({ ...atual, ...parcial }));
    setErros(({ [campoDoErro]: _, ...resto }) => resto);
  };

  const voltar = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };
  const terminar = () => {
    if (modoCompletar) {
      router.replace('/');
    } else {
      voltar();
    }
  };

  // Vai para a API como a pessoa escreveu (só aparada): a API guarda assim e
  // compara repetidas pela forma normalizada.
  const adicionarHabilidade = (digitada: string) => {
    const nova = aparar(digitada);
    const chave = erroDaHabilidade(nova, valores.habilidades);
    if (chave !== null) {
      setErros((atuais) => ({ ...atuais, habilidades: textos.erros[chave] }));
      return;
    }
    alterar({ habilidades: [...valores.habilidades, nova] }, 'habilidades');
  };

  const aoSalvar = () => {
    const descricao = valores.descricao.trim();
    const dados: EntradaDePerfil = {
      nome: valores.nome.trim(),
      cidade: valores.cidade.trim(),
      ...(descricao !== '' && { descricao }),
      habilidades: valores.habilidades,
    };
    const locais = validarPerfil(dados);
    if (Object.keys(locais).length > 0) {
      setErros(traduzir(locais));
      return;
    }
    setErros({});
    salvar.mutate(dados, {
      onSuccess: () => setSucesso(true),
      onError: (erro) => {
        const { campos, geral } = chaveDoErro(erro, 'perfil');
        setErros(traduzir(campos, geral));
      },
    });
  };

  return (
    <EditarPerfil
      modoCompletar={modoCompletar}
      valores={valores}
      erros={erros}
      salvando={salvar.isPending}
      sucesso={sucesso}
      semConexao={!online}
      onMudarNome={(nome) => alterar({ nome }, 'nome')}
      onMudarCidade={(cidade) => alterar({ cidade }, 'cidade')}
      onMudarDescricao={(descricao) => alterar({ descricao }, 'descricao')}
      onAdicionarHabilidade={adicionarHabilidade}
      onRemoverHabilidade={(habilidade) =>
        alterar(
          {
            habilidades: valores.habilidades.filter((h) => h !== habilidade),
          },
          'habilidades',
        )
      }
      onSalvar={aoSalvar}
      onFecharSucesso={terminar}
      onVoltar={voltar}
      {...(modoCompletar && { onAgoraNao: () => router.replace('/') })}
    />
  );
}
