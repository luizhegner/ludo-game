/**
 * Elo derivado do histórico.
 *
 * O histórico é a única fonte de verdade: não guardamos rating em
 * localStorage. Sempre que a tela precisa de um Elo, as partidas daquele modo
 * são replayadas em ordem cronológica. Isso também torna backup/importação e
 * a troca de aparelho determinísticos.
 */
import type { Color, GameState, Mode, PlayerSlot } from '../engine/types';
import { COLORS } from '../engine/types';

export const ELO_INITIAL = 1000;
export const ELO_K = 32;
export const ELO_SCALE = 400;
/** Nomes alternativos usados por integrações/versões anteriores. */
export const INITIAL_ELO = ELO_INITIAL;
export const K_FACTOR = ELO_K;

/** Modos com Elo próprio (na mesma ordem em que aparecem no assistente). */
export const ELO_MODES: readonly Mode[] = [
  'classic',
  'powers',
  'team',
  'teamPowers',
  'quick',
  'fiveMin',
  'deathmatch',
] as const;

const TEAM_OF: Record<Color, 'A' | 'B'> = {
  green: 'A',
  blue: 'A',
  red: 'B',
  yellow: 'B',
};

export interface EloParticipant {
  playerId: string;
  name: string;
  avatar: string;
  color: Color;
  /** Colocação 1-based. Participantes empatados têm a mesma colocação. */
  place: number;
  /** Time no 2v2; fora dele é a cor do jogador. */
  team: string;
  /** Jogador que entrou no lugar de outro não herda a identidade de quem saiu. */
  slot?: PlayerSlot;
}

export interface EloChange {
  gameId: string;
  mode: Mode;
  at: number;
  playerId: string;
  color: Color;
  place: number;
  before: number;
  after: number;
  delta: number;
  win: boolean;
  participants: number;
}

export interface EloPoint {
  at: number;
  gameId: string | null;
  rating: number;
  delta: number;
  place: number | null;
}

export interface EloReplay {
  mode: Mode;
  /** Rating final por id. IDs que nunca jogaram não são incluídos. */
  ratings: Map<string, number>;
  /** Rating final por id, conveniente para serialização e para a UI. */
  ratingById: Record<string, number>;
  changes: EloChange[];
  snapshots: Map<string, EloPoint[]>;
  games: number;
}

export interface EloStanding {
  playerId: string;
  name: string;
  avatar: string;
  rating: number;
  /** Variação desde o início do período selecionado. */
  delta: number;
  games: number;
  wins: number;
  placeSum: number;
  captures: number;
  deaths: number;
  /** Quantidade de partidas no período (igual a games quando o período é "tudo"). */
  periodGames: number;
  periodWins: number;
  periodDelta: number;
  lastAt: number;
}

interface RatingState {
  ratings: Map<string, number>;
  changes: EloChange[];
  snapshots: Map<string, EloPoint[]>;
}

/**
 * Replay completo de um modo. Partidas abandonadas (`placements === null`) não
 * alteram o rating e também não entram em `games`.
 */
export function calculateElo(games: readonly GameState[], mode: Mode): EloReplay {
  const state: RatingState = { ratings: new Map(), changes: [], snapshots: new Map() };
  for (const game of chronological(games)) {
    if (game.rules.mode !== mode || !isRanked(game)) continue;
    const participants = participantsOf(game);
    if (participants.length < 2) continue;
    applyGame(state, game, participants);
  }
  const ratingById: Record<string, number> = {};
  for (const [id, rating] of state.ratings) ratingById[id] = rating;
  return {
    mode,
    ratings: state.ratings,
    ratingById,
    changes: state.changes,
    snapshots: state.snapshots,
    games: new Set(state.changes.map((c) => c.gameId)).size,
  };
}

/** Rating atual de um jogador num modo. Jogador sem partidas começa em 1000. */
export function ratingFor(games: readonly GameState[], playerId: string, mode: Mode): number {
  return calculateElo(games, mode).ratings.get(playerId) ?? ELO_INITIAL;
}

export const computeElo = calculateElo;
export function ratingsFor(games: readonly GameState[], mode: Mode): Map<string, number> {
  return calculateElo(games, mode).ratings;
}

/** Alias mais legível para chamadas de UI e compatibilidade com backups antigos. */
export const eloFor = ratingFor;

/** Rating arredondado para mostrar na interface. */
export function roundedRating(rating: number): number {
  return Math.round(rating);
}

/** Delta arredondado, evitando mostrar -0. */
export function roundedDelta(delta: number): number {
  const n = Math.round(delta);
  return Object.is(n, -0) ? 0 : n;
}

