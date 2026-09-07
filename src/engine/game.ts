/**
 * Motor de regras — Clássico (fase 1) e Poderes (fase 3).
 *
 * Todas as funções recebem um GameState e devolvem um GameState NOVO.
 * Nunca mutam o argumento. Nada aqui toca DOM, Svelte ou Three.js.
 */
import {
  BASE,
  COLORS,
  FINISH,
  type BlastPower,
  type Color,
  type EndReason,
  type GameEvent,
  type GameState,
  type PlayerSlot,
  type Power,
  type Rules,
  type Turn,
} from './types';
import { SAFE_ABS, isRing, progressOf, toAbsolute } from './board';
import { nextInt, randomSeed } from './rng';
import {
  MEGA_BOMB_RADIUS,
  REFILL_AT,
  ROCKET_RANGE,
  SPRING_RANGE,
  clearEffects,
  effectsOf,
  hasPowers,
  isBurning,
  isFrozen,
  peekEffects,
  pendingOf,
  piecesAt,
  placePowers,
  powerAt,
  removeCell,
  ringDistance,
  sameSide,
} from './powers';

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

  const state: GameState = {
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
  if (hasPowers(state.rules)) {
    state.rules.disabledPowers = [...(cfg.rules.disabledPowers ?? [])];
    state.powers = { cells: [], effects: {}, pending: {} };
    placePowers(state);
  }
  return state;
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
    if (isFrozen(state, color, i)) continue;
    if (p === BASE) {
      if (dice === 6) legal.push(i);
      continue;
    }
    if (p + dice <= FINISH) legal.push(i);
  }
  return legal;
}

