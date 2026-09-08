/**
 * Deathmatch — camada de apresentação por jogador.
 *
 * A `match` store continua dona do `state` (persistência, cronômetro, histórico,
 * menu, toasts). Esta store cuida do que é POR COR no tempo real: dado
 * girando, peça andando casa a casa, "sem jogada" segurando o número — tudo
 * independente entre os jogadores (o verde pode estar movendo enquanto o azul
 * rola). O motor resolve cada ação no instante em que ela chega; a animação é
 * só apresentação — como nos outros modos, o estado final é persistido na hora.
 *
 * Captura "no pouso": o motor já decide no `dmMove`. Se a vítima moveu antes
 * de a peça atacante "chegar" visualmente, o motor já a tinha tirado de lá —
 * o que a UI mostra é exatamente o que o motor decidiu, na ordem dos toques.
 */
import { match, TIMING, registerDmReset, type Moving } from './match.svelte';
import * as dm from '../engine/deathmatch';
import { playerOf } from '../engine/game';
import { BASE, type Color, type GameState } from '../engine/types';
import { settings, haptic } from './settings.svelte';
import { sound } from '../lib/sound';

export interface DmAnim {
  /** Dado girando (valor já sorteado). */
  rolling: boolean;
  rollingValue: number | null;
  /** Última face parada. */
  face: number;
  /** Segurando "sem jogada" na tela. */
  holding: boolean;
  /** Auto-move agendado. */
  autoPending: boolean;
  /** Peça andando. */
  moving: Moving | null;
}

const IDLE: DmAnim = { rolling: false, rollingValue: null, face: 1, holding: false, autoPending: false, moving: null };

class DeathmatchStore {
  anim: Record<Color, DmAnim> = $state({ green: { ...IDLE }, red: { ...IDLE }, blue: { ...IDLE }, yellow: { ...IDLE } });
  /**
   * Posições a EXIBIR no lugar das do motor, por `cor-peça`, até a jogada que
   * as afetou terminar de animar: a vítima de uma captura continua na casa até
   * a peça atacante pousar; a peça abatida pelo canhão fica um instante na
   * estrela antes de voltar.
   */
  overrides: Record<string, number> = $state({});
  private timers = new Map<Color, Set<ReturnType<typeof setTimeout>>>();

  /** Peças em movimento de todas as cores (pro tabuleiro). */
  get movings(): Moving[] {
    const out: Moving[] = [];
    for (const c of Object.keys(this.anim) as Color[]) {
      const m = this.anim[c].moving;
      if (m) out.push(m);
    }
    return out;
  }

  /** `color` está ocupada com animação (dado/peça)? */
  busy(color: Color): boolean {
    const a = this.anim[color];
    return a.rolling || a.holding || a.autoPending || a.moving !== null;
  }

  /** Pode tocar no dado agora? */
  canRoll(color: Color, s: GameState | null = match.state): boolean {
    if (!s || !dm.dmCanAct(s, color)) return false;
    if (this.busy(color)) return false;
    return dm.dmPlayer(s, color)?.phase === 'roll';
  }

  /** Peças de `color` que podem ser tocadas agora. */
  legal(color: Color, s: GameState | null = match.state): number[] {
    if (!s || !dm.dmCanAct(s, color) || this.busy(color)) return [];
    const p = dm.dmPlayer(s, color);
    return p?.phase === 'move' ? p.legal : [];
  }

  roll(color: Color, forced?: number, opts?: { visualDone?: boolean }): void {
    const s = match.state;
    if (!s || !this.canRoll(color, s)) return;
    if (match.timeIsUp()) return;
    let after: GameState;
    try {
      after = dm.dmRoll(s, color, forced);
    } catch {
      return;
    }
    const value = rolledValue(s, after);
    // persiste e aplica na hora; os avisos ("sem jogadas") só quando o dado parar
    match.applyDm(after, s, true);

    const a = this.anim[color];
    a.rolling = true;
    a.rollingValue = value;
    if (!opts?.visualDone) {
      sound.play('dice');
      haptic('diceStart');
    }
    this.later(color, () => {
      a.rolling = false;
      a.face = value;
      a.rollingValue = null;
      sound.play('diceLand');
      haptic('diceLand');
      if (value === 6) {
        sound.play('six');
        haptic('six');
      }
      match.revealDm(after, s);
      const st = dm.dmPlayer(match.state!, color);
      if (!st || st.phase !== 'move') {
        // sem jogada: segura o número um instante
        a.holding = true;
        this.later(color, () => (a.holding = false), TIMING.hold);
        return;
      }
      this.afterRoll(color, st.legal);
    }, opts?.visualDone ? 60 : TIMING.dice);
  }

