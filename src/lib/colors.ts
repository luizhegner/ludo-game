import type { Color } from '../engine/types';

export const COLOR_HEX: Record<Color, string> = {
  green: '#43a047',
  red: '#e53935',
  blue: '#1e88e5',
  yellow: '#fdd835',
};

export const COLOR_DARK: Record<Color, string> = {
  green: '#2a6e2e',
  red: '#a0201c',
  blue: '#125a9c',
  yellow: '#b8960a',
};

export const COLOR_LIGHT: Record<Color, string> = {
  green: '#b7e4b9',
  red: '#ffb3ae',
  blue: '#b6dbff',
  yellow: '#fff2a8',
};

export const COLOR_NAME: Record<Color, string> = {
  green: 'Verde',
  red: 'Vermelho',
  blue: 'Azul',
  yellow: 'Amarelo',
};

/** Cor de texto legível sobre a cor do jogador. */
export const COLOR_ON: Record<Color, string> = {
  green: '#ffffff',
  red: '#ffffff',
  blue: '#ffffff',
  yellow: '#3b3200',
};