/** Fase 'pick' (dado personalizável): valores de 1 a 6 que a peça consegue andar. */
export function legalPicks(state: GameState): number[] {
  if (state.turn.phase !== 'pick' || state.turn.pick === undefined) return [];
  const pos = state.pieces[state.turn.color][state.turn.pick];
  if (pos === BASE || pos === FINISH) return [];
  const out: number[] = [];
  for (let v = 1; v <= 6; v++) if (pos + v <= FINISH) out.push(v);
  return out;
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

  // multiplicador ×2/×3 armado pra esta vez: a peça dona anda dado × fator
  const pend = pendingOf(s, color);
  if (pend?.armed) {
    delete s.powers!.pending[color];
    const pos = s.pieces[color][pend.piece];
    const ok =
      pos !== BASE && pos !== FINISH && !isFrozen(s, color, pend.piece) && pos + value * pend.factor <= FINISH;
    if (ok) {
      log(s, { t: now, type: 'roll', color, value, mult: pend.factor });
      // um 6 multiplicado não dá jogada extra nem conta pros três 6
      s.turn = { ...s.turn, phase: 'move', dice: value, legal: [pend.piece], mult: pend.factor };
      return s;
    }
    log(s, { t: now, type: 'roll', color, value });
    log(s, { t: now, type: 'multLost', color, piece: pend.piece, factor: pend.factor, reason: 'overshoot' });
  } else {
    log(s, { t: now, type: 'roll', color, value });
  }

  // três 6 seguidos: última peça movida volta pra base e perde a vez
  if (value === 6 && s.turn.sixStreak + 1 >= 3) {
    const penalized = threeSixes(s, color, now);
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
  const mult = s.turn.mult;

  const from = s.pieces[color][piece];
  s.turn.lastMoved = piece;
  const out = walk(s, color, piece, destination(from, dice * (mult ?? 1)), 'dice', now);

  let extra = mult ? false : dice === 6;
  if (out.captured > 0 && s.rules.captureBonus) extra = true;
  return endOfMove(s, color, out, extra, now);
}

/** Dado personalizável: o jogador escolhe `value` (1–6) e a peça marcada anda na hora. */
export function pick(state: GameState, value: number, now = Date.now()): GameState {
  if (state.turn.phase !== 'pick' || state.turn.pick === undefined) throw new Error('não é hora de escolher');
  if (!legalPicks(state).includes(value)) throw new Error('valor inválido');

  const s = clone(state);
  s.updatedAt = now;
  const color = s.turn.color;
  const piece = s.turn.pick!;
  const me = playerOf(s, color)!;
  const from = s.pieces[color][piece];

  if (value === 6) me.stats.sixes++;
  log(s, { t: now, type: 'pick', color, piece, value });
  let extra = s.turn.extra ?? false;
  s.turn = { ...s.turn, phase: 'move', dice: value, legal: [piece], pick: undefined, extra: undefined, lastMoved: piece };

  // o número escolhido vale como um dado: 6 conta pros três 6
  if (value === 6 && s.turn.sixStreak + 1 >= 3) {
    const penalized = threeSixes(s, color, now);
    log(s, { t: now, type: 'threeSixes', color, piece: penalized });
    refill(s, now);
    return advanceTurn(s, now);
  }
  s.turn.sixStreak = value === 6 ? s.turn.sixStreak + 1 : 0;

  const out = walk(s, color, piece, from + value, 'dice', now);
  if (value === 6) extra = true;
  if (out.captured > 0 && s.rules.captureBonus) extra = true;
  return endOfMove(s, color, out, extra, now);
}

/** Fecha uma jogada: espera escolha, repovoa casas, encerra ou passa a vez. */
function endOfMove(s: GameState, color: Color, out: Outcome, extra: boolean, now: number): GameState {
  if (out.picking) {
    s.turn = { ...s.turn, phase: 'pick', legal: [], mult: undefined, extra };
    return s;
  }
  refill(s, now);
  if (shouldEnd(s)) return finishGame(s, 'finished', now);
  if (extra && isPlayable(s, color)) {
    s.turn = { ...s.turn, phase: 'roll', dice: null, legal: [], mult: undefined, pick: undefined, extra: undefined };
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
  if (s.powers) {
    delete s.powers.effects[color];
    delete s.powers.pending[color];
  }
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
  beginTurn(s, next, now);
  return s;
}

/** Início da vez de `color`: contadores de gelo/fogo caem, multiplicador arma. */
function beginTurn(s: GameState, color: Color, now: number): void {
  const p = s.powers;
  if (!p) return;
  const fx = p.effects[color];
  if (fx) {
    for (let i = 0; i < fx.length; i++) {
      const e = fx[i];
      if (!e) continue;
      if (e.frozen) e.frozen--;
      if (e.fire) {
        e.fire--;
        if (!e.fire) log(s, { t: now, type: 'fireOut', color, piece: i, reason: 'expired' });
      }
    }
  }
  const pend = p.pending[color];
  if (pend) pend.armed = true;
}

/** Penalidade dos três 6: última peça movida volta pra base. Devolve a peça punida. */
function threeSixes(s: GameState, color: Color, now: number): number | null {
  const piece = s.turn.lastMoved;
  if (piece === null) return null;
  const pos = s.pieces[color][piece];
  if (pos === BASE || pos === FINISH) return null;
  sendHome(s, color, piece, now);
  return piece;
}

// ---------------------------------------------------------------------------
// Movimento e pouso (compartilhado por dado, dado personalizável e voos)
// ---------------------------------------------------------------------------

interface Outcome {
  /** Adversários comidos por pouso ou fogo (pra jogada extra opcional). */
  captured: number;
  /** Parou numa casa de dado personalizável: espera a escolha. */
  picking: boolean;
}

type MoveKind = 'dice' | 'fly';

/**
 * Leva a peça até `to` e resolve o pouso. Movimento de dado interage com o
 * caminho (revela minas, fogo queima); voo de foguete/mola não.
 */
function walk(s: GameState, color: Color, piece: number, to: number, kind: MoveKind, now: number): Outcome {
  const out: Outcome = { captured: 0, picking: false };
  const from = s.pieces[color][piece];
  const burning = kind === 'dice' && isBurning(s, color, piece);

  if (kind === 'dice' && from !== BASE) {
    for (let r = from + 1; r < to && isRing(r); r++) {
      const abs = toAbsolute(color, r);
      const cell = powerAt(s, abs);
      if (cell?.power === 'mine' && cell.hidden) {
        if (burning) {
          removeCell(s, abs);
          log(s, { t: now, type: 'mineDetonated', ring: abs, by: color });
        } else {
          cell.hidden = false;
          log(s, { t: now, type: 'mineRevealed', ring: abs, by: color });
        }
      }
      if (burning && !SAFE_ABS.has(abs)) burnCell(s, color, piece, abs, now, out);
    }
  }

  s.pieces[color][piece] = to;
  if (kind === 'dice') log(s, { t: now, type: 'move', color, piece, from, to });
  if (burning) {
    // o fogo é consumido por este movimento (quem foi queimado, foi)
    effectsOf(s, color, piece).fire = 0;
    log(s, { t: now, type: 'burn', color, piece, from, to });
  }

  land(s, color, piece, from, to, burning ? 'fire' : undefined, now, out);
  return out;
}

/** Fogo passando por `abs`: adversários voltam pra base; escudo quebra e a peça fica. */
function burnCell(s: GameState, color: Color, piece: number, abs: number, now: number, out: Outcome): void {
  const me = playerOf(s, color)!;
  for (const e of piecesAt(s, abs)) {
    if (sameSide(s, color, e.color)) continue;
    const fx = effectsOf(s, e.color, e.piece);
    if (fx.shield) {
      fx.shield = false;
      log(s, { t: now, type: 'shieldBreak', color: e.color, piece: e.piece, by: color, cause: 'fire' });
      continue;
    }
    sendHome(s, e.color, e.piece, now);
    playerOf(s, e.color)!.stats.deaths++;
    me.stats.captures++;
    out.captured++;
    log(s, { t: now, type: 'capture', by: color, victim: e.color, piece: e.piece, ring: abs, how: 'fire' });
  }
}

/** Pouso em `to`: escudo/captura, chegada, casa de poder (com cadeia). */
function land(
  s: GameState,
  color: Color,
  piece: number,
  from: number,
  to: number,
  how: 'fire' | undefined,
  now: number,
  out: Outcome,
): void {
  const me = playerOf(s, color)!;

  if (isRing(to)) {
    const abs = toAbsolute(color, to);
    if (!SAFE_ABS.has(abs)) {
      const enemies = piecesAt(s, abs).filter((e) => !sameSide(s, color, e.color));
      const shielded = enemies.find((e) => peekEffects(s, e.color, e.piece).shield);
      if (shielded) {
        // escudo absorve o ataque: some, e o atacante volta pra onde estava
        effectsOf(s, shielded.color, shielded.piece).shield = false;
        s.pieces[color][piece] = from;
        log(s, {
          t: now,
          type: 'shieldBlock',
          attacker: color,
          piece,
          defender: shielded.color,
          defenderPiece: shielded.piece,
          ring: abs,
          back: from,
        });
        return;
      }
      for (const e of enemies) {
        sendHome(s, e.color, e.piece, now);
        playerOf(s, e.color)!.stats.deaths++;
        me.stats.captures++;
        out.captured++;
        log(s, { t: now, type: 'capture', by: color, victim: e.color, piece: e.piece, ring: abs, how });
      }
    }
    const cell = powerAt(s, abs);
    if (cell) {
      removeCell(s, abs);
      me.stats.powers++;
      log(s, { t: now, type: 'power', color, piece, power: cell.power, ring: abs });
      applyPower(s, color, piece, cell.power, abs, to, now, out);
    }
    return;
  }

  // reta final ou centro: fogo apaga
  const fx = peekEffects(s, color, piece);
  if (fx.fire) {
    effectsOf(s, color, piece).fire = 0;
    log(s, { t: now, type: 'fireOut', color, piece, reason: 'stretch' });
  }
  if (to === FINISH) arrive(s, color, piece, now);
}

/** Peça chegou ao centro. */
function arrive(s: GameState, color: Color, piece: number, now: number): void {
  log(s, { t: now, type: 'finish', color, piece });
  clearEffects(s, color, piece);
  dropPending(s, color, piece, 'finished', now);
  const done = s.rules.mode === 'quick' ? true : s.pieces[color].every((p) => p === FINISH);
  if (done) {
    if (s.rules.mode === 'quick') {
      // no Rápido as outras peças saem do tabuleiro
      s.pieces[color] = s.pieces[color].map((p) => (p === FINISH ? FINISH : BASE));
    }
    s.finished.push(color);
    log(s, { t: now, type: 'playerDone', color, place: s.finished.length });
  }
}

function applyPower(
  s: GameState,
  color: Color,
  piece: number,
  power: Power,
  abs: number,
  pos: number,
  now: number,
  out: Outcome,
): void {
  switch (power) {
    case 'shield':
      effectsOf(s, color, piece).shield = true;
      return;
    case 'freeze': {
      const fx = effectsOf(s, color, piece);
      fx.frozen = 2;
      if (fx.fire) {
        fx.fire = 0;
        log(s, { t: now, type: 'fireOut', color, piece, reason: 'frozen' });
      }
      dropPending(s, color, piece, 'frozen', now);
      return;
    }
    case 'fire':
      effectsOf(s, color, piece).fire = 2;
      return;
    case 'x2':
    case 'x3': {
      const factor = power === 'x2' ? 2 : 3;
      const old = pendingOf(s, color);
      if (old) log(s, { t: now, type: 'multLost', color, piece: old.piece, factor: old.factor, reason: 'replaced' });
      s.powers!.pending[color] = { piece, factor, armed: false };
      return;
    }
    case 'rocket':
    case 'spring': {
      const [lo, hi] = power === 'rocket' ? ROCKET_RANGE : SPRING_RANGE;
      const r = nextInt(s.rng, lo, hi);
      s.rng = r.seed;
      const to = Math.min(pos + r.value, FINISH);
      log(s, { t: now, type: 'fly', color, piece, power, from: pos, to, n: r.value });
      const sub = walk(s, color, piece, to, 'fly', now);
      out.captured += sub.captured;
      out.picking = out.picking || sub.picking;
      return;
    }
    case 'magicDice':
      s.turn.pick = piece;
      out.picking = true;
      return;
    case 'bomb':
    case 'mine':
      log(s, { t: now, type: 'boom', by: color, piece, power, ring: abs });
      blastHit(s, color, color, piece, abs, power, now);
      return;
    case 'megaBomb': {
      log(s, { t: now, type: 'boom', by: color, piece, power, ring: abs });
      const victims: { color: Color; piece: number; abs: number }[] = [];
      for (const p of s.players) {
        if (p.status === 'removed') continue;
        const arr = s.pieces[p.color];
        for (let i = 0; i < arr.length; i++) {
          if (!isRing(arr[i])) continue;
          const a = toAbsolute(p.color, arr[i]);
          if (ringDistance(a, abs) <= MEGA_BOMB_RADIUS) victims.push({ color: p.color, piece: i, abs: a });
        }
      }
      for (const v of victims) blastHit(s, color, v.color, v.piece, v.abs, power, now);
      return;
    }
  }
}

/** Explosão atinge uma peça: escudo absorve; senão volta pra base (casa segura não protege). */
function blastHit(
  s: GameState,
  by: Color,
  color: Color,
  piece: number,
  abs: number,
  cause: BlastPower,
  now: number,
): void {
  const fx = effectsOf(s, color, piece);
  if (fx.shield) {
    fx.shield = false;
    log(s, { t: now, type: 'shieldBreak', color, piece, by, cause });
    return;
  }
  sendHome(s, color, piece, now);
  playerOf(s, color)!.stats.deaths++;
  if (sameSide(s, by, color)) {
    log(s, { t: now, type: 'lost', color, piece, cause });
  } else {
    playerOf(s, by)!.stats.captures++;
    log(s, { t: now, type: 'capture', by, victim: color, piece, ring: abs, how: cause });
  }
}

/** Peça volta pra base: perde efeitos e multiplicador pendente. */
function sendHome(s: GameState, color: Color, piece: number, now: number): void {
  s.pieces[color][piece] = BASE;
  clearEffects(s, color, piece);
  dropPending(s, color, piece, 'home', now);
}

function dropPending(
  s: GameState,
  color: Color,
  piece: number,
  reason: 'home' | 'frozen' | 'finished',
  now: number,
): void {
  const pend = pendingOf(s, color);
  if (!pend || pend.piece !== piece) return;
  delete s.powers!.pending[color];
  log(s, { t: now, type: 'multLost', color, piece, factor: pend.factor, reason });
}

/** Sobrando poucas casas de poder, repovoa pra 10. */
function refill(s: GameState, now: number): void {
  if (!s.powers || s.powers.cells.length > REFILL_AT) return;
  const added = placePowers(s);
  if (added.length) log(s, { t: now, type: 'repopulate', rings: added });
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
