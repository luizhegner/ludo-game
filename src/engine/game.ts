/**
 * Motor de regras — Clássico (fase 1), Poderes (fase 3), 5 Minutos e 2v2 (fase 4).
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
  DEFAULT_DURATION_MS,
  MEGA_BOMB_RADIUS,
  REFILL_AT,
  ROCKET_RANGE,
  SPRING_MAX_STRETCH,
  clearEffects,
  effectsOf,
  hasPowers,
  hasTeams,
  isTimed,
  partnerOf,
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

  if (hasTeams(cfg.rules) && players.length !== 4) throw new Error('2v2 precisa de exatamente 4 jogadores');

  const pieces = {} as Record<Color, number[]>;
  // 5 Minutos: todas as peças começam fora, empilhadas na casa de saída
  const startPos = cfg.rules.mode === 'fiveMin' ? 0 : BASE;
  for (const p of players) pieces[p.color] = [startPos, startPos, startPos, startPos];

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
    state.rules.visibleMines = !!cfg.rules.visibleMines;
    state.powers = { cells: [], effects: {}, pending: {} };
    placePowers(state);
  }
  if (isTimed(state.rules)) {
    state.rules.durationMs = cfg.rules.durationMs ?? DEFAULT_DURATION_MS;
    // o cronômetro só começa no primeiro lançamento (startClock)
    state.clock = { elapsedMs: 0, runningSince: null };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Cronômetro (5 Minutos / Deathmatch)
// ---------------------------------------------------------------------------

/** Tempo de jogo consumido até `now`, em ms (0 nos modos sem cronômetro). */
export function elapsedMs(state: GameState, now = Date.now()): number {
  const c = state.clock;
  if (!c) return 0;
  return c.elapsedMs + (c.runningSince !== null ? Math.max(0, now - c.runningSince) : 0);
}

/** Tempo restante em ms (0 quando acabou; Infinity nos modos sem cronômetro). */
export function remainingMs(state: GameState, now = Date.now()): number {
  if (!state.clock) return Infinity;
  return Math.max(0, (state.rules.durationMs ?? DEFAULT_DURATION_MS) - elapsedMs(state, now));
}

/** Cronômetro acabou (ainda que a partida não tenha sido fechada por `timeUp`). */
export function isTimeUp(state: GameState, now = Date.now()): boolean {
  return !!state.clock && !isOver(state) && remainingMs(state, now) <= 0;
}

/** Começa/retoma a contagem (primeiro lançamento, volta do menu). */
export function startClock(state: GameState, now = Date.now()): GameState {
  if (!state.clock || isOver(state) || state.clock.runningSince !== null) return state;
  const s = clone(state);
  s.clock!.runningSince = now;
  return s;
}

/** Pausa a contagem (menu aberto, app em segundo plano). */
export function pauseClock(state: GameState, now = Date.now()): GameState {
  if (!state.clock || state.clock.runningSince === null) return state;
  const s = clone(state);
  s.clock = { elapsedMs: elapsedMs(state, now), runningSince: null };
  return s;
}

/**
 * Fecha a partida por tempo: colocação por peças no centro, desempate por
 * progresso total (SPEC §4). Se o tempo ainda não acabou, devolve o mesmo estado.
 */
