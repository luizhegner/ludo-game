/**
 * Modo Poderes — catálogo, sorteio das casas e efeitos por peça.
 *
 * O que acontece quando uma peça pisa numa casa (captura, voo, explosão…)
 * fica em `landing.ts`; aqui só há dados e utilitários puros.
 */
import {
  BASE,
  COLORS,
  FINISH,
  POWERS,
  RING,
  type Color,
  type GameState,
  type PendingMultiplier,
  type PieceEffects,
  type Power,
  type PowerCell,
  type Rules,
} from './types';
import { SAFE_ABS, isRing, toAbsolute } from './board';
import { nextInt } from './rng';

export type PowerFamily = 'dice' | 'defense' | 'boost' | 'blast';

export interface PowerInfo {
  id: Power;
  name: string;
  /** Uma frase, pra regras e pra área de status. */
  blurb: string;
  family: PowerFamily;
  /** Azar: o jogador quer desviar. */
  bad: boolean;
  /** Peso no sorteio das casas visíveis (0 = fora do sorteio). */
  weight: number;
}

export const POWER_INFO: Record<Power, PowerInfo> = {
  shield: {
    id: 'shield',
    name: 'Escudo',
    blurb: 'Protege a peça até absorver 1 ataque. Quem cair nela volta pra onde estava.',
    family: 'defense',
    bad: false,
    weight: 3,
  },
  freeze: {
    id: 'freeze',
    name: 'Congelar',
    blurb: 'Azar: a peça fica 1 rodada sem poder ser movida. Apaga o fogo.',
    family: 'defense',
    bad: true,
    weight: 2,
  },
  spring: {
    id: 'spring',
    name: 'Mola',
    blurb: 'A peça pula de 4 a 9 casas pra frente. Se cair em adversário, come.',
    family: 'boost',
    bad: false,
    weight: 3,
  },
  magicDice: {
    id: 'magicDice',
    name: 'Dado personalizável',
    blurb: 'Escolha um número de 1 a 6 e essa peça anda na hora. 6 dá jogada extra.',
    family: 'dice',
    bad: false,
    weight: 3,
  },
  x2: {
    id: 'x2',
    name: 'Multiplicador ×2',
    blurb: 'Na sua próxima vez, essa peça anda o dado × 2. Um 6 multiplicado não dá jogada extra.',
    family: 'dice',
    bad: false,
    weight: 3,
  },
  x3: {
    id: 'x3',
    name: 'Multiplicador ×3',
    blurb: 'Na sua próxima vez, essa peça anda o dado × 3. Um 6 multiplicado não dá jogada extra.',
    family: 'dice',
    bad: false,
    weight: 2,
  },
  rocket: {
    id: 'rocket',
    name: 'Foguete',
    blurb: 'A peça voa de 6 a 20 casas pra frente, por cima de tudo. Se pousar em adversário, come.',
    family: 'boost',
    bad: false,
    weight: 3,
  },
  bomb: {
    id: 'bomb',
    name: 'Bomba',
    blurb: 'Azar: só a peça que pisou volta pra base.',
    family: 'blast',
    bad: true,
    weight: 2,
  },
  megaBomb: {
    id: 'megaBomb',
    name: 'Mega bomba',
    blurb: 'Azar: todas as peças num raio de 2 casas (as suas também) voltam pra base. Casa segura não protege.',
    family: 'blast',
    bad: true,
    weight: 1,
  },
  mine: {
    id: 'mine',
    name: 'Mina',
    blurb: 'Quem parar nela volta pra base. Fica escondida até alguém passar por cima (ou visível desde o início, se a partida for configurada assim).',
    family: 'blast',
    bad: true,
    weight: 0,
  },
  fire: {
    id: 'fire',
    name: 'Fogo',
    blurb: 'No próximo movimento, toda peça adversária no caminho volta pra base (casas seguras protegem).',
    family: 'blast',
    bad: false,
    weight: 3,
  },
};

/** Ordem de exibição (regras, configuração). */
export const POWER_ORDER: readonly Power[] = [
  'shield',
  'rocket',
  'spring',
  'magicDice',
  'x2',
  'x3',
  'fire',
  'freeze',
  'bomb',
  'megaBomb',
  'mine',
];

/** Casas de poder no tabuleiro: 8 visíveis + 2 minas escondidas. */
export const TOTAL_CELLS = 10;
export const MINE_CELLS = 2;
/** Quando sobrarem tantas, repovoa. */
export const REFILL_AT = 4;

export const ROCKET_RANGE: [number, number] = [6, 20];
export const SPRING_RANGE: [number, number] = [4, 9];
export const MEGA_BOMB_RADIUS = 2;

export function hasPowers(rules: Rules): boolean {
  return rules.mode === 'powers' || rules.mode === 'teamPowers';
}

export function enabledPowers(rules: Rules): Power[] {
  const off = new Set(rules.disabledPowers ?? []);
  return POWERS.filter((p) => !off.has(p));
}

export function isEnabled(rules: Rules, p: Power): boolean {
  return !(rules.disabledPowers ?? []).includes(p);
}

// ---------------------------------------------------------------------------
// Casas
// ---------------------------------------------------------------------------

export function powerAt(s: GameState, abs: number): PowerCell | undefined {
  return s.powers?.cells.find((c) => c.abs === abs);
}