/**
 * Classificação Elo. `since` filtra as partidas exibidas e soma em `periodDelta`
 * as mudanças ocorridas no período. O rating exibido continua sendo o rating
 * recalculado de todo o histórico.
 */
export function eloStandings(games: readonly GameState[], mode: Mode, since: number | null = null): EloStanding[] {
  const replay = calculateElo(games, mode);
  const all = new Map<string, EloStanding>();
  const periodIds = new Set<string>();

  for (const change of replay.changes) {
    const inPeriod = since === null || change.at >= since;
    const row = all.get(change.playerId) ?? {
      playerId: change.playerId,
      name: change.playerId,
      avatar: '🙂',
      rating: replay.ratings.get(change.playerId) ?? ELO_INITIAL,
      delta: (replay.ratings.get(change.playerId) ?? ELO_INITIAL) - ELO_INITIAL,
      games: 0,
      wins: 0,
      placeSum: 0,
      captures: 0,
      deaths: 0,
      periodGames: 0,
      periodWins: 0,
      periodDelta: 0,
      lastAt: 0,
    };
    const game = games.find((g) => g.id === change.gameId);
    const p = game ? participantsOf(game).find((x) => x.playerId === change.playerId) : undefined;
    if (p && change.at >= row.lastAt) {
      row.name = p.name;
      row.avatar = p.avatar;
      row.lastAt = change.at;
    }
    row.games++;
    if (change.win) row.wins++;
    row.placeSum += change.place;
    if (p?.slot) {
      row.captures += p.slot.stats.captures;
      row.deaths += p.slot.stats.deaths;
    }
    if (inPeriod) {
      periodIds.add(change.playerId);
      row.periodGames++;
      if (change.win) row.periodWins++;
      row.periodDelta += change.delta;
    }
    all.set(change.playerId, row);
  }

  for (const row of all.values()) {
    row.rating = replay.ratings.get(row.playerId) ?? ELO_INITIAL;
    row.delta = row.rating - ELO_INITIAL;
  }

  // Em um período, só aparecem os jogadores que jogaram nele. Em "tudo", todos
  // que já têm uma partida ranqueada aparecem.
  const rows = [...all.values()].filter((row) => periodIds.has(row.playerId));
  return rows.sort(
    (a, b) =>
      b.rating - a.rating ||
      b.periodWins - a.periodWins ||
      b.wins - a.wins ||
      a.placeSum / a.games - b.placeSum / b.games ||
      b.games - a.games ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/** Evolução de um jogador em um modo, começando no Elo inicial. */
export function eloEvolution(games: readonly GameState[], playerId: string, mode: Mode): EloPoint[] {
  const replay = calculateElo(games, mode);
  return replay.snapshots.get(playerId) ?? [{ at: 0, gameId: null, rating: ELO_INITIAL, delta: 0, place: null }];
}

/** Alias para a nomenclatura usada nas telas de detalhe. */
export const evolutionFor = eloEvolution;

/** Todas as colocações que alimentam o Elo, incluindo substituídos/removidos. */
export function participantsOf(game: GameState): EloParticipant[] {
  if (!isRanked(game)) return [];
  const placements = game.placements ?? [];
  const byColor = new Map<Color, number>();
  placements.forEach((color, i) => byColor.set(color, i + 1));
  const out: EloParticipant[] = [];
  const seen = new Set<string>();

  for (const slot of game.players) {
    if (seen.has(slot.playerId)) continue;
    seen.add(slot.playerId);
    out.push({
      playerId: slot.playerId,
      name: slot.name,
      avatar: slot.avatar,
      color: slot.color,
      place: byColor.get(slot.color) ?? placements.length + 1,
      team: teamFor(game.rules.mode, slot.color),
      slot,
    });
  }

  // Quem saiu por substituição não herda o resultado de quem entrou. Todos os
  // que saíram ficam empatados em último; comparações entre eles dão meia
  // vitória para não depender de uma ordem arbitrária.
  const lastPlace = Math.max(placements.length, out.length);
  for (const old of [...(game.substituted ?? [])].sort((a, b) => b.leftAt - a.leftAt)) {
    if (seen.has(old.playerId)) continue;
    seen.add(old.playerId);
    out.push({
      playerId: old.playerId,
      name: old.name,
      avatar: old.avatar,
      color: old.color,
      place: lastPlace,
      team: teamFor(game.rules.mode, old.color),
    });
  }
  return out;
}

/** Indica se uma partida altera Elo. */
export function isRanked(game: GameState): boolean {
  return Array.isArray(game.placements) && game.placements.length > 0 && game.endReason !== 'abandoned';
}

/** Retorna o resultado esperado de A contra B (0..1). */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / ELO_SCALE));
}

