import type { Mode } from '../engine/types';

export interface ModeInfo {
  id: Mode;
  name: string;
  /** Uma frase, pra mostrar no card de escolha. */
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  /** Duplas de cores opostas (verde+azul × vermelho+amarelo). */
  teams: boolean;
  powers: boolean;
  /** Tem cronômetro. */
  timed: boolean;
  /** Já dá pra jogar nesta versão? (os demais chegam na fase 4) */
  available: boolean;
}

export const MODES: readonly ModeInfo[] = [
  {
    id: 'classic',
    name: 'Clássico',
    blurb: 'As regras de sempre: 6 pra sair, come quem cai em cima, até sobrar um.',
    minPlayers: 2,
    maxPlayers: 4,
    teams: false,
    powers: false,
    timed: false,
    available: true,
  },
  {
    id: 'powers',
    name: 'Poderes',
    blurb: 'Clássico com 10 casas de poder pelo tabuleiro: foguete, escudo, bomba, fogo…',
    minPlayers: 2,
    maxPlayers: 4,
    teams: false,
    powers: true,
    timed: false,
    available: true,
  },
  {
    id: 'team',
    name: '2v2',
    blurb: 'Duplas de cores opostas: verde + azul contra vermelho + amarelo.',
    minPlayers: 4,
    maxPlayers: 4,
    teams: true,
    powers: false,
    timed: false,
    available: false,
  },
  {
    id: 'teamPowers',
    name: '2v2 Poderes',
    blurb: 'As duplas do 2v2 com as casas de poder.',
    minPlayers: 4,
    maxPlayers: 4,
    teams: true,
    powers: true,
    timed: false,
    available: false,
  },
  {
    id: 'quick',
    name: 'Rápido',
    blurb: 'Vence quem colocar o primeiro peão no centro.',
    minPlayers: 2,
    maxPlayers: 4,
    teams: false,
    powers: false,
    timed: false,
    available: true,
  },
  {
    id: 'fiveMin',
    name: '5 Minutos',
    blurb: 'Todas as peças começam fora. Aos 5:00, quem tiver mais peças no centro vence.',
    minPlayers: 2,
    maxPlayers: 4,
    teams: false,
    powers: false,
    timed: true,
    available: false,
  },
  {
    id: 'deathmatch',
    name: 'Deathmatch',
    blurb: 'Tempo real, sem turnos: vence quem chegar a 8 capturas.',
    minPlayers: 2,
    maxPlayers: 4,
    teams: false,
    powers: false,
    timed: true,
    available: false,
  },
];

export const MODE_BY_ID: Record<Mode, ModeInfo> = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<
  Mode,
  ModeInfo
>;

export function modeName(mode: Mode): string {
  return MODE_BY_ID[mode]?.name ?? mode;
}
