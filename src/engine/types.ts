/** Tipos do motor de regras. Nada aqui depende de DOM ou Svelte. */

export type Color = 'green' | 'red' | 'blue' | 'yellow';

/** Ordem horária no tabuleiro: verde (↖) → vermelho (↗) → azul (↘) → amarelo (↙). */
export const COLORS: readonly Color[] = ['green', 'red', 'blue', 'yellow'] as const;

export type Mode =
  | 'classic'
  | 'powers'
  | 'team'
  | 'teamPowers'
  | 'quick'
  | 'fiveMin'
  | 'deathmatch';

export interface Rules {
  mode: Mode;
  /** Jogada extra ao comer uma peça adversária. */
  captureBonus: boolean;
}

export type PlayerStatus = 'active' | 'paused' | 'removed';

export interface PlayerStats {
  captures: number;
  deaths: number;
  sixes: number;
  powers: number;
}

export interface PlayerSlot {
  color: Color;
  /** Referência ao cadastro de jogadores (fase 2). */
  playerId: string;
  name: string;
  /** Emoji ou data URL de foto. */
  avatar: string;
  status: PlayerStatus;
  joinedAt: number;
  /** Quando foi removido (conta como último). */
  leftAt?: number;
  stats: PlayerStats;
}

/** Jogador que saiu por substituição: conta como último na partida. */
export interface SubstitutedPlayer {
  playerId: string;
  name: string;
  avatar: string;
  color: Color;
  leftAt: number;
}

/**
 * Posição de uma peça, sempre relativa à própria cor:
 *  -1      = na base
 *  0..50   = anel (0 = casa de saída)
 *  51..55  = reta final
 *  56      = centro (terminou)
 */
export const BASE = -1;
export const HOME_START = 51;
export const FINISH = 56;
export const RING = 52;

export type Phase = 'roll' | 'move' | 'over';

export interface Turn {
  color: Color;
  phase: Phase;
  /** Valor do dado quando em fase 'move'. */
  dice: number | null;
  /** Índices das peças que podem mover (fase 'move'). */
  legal: number[];
  /** Seis consecutivos neste turno. */
  sixStreak: number;
  /** Última peça movida neste turno (para a penalidade dos três 6). */
  lastMoved: number | null;
}

export type EndReason = 'finished' | 'ranked' | 'abandoned';

export interface GameState {
  id: string;
  createdAt: number;
  updatedAt: number;
  rules: Rules;
  /** Sempre em ordem horária de cor. */
  players: PlayerSlot[];
  /** Quatro posições por cor presente na partida. */
  pieces: Record<Color, number[]>;
  turn: Turn;
  /** Cores na ordem em que terminaram. */
  finished: Color[];
  /** Colocação final quando a partida acaba (null se encerrada sem contar). */
  placements: Color[] | null;
  endReason: EndReason | null;
  /** Jogadores que saíram por substituição. */
  substituted?: SubstitutedPlayer[];
  /** Estado do gerador de números aleatórios (serializável). */
  rng: number;
  log: GameEvent[];
}

export type GameEvent =
  | { t: number; type: 'start'; first: Color }
  | { t: number; type: 'roll'; color: Color; value: number }
  | { t: number; type: 'noMoves'; color: Color; value: number }
  | { t: number; type: 'move'; color: Color; piece: number; from: number; to: number }
  | { t: number; type: 'capture'; by: Color; victim: Color; piece: number; ring: number }
  | { t: number; type: 'finish'; color: Color; piece: number }
  | { t: number; type: 'threeSixes'; color: Color; piece: number | null }
  | { t: number; type: 'playerDone'; color: Color; place: number }
  | { t: number; type: 'turn'; color: Color }
  | { t: number; type: 'gameOver'; placements: Color[] | null; reason: EndReason };

export type EventType = GameEvent['type'];