/** Delta de uma partida, útil para pódio e histórico. */
export function changesForGame(games: readonly GameState[], gameId: string, mode?: Mode): EloChange[] {
  const game = games.find((g) => g.id === gameId);
  if (!game || (mode && game.rules.mode !== mode) || !isRanked(game)) return [];
  return calculateElo(games, game.rules.mode).changes.filter((c) => c.gameId === gameId);
}

/** Variação de um jogador numa partida específica. */
export function deltaForGame(games: readonly GameState[], gameId: string, playerId: string): number {
  return changesForGame(games, gameId).find((c) => c.playerId === playerId)?.delta ?? 0;
}

function applyGame(state: RatingState, game: GameState, participants: EloParticipant[]): void {
  const before = new Map<string, number>();
  for (const p of participants) {
    if (!state.ratings.has(p.playerId)) state.ratings.set(p.playerId, ELO_INITIAL);
    before.set(p.playerId, state.ratings.get(p.playerId)!);
  }

  const deltas = new Map<string, number>();
  if (isTeamMode(game.rules.mode)) {
    const teams = new Map<string, EloParticipant[]>();
    for (const p of participants) {
      const list = teams.get(p.team) ?? [];
      list.push(p);
      teams.set(p.team, list);
    }
    const groups = [...teams.values()];
    // Os modos 2v2 têm exatamente duas equipes. O fallback abaixo mantém um
    // resultado sensato para backups antigos/incompletos.
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        const ar = average(a.map((p) => before.get(p.playerId)!));
        const br = average(b.map((p) => before.get(p.playerId)!));
        const sa = comparePlace(teamPlace(a), teamPlace(b));
        const d = ELO_K * (sa - expectedScore(ar, br));
        for (const p of a) deltas.set(p.playerId, (deltas.get(p.playerId) ?? 0) + d);
        for (const p of b) deltas.set(p.playerId, (deltas.get(p.playerId) ?? 0) - d);
      }
    }
  } else {
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const a = participants[i];
        const b = participants[j];
        const d = ELO_K * (comparePlace(a.place, b.place) - expectedScore(before.get(a.playerId)!, before.get(b.playerId)!));
        deltas.set(a.playerId, (deltas.get(a.playerId) ?? 0) + d);
        deltas.set(b.playerId, (deltas.get(b.playerId) ?? 0) - d);
      }
    }
  }

  const at = game.updatedAt || game.createdAt;
  for (const p of participants) {
    const b = before.get(p.playerId)!;
    const d = deltas.get(p.playerId) ?? 0;
    const a = b + d;
    state.ratings.set(p.playerId, a);
    state.changes.push({
      gameId: game.id,
      mode: game.rules.mode,
      at,
      playerId: p.playerId,
      color: p.color,
      place: p.place,
      before: b,
      after: a,
      delta: d,
      win: isWinner(p, participants),
      participants: participants.length,
    });
    const points = state.snapshots.get(p.playerId) ?? [{ at: 0, gameId: null, rating: ELO_INITIAL, delta: 0, place: null }];
    points.push({ at, gameId: game.id, rating: a, delta: d, place: p.place });
    state.snapshots.set(p.playerId, points);
  }
}

function chronological(games: readonly GameState[]): GameState[] {
  return games.map((game, index) => ({ game, index })).sort((a, b) => timeOf(a.game) - timeOf(b.game) || a.index - b.index).map((x) => x.game);
}

function timeOf(game: GameState): number {
  return game.updatedAt || game.createdAt || 0;
}

function isTeamMode(mode: Mode): boolean {
  return mode === 'team' || mode === 'teamPowers';
}

function teamFor(mode: Mode, color: Color): string {
  return isTeamMode(mode) ? TEAM_OF[color] : color;
}

function teamPlace(team: EloParticipant[]): number {
  return Math.min(...team.map((p) => p.place));
}

function comparePlace(a: number, b: number): number {
  return a < b ? 1 : a > b ? 0 : 0.5;
}

function isWinner(p: EloParticipant, all: EloParticipant[]): boolean {
  return p.place === Math.min(...all.map((x) => x.place));
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : ELO_INITIAL;
}

/**
 * Reexporta as cores para pequenos consumidores que antes duplicavam a regra
 * de times. Evita que a definição de dupla escape da camada de Elo.
 */
export const ELO_TEAM_OF = TEAM_OF;
export { COLORS };
