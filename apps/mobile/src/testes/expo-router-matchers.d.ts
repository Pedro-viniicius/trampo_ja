// Tipos dos matchers do Expo Router (`toHavePathname`, `toHaveSearchParams`...)
// para todos os testes. O runtime os registra em `expo-router/testing-library`
// (`expect.extend`), mas o SDK 57 não publica os tipos (o `expect.d.ts` do
// pacote está vazio): declare-os aqui. Os nomes e assinaturas seguem o
// `expect.js` do pacote.
declare namespace jest {
  // biome-ignore lint/complexity/noBannedTypes: `T = {}` precisa casar com a declaração de @types/jest
  interface Matchers<R, T = {}> {
    toHavePathname(pathname: string): R;
    toHavePathnameWithParams(pathnameWithParams: string): R;
    toHaveSegments(segments: string[]): R;
    toHaveSearchParams(params: Record<string, string | string[]>): R;
    toHaveRouterState(state: unknown): R;
  }
}