  move(color: Color, piece: number): void {
    const s = match.state;
    if (!s || !this.legal(color, s).includes(piece)) return;
    let after: GameState;
    try {
      after = dm.dmMove(s, color, piece);
    } catch {
      return;
    }
    const from = s.pieces[color][piece];
    const to = landingOf(s, after, color, piece);
    match.applyDm(after, s, /* deferVisual */ true);
    // se esta peça estava "segurada" numa casa antiga (comida há um instante e já saindo de novo), solta
    delete this.overrides[`${color}-${piece}`];

    // vítimas continuam onde estavam até a peça pousar
    const held: string[] = [];
    let cannon = false;
    for (let i = s.log.length; i < after.log.length; i++) {
      const e = after.log[i];
      if (e.type === 'capture' && e.by === color) {
        const k = `${e.victim}-${e.piece}`;
        this.overrides[k] = s.pieces[e.victim][e.piece];
        held.push(k);
      } else if (e.type === 'cannon' && e.victim === color && e.piece === piece) cannon = true;
    }
    const release = () => {
      for (const k of held) delete this.overrides[k];
    };
    this.animate(color, piece, from, to, () => {
      if (cannon) {
        // pousou na estrela do adversário: fica um instante, o canhão dispara, e a peça volta
        const k = `${color}-${piece}`;
        this.overrides[k] = to;
        this.later(color, () => {
          delete this.overrides[k];
          release();
          match.revealDm(after, s);
        }, TIMING.power);
        return;
      }
      release();
      match.revealDm(after, s);
    });
  }

  private afterRoll(color: Color, legal: number[]): void {
    if (!settings.autoMove) return;
    const s = match.state!;
    const samePlace = legal.length > 0 && legal.every((i) => s.pieces[color][i] === s.pieces[color][legal[0]]);
    if (legal.length === 1 || samePlace) {
      const a = this.anim[color];
      a.autoPending = true;
      this.later(color, () => {
        a.autoPending = false;
        this.move(color, legal[0]);
      }, TIMING.autoMove);
    }
  }

  /** Anima casa a casa (dá a volta no anel) e chama `done` no pouso. */
  private animate(color: Color, piece: number, from: number, to: number, done: () => void): void {
    const a = this.anim[color];
    if (from === BASE) {
      a.moving = { color, piece, pos: from, to, step: 0 };
      sound.play('out');
      haptic('out');
      this.later(color, () => {
        a.moving = { color, piece, pos: to, to, step: 1 };
        this.later(color, () => {
          a.moving = null;
          done();
        }, 60);
      }, TIMING.out);
      return;
    }
    // passos no anel, com volta (51 → 0)
    const steps = (to - from + 52) % 52 || 52;
    a.moving = { color, piece, pos: from, to, step: 0 };
    let k = 0;
    const advance = () => {
      if (k >= steps) {
        a.moving = null;
        done();
        return;
      }
      k++;
      a.moving = { color, piece, pos: (from + k) % 52, to, step: k };
      sound.play('step');
      haptic('step');
      this.later(color, advance, TIMING.step);
    };
    this.later(color, advance, 0);
  }

  private later(color: Color, fn: () => void, ms: number): void {
    const set = this.timers.get(color) ?? new Set();
    this.timers.set(color, set);
    const t = setTimeout(() => {
      set.delete(t);
      fn();
    }, ms);
    set.add(t);
  }

  /** Cancela tudo (troca de partida / encerramento). */
  reset(): void {
    for (const set of this.timers.values()) for (const t of set) clearTimeout(t);
    this.timers.clear();
    for (const c of Object.keys(this.anim) as Color[]) this.anim[c] = { ...IDLE, face: this.anim[c].face };
    this.overrides = {};
  }
}

function rolledValue(before: GameState, after: GameState): number {
  for (let i = after.log.length - 1; i >= before.log.length; i--) {
    const e = after.log[i];
    if (e.type === 'roll') return e.value;
  }
  return 1;
}

/** Onde a peça parou visualmente (antes de um eventual canhão mandá-la pra base). */
function landingOf(before: GameState, after: GameState, color: Color, piece: number): number {
  for (let i = before.log.length; i < after.log.length; i++) {
    const e = after.log[i];
    if (e.type === 'move' && e.color === color && e.piece === piece) return e.to;
  }
  return after.pieces[color][piece];
}

export const dmStore = new DeathmatchStore();
registerDmReset(() => dmStore.reset());

/** Nome curto pra UI. */
export function dmNameOf(s: GameState, c: Color): string {
  return playerOf(s, c)?.name ?? c;
}
