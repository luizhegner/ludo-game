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

export type Power =
  | 'shield'
  | 'freeze'
  | 'spring'
  | 'magicDice'
  | 'x2'
  | 'x3'
  | 'rocket'
  | 'bomb'
  | 'megaBomb'
  | 'mine'
  | 'fire';

export const POWERS: readonly Power[] = [
  'shield',
  'freeze',
  'spring',
  'magicDice',
  'x2',
  'x3',
  'rocket',
  'bomb',
  'megaBomb',
  'mine',
  'fire',
] as const;

export interface Rules {
  mode: Mode;
  /** Jogada extra ao comer uma peça adversária. */
  captureBonus: boolean;
  /** Poderes desligados nesta partida (só nos modos com poderes). Ausente = todos ligados. */
  disabledPowers?: Power[];
}

/** Casa de poder no anel (índice absoluto). */
export interface PowerCell {
  abs: number;
  power: Power;
  /** Mina ainda não revelada. */
  hidden?: boolean;
}

/** Efeitos ligados a uma peça. Objeto vazio = nenhum. */
export interface PieceEffects {
  shield?: boolean;
  /**
   * Fogo: >0 = em chamas. Vale 2 ao pegar e cai 1 no início de cada vez do
   * jogador, então dura até o fim da próxima vez; o próximo movimento de dado
   * da peça consome.
   */
  fire?: number;
  /** Congelada: >0 = não pode ser movida. Mesma contagem do fogo (2 → dura a próxima vez inteira). */
  frozen?: number;
}

/** Multiplicador ×2/×3 pendente pra próxima vez do jogador. */
export interface PendingMultiplier {
  piece: number;
  factor: 2 | 3;
  /** Vira true quando começa a próxima vez do jogador; aí o primeiro dado é multiplicado. */
  armed: boolean;
}

export interface PowersState {
  cells: PowerCell[];
  /** Efeitos por cor → peça (4 por cor). */
  effects: Partial<Record<Color, PieceEffects[]>>;
  pending: Partial<Record<Color, PendingMultiplier>>;
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

/** 'pick' = dado personalizável: o jogador escolhe um número de 1 a 6. */
export type Phase = 'roll' | 'move' | 'pick' | 'over';

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
  /** Multiplicador aplicado ao dado atual (a peça em `legal[0]` anda dado × mult). */
  mult?: 2 | 3;
  /** Fase 'pick': peça que vai andar o número escolhido. */
  pick?: number;
  /** Jogada extra acumulada na cadeia em andamento (retomada depois do 'pick'). */
  extra?: boolean;
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
  /** Casas de poder e efeitos (só nos modos com poderes). */
  powers?: PowersState;
  /** Estado do gerador de números aleatórios (serializável). */
  rng: number;
  log: GameEvent[];
}

export type BlastPower = 'bomb' | 'megaBomb' | 'mine';
export type FlyPower = 'rocket' | 'spring';

export type GameEvent =
  | { t: number; type: 'start'; first: Color }
  | { t: number; type: 'roll'; color: Color; value: number; mult?: 2 | 3 }
  | { t: number; type: 'noMoves'; color: Color; value: number }
  | { t: number; type: 'move'; color: Color; piece: number; from: number; to: number }
  | { t: number; type: 'capture'; by: Color; victim: Color; piece: number; ring: number; how?: 'fire' | BlastPower }
  | { t: number; type: 'finish'; color: Color; piece: number }
  | { t: number; type: 'threeSixes'; color: Color; piece: number | null }
  | { t: number; type: 'playerDone'; color: Color; place: number }
  | { t: number; type: 'turn'; color: Color }
  | { t: number; type: 'gameOver'; placements: Color[] | null; reason: EndReason }
  // --- poderes ---
  /** Peça pisou numa casa de poder (a casa é consumida). */
  | { t: number; type: 'power'; color: Color; piece: number; power: Power; ring: number }
  /** Voo de foguete/mola: de `from` a `to` (posições relativas), `n` casas sorteadas. */
  | { t: number; type: 'fly'; color: Color; piece: number; power: FlyPower; from: number; to: number; n: number }
  /** Peça em chamas andou de `from` a `to` (vítimas vêm como 'capture' com how:'fire'). */
  | { t: number; type: 'burn'; color: Color; piece: number; from: number; to: number }
  /** Atacante caiu em peça com escudo: escudo some, atacante volta pra `back`. */
  | { t: number; type: 'shieldBlock'; attacker: Color; piece: number; defender: Color; defenderPiece: number; ring: number; back: number }
  /** Escudo destruído por explosão/fogo (a peça fica). */
  | { t: number; type: 'shieldBreak'; color: Color; piece: number; by: Color; cause: 'fire' | BlastPower }
  /** Explosão em `ring` causada por `by` (vítimas vêm como 'capture' ou 'lost'). */
  | { t: number; type: 'boom'; by: Color; piece: number; power: BlastPower; ring: number }
  /** Própria peça (ou de quem explodiu) voltou pra base por explosão. */
  | { t: number; type: 'lost'; color: Color; piece: number; cause: BlastPower }
  /** Dado personalizável: número escolhido. */
  | { t: number; type: 'pick'; color: Color; piece: number; value: number }
  /** Multiplicador pendente perdido. */
  | { t: number; type: 'multLost'; color: Color; piece: number; factor: 2 | 3; reason: 'home' | 'frozen' | 'finished' | 'overshoot' | 'replaced' }
  /** Fogo apagou sem ser usado. */
  | { t: number; type: 'fireOut'; color: Color; piece: number; reason: 'home' | 'frozen' | 'stretch' | 'expired' }
  | { t: number; type: 'mineRevealed'; ring: number; by: Color }
  | { t: number; type: 'mineDetonated'; ring: number; by: Color }
  /** Novas casas de poder colocadas (índices absolutos; minas escondidas não aparecem aqui). */
  | { t: number; type: 'repopulate'; rings: number[] };

export type EventType = GameEvent['type'];
