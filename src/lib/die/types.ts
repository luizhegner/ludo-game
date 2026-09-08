import type { Color } from '../../engine/types';

export interface DieRoll {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  /** Vetor do arrasto, em pixels, usado como impulso horizontal. */
  dragX: number;
  dragY: number;
}

export interface DieSceneOptions {
  color: Color;
  size: number;
  onResult?: (roll: DieRoll) => void;
}

export interface DieScene {
  readonly running: boolean;
  roll(dragX?: number, dragY?: number): Promise<DieRoll>;
  resize(size: number): void;
  setColor?(color: Color): void;
  dispose(): void;
}