export function timeUp(state: GameState, now = Date.now()): GameState {
  if (!isTimeUp(state, now)) return state;
  const s = clone(state);
  s.updatedAt = now;
  s.clock = { elapsedMs: s.rules.durationMs ?? DEFAULT_DURATION_MS, runningSince: null };
  return finishGame(s, 'time', now);
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

/**
 * Cor de quem controla a vez de `color`: a própria ou, no 2v2, o parceiro
 * quando `color` saiu da partida (o parceiro assume as peças dele).
 */
export function controllerOf(state: GameState, color: Color): Color {
  const p = playerOf(state, color);
  if (p && p.status === 'removed' && hasTeams(state.rules)) return partnerOf(color);
  return color;
}

/** Quem está jogando agora (no 2v2 pode ser o parceiro de `turn.color`). */
export function currentPlayer(state: GameState): PlayerSlot | undefined {
  return playerOf(state, controllerOf(state, state.turn.color));
}

export function isFinishedPlayer(state: GameState, color: Color): boolean {
  return state.finished.includes(color);
}

/**
 * Pode receber a vez: está na partida, ativo e ainda não terminou.
 * No 2v2, quem já terminou as 4 peças continua jogando com as do parceiro
 * enquanto o parceiro tiver peças em jogo.
 */
export function isPlayable(state: GameState, color: Color): boolean {
  const p = playerOf(state, color);
  if (!p) return false;
  if (hasTeams(state.rules)) {
    const partner = playerOf(state, partnerOf(color));
    if (p.status === 'removed') {
      // quem saiu deixa a vez (e as peças) pro parceiro, enquanto a dupla não terminou
      return !!partner && partner.status === 'active' && !teamDone(state, color);
    }
    if (p.status !== 'active') return false;
    if (!isFinishedPlayer(state, color)) return true;
    // terminou as suas: joga com as do parceiro enquanto ele tiver peças em jogo
    return !!partner && !isFinishedPlayer(state, partnerOf(color));
  }
  return p.status === 'active' && !isFinishedPlayer(state, color);
}

/**
 * Cor cujas peças `color` move na vez dela: a própria, ou a do parceiro
 * (2v2, quando já terminou as suas). Cor removida deixa as peças pro parceiro.
 */
export function piecesColorFor(state: GameState, color: Color): Color {
  if (hasTeams(state.rules) && isFinishedPlayer(state, color)) {
    const partner = partnerOf(color);
    if (playerOf(state, partner) && !isFinishedPlayer(state, partner)) return partner;
  }
  return color;
}

/** Cores do mesmo time de `color` (só a própria fora do 2v2). */
export function teamOf(state: GameState, color: Color): Color[] {
  return hasTeams(state.rules) ? [color, partnerOf(color)].filter((c) => !!playerOf(state, c)) : [color];
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
  const pos = state.pieces[piecesColorFor(state, state.turn.color)][state.turn.pick];
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
  if (isTimeUp(state, now)) throw new Error('tempo esgotado');
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

  const me = playerOf(s, controllerOf(s, color))!;
  if (value === 6) me.stats.sixes++;
  // cronômetro: começa no primeiro lançamento e é rebaseado a cada um (se o app
  // for fechado no meio, perde-se no máximo o tempo desde o último lançamento)
  if (s.clock) s.clock = { elapsedMs: elapsedMs(state, now), runningSince: now };

  const pc = piecesColorFor(s, color); // de quem são as peças que vão andar

  // multiplicador ×2/×3 armado pra esta vez: a peça dona anda dado × fator
  const pend = pendingOf(s, pc);
  if (pend?.armed) {
    delete s.powers!.pending[pc];
    const pos = s.pieces[pc][pend.piece];
    const ok =
      pos !== BASE && pos !== FINISH && !isFrozen(s, pc, pend.piece) && pos + value * pend.factor <= FINISH;
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
  const legal = legalMoves(s, pc, value);

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
  const pc = piecesColorFor(s, color);
  const dice = s.turn.dice!;
  const mult = s.turn.mult;

  const from = s.pieces[pc][piece];
  s.turn.lastMoved = piece;
  const out = walk(s, pc, piece, destination(from, dice * (mult ?? 1)), 'dice', now, controllerOf(s, color));

  let extra = mult ? false : dice === 6;
  if (out.captured > 0 && s.rules.captureBonus) extra = true;
  if (out.finished) extra = true; // chegar ao centro dá jogada extra
  return endOfMove(s, color, out, extra, now);
}

/** Dado personalizável: o jogador escolhe `value` (1–6) e a peça marcada anda na hora. */
export function pick(state: GameState, value: number, now = Date.now()): GameState {
  if (state.turn.phase !== 'pick' || state.turn.pick === undefined) throw new Error('não é hora de escolher');
  if (!legalPicks(state).includes(value)) throw new Error('valor inválido');

  const s = clone(state);
  s.updatedAt = now;
  const color = s.turn.color;
  const pc = piecesColorFor(s, color);
  const piece = s.turn.pick!;
  const me = playerOf(s, controllerOf(s, color))!;
  const from = s.pieces[pc][piece];

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

  const out = walk(s, pc, piece, from + value, 'dice', now, controllerOf(s, color));
  if (value === 6) extra = true;
  if (out.captured > 0 && s.rules.captureBonus) extra = true;
  if (out.finished) extra = true;
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
  // 2v2: o parceiro assume as peças de quem saiu (continuam no tabuleiro)
  const keep = hasTeams(s.rules) && playerOf(s, partnerOf(color))?.status !== 'removed';
  if (!keep) {
    s.pieces[color] = [BASE, BASE, BASE, BASE];
    if (s.powers) {
      delete s.powers.effects[color];
      delete s.powers.pending[color];
    }
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
  const pc = piecesColorFor(s, next);
  if (pc !== next) log(s, { t: now, type: 'partnerTurn', color: next, forPartner: pc });
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
      // o fogo não expira com o tempo: fica até queimar alguém (ver walk/burnCell)
    }
  }
  const pend = p.pending[piecesColorFor(s, color)];
  if (pend) pend.armed = true;
}

/** Penalidade dos três 6: última peça movida volta pra base. Devolve a peça punida. */
function threeSixes(s: GameState, color: Color, now: number): number | null {
  const piece = s.turn.lastMoved;
  if (piece === null) return null;
  const pc = piecesColorFor(s, color);
  const pos = s.pieces[pc][piece];
  if (pos === BASE || pos === FINISH) return null;
  sendHome(s, pc, piece, now);
  return piece;
}

// ---------------------------------------------------------------------------
// Movimento e pouso (compartilhado por dado, dado personalizável e voos)
// ---------------------------------------------------------------------------

interface Outcome {
  /** Adversários comidos por pouso ou fogo (pra jogada extra opcional). */
  captured: number;
  /** Escudos quebrados pelo fogo no caminho (consomem o fogo, mas não contam como captura). */
  shieldsBroken: number;
  /** Parou numa casa de dado personalizável: espera a escolha. */
  picking: boolean;
  /** Uma peça chegou ao centro neste movimento (dá jogada extra). */
  finished: boolean;
}

type MoveKind = 'dice' | 'fly';

/**
 * Leva a peça até `to` e resolve o pouso. Movimento de dado interage com o
 * caminho (revela minas, fogo queima); voo de foguete/mola não.
 */
function walk(
  s: GameState,
  color: Color,
  piece: number,
  to: number,
  kind: MoveKind,
  now: number,
  actor: Color = color,
): Outcome {
  const out: Outcome = { captured: 0, shieldsBroken: 0, picking: false, finished: false };
  const from = s.pieces[color][piece];
  const burning = kind === 'dice' && isBurning(s, color, piece);

  s.pieces[color][piece] = to;
  if (kind === 'dice') log(s, { t: now, type: 'move', color, piece, from, to });

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
      if (burning && !SAFE_ABS.has(abs)) burnCell(s, color, piece, abs, now, out, actor);
    }
  }

  if (burning) log(s, { t: now, type: 'burn', color, piece, from, to });

  const beforeLand = out.captured + out.shieldsBroken;
  land(s, color, piece, from, to, burning ? 'fire' : undefined, now, out, actor);
  if (burning && out.captured + out.shieldsBroken > 0 && isBurning(s, color, piece)) {
    // o fogo é consumido ao queimar alguém (no caminho ou no pouso); se ninguém queimou, continua aceso
    effectsOf(s, color, piece).fire = 0;
    log(s, { t: now, type: 'fireOut', color, piece, reason: 'burned' });
  }
  void beforeLand;
  return out;
}

