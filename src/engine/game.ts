/**
 * Motor de regras — Clássico (fase 1).
 *
 * Todas as funções recebem um GameState e devolvem um GameState NOVO.
 * Nunca mutam o argumento. Nada aqui toca DOM, Svelte ou Three.js.
 */
import {
  BASE,
  COLORS,
  FINISH,
  type Color,
  type EndReason,
  type GameEvent,
  type GameState,
  type PlayerSlot,
  type Rules,
  type Turn,
} from './types';
import { isRing, isSafe, progressOf, toAbsolute } from './board';
import { nextInt, randomSeed } from './rng';

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export interface NewPlayer {
  color: Color;
  playerId: string;
  name: string;
  avatar: string;
}

export interface NewGameConfig {
  rules: Rules;
  players: NewPlayer[];
  /** Semente do RNG (testes). */
  seed?: number;
  /** Força quem começa (testes). */
  first?: Color;
  id?: string;
  now?: number;
}

export const DEFAULT_RULES: Rules = { mode: 'classic', captureBonus: false };

export function createGame(cfg: NewGameConfig): GameState {
  if (cfg.players.length < 2) throw new Error('mínimo 2 jogadores');
  const colors = new Set(cfg.players.map((p) => p.color));
  if (colors.size !== cfg.players.length) throw new Error('cores repetidas');

  const now = cfg.now ?? Date.now();
  const players: PlayerSlot[] = COLORS.filter((c) => colors.has(c)).map((c) => {
    const p = cfg.players.find((x) => x.color === c)!;
    return {
      color: c,
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar,
      status: 'active',
      joinedAt: now,
      stats: { captures: 0, deaths: 0, sixes: 0, powers: 0 },
    };
  });

  const pieces = {} as Record<Color, number[]>;
  for (const p of players) pieces[p.color] = [BASE, BASE, BASE, BASE];

  let seed = cfg.seed ?? randomSeed();
  let first = cfg.first;
  if (!first) {
    const r = nextInt(seed, 0, players.length - 1);
    seed = r.seed;
    first = players[r.value].color;
  }

  return {
    id: cfg.id ?? newId(),
    createdAt: now,
    updatedAt: now,
    rules: { ...cfg.rules },
    players,
    pieces,
    turn: freshTurn(first),
    finished: [],
    placements: null,
    endReason: null,
    rng: seed,
    log: [{ t: now, type: 'start', first }],
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function freshTurn(color: Color): Turn {
  return { color, phase: 'roll', dice: null, legal: [], sixStreak: 0, lastMoved: null };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function playerOf(state: GameState, color: Color): PlayerSlot | undefined {
  return state.players.find((p) => p.color === color);
}

export function currentPlayer(state: GameState): PlayerSlot | undefined {
  return playerOf(state, state.turn.color);
}

export function isFinishedPlayer(state: GameState, color: Color): boolean {
  return state.finished.includes(color);
}

/** Pode receber a vez: está na partida, ativo e ainda não terminou. */
export function isPlayable(state: GameState, color: Color): boolean {
  const p = playerOf(state, color);
  return !!p && p.status === 'active' && !isFinishedPlayer(state, color);
}

/** Próxima cor jogável em sentido horário depois de `from` (ou a própria, se não houver outra). */
export function nextColor(state: GameState, from: Color): Color {
  const order = state.players.map((p) => p.color);
  const i = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const c = order[(i + k) % order.length];
    if (isPlayable(state, c)) return c;
  }
  return from;
}

/** Índices das peças de `color` que podem andar `dice` casas. */
export function legalMoves(state: GameState, color: Color, dice: number): number[] {
  const legal: number[] = [];
  const pieces = state.pieces[color];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p === FINISH) continue;
    if (p === BASE) {
      if (dice === 6) legal.push(i);
      continue;
    }
    if (p + dice <= FINISH) legal.push(i);
  }
  return legal;
}

/** Casa de destino de uma peça com o dado atual (pra a UI destacar). */
export function destination(pos: number, dice: number): number {
  return pos === BASE ? 0 : pos + dice;
}

export function progress(state: GameState, color: Color): number {
  return progressOf(state.pieces[color]);
}

export function isOver(state: GameState): boolean {
  return state.turn.phase === 'over';
}

// ---------------------------------------------------------------------------
// Ações do turno
// ---------------------------------------------------------------------------

/**
 * Rola o dado do jogador da vez.
 * `forced` permite injetar o valor (dado físico em modo "física real", testes).
 */
