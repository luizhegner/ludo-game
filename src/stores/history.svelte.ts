/**
 * Histórico de partidas encerradas.
 *
 * Guarda o GameState completo (com o log) de cada partida — é a fonte da
 * verdade pra estatísticas e, na fase 6, pro Elo. Fotos de avatar são
 * trocadas por um emoji ao arquivar pra não inflar o armazenamento; a UI
 * sempre resolve o avatar atual pelo `playerId` no cadastro.
 *
 * Armazenamento: **IndexedDB** (ver lib/idb.ts). A lista em memória é a
 * fonte da verdade reativa; as escritas no banco são assíncronas e
 * enfileiradas em ordem. Na primeira abertura, o que existir da versão
 * antiga em localStorage (`ludo.history.v1`) é migrado e apagado.
 */
import type { Color, GameState, PlayerSlot } from '../engine/types';
import { DEFAULT_AVATAR, isPhoto } from '../lib/avatars';
import { placeOf } from '../lib/stats';
import { idbClear, idbDelete, idbGetAll, idbPut, idbPutMany, idbReplaceAll } from '../lib/idb';

const LEGACY_KEY = 'ludo.history.v1';
/** Limite de partidas guardadas (as mais antigas saem). */
export const HISTORY_MAX = 2000;

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
  /** Já carregou do banco? (a UI mostra "carregando" antes disso) */
  ready = $state(false);

  /** Escritas em ordem: cada operação espera a anterior terminar. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Resolve quando a carga inicial terminar (testes / import esperam por isso). */
  readonly loaded: Promise<void>;

  constructor() {
    this.loaded = this.load();
  }

  private async load(): Promise<void> {
    try {
      const fromDb = await idbGetAll();
      const legacy = loadLegacy();
      let list = fromDb;
      if (legacy.length) {
        // migração: junta, sem duplicar, e apaga a cópia antiga
        const ids = new Set(fromDb.map((g) => g.id));
        const extra = legacy.filter((g) => !ids.has(g.id));
        list = [...fromDb, ...extra].sort((a, b) => b.updatedAt - a.updatedAt);
        await idbPutMany(extra);
        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          /* ignora */
        }
      }
      // não sobrescreve o que foi adicionado enquanto carregava (partida acabou no meio)
      const ids = new Set(list.map((g) => g.id));
      const added = this.list.filter((g) => !ids.has(g.id));
      this.list = [...added, ...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, HISTORY_MAX);
    } catch {
      /* fica com o que tem em memória */
    } finally {
      this.ready = true;
    }
  }

  /** Espera todas as escritas pendentes (testes / antes de exportar). */
  flush(): Promise<void> {
    return this.loaded.then(() => this.queue).then(() => undefined);
  }

  private write(op: () => Promise<void>): void {
    this.queue = this.queue.then(op, op).catch(() => {});
  }

  get(id: string): GameState | undefined {
    return this.list.find((g) => g.id === id);
  }

  /** Arquiva uma partida encerrada. Idempotente (mesmo id substitui). */
  add(s: GameState): void {
    if (s.turn.phase !== 'over') return;
    const entry = strip(s);
    const next = [entry, ...this.list.filter((g) => g.id !== s.id)].sort((a, b) => b.updatedAt - a.updatedAt);
    const dropped = next.slice(HISTORY_MAX);
    this.list = next.slice(0, HISTORY_MAX);
    this.write(async () => {
      await this.loaded;
      await idbPut(entry);
      for (const g of dropped) await idbDelete(g.id);
    });
  }

  remove(id: string): void {
    this.list = this.list.filter((g) => g.id !== id);
    this.write(async () => {
      await this.loaded;
      await idbDelete(id);
    });
  }

  clear(): void {
    this.list = [];
    this.write(async () => {
      await this.loaded;
      await idbClear();
    });
  }

  /** Substitui tudo (importar backup). */
  replaceAll(list: GameState[]): void {
    const clean = list
      .filter(isValidGame)
      .map(strip)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, HISTORY_MAX);
    this.list = clean;
    this.write(async () => {
      await this.loaded;
      await idbReplaceAll(clean);
    });
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

/** Histórico da versão anterior (localStorage), se existir. */
function loadLegacy(): GameState[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter(isValidGame);
    }
  } catch {
    /* ignora */
  }
  return [];
}

export const history = new HistoryStore();
