/**
 * Cadastro de jogadores (nome + avatar), persistido em localStorage.
 *
 * O id do jogador é o que liga tudo: partida em andamento, histórico e,
 * o Elo derivado do histórico. Nome e avatar podem ser editados à vontade sem
 * quebrar nada — o histórico guarda o nome da época como cópia.
 */
import { DEFAULT_AVATAR, isPhoto } from '../lib/avatars';

export interface Player {
  id: string;
  name: string;
  /** Emoji ou data URL (JPEG 128×128) de foto. */
  avatar: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'ludo.players.v1';
export const NAME_MAX = 16;

class PlayersStore {
  list: Player[] = $state([]);

  constructor() {
    this.list = load();
  }

  get(id: string | undefined | null): Player | undefined {
    if (!id) return undefined;
    return this.list.find((p) => p.id === id);
  }

  /** Avatar atual do jogador; cai no `fallback` (cópia da partida) se ele foi apagado. */
  avatarOf(id: string | undefined | null, fallback = DEFAULT_AVATAR): string {
    const p = this.get(id);
    if (p) return p.avatar;
    return fallback && !isPhoto(fallback) ? fallback : DEFAULT_AVATAR;
  }

  nameOf(id: string | undefined | null, fallback = ''): string {
    return this.get(id)?.name ?? fallback;
  }

  create(name: string, avatar: string, now = Date.now()): Player {
    const p: Player = {
      id: newId(),
      name: cleanName(name),
      avatar: avatar || DEFAULT_AVATAR,
      createdAt: now,
      updatedAt: now,
    };
    if (!p.name) throw new Error('nome vazio');
    this.list = [...this.list, p];
    persist(this.list);
    return p;
  }

  update(id: string, patch: { name?: string; avatar?: string }, now = Date.now()): Player | undefined {
    const i = this.list.findIndex((p) => p.id === id);
    if (i < 0) return undefined;
    const cur = this.list[i];
    const next: Player = {
      ...cur,
      name: patch.name !== undefined ? cleanName(patch.name) || cur.name : cur.name,
      avatar: patch.avatar !== undefined ? patch.avatar || cur.avatar : cur.avatar,
      updatedAt: now,
    };
    this.list = this.list.map((p) => (p.id === id ? next : p));
    persist(this.list);
    return next;
  }

  remove(id: string): void {
    this.list = this.list.filter((p) => p.id !== id);
    persist(this.list);
  }

  /** Nome já usado por outro jogador (ignora maiúsculas/acentos leves)? */
  nameTaken(name: string, exceptId?: string): boolean {
    const n = norm(name);
    return this.list.some((p) => p.id !== exceptId && norm(p.name) === n);
  }

  /** Substitui tudo (importar backup / apagar tudo). */
  replaceAll(list: Player[]): void {
    this.list = list.filter(isValid).map((p) => ({ ...p }));
    persist(this.list);
  }
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

function norm(s: string): string {
  return cleanName(s)
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isValid(p: unknown): p is Player {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.avatar === 'string';
}

function load(): Player[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter(isValid);
    }
  } catch {
    /* ignora */
  }
  return [];
}

function persist(list: Player[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sem espaço / modo privado: ignora */
  }
}

export const players = new PlayersStore();
