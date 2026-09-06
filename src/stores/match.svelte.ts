/**
 * Partida em andamento: liga o motor à UI.
 * - guarda o GameState atual
 * - aplica auto-move / auto-pass com pequenos atrasos pra UI respirar
 * - persiste em localStorage a cada jogada (retomar partida)
 */
import * as engine from '../engine/game';
import type { Color, GameState } from '../engine/types';
import { settings, vibrate } from './settings.svelte';

const KEY = 'ludo.match.v1';

/** Eventos de UI derivados do log, pra toasts. */
export interface Toast {
  id: number;
  text: string;
  color?: Color;
}

class MatchStore {
  /** raw: o motor sempre devolve um objeto novo, não precisamos de proxy profundo. */
  state: GameState | null = $state.raw(null);
  /** Valor sendo animado no dado (antes de aplicar o resultado). */
  rolling = $state(false);
  toasts: Toast[] = $state([]);
  status = $state('');

  private toastId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = load();
    if (this.state) this.refreshStatus();
  }

  get active(): boolean {
    return !!this.state && this.state.turn.phase !== 'over';
  }

  start(cfg: engine.NewGameConfig): void {
    this.cancelTimer();
    this.state = engine.createGame(cfg);
    this.toasts = [];
    persist(this.state);
    this.refreshStatus();
  }

  clear(): void {
    this.cancelTimer();
    this.state = null;
    this.toasts = [];
    persist(null);
  }

  /** Rola o dado; `forced` vem do dado físico em modo "física real". */
  roll(forced?: number): void {
    if (!this.state || this.state.turn.phase !== 'roll' || this.rolling) return;
    const before = this.state;
    const after = engine.roll(before, forced);
    this.rolling = true;
    // o dado gira ~700ms; só então aplicamos o estado
    this.timer = setTimeout(() => {
      this.rolling = false;
      this.apply(before, after);
      this.afterRoll(after);
    }, 720);
  }

  move(piece: number): void {
    if (!this.state || this.state.turn.phase !== 'move') return;
    const before = this.state;
    const after = engine.move(before, piece);
    this.apply(before, after);
  }

  endGame(rank: boolean): void {
    if (!this.state) return;
    const before = this.state;
    this.apply(before, engine.endGame(before, rank));
  }

  addPlayer(p: engine.NewPlayer): void {
    if (!this.state) return;
    this.apply(this.state, engine.addPlayer(this.state, p));
  }
  removePlayer(color: Color): void {
    if (!this.state) return;
    this.apply(this.state, engine.removePlayer(this.state, color));
  }
  pausePlayer(color: Color): void {
    if (!this.state) return;
    this.apply(this.state, engine.pausePlayer(this.state, color));
  }
  resumePlayer(color: Color): void {
    if (!this.state) return;
    this.apply(this.state, engine.resumePlayer(this.state, color));
  }
  substitutePlayer(color: Color, r: { playerId: string; name: string; avatar: string }): void {
    if (!this.state) return;
    this.apply(this.state, engine.substitutePlayer(this.state, color, r));
  }

  // -------------------------------------------------------------------------

  private afterRoll(s: GameState): void {
    if (s.turn.phase !== 'move') return;
    if (settings.autoMove && s.turn.legal.length === 1) {
      this.timer = setTimeout(() => this.move(s.turn.legal[0]), 350);
    }
  }

  private apply(before: GameState, after: GameState): void {
    this.state = after;
    persist(after);
    this.emitToasts(before, after);
    this.refreshStatus();
  }

  private emitToasts(before: GameState, after: GameState): void {
    const fresh = after.log.slice(before.log.length);
    for (const e of fresh) {
      const name = (c: Color) => engine.playerOf(after, c)?.name ?? c;
      switch (e.type) {
        case 'capture':
          this.toast(`${name(e.by)} comeu ${name(e.victim)}!`, e.by);
          vibrate([30, 40, 60]);
          break;
        case 'threeSixes':
          this.toast(`Três 6 seguidos! ${name(e.color)} perde a vez`, e.color);
          vibrate(80);
          break;
        case 'finish':
          this.toast(`${name(e.color)} colocou uma peça no centro`, e.color);
          vibrate(40);
          break;
        case 'playerDone':
          this.toast(`🏁 ${name(e.color)} terminou em ${e.place}º!`, e.color);
          vibrate([40, 40, 40, 40, 120]);
          break;
        case 'noMoves':
          this.toast(`${name(e.color)}: ${e.value} — sem jogadas`, e.color);
          break;
        case 'roll':
          if (e.value === 6) vibrate(20);
          break;
      }
    }
  }

  private toast(text: string, color?: Color): void {
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-2), { id, text, color }];
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), 2200);
  }

  private refreshStatus(): void {
    const s = this.state;
    if (!s) {
      this.status = '';
      return;
    }
    const me = engine.currentPlayer(s)?.name ?? '';
    switch (s.turn.phase) {
      case 'roll':
        this.status = s.turn.sixStreak > 0 ? `${me}: tirou 6, joga de novo` : `${me}: lance o dado`;
        break;
      case 'move':
        this.status = s.turn.legal.length > 1 ? `${me}: escolha uma peça` : `${me}: movendo…`;
        break;
      case 'over':
        this.status = 'Fim de jogo';
        break;
    }
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.rolling = false;
  }
}

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s || !s.turn || !s.pieces) return null;
    return s;
  } catch {
    return null;
  }
}

function persist(s: GameState | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}

export const match = new MatchStore();
