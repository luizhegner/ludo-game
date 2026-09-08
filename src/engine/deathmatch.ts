/**
 * Deathmatch — tempo real, sem turnos (SPEC §4).
 *
 * Cada jogador tem o seu próprio ciclo permanente rola → move → rola…, guardado
 * em `state.dm.players[cor]`. O `turn` global do GameState não é usado aqui
 * (fica como `phase:'roll'` do primeiro jogador só por compatibilidade com o
 * resto do app; `phase:'over'` continua marcando o fim).
 *
 * Regras:
 * - 6 tira peça da base OU anda 6; sem jogada extra, sem regra dos três 6.
 * - Peças dão a volta no anel (0..51) indefinidamente: sem reta final, sem centro.
 * - Comer = adversário volta pra base (+1 captura). Vence quem chegar a
 *   `target` capturas; no fim do tempo, quem tiver mais (desempate: menos mortes).
 * - Casa segura protege por no máximo DM_SAFE_MS seguidos (tempo de jogo);
 *   depois a peça fica vulnerável ATÉ MOVER. Exceção: o canhão de cada base
 *   abate na hora qualquer adversário que parar na ESTRELA da cor dele
 *   (conta como captura do dono do canhão).
 * - As ações são resolvidas na ordem em que chegam ao motor (a UI chama
 *   `dmRoll` quando o dado para e `dmMove` quando o jogador escolhe). Captura
 *   é avaliada no pouso: se a vítima "já saiu" (moveu antes), ninguém come.
 *
 * Todas as funções recebem um GameState e devolvem um GameState NOVO.
 */
import { BASE, COLORS, RING, type Color, type DmPlayer, type GameEvent, type GameState } from './types';
import { SAFE_ABS, STAR_ABS, toAbsolute } from './board';
import { nextInt } from './rng';
import { elapsedMs, isOver, isTimeUp, playerOf } from './game';

/** Capturas pra vencer. */
export const DM_TARGET = 8;
/** Quanto tempo (de jogo) uma casa segura protege uma peça parada nela. */
export const DM_SAFE_MS = 15_000;

export function isDeathmatch(s: GameState): boolean {
  return s.rules.mode === 'deathmatch' && !!s.dm;
}

/** Estado do ciclo de `color` (rola/move). */
export function dmPlayer(s: GameState, color: Color): DmPlayer | undefined {
  return s.dm?.players[color];
}

/** `color` pode agir agora (está na partida, ativo, e a partida não acabou)? */
export function dmCanAct(s: GameState, color: Color): boolean {
  if (!isDeathmatch(s) || isOver(s)) return false;
  const p = playerOf(s, color);
  return !!p && p.status === 'active' && !!s.dm!.players[color];
}

/** Índices das peças de `color` que podem andar `dice` casas (base só com 6; no anel sempre pode). */
export function dmLegalMoves(s: GameState, color: Color, dice: number): number[] {
  const legal: number[] = [];
  const pieces = s.pieces[color];
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i] === BASE) {
      if (dice === 6) legal.push(i);
    } else legal.push(i);
  }
  return legal;
}

/** Destino no anel (dá a volta). */
export function dmDestination(pos: number, dice: number): number {
  return pos === BASE ? 0 : (pos + dice) % RING;
}

/**
 * Situação de proteção de uma peça parada em casa segura, em `now` (relógio de
 * parede; convertido pra tempo de jogo internamente):
 *  - null: não está em casa segura (ou está na base)
 *  - { remaining }: ms de proteção restantes (0 = vulnerável até mover)
 */
export function dmSafeStatus(s: GameState, color: Color, piece: number, now = Date.now()): { remaining: number } | null {
  if (!isDeathmatch(s)) return null;
  const pos = s.pieces[color][piece];
  if (pos === BASE) return null;
  if (!SAFE_ABS.has(toAbsolute(color, pos))) return null;
  const since = s.dm!.safeSince[color]?.[piece];
  if (since === null || since === undefined) return { remaining: 0 };
  return { remaining: Math.max(0, DM_SAFE_MS - (elapsedMs(s, now) - since)) };
}

/** A peça está protegida neste instante (casa segura dentro do prazo)? */
export function dmIsProtected(s: GameState, color: Color, piece: number, now = Date.now()): boolean {
  const st = dmSafeStatus(s, color, piece, now);
  return !!st && st.remaining > 0;
}

