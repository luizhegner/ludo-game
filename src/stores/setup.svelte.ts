/**
 * Última configuração de partida (modo, quem estava em cada cor, regras),
 * pra "Nova partida" já vir pré-preenchida e a "Revanche" ser um toque.
 */
import type { Color, Mode } from '../engine/types';

export interface Setup {
  mode: Mode;
  /** playerId por cor (null = cor vazia). */
  slots: Record<Color, string | null>;
  captureBonus: boolean;
}

const KEY = 'ludo.lastSetup.v2';

export const EMPTY_SLOTS: Record<Color, string | null> = { green: null, red: null, blue: null, yellow: null };

export function defaultSetup(): Setup {
  return { mode: 'classic', slots: { ...EMPTY_SLOTS }, captureBonus: false };
}

export function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Setup>;
      return {
        mode: v.mode ?? 'classic',
        slots: { ...EMPTY_SLOTS, ...(v.slots ?? {}) },
        captureBonus: !!v.captureBonus,
      };
    }
  } catch {
    /* ignora */
  }
  return defaultSetup();
}

export function saveSetup(s: Setup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}

export function clearSetup(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
