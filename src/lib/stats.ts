/**
 * Estatísticas derivadas do histórico (funções puras, sem Svelte).
 * A classificação legada por vitórias continua exportada para comparativos e
 * backups antigos; a UI principal usa `lib/elo.ts` desde a fase 6.
 */
import type { Color, GameState, Mode, PlayerSlot } from '../engine/types';

/** Colocação (1-based) de uma cor na partida, ou null se não contou. */
export function placeOf(game: GameState, color: Color): number | null {
  if (!game.placements) return null;
  const i = game.placements.indexOf(color);
  return i < 0 ? null : i + 1;
}

/** Slot vencedor (1º colocado), se a partida contou. */
export function winnerOf(game: GameState): PlayerSlot | undefined {
  const c = game.placements?.[0];
  if (!c) return undefined;
  return game.players.find((p) => p.color === c);
}

/** Jogadores que participaram (inclui quem saiu por substituição). */
export function participantsOf(game: GameState): { playerId: string; name: string; avatar: string; color: Color }[] {
  const out = game.players.map((p) => ({ playerId: p.playerId, name: p.name, avatar: p.avatar, color: p.color }));
  for (const s of game.substituted ?? []) out.push({ playerId: s.playerId, name: s.name, avatar: s.avatar, color: s.color });
  return out;
}

export interface Standing {
  playerId: string;
  /** Nome/avatar da partida mais recente (a UI prefere o cadastro atual). */
  name: string;
  avatar: string;
  games: number;
  wins: number;
  /** Soma das colocações (pra média). */
  placeSum: number;
  captures: number;
  deaths: number;
  lastAt: number;
}

export type Period = 'week' | 'month' | 'year' | 'all';

export const PERIOD_MS: Record<Period, number | null> = {
  week: 7 * 86400000,
  month: 30 * 86400000,
  year: 365 * 86400000,
  all: null,
};

/**
 * Classificação por vitórias (desempate: % de vitórias, depois colocação média,
 * depois partidas). Só partidas que contaram (`placements` preenchido).
 */
export function standings(games: readonly GameState[], mode?: Mode | null, since?: number | null): Standing[] {
  const map = new Map<string, Standing>();
  for (const g of games) {
    if (!g.placements) continue;
    if (mode && g.rules.mode !== mode) continue;
    if (since && g.updatedAt < since) continue;
    const n = g.placements.length;
    const seen = new Set<string>();
    for (const p of g.players) {
      const place = placeOf(g, p.color);
      if (place === null || seen.has(p.playerId)) continue;
      seen.add(p.playerId);
      bump(map, p.playerId, p.name, p.avatar, g.updatedAt, place, p.stats.captures, p.stats.deaths);
    }
    for (const s of g.substituted ?? []) {
      if (seen.has(s.playerId)) continue;
      seen.add(s.playerId);
      bump(map, s.playerId, s.name, s.avatar, g.updatedAt, n, 0, 0);
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.wins / b.games - a.wins / a.games ||
      a.placeSum / a.games - b.placeSum / b.games ||
      b.games - a.games ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}

function bump(
  map: Map<string, Standing>,
  id: string,
  name: string,
  avatar: string,
  at: number,
  place: number,
  captures: number,
  deaths: number,
): void {
  const cur = map.get(id) ?? { playerId: id, name, avatar, games: 0, wins: 0, placeSum: 0, captures: 0, deaths: 0, lastAt: 0 };
  cur.games++;
  cur.placeSum += place;
  if (place === 1) cur.wins++;
  cur.captures += captures;
  cur.deaths += deaths;
  if (at >= cur.lastAt) {
    cur.lastAt = at;
    cur.name = name;
    cur.avatar = avatar;
  }
  map.set(id, cur);
}

/** Modo com mais partidas ranqueadas (empate: o mais recente). */
export function mostPlayedMode(games: readonly GameState[]): Mode | null {
  const count = new Map<Mode, { n: number; last: number }>();
  for (const g of games) {
    if (!g.placements) continue;
    const c = count.get(g.rules.mode) ?? { n: 0, last: 0 };
    c.n++;
    c.last = Math.max(c.last, g.updatedAt);
    count.set(g.rules.mode, c);
  }
  let best: Mode | null = null;
  let bestN = -1;
  let bestLast = -1;
  for (const [m, c] of count) {
    if (c.n > bestN || (c.n === bestN && c.last > bestLast)) {
      best = m;
      bestN = c.n;
      bestLast = c.last;
    }
  }
  return best;
}

/** Modos que já apareceram no histórico (pra o seletor do ranking). */
export function modesPlayed(games: readonly GameState[]): Mode[] {
  const set = new Set<Mode>();
  for (const g of games) if (g.placements) set.add(g.rules.mode);
  return [...set];
}
