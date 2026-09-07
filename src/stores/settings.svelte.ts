/** Ajustes do app, persistidos em localStorage. */

export interface Settings {
  sound: boolean;
  haptics: boolean;
  autoMove: boolean;
  /** 'physics' = face que ficou pra cima; 'seeded' = sorteio + animação. */
  diceMode: 'seeded' | 'physics';
}

const KEY = 'ludo.settings.v1';

export const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, autoMove: true, diceMode: 'seeded' };

function sanitize(v: unknown): Partial<Settings> {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof o.sound === 'boolean') out.sound = o.sound;
  if (typeof o.haptics === 'boolean') out.haptics = o.haptics;
  if (typeof o.autoMove === 'boolean') out.autoMove = o.autoMove;
  if (o.diceMode === 'seeded' || o.diceMode === 'physics') out.diceMode = o.diceMode;
  return out;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...sanitize(JSON.parse(raw)) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const settings: Settings = $state(load());

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sem espaço / modo privado: ignora */
  }
}

/** Aplica um conjunto parcial (importar backup) ou volta ao padrão (`patch` vazio + `reset`). */
export function applySettings(patch: Partial<Settings>, reset = false): void {
  const base = reset ? DEFAULT_SETTINGS : settings;
  const next = { ...base, ...sanitize(patch) };
  settings.sound = next.sound;
  settings.haptics = next.haptics;
  settings.autoMove = next.autoMove;
  settings.diceMode = next.diceMode;
  saveSettings();
}

export function vibrate(pattern: number | number[]): void {
  if (!settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignora */
  }
}
