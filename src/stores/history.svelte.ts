/**
 * Histórico de partidas encerradas, persistido em localStorage.
 *
 * Guarda o GameState completo (com o log) de cada partida — é a fonte da
 * verdade pra estatísticas e, na fase 6, pro Elo. Fotos de avatar são
 * trocadas por um emoji ao arquivar pra não inflar o armazenamento; a UI
 * sempre resolve o avatar atual pelo `playerId` no cadastro.
 */
import type { Color, GameState, PlayerSlot } from '../engine/types';
import { DEFAULT_AVATAR, isPhoto } from '../lib/avatars';
import { placeOf } from '../lib/stats';

const KEY = 'ludo.history.v1';
/** Limite de partidas guardadas (as mais antigas saem). */
export const HISTORY_MAX = 500;

export interface PlayerHistoryStats {
  games: number;
  /** Partidas que contaram (não abandonadas). */
  ranked: number;
  wins: number;
  /** Soma das colocações nas partidas ranqueadas (pra média). */
  placeSum: number;
  captures: number;
  deaths: number;
  sixes: number;
  powers: number;
  /** Maior sequência de vitórias consecutivas (partidas ranqueadas). */
  bestStreak: number;
  /** Sequência atual de vitórias. */
  streak: number;
  lastPlayedAt: number | null;
}

/** Participação de um jogador numa partida (pra "últimas partidas"). */
export interface Participation {
  game: GameState;
  color: Color;
  /** 1-based; null se a partida foi encerrada sem contar. */
  place: number | null;
  /** Nome e avatar usados naquela partida. */
  slot: PlayerSlot;
}

class HistoryStore {
  /** Mais recente primeiro. */
  list: GameState[] = $state.raw([]);

  constructor() {
    this.list = load();
  }

  get(id: string): GameState | undefined {
    return this.list.find((g) => g.id === id);
  }

  /** Arquiva uma partida encerrada. Idempotente (mesmo id substitui). */
  add(s: GameState): void {
    if (s.turn.phase !== 'over') return;
    const entry = strip(s);
    this.list = [entry, ...this.list.filter((g) => g.id !== s.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, HISTORY_MAX);
    persist(this.list);
  }

  remove(id: string): void {
    this.list = this.list.filter((g) => g.id !== id);
    persist(this.list);
  }

  clear(): void {
    this.list = [];
    persist(this.list);
  }

  /** Substitui tudo (importar backup). */
  replaceAll(list: GameState[]): void {
    this.list = list
      .filter(isValidGame)
      .map(strip)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, HISTORY_MAX);
    persist(this.list);
  }

  /** Partidas de um jogador, da mais recente pra mais antiga. */
  forPlayer(playerId: string): Participation[] {
    const out: Participation[] = [];
    for (const game of this.list) {
      const slot = game.players.find((p) => p.playerId === playerId);
      if (slot) {
        out.push({ game, color: slot.color, place: placeOf(game, slot.color), slot });
        continue;
      }
      const sub = game.substituted?.find((x) => x.playerId === playerId);
      if (sub) {
        // quem saiu por substituição conta como último
        const n = game.placements?.length ?? game.players.length;
        out.push({
          game,
          color: sub.color,
          place: game.placements ? n : null,
          slot: {
            color: sub.color,
            playerId: sub.playerId,
            name: sub.name,
            avatar: sub.avatar,
            status: 'removed',
            joinedAt: game.createdAt,
            leftAt: sub.leftAt,
            stats: { captures: 0, deaths: 0, sixes: 0, powers: 0 },
          },
        });
      }
    }
    return out;
  }

  statsFor(playerId: string): PlayerHistoryStats {
    const st: PlayerHistoryStats = {
      games: 0,
      ranked: 0,
      wins: 0,
      placeSum: 0,
      captures: 0,
      deaths: 0,
      sixes: 0,
      powers: 0,
      bestStreak: 0,
      streak: 0,
      lastPlayedAt: null,
    };
    // da mais antiga pra mais recente, pra sequência atual sair certa
    const parts = this.forPlayer(playerId).reverse();
    let streak = 0;
    for (const { game, place, slot } of parts) {
      st.games++;
      st.captures += slot.stats.captures;
      st.deaths += slot.stats.deaths;
      st.sixes += slot.stats.sixes;
      st.powers += slot.stats.powers;
      st.lastPlayedAt = Math.max(st.lastPlayedAt ?? 0, game.updatedAt);
      if (place !== null) {
        st.ranked++;
        st.placeSum += place;
        if (place === 1) {
          st.wins++;
          streak++;
          st.bestStreak = Math.max(st.bestStreak, streak);
        } else streak = 0;
      }
    }
    st.streak = streak;
    return st;
  }
}

/** Troca fotos por emoji pra não inflar o armazenamento. */
function strip(s: GameState): GameState {
  const players = s.players.map((p) => (isPhoto(p.avatar) ? { ...p, avatar: DEFAULT_AVATAR } : p));
  const substituted = s.substituted?.map((p) => (isPhoto(p.avatar) ? { ...p, avatar: DEFAULT_AVATAR } : p));
  return { ...s, players, ...(substituted ? { substituted } : {}) };
}

export function isValidGame(g: unknown): g is GameState {
  if (!g || typeof g !== 'object') return false;
  const o = g as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    Array.isArray(o.players) &&
    !!o.turn &&
    typeof o.turn === 'object' &&
    !!o.rules &&
    typeof o.rules === 'object' &&
    !!o.pieces &&
    Array.isArray(o.log)
  );
}

function load(): GameState[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter(isValidGame);
    }
  } catch {
    /* ignora */
  }
  return [];
}

function persist(list: GameState[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // sem espaço: tenta guardar menos
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, Math.floor(list.length / 2))));
    } catch {
      /* desiste */
    }
  }
}

export const history = new HistoryStore();