export function removeCell(s: GameState, abs: number): void {
  if (!s.powers) return;
  s.powers.cells = s.powers.cells.filter((c) => c.abs !== abs);
}

/** Índices absolutos do anel ocupados por alguma peça. */
export function occupiedAbs(s: GameState): Set<number> {
  const out = new Set<number>();
  for (const p of s.players) {
    if (p.status === 'removed') continue;
    for (const pos of s.pieces[p.color] ?? []) if (isRing(pos)) out.add(toAbsolute(p.color, pos));
  }
  return out;
}

/**
 * Completa as casas de poder até `TOTAL_CELLS`: primeiro completa as minas
 * escondidas (sempre 2 no tabuleiro), depois sorteia as visíveis por peso.
 * Nunca em casa segura, nem em casa ocupada, nem onde já há poder. Devolve os
 * índices absolutos das casas visíveis novas (pra UI destacar). Consome `s.rng`.
 */
export function placePowers(s: GameState): number[] {
  const p = s.powers;
  if (!p) return [];
  const want = TOTAL_CELLS - p.cells.length;
  if (want <= 0) return [];

  const enabled = enabledPowers(s.rules);
  const minesOnBoard = p.cells.filter((c) => c.power === 'mine').length;
  const newMines = enabled.includes('mine') ? Math.max(0, Math.min(MINE_CELLS - minesOnBoard, want)) : 0;
  const newVisible = want - newMines;

  // casas livres, embaralhadas
  const taken = new Set(p.cells.map((c) => c.abs));
  const occupied = occupiedAbs(s);
  const free: number[] = [];
  for (let a = 0; a < RING; a++) if (!SAFE_ABS.has(a) && !taken.has(a) && !occupied.has(a)) free.push(a);
  shuffle(s, free);

  // pool de fichas: peso de cada poder menos as que já estão no tabuleiro
  const onBoard = new Map<Power, number>();
  for (const c of p.cells) onBoard.set(c.power, (onBoard.get(c.power) ?? 0) + 1);
  const pool: Power[] = [];
  for (const pw of enabled) {
    const left = POWER_INFO[pw].weight - (onBoard.get(pw) ?? 0);
    for (let i = 0; i < left; i++) pool.push(pw);
  }
  shuffle(s, pool);

  const added: number[] = [];
  let fi = 0;
  for (let i = 0; i < newMines && fi < free.length; i++) {
    const abs = free[fi++];
    if (s.rules.visibleMines) {
      p.cells.push({ abs, power: 'mine' });
      added.push(abs);
    } else {
      p.cells.push({ abs, power: 'mine', hidden: true });
    }
  }
  for (let i = 0; i < newVisible && fi < free.length && i < pool.length; i++) {
    const abs = free[fi++];
    p.cells.push({ abs, power: pool[i] });
    added.push(abs);
  }
  return added;
}

function shuffle<T>(s: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const r = nextInt(s.rng, 0, i);
    s.rng = r.seed;
    [arr[i], arr[r.value]] = [arr[r.value], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Efeitos por peça
// ---------------------------------------------------------------------------

export function effectsOf(s: GameState, color: Color, piece: number): PieceEffects {
  if (!s.powers) s.powers = { cells: [], effects: {}, pending: {} };
  let arr = s.powers.effects[color];
  if (!arr) {
    arr = [{}, {}, {}, {}];
    s.powers.effects[color] = arr;
  }
  return (arr[piece] ??= {});
}

/** Leitura sem criar nada (pra UI). */
export function peekEffects(s: GameState, color: Color, piece: number): PieceEffects {
  return s.powers?.effects[color]?.[piece] ?? {};
}

export function clearEffects(s: GameState, color: Color, piece: number): void {
  const arr = s.powers?.effects[color];
  if (arr) arr[piece] = {};
}

export function isFrozen(s: GameState, color: Color, piece: number): boolean {
  return (peekEffects(s, color, piece).frozen ?? 0) > 0;
}

export function isBurning(s: GameState, color: Color, piece: number): boolean {
  return (peekEffects(s, color, piece).fire ?? 0) > 0;
}

export function pendingOf(s: GameState, color: Color): PendingMultiplier | undefined {
  return s.powers?.pending[color];
}

/** Mesmo lado? Por enquanto só a própria cor; a fase 5 (2v2) acrescenta o parceiro. */
export function sameSide(_s: GameState, a: Color, b: Color): boolean {
  return a === b;
}

/** Peça está "em jogo" no anel (fora da base, fora da reta final). */
export function onRing(pos: number): boolean {
  return pos !== BASE && pos !== FINISH && isRing(pos);
}

/** Todas as peças (cor, índice) que estão na casa absoluta `abs`. */
export function piecesAt(s: GameState, abs: number): { color: Color; piece: number }[] {
  const out: { color: Color; piece: number }[] = [];
  for (const c of COLORS) {
    const arr = s.pieces[c];
    if (!arr) continue;
    const p = s.players.find((x) => x.color === c);
    if (!p || p.status === 'removed') continue;
    for (let i = 0; i < arr.length; i++) if (isRing(arr[i]) && toAbsolute(c, arr[i]) === abs) out.push({ color: c, piece: i });
  }
  return out;
}

/** Distância circular entre duas casas do anel. */
export function ringDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % RING;
  return Math.min(d, RING - d);
}
