import { Feather } from '@expo/vector-icons';
import type { ComponentRef, Ref } from 'react';
import { TextInput, View } from 'react-native';
import { texto as estiloDeTexto } from '../tema/texto';
import { cores, espaco, raio, sombra } from '../tema/tokens';
import { textos } from '../textos/pt-BR';
import { BotaoDeIcone } from './BotaoDeIcone';
import { estiloDeFoco, useFoco } from './utilitarios';

export type PropsDoCampoDeBusca = {
  /** Rótulo falado e texto de exemplo (ex.: "Buscar conversa"). */
  rotulo: string;
  valor: string;
  onChangeText: (texto: string) => void;
  onSubmitEditing?: () => void;
  /** Mostra o botão de filtro redondo à direita. */
  onFiltros?: () => void;
  /** Filtros aplicados: aparece um número no botão e no rótulo falado. */
  filtrosAtivos?: number;
  /** Só para texto ASCII; texto livre deve ser cortado por quem usa. */
  maxLength?: number;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
};

/** Busca em pílula branca: ícone de lupa, campo e (opcional) o botão de filtros. */
export function CampoDeBusca({
  rotulo,
  valor,
  onChangeText,
  onSubmitEditing,
  onFiltros,
  filtrosAtivos = 0,
  maxLength,
  inputRef,
}: PropsDoCampoDeBusca) {
  const { focado, aoFocar, aoDesfocar } = useFoco();
  return (
    <View
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: espaco.s,
          paddingLeft: espaco.m,
          paddingRight: onFiltros ? espaco.xs : espaco.m,
          borderRadius: raio.pill,
          borderWidth: 1.5,
          borderColor: focado ? cores.primaria : cores.bordaDeCampo,
          backgroundColor: cores.superficie,
        },
        sombra.sm,
        focado && estiloDeFoco,
      ]}
    >
      <Feather
        name="search"
        size={20}
        color={cores.textoSecundario}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <TextInput
        ref={inputRef}
        accessibilityLabel={rotulo}
        accessibilityRole="search"
        value={valor}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={aoFocar}
        onBlur={aoDesfocar}
        placeholder={rotulo}
        placeholderTextColor={cores.tinta[500]}
        returnKeyType="search"
        autoCorrect={false}
        maxLength={maxLength}
        style={[
          estiloDeTexto('corpo'),
          { flex: 1, minHeight: 48, color: cores.texto },
        ]}
      />
      {onFiltros ? (
        <BotaoDeIcone
          icone="sliders"
          variante="escuro"
          rotulo={
            filtrosAtivos > 0
              ? textos.buscarFreelancers.filtrosAtivos(filtrosAtivos)
              : textos.buscarFreelancers.filtros
          }
          contador={filtrosAtivos > 0 ? filtrosAtivos : undefined}
          onPress={onFiltros}
        />
      ) : null}
    </View>
  );
}
