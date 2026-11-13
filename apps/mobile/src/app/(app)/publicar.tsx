import { Redirect } from 'expo-router';

/**
 * Publicar deixou de ser aba (D56, CA77): o caminho antigo continua valendo
 * e abre o formulário de trampo.
 */
export default function RotaDePublicar() {
  return <Redirect href="/trampos/novo" />;
}