export function roll(state: GameState, forced?: number, now = Date.now()): GameState {
  if (state.turn.phase !== 'roll') throw new Error('não é hora de rolar');
  const color = state.turn.color;
  if (!isPlayable(state, color)) throw new Error('jogador da vez não pode jogar');
  if (forced !== undefined && (forced < 1 || forced > 6 || !Number.isInteger(forced)))
    throw new Error('valor de dado inválido');

  const s = clone(state);
  s.updatedAt = now;

  let value: number;
  if (forced !== undefined) value = forced;
  else {
    const r = nextInt(s.rng, 1, 6);
    s.rng = r.seed;
    value = r.value;
  }

  const me = playerOf(s, color)!;
  if (value === 6) me.stats.sixes++;
  log(s, { t: now, type: 'roll', color, value });

  // três 6 seguidos: última peça movida volta pra base e perde a vez
  if (value === 6 && s.turn.sixStreak + 1 >= 3) {
    const piece = s.turn.lastMoved;
    let penalized: number | null = null;
    if (piece !== null) {
      const pos = s.pieces[color][piece];
      if (pos !== BASE && pos !== FINISH) {
        s.pieces[color][piece] = BASE;
        penalized = piece;
      }
    }
    log(s, { t: now, type: 'threeSixes', color, piece: penalized });
    return advanceTurn(s, now);
  }

  const streak = value === 6 ? s.turn.sixStreak + 1 : 0;
  const legal = legalMoves(s, color, value);

  if (legal.length === 0) {
    log(s, { t: now, type: 'noMoves', color, value });
    if (value === 6) {
      // 6 sempre dá outra rolagem, mesmo sem jogada
      s.turn = { ...s.turn, phase: 'roll', dice: null, legal: [], sixStreak: streak };
      return s;
    }
    return advanceTurn(s, now);
  }

  s.turn = { ...s.turn, phase: 'move', dice: value, legal, sixStreak: streak };
  return s;
}

/** Move a peça `piece` do jogador da vez com o dado já rolado. */
export function move(state: GameState, piece: number, now = Date.now()): GameState {
  if (state.turn.phase !== 'move' || state.turn.dice === null) throw new Error('não é hora de mover');
  if (!state.turn.legal.includes(piece)) throw new Error('movimento ilegal');

  const s = clone(state);
  s.updatedAt = now;
  const color = s.turn.color;
  const dice = s.turn.dice!;
  const me = playerOf(s, color)!;

  const from = s.pieces[color][piece];
  const to = destination(from, dice);
  s.pieces[color][piece] = to;
  s.turn.lastMoved = piece;
  log(s, { t: now, type: 'move', color, piece, from, to });

  let extra = dice === 6;

  // captura
  if (isRing(to) && !isSafe(color, to)) {
    const abs = toAbsolute(color, to);
    let captured = 0;
    for (const other of s.players) {
      if (other.color === color) continue;
      const theirs = s.pieces[other.color];
      for (let j = 0; j < theirs.length; j++) {
        if (isRing(theirs[j]) && toAbsolute(other.color, theirs[j]) === abs) {
          theirs[j] = BASE;
          captured++;
          other.stats.deaths++;
          me.stats.captures++;
          log(s, { t: now, type: 'capture', by: color, victim: other.color, piece: j, ring: abs });
        }
      }
    }
    if (captured > 0 && s.rules.captureBonus) extra = true;
  }

  // chegada
  if (to === FINISH) {
    log(s, { t: now, type: 'finish', color, piece });
    const done =
      s.rules.mode === 'quick' ? true : s.pieces[color].every((p) => p === FINISH);
    if (done) {
      if (s.rules.mode === 'quick') {
        // no Rápido as outras peças saem do tabuleiro
        s.pieces[color] = s.pieces[color].map((p) => (p === FINISH ? FINISH : BASE));
      }
      s.finished.push(color);
      log(s, { t: now, type: 'playerDone', color, place: s.finished.length });
      extra = false;
    }
  }

  if (shouldEnd(s)) return finishGame(s, 'finished', now);

  if (extra && isPlayable(s, color)) {
    s.turn = { ...s.turn, phase: 'roll', dice: null, legal: [] };
    return s;
  }
  return advanceTurn(s, now);
}

/** Encerra manualmente. `rank` = ranquear por progresso (mexe no Elo) ou só abandonar. */
export function endGame(state: GameState, rank: boolean, now = Date.now()): GameState {
  if (isOver(state)) return state;
  const s = clone(state);
  s.updatedAt = now;
  return finishGame(s, rank ? 'ranked' : 'abandoned', now);
}

// ---------------------------------------------------------------------------
// Jogadores durante a partida
// ---------------------------------------------------------------------------

export function addPlayer(state: GameState, p: NewPlayer, now = Date.now()): GameState {
  if (isOver(state)) throw new Error('partida encerrada');
  if (playerOf(state, p.color)) throw new Error('cor ocupada');
  const s = clone(state);
  s.updatedAt = now;
  s.players.push({
    color: p.color,
    playerId: p.playerId,
    name: p.name,
    avatar: p.avatar,
    status: 'active',
    joinedAt: now,
    stats: { captures: 0, deaths: 0, sixes: 0, powers: 0 },
  });
  s.players.sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
  s.pieces[p.color] = [BASE, BASE, BASE, BASE];
  return s;
}

