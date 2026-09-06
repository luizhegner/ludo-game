/** Ajustes do app, persistidos em localStorage. */

export interface Settings {
  sound: boolean;
  haptics: boolean;
  autoMove: boolean;
  /** 'physics' = face que ficou pra cima; 'seeded' = sorteio + animação. */
  diceMode: 'seeded' | 'physics';
}

const KEY = 'ludo.settings.v1';

const DEFAULTS: Settings = { sound: true, haptics: true, autoMove: true, diceMode: 'seeded' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
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

export function vibrate(pattern: number | number[]): void {
  if (!settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignora */
  }
}