/** Rola o dado de `color`. `forced` = valor injetado (dado físico / testes). */
export function dmRoll(state: GameState, color: Color, forced?: number, now = Date.now()): GameState {
  if (!dmCanAct(state, color)) throw new Error('jogador não pode agir');
  const me = state.dm!.players[color]!;
  if (me.phase !== 'roll') throw new Error('não é hora de rolar');
  if (isTimeUp(state, now)) throw new Error('tempo esgotado');
  if (forced !== undefined && (forced < 1 || forced > 6 || !Number.isInteger(forced))) throw new Error('valor de dado inválido');

  const s = clone(state);
  s.updatedAt = now;
  let value: number;
  if (forced !== undefined) value = forced;
  else {
    const r = nextInt(s.rng, 1, 6);
    s.rng = r.seed;
    value = r.value;
  }
  const slot = playerOf(s, color)!;
  if (value === 6) slot.stats.sixes++;
  // relógio: começa no primeiro lançamento de qualquer um; rebaseia a cada lançamento
  if (s.clock) s.clock = { elapsedMs: elapsedMs(state, now), runningSince: now };

  log(s, { t: now, type: 'roll', color, value });
  const legal = dmLegalMoves(s, color, value);
  if (legal.length === 0) {
    log(s, { t: now, type: 'noMoves', color, value });
    s.dm!.players[color] = { phase: 'roll', dice: null, legal: [] };
    return s;
  }
  s.dm!.players[color] = { phase: 'move', dice: value, legal };
  return s;
}

/** Move a peça `piece` de `color` com o dado já rolado; resolve captura, canhão e vitória. */
export function dmMove(state: GameState, color: Color, piece: number, now = Date.now()): GameState {
  if (!dmCanAct(state, color)) throw new Error('jogador não pode agir');
  const me = state.dm!.players[color]!;
  if (me.phase !== 'move' || me.dice === null) throw new Error('não é hora de mover');
  if (!me.legal.includes(piece)) throw new Error('movimento ilegal');

  // a lista `legal` foi calculada na hora do lançamento; a peça pode ter sido
  // comida (ou um canhão a devolvido) nesse meio-tempo → revalida agora
  if (!dmLegalMoves(state, color, me.dice).includes(piece)) throw new Error('movimento ilegal');

  const s = clone(state);
  s.updatedAt = now;
  const from = s.pieces[color][piece];
  const to = dmDestination(from, me.dice);
  const game = elapsedMs(s, now);

  s.pieces[color][piece] = to;
  log(s, { t: now, type: 'move', color, piece, from, to });
  s.dm!.players[color] = { phase: 'roll', dice: null, legal: [] };

  const abs = toAbsolute(color, to);
  const safe = SAFE_ABS.has(abs);
  const slot = playerOf(s, color)!;

  // canhão: parou na estrela de OUTRA cor presente → abatida na hora
  const owner = (Object.keys(STAR_ABS) as Color[]).find((c) => STAR_ABS[c] === abs);
  if (owner && owner !== color) {
    const op = playerOf(s, owner);
    if (op && op.status !== 'removed') {
      s.pieces[color][piece] = BASE;
      setSafe(s, color, piece, null);
      slot.stats.deaths++;
      op.stats.captures++;
      log(s, { t: now, type: 'cannon', by: owner, victim: color, piece, ring: abs });
      return finishIfWon(s, owner, now);
    }
  }

  // captura: adversários na casa; em casa segura, só quem já perdeu a proteção
  for (const c of COLORS) {
    if (c === color) continue;
    const p = playerOf(s, c);
    if (!p || p.status === 'removed') continue;
    const arr = s.pieces[c];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === BASE || toAbsolute(c, arr[i]) !== abs) continue;
      if (safe) {
        const since = s.dm!.safeSince[c]?.[i];
        const protectedNow = since !== null && since !== undefined && game - since < DM_SAFE_MS;
        if (protectedNow) continue;
      }
      arr[i] = BASE;
      setSafe(s, c, i, null);
      p.stats.deaths++;
      slot.stats.captures++;
      log(s, { t: now, type: 'capture', by: color, victim: c, piece: i, ring: abs });
    }
  }

  // marca (ou zera) a proteção da peça que acabou de parar
  setSafe(s, color, piece, safe ? game : null);
  refreshCycles(s);
  return finishIfWon(s, color, now);
}

