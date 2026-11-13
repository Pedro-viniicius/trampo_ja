// Setup comum do Jest, carregado por `setupFiles` em package.json antes de cada arquivo de teste.
// Feather (D53, único conjunto de ícones do app) carrega a fonte de forma assíncrona e quebra no jest;
// aqui vira um marcador com o nome do ícone.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const icone = ({ name }: { name: string }) =>
    React.createElement(View, { testID: `icone-${name}` });
  return { Feather: icone };
});
