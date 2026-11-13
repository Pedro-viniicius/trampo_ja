import { Redirect } from 'expo-router';

/**
 * Minhas candidaturas virou a aba Meus trampos (CA77): o caminho antigo
 * continua valendo e leva até ela.
 */
export default function RotaDasMinhasCandidaturas() {
  return <Redirect href="/meus-trampos" />;
}
