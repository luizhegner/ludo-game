import type { Color } from '../../engine/types';

export interface DieRoll {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  /** Vetor do arrasto, em pixels, usado como impulso horizontal. */
  dragX: number;
  dragY: number;
}

export interface DieToken {
  id: string;
  color: Color;
  /** Centro da base, em células (0–15). */
  homeX: number;
  homeY: number;
  enabled: boolean;
}

export interface DiePose {
  id: string;
  x: number;
  y: number;
  rolling: boolean;
}

export interface DieSceneOptions {
  color: Color;
  size: number;
  onResult?: (roll: DieRoll) => void;
}

export interface DieScene {
  readonly running: boolean;
  /** `forceValue`: face já sorteada; a animação termina nela. */
  roll(dragX?: number, dragY?: number, forceValue?: number): Promise<DieRoll>;
  resize(size: number): void;
  setColor?(color: Color): void;
  dispose(): void;
}
