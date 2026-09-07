/**
 * Backup JSON: jogadores + histórico + ajustes num arquivo só.
 * A partida em andamento não entra (é transitória).
 */
import type { GameState } from '../engine/types';
import type { Player } from '../stores/players.svelte';
import type { Settings } from '../stores/settings.svelte';
import { isValidGame } from '../stores/history.svelte';

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'ludo';
  version: number;
  exportedAt: number;
  players: Player[];
  history: GameState[];
  settings?: Partial<Settings>;
}

export function makeBackup(players: Player[], history: GameState[], settings: Settings, now = Date.now()): Backup {
  return { app: 'ludo', version: BACKUP_VERSION, exportedAt: now, players, history, settings };
}

export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `ludo-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** Valida e normaliza um JSON de backup. Lança erro com mensagem legível. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo vazio ou inválido.');
  const o = raw as Record<string, unknown>;
  if (o.app !== 'ludo') throw new Error('Esse arquivo não é um backup do Ludo.');
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION)
    throw new Error('Backup de uma versão mais nova do app. Atualize o app primeiro.');

  const players = Array.isArray(o.players) ? o.players.filter(isValidPlayer) : [];
  const history = Array.isArray(o.history) ? o.history.filter(isValidGame) : [];
  const settings = o.settings && typeof o.settings === 'object' ? (o.settings as Partial<Settings>) : undefined;
  return {
    app: 'ludo',
    version: o.version,
    exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : 0,
    players,
    history,
    settings,
  };
}

function isValidPlayer(p: unknown): p is Player {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.avatar === 'string';
}

/** Dispara o download de um texto como arquivo (Chrome Android abre "salvar em"). */
export function downloadText(text: string, fileName: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