/** Fogo passando por `abs`: adversários voltam pra base; escudo quebra e a peça fica. */
function burnCell(s: GameState, color: Color, piece: number, abs: number, now: number, out: Outcome, actor: Color = color): void {
  const me = playerOf(s, actor)!;
  for (const e of piecesAt(s, abs)) {
    if (sameSide(s, color, e.color)) continue;
    const fx = effectsOf(s, e.color, e.piece);
    if (fx.shield) {
      fx.shield = false;
      out.shieldsBroken++;
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
  actor: Color = color,
): void {
  const me = playerOf(s, actor)!;

  if (isRing(to)) {
    const abs = toAbsolute(color, to);
    if (!SAFE_ABS.has(abs)) {
      // 2v2: cair na casa do parceiro come normalmente (azar); só o fogo de passagem poupa o parceiro
      const enemies = piecesAt(s, abs).filter((e) => e.color !== color);
      const shielded = enemies.find((e) => peekEffects(s, e.color, e.piece).shield);
      if (shielded) {
        // escudo absorve o ataque: some, e o atacante volta pra onde estava
        effectsOf(s, shielded.color, shielded.piece).shield = false;
        if (how === 'fire') out.shieldsBroken++;
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
        if (!sameSide(s, color, e.color)) {
          me.stats.captures++;
          out.captured++;
        }
        log(s, { t: now, type: 'capture', by: color, victim: e.color, piece: e.piece, ring: abs, how });
      }
    }
    const cell = powerAt(s, abs);
    if (cell) {
      removeCell(s, abs);
      me.stats.powers++;
      log(s, { t: now, type: 'power', color, piece, power: cell.power, ring: abs });
      applyPower(s, color, piece, cell.power, abs, to, now, out, actor);
    }
    return;
  }

  // reta final ou centro: fogo apaga
  const fx = peekEffects(s, color, piece);
  if (fx.fire) {
    effectsOf(s, color, piece).fire = 0;
    log(s, { t: now, type: 'fireOut', color, piece, reason: 'stretch' });
  }
  if (to === FINISH) {
    arrive(s, color, piece, now);
    out.finished = true;
  }
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

/** 2v2: os dois da dupla já colocaram as 8 peças. */
function teamDone(s: GameState, color: Color): boolean {
  return teamOf(s, color).every((c) => isFinishedPlayer(s, c));
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
  actor: Color = color,
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
      effectsOf(s, color, piece).fire = 1;
      return;
    case 'x2':
    case 'x3': {
      const factor = power === 'x2' ? 2 : 3;
      const old = pendingOf(s, color);
      if (old) log(s, { t: now, type: 'multLost', color, piece: old.piece, factor: old.factor, reason: 'replaced' });
      s.powers!.pending[color] = { piece, factor, armed: false };
      return;
    }
    case 'rocket': {
      const r = nextInt(s.rng, ROCKET_RANGE[0], ROCKET_RANGE[1]);
      s.rng = r.seed;
      const to = Math.min(pos + r.value, FINISH);
      log(s, { t: now, type: 'fly', color, piece, power, from: pos, to, n: r.value });
      const sub = walk(s, color, piece, to, 'fly', now, actor);
      out.captured += sub.captured;
      out.picking = out.picking || sub.picking;
      out.finished = out.finished || sub.finished;
      return;
    }
    case 'spring': {
      // como no jogo original: pula até a próxima casa segura (estrela ou saída colorida);
      // se não houver nenhuma antes da reta final, entra na reta e para no máximo possível
      const to = springTarget(color, pos);
      log(s, { t: now, type: 'fly', color, piece, power, from: pos, to, n: to - pos });
      const sub = walk(s, color, piece, to, 'fly', now, actor);
      out.captured += sub.captured;
      out.picking = out.picking || sub.picking;
      out.finished = out.finished || sub.finished;
      return;
    }
    case 'magicDice':
      s.turn.pick = piece;
      out.picking = true;
      return;
    case 'bomb':
    case 'mine':
      log(s, { t: now, type: 'boom', by: color, piece, power, ring: abs });
      blastHit(s, actor, color, piece, abs, power, now);
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
      for (const v of victims) blastHit(s, actor, v.color, v.piece, v.abs, power, now);
      return;
    }
  }
}

/** Destino da mola: próxima casa segura do anel depois de `pos`; sem nenhuma, o mais longe possível na reta. */
export function springTarget(color: Color, pos: number): number {
  for (let r = pos + 1; isRing(r); r++) {
    if (SAFE_ABS.has(toAbsolute(color, r))) return r;
  }
  return Math.min(pos + SPRING_MAX_STRETCH, FINISH);
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
  if (hasTeams(s.rules)) {
    // acaba quando uma dupla colocou as 8 peças, ou quando só sobrou uma dupla ativa
    const teams = ['green', 'red'] as const;
    const alive = teams.filter((t) => teamOf(s, t).some((c) => playerOf(s, c)?.status === 'active'));
    if (alive.length <= 1) return true;
    return teams.some((t) => teamDone(s, t));
  }
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
  // quem terminou (na ordem), depois quem está em jogo por peças no centro + progresso, depois quem saiu
  if (hasTeams(s.rules)) return teamPlacements(s);
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
/**
 * 2v2: a dupla vencedora ocupa 1º e 2º, a outra 3º e 4º. Dentro da dupla,
 * quem tem mais peças no centro (depois progresso) fica na frente. Dupla
 * vence se completou as 8 peças; senão, compara soma de pontos das duas.
 */
function teamPlacements(s: GameState): Color[] {
  const teams: Color[][] = [
    ['green', 'blue'].filter((c) => playerOf(s, c as Color)) as Color[],
    ['red', 'yellow'].filter((c) => playerOf(s, c as Color)) as Color[],
  ];
  const teamScore = (t: Color[]) => (t.every((c) => isFinishedPlayer(s, c)) ? 1e6 : 0) + t.reduce((a, c) => a + scoreOf(s, c), 0);
  const teamAlive = (t: Color[]) => t.some((c) => playerOf(s, c)?.status === 'active');
  teams.sort((a, b) => Number(teamAlive(b)) - Number(teamAlive(a)) || teamScore(b) - teamScore(a));
  const out: Color[] = [];
  for (const t of teams) {
    const sorted = [...t].sort(
      (a, b) =>
        Number(playerOf(s, b)!.status !== 'removed') - Number(playerOf(s, a)!.status !== 'removed') ||
        scoreOf(s, b) - scoreOf(s, a) ||
        COLORS.indexOf(a) - COLORS.indexOf(b),
    );
    out.push(...sorted);
  }
  return out;
}

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