/**
 * Depois de capturas: quem estava escolhendo a peça pode ter perdido opções
 * (peça comida com dado ≠ 6). Recalcula; sem opção, volta a rolar.
 */
function refreshCycles(s: GameState): void {
  for (const c of Object.keys(s.dm!.players) as Color[]) {
    const st = s.dm!.players[c]!;
    if (st.phase !== 'move' || st.dice === null) continue;
    const legal = dmLegalMoves(s, c, st.dice);
    s.dm!.players[c] = legal.length ? { ...st, legal } : { phase: 'roll', dice: null, legal: [] };
  }
}

/**
 * Fecha por tempo (chamado pela UI quando o relógio zera): colocação por
 * capturas, desempate por menos mortes.
 */
export function dmTimeUp(state: GameState, now = Date.now()): GameState {
  if (!isDeathmatch(state) || !isTimeUp(state, now)) return state;
  const s = clone(state);
  s.updatedAt = now;
  s.clock = { elapsedMs: s.rules.durationMs ?? 0, runningSince: null };
  return finish(s, 'time', now);
}

/** Encerrar manualmente (`rank` = conta pro ranking pelas capturas atuais). */
export function dmEndGame(state: GameState, rank: boolean, now = Date.now()): GameState {
  if (isOver(state)) return state;
  const s = clone(state);
  s.updatedAt = now;
  if (s.clock) s.clock = { elapsedMs: elapsedMs(state, now), runningSince: null };
  return finish(s, rank ? 'ranked' : 'abandoned', now);
}

/** Colocação: capturas (desc.), menos mortes, depois ordem de cor. Removidos por último. */
export function dmPlacements(s: GameState): Color[] {
  const inGame = s.players.filter((p) => p.status !== 'removed');
  const removed = s.players.filter((p) => p.status === 'removed').sort((a, b) => (b.leftAt ?? 0) - (a.leftAt ?? 0));
  inGame.sort(
    (a, b) =>
      b.stats.captures - a.stats.captures ||
      a.stats.deaths - b.stats.deaths ||
      COLORS.indexOf(a.color) - COLORS.indexOf(b.color),
  );
  return [...inGame, ...removed].map((p) => p.color);
}

/** Depois de remover/pausar alguém: se sobrou um ativo, acaba. */
export function dmAfterAvailabilityChange(state: GameState, now = Date.now()): GameState {
  if (!isDeathmatch(state) || isOver(state)) return state;
  const active = state.players.filter((p) => p.status === 'active');
  if (active.length <= 1) {
    const s = clone(state);
    s.updatedAt = now;
    return finish(s, 'finished', now);
  }
  // quem saiu perde o ciclo (as peças já voltaram pra base em removePlayer);
  // quem voltou (resume) ou entrou ganha um ciclo novo
  const s = clone(state);
  for (const p of s.players) {
    if (p.status === 'removed') {
      delete s.dm!.players[p.color];
      delete s.dm!.safeSince[p.color];
    } else if (!s.dm!.players[p.color]) {
      s.dm!.players[p.color] = { phase: 'roll', dice: null, legal: [] };
    }
  }
  return s;
}

// ---------------------------------------------------------------------------

function finishIfWon(s: GameState, color: Color, now: number): GameState {
  const p = playerOf(s, color)!;
  if (p.stats.captures >= s.dm!.target) return finish(s, 'finished', now);
  return s;
}

function finish(s: GameState, reason: 'finished' | 'time' | 'ranked' | 'abandoned', now: number): GameState {
  s.placements = reason === 'abandoned' ? null : dmPlacements(s);
  s.endReason = reason;
  s.turn = { ...s.turn, phase: 'over', dice: null, legal: [] };
  for (const c of Object.keys(s.dm!.players) as Color[]) s.dm!.players[c] = { phase: 'roll', dice: null, legal: [] };
  log(s, { t: now, type: 'gameOver', placements: s.placements, reason });
  return s;
}

function setSafe(s: GameState, color: Color, piece: number, at: number | null): void {
  const arr = (s.dm!.safeSince[color] ??= [null, null, null, null]);
  arr[piece] = at;
}

function log(s: GameState, e: GameEvent): void {
  s.log.push(e);
}

function clone<T>(x: T): T {
  if (Array.isArray(x)) return x.map(clone) as unknown as T;
  if (x !== null && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as object)) out[k] = clone((x as Record<string, unknown>)[k]);
    return out as T;
  }
  return x;
}