export function removePlayer(state: GameState, color: Color, now = Date.now()): GameState {
  const s = clone(state);
  const p = playerOf(s, color);
  if (!p || p.status === 'removed') throw new Error('jogador não está na partida');
  s.updatedAt = now;
  p.status = 'removed';
  p.leftAt = now;
  s.pieces[color] = [BASE, BASE, BASE, BASE];
  return afterAvailabilityChange(s, color, now);
}

export function pausePlayer(state: GameState, color: Color, now = Date.now()): GameState {
  const s = clone(state);
  const p = playerOf(s, color);
  if (!p || p.status !== 'active') throw new Error('jogador não está ativo');
  s.updatedAt = now;
  p.status = 'paused';
  return afterAvailabilityChange(s, color, now);
}

export function resumePlayer(state: GameState, color: Color, now = Date.now()): GameState {
  const s = clone(state);
  const p = playerOf(s, color);
  if (!p || p.status !== 'paused') throw new Error('jogador não está pausado');
  s.updatedAt = now;
  p.status = 'active';
  return s;
}

/** `color` passa a ser controlada por outro jogador cadastrado. Quem saiu conta como último. */
export function substitutePlayer(
  state: GameState,
  color: Color,
  replacement: { playerId: string; name: string; avatar: string },
  now = Date.now(),
): GameState {
  const s = clone(state);
  const p = playerOf(s, color);
  if (!p || p.status === 'removed') throw new Error('jogador não está na partida');
  s.updatedAt = now;
  s.substituted = s.substituted ?? [];
  s.substituted.push({ playerId: p.playerId, name: p.name, avatar: p.avatar, color, leftAt: now });
  p.playerId = replacement.playerId;
  p.name = replacement.name;
  p.avatar = replacement.avatar;
  p.joinedAt = now;
  p.stats = { captures: 0, deaths: 0, sixes: 0, powers: 0 };
  if (p.status === 'paused') p.status = 'active';
  return s;
}

/** Se o jogador da vez deixou de estar disponível, a vez passa; se sobrou um, acaba. */
function afterAvailabilityChange(s: GameState, color: Color, now: number): GameState {
  if (isOver(s)) return s;
  if (shouldEnd(s)) return finishGame(s, 'finished', now);
  if (s.turn.color === color && !isPlayable(s, color)) return advanceTurn(s, now);
  return s;
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

function advanceTurn(s: GameState, now: number): GameState {
  const next = nextColor(s, s.turn.color);
  s.turn = freshTurn(next);
  log(s, { t: now, type: 'turn', color: next });
  return s;
}

/** Acaba quando resta no máximo um jogador ativo que ainda não terminou. */
function shouldEnd(s: GameState): boolean {
  const racing = s.players.filter((p) => p.status === 'active' && !isFinishedPlayer(s, p.color));
  return racing.length <= 1;
}

function finishGame(s: GameState, reason: EndReason, now: number): GameState {
  s.placements = reason === 'abandoned' ? null : computePlacements(s);
  s.endReason = reason;
  s.turn = { ...s.turn, phase: 'over', dice: null, legal: [] };
  log(s, { t: now, type: 'gameOver', placements: s.placements, reason });
  return s;
}

/**
 * Colocação final:
 *  1. quem terminou, na ordem de chegada
 *  2. quem não terminou (ativo ou pausado), por progresso
 *  3. quem foi removido, do último a sair pro primeiro
 */
export function computePlacements(s: GameState): Color[] {
  const done = [...s.finished];
  const racing = s.players
    .filter((p) => p.status !== 'removed' && !isFinishedPlayer(s, p.color))
    .map((p) => p.color)
    .sort((a, b) => scoreOf(s, b) - scoreOf(s, a) || COLORS.indexOf(a) - COLORS.indexOf(b));
  const removed = s.players
    .filter((p) => p.status === 'removed')
    .sort((a, b) => (b.leftAt ?? 0) - (a.leftAt ?? 0))
    .map((p) => p.color);
  return [...done, ...racing, ...removed];
}

/** Peças no centro pesam mais que distância percorrida. */
function scoreOf(s: GameState, color: Color): number {
  const pieces = s.pieces[color];
  const home = pieces.filter((p) => p === FINISH).length;
  const dist = pieces.reduce((acc, p) => acc + (p === BASE ? 0 : p + 1), 0);
  return home * 1000 + dist;
}

function log(s: GameState, e: GameEvent): void {
  s.log.push(e);
}

/**
 * Cópia profunda do estado. Feita à mão (e não com structuredClone) porque o
 * estado pode chegar embrulhado num Proxy reativo da UI, que structuredClone
 * não aceita. O GameState é só JSON (objetos, arrays, números, strings).
 */
function clone<T>(x: T): T {
  if (Array.isArray(x)) return x.map(clone) as unknown as T;
  if (x !== null && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as object)) out[k] = clone((x as Record<string, unknown>)[k]);
    return out as T;
  }
  return x;
}
