/**
 * Partida em andamento: liga o motor à UI.
 * - guarda o GameState atual
 * - anima o dado (valor já sorteado pelo motor) e o movimento casa a casa
 * - aplica auto-move / auto-pass com pequenos atrasos pra UI respirar
 * - persiste em localStorage a cada jogada (retomar partida)
 *
 * Regra geral: o MOTOR decide tudo na hora; a UI só atrasa a apresentação.
 * O estado final é persistido imediatamente (fechar o app no meio de uma
 * animação não perde nada), mas `state` só avança quando a animação termina.
 */
import * as engine from '../engine/game';
import { toAbsolute } from '../engine/board';
import { BASE, type Color, type GameState, type Power } from '../engine/types';
import { settings, vibrate } from './settings.svelte';
import { history } from './history.svelte';
import { EMPTY_SLOTS, loadSetup, saveSetup } from './setup.svelte';
import { sound, type SoundName } from '../lib/sound';
import { describePowerEvent } from '../lib/powers';

const KEY = 'ludo.match.v1';

/** Tempos (ms) das animações. Exportados pros testes. */
export const TIMING = {
  /** Giro do dado até parar na face sorteada. */
  dice: 720,
  /** Cada casa do movimento. */
  step: 150,
  /** Salto da base pra casa de saída. */
  out: 260,
  /** Segurar o número na tela quando não há jogada / três 6. */
  hold: 900,
  /** Espera antes do auto-move. */
  autoMove: 350,
  /** Voo de volta pra base (peça comida / penalidade). */
  home: 550,
  /** Voo de foguete/mola (uma parábola só, independente da distância). */
  fly: 700,
  /** Pausa na casa de poder antes de mostrar o efeito. */
  power: 350,
  /** Explicação do poder fica na tela depois de soltar o dedo. */
  infoLinger: 1500,
} as const;

/** Eventos de UI derivados do log, pra toasts. */
export interface Toast {
  id: number;
  text: string;
  color?: Color;
}

/** Peça em movimento: desenhada em `pos`, uma casa por vez, até chegar em `to`. */
export interface Moving {
  color: Color;
  piece: number;
  /** Posição atual da animação (relativa à cor). */
  pos: number;
  /** Destino final. */
  to: number;
  /** Passo atual (1 = primeira casa). */
  step: number;
  /** Voo (foguete/mola): desenhada em arco em vez de casa a casa. */
  flying?: boolean;
}

class MatchStore {
  /** raw: o motor sempre devolve um objeto novo, não precisamos de proxy profundo. */
  state: GameState | null = $state.raw(null);
  /** Dado girando (ainda não aplicamos o resultado). */
  rolling = $state(false);
  /** Valor já sorteado pelo motor enquanto o dado gira. */
  rollingValue: number | null = $state(null);
  /** Última face mostrada pelo dado (mantida entre turnos). */
  diceFace = $state(1);
  /** Peça andando casa a casa. */
  moving: Moving | null = $state.raw(null);
  /** Peças voltando pra base (chave `cor-índice`), pra animar o voo. */
  goingHome: string[] = $state.raw([]);
  /** Segurando a tela (ex.: "sem jogadas") antes de passar a vez. */
  holding = $state(false);
  /** Auto-move agendado (a peça vai andar sozinha daqui a pouco). */
  autoPending = $state(false);
  toasts: Toast[] = $state([]);
  status = $state('');
  /** Explicação de um poder (segurar o dedo na casa); some sozinha. */
  info: { power: Power } | null = $state.raw(null);

  private toastId = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    this.state = load();
    if (this.state) {
      this.diceFace = lastFace(this.state);
      this.refreshStatus();
    }
  }

  get active(): boolean {
    return !!this.state && this.state.turn.phase !== 'over';
  }

  /** UI travada: dado e peças não respondem. */
  get busy(): boolean {
    return this.rolling || this.moving !== null || this.holding || this.autoPending;
  }

  start(cfg: engine.NewGameConfig): void {
    this.reset();
    this.state = engine.createGame(cfg);
    this.diceFace = 1;
    this.toasts = [];
    persist(this.state);
    this.refreshStatus();
    // lembra a configuração pra "Nova partida" já vir pré-preenchida (vale pra revanche também)
    const slots = { ...EMPTY_SLOTS };
    for (const p of cfg.players) slots[p.color] = p.playerId;
    saveSetup({
      mode: cfg.rules.mode,
      slots,
      captureBonus: cfg.rules.captureBonus,
      disabledPowers: cfg.rules.disabledPowers ?? loadSetup().disabledPowers,
    });
  }

  clear(): void {
    this.reset();
    this.state = null;
    this.toasts = [];
    persist(null);
  }

  /** Rola o dado; `forced` vem do dado físico em modo "física real". */
  roll(forced?: number): void {
    if (!this.state || this.state.turn.phase !== 'roll' || this.busy) return;
    const before = this.state;
    const after = engine.roll(before, forced);
    const value = rolledValue(before, after);
    persist(after);

    this.rolling = true;
    this.rollingValue = value;
    sound.play('dice');

    this.later(() => {
      this.rolling = false;
      this.diceFace = value;
      this.rollingValue = null;
      sound.play('diceLand');
      if (after.turn.mult) sound.play('multiplier');
      else if (value === 6) sound.play('six');

      const passes = after.turn.color !== before.turn.color || after.turn.phase === 'over';
      const noPlay = after.turn.phase !== 'move';
      if (noPlay && (passes || hasEvent(before, after, 'noMoves') || hasEvent(before, after, 'threeSixes'))) {
        // sem jogada / três 6: mostra o número (e o aviso) por um instante antes de passar a vez
        this.holding = true;
        this.emitToasts(before, after);
        this.later(() => {
          this.holding = false;
          this.commit(after, false);
        }, TIMING.hold);
        return;
      }
      this.commit(after, true, before);
      this.afterRoll(after);
    }, TIMING.dice);
  }

  move(piece: number): void {
    if (!this.state || this.state.turn.phase !== 'move' || this.busy) return;
    if (!this.state.turn.legal.includes(piece)) return;
    const before = this.state;
    const after = engine.move(before, piece);
    // persiste o resultado na hora; a UI só mostra depois do último passo
    persist(after);
    this.animateMove(before, after, piece);
  }

  /** Dado personalizável: o jogador escolheu `value`. */
  pick(value: number): void {
    if (!this.state || this.state.turn.phase !== 'pick' || this.busy) return;
    if (!engine.legalPicks(this.state).includes(value)) return;
    const before = this.state;
    const piece = before.turn.pick!;
    const after = engine.pick(before, value);
    persist(after);
    this.diceFace = value;
    this.animateMove(before, after, piece);
  }

  /**
   * Anima a peça `piece` de onde estava até onde o motor a deixou, em etapas:
   * o trecho de dado casa a casa, depois cada voo (foguete/mola) num arco.
   * Se a peça voltou pra base (bomba, mina, escudo…), o voo de volta vem no fim.
   */
  private animateMove(before: GameState, after: GameState, piece: number): void {
    const color = before.turn.color;
    const from = before.pieces[color][piece];
    const fresh = after.log.slice(before.log.length);

    // trechos: [de, até, voo?]
    const legs: { from: number; to: number; fly: boolean }[] = [];
    let cur = from;
    for (const e of fresh) {
      if (e.type === 'move' && e.color === color && e.piece === piece) {
        legs.push({ from: cur, to: e.to, fly: false });
        cur = e.to;
      } else if (e.type === 'fly' && e.color === color && e.piece === piece) {
        legs.push({ from: cur, to: e.to, fly: true });
        cur = e.to;
      } else if (e.type === 'shieldBlock' && e.attacker === color && e.piece === piece) {
        legs.push({ from: cur, to: e.back, fly: true });
        cur = e.back;
      }
    }
    if (!legs.length) legs.push({ from, to: after.pieces[color][piece], fly: false });

    // posições (relativas) onde a peça pisou em casa de poder, pra pausar ali
    const powerStops = new Set(
      fresh
        .filter((e) => e.type === 'power' && e.color === color && e.piece === piece)
        .map((e) => (e.type === 'power' ? e.ring : -1)),
    );
    const isPowerStop = (rel: number) => rel >= 0 && rel < 51 && powerStops.has(toAbsolute(color, rel));

    let i = 0;
    const runLeg = () => {
      if (i >= legs.length) {
        this.land(before, after);
        return;
      }
      const leg = legs[i++];
      const pause = isPowerStop(leg.to) ? TIMING.power : 40;

      if (leg.fly) {
        this.moving = { color, piece, pos: leg.from, to: leg.to, step: 0, flying: true };
        sound.play(leg.to < leg.from ? 'shield' : 'fly');
        this.later(() => {
          this.moving = { color, piece, pos: leg.to, to: leg.to, step: 1, flying: true };
          this.later(runLeg, TIMING.fly + pause);
        }, 20);
        return;
      }

      if (leg.from === BASE) {
        // salto único da base pra casa de saída
        this.moving = { color, piece, pos: leg.from, to: leg.to, step: 0 };
        sound.play('out');
        this.later(() => {
          this.moving = { color, piece, pos: leg.to, to: leg.to, step: 1 };
          this.later(runLeg, pause);
        }, TIMING.out);
        return;
      }

      this.moving = { color, piece, pos: leg.from, to: leg.to, step: 0 };
      const advance = () => {
        const m = this.moving!;
        if (m.pos >= leg.to) {
          this.later(runLeg, pause);
          return;
        }
        this.moving = { ...m, pos: m.pos + 1, step: m.step + 1 };
        sound.play('step');
        this.later(advance, TIMING.step);
      };
      this.later(advance, 0);
    };
    runLeg();
  }

  /** Mostra a explicação de um poder na área de status (segurar o dedo na casa). */
  showInfo(power: Power): void {
    this.info = { power };
    this.scheduleInfoHide(6000);
  }
  /** Soltou o dedo: a explicação ainda fica um instante pra dar tempo de ler. */
  hideInfo(): void {
    if (this.info) this.scheduleInfoHide(TIMING.infoLinger);
  }
  private infoTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleInfoHide(ms: number): void {
    if (this.infoTimer) clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => {
      this.infoTimer = null;
      this.info = null;
    }, ms);
  }

  endGame(rank: boolean): void {
    if (!this.state) return;
    this.reset();
    const before = this.state;
    this.commit(engine.endGame(before, rank), true, before);
  }

  addPlayer(p: engine.NewPlayer): void {
    if (!this.state) return;
    this.reset();
    this.commit(engine.addPlayer(this.state, p), true, this.state);
  }
  removePlayer(color: Color): void {
    if (!this.state) return;
    this.reset();
    this.commit(engine.removePlayer(this.state, color), true, this.state);
  }
  pausePlayer(color: Color): void {
    if (!this.state) return;
    this.reset();
    this.commit(engine.pausePlayer(this.state, color), true, this.state);
  }
  resumePlayer(color: Color): void {
    if (!this.state) return;
    this.reset();
    this.commit(engine.resumePlayer(this.state, color), true, this.state);
  }
  substitutePlayer(color: Color, r: { playerId: string; name: string; avatar: string }): void {
    if (!this.state) return;
    this.reset();
    this.commit(engine.substitutePlayer(this.state, color, r), true, this.state);
  }

  // -------------------------------------------------------------------------

  /** Pouso da peça: agora sim aplica capturas, toasts e passagem de vez. */
  private land(before: GameState, after: GameState): void {
    this.moving = null;
    this.commit(after, true, before);
    this.afterMove(after);
  }

  private afterRoll(s: GameState): void {
    if (s.turn.phase !== 'move') return;
    if (!settings.autoMove) return;
    const legal = s.turn.legal;
    const color = s.turn.color;
    // uma jogada só, ou várias equivalentes (todas as peças legais ainda na base)
    const allInBase = legal.length > 0 && legal.every((i) => s.pieces[color][i] === BASE);
    if (legal.length === 1 || allInBase) {
      this.autoPending = true;
      this.later(() => {
        this.autoPending = false;
        this.move(legal[0]);
      }, TIMING.autoMove);
    }
  }

  private afterMove(s: GameState): void {
    // depois de mover, ou o jogador rola de novo, ou escolhe o número (dado personalizável)
    if (s.turn.phase === 'pick') sound.play('magicDice');
  }

  /**
   * Aplica um novo estado na UI. `withToasts` emite avisos dos eventos novos
   * (comparando com `before`); quando já foram emitidos antes, passa `false`.
   */
  private commit(after: GameState, withToasts: boolean, before?: GameState): void {
    const prev = before ?? this.state;
    this.state = after;
    persist(after);
    if (withToasts && prev) this.emitToasts(prev, after);
    if (prev) this.animateHome(prev, after);
    this.refreshStatus();
  }

  /** Peças que voltaram pra base ganham a classe `home` por um instante. */
  private animateHome(before: GameState, after: GameState): void {
    const keys: string[] = [];
    for (const p of after.players) {
      const c = p.color;
      const b = before.pieces[c];
      const a = after.pieces[c];
      if (!b || !a) continue;
      for (let i = 0; i < a.length; i++) if (a[i] === BASE && b[i] !== BASE) keys.push(`${c}-${i}`);
    }
    if (!keys.length) return;
    this.goingHome = [...this.goingHome, ...keys];
    this.later(() => (this.goingHome = this.goingHome.filter((k) => !keys.includes(k))), TIMING.home);
  }

  private emitToasts(before: GameState, after: GameState): void {
    const fresh = after.log.slice(before.log.length);
    for (const e of fresh) {
      const name = (c: Color) => engine.playerOf(after, c)?.name ?? c;
      const pw = describePowerEvent(e, name);
      if (pw) {
        this.toast(pw.text, pw.color);
        const snd = POWER_SOUND[e.type];
        if (snd) sound.play(snd);
        if (e.type === 'boom' || (e.type === 'capture' && e.how)) vibrate([30, 40, 60]);
        continue;
      }
      switch (e.type) {
        case 'capture':
          this.toast(`${name(e.by)} comeu ${name(e.victim)}!`, e.by);
          sound.play('capture');
          vibrate([30, 40, 60]);
          break;
        case 'threeSixes':
          this.toast(`Três 6 seguidos! ${name(e.color)} perde a vez`, e.color);
          sound.play('threeSixes');
          vibrate(80);
          break;
        case 'finish':
          this.toast(`${name(e.color)} colocou uma peça no centro`, e.color);
          sound.play('finish');
          vibrate(40);
          break;
        case 'playerDone':
          this.toast(`🏁 ${name(e.color)} terminou em ${e.place}º!`, e.color);
          sound.play('playerDone');
          vibrate([40, 40, 40, 40, 120]);
          break;
        case 'noMoves':
          this.toast(`${name(e.color)}: ${e.value} — sem jogadas`, e.color);
          sound.play('noMoves');
          break;
        case 'gameOver':
          sound.play('victory');
          vibrate([60, 60, 60, 60, 200]);
          break;
        case 'turn':
          sound.play('turn');
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
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), 2600);
  }

  private refreshStatus(): void {
    const s = this.state;
    if (!s) {
      this.status = '';
      return;
    }
    const me = engine.currentPlayer(s)?.name ?? '';
    switch (s.turn.phase) {
      case 'roll': {
        const pend = s.powers?.pending[s.turn.color];
        if (pend?.armed) this.status = `${me}: lance o dado — a peça anda ×${pend.factor}`;
        else this.status = s.turn.sixStreak > 0 ? `${me}: tirou 6, joga de novo` : `${me}: lance o dado`;
        break;
      }
      case 'move':
        if (s.turn.mult) this.status = `${me}: ${s.turn.dice} × ${s.turn.mult} = ${s.turn.dice! * s.turn.mult} casas`;
        else this.status = s.turn.legal.length > 1 ? `${me}: escolha uma peça` : `${me}: movendo…`;
        break;
      case 'pick':
        this.status = `🎯 ${me}: escolha um número`;
        break;
      case 'over':
        this.status = 'Fim de jogo';
        break;
    }
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** Cancela animações pendentes e volta pro estado persistido (sempre o final). */
  private reset(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.rolling = false;
    this.rollingValue = null;
    this.moving = null;
    this.holding = false;
    this.autoPending = false;
    this.goingHome = [];
    const saved = load();
    if (saved && this.state && saved.id === this.state.id) this.state = saved;
  }
}

/** Som pra cada evento de poder (os que não estão aqui ficam mudos). */
const POWER_SOUND: Partial<Record<GameState['log'][number]['type'], SoundName>> = {
  power: 'power',
  shieldBreak: 'shield',
  boom: 'boom',
  mineRevealed: 'mine',
  mineDetonated: 'boom',
  repopulate: 'repopulate',
  capture: 'capture',
  pick: 'tap',
};

function rolledValue(before: GameState, after: GameState): number {
  for (let i = after.log.length - 1; i >= before.log.length; i--) {
    const e = after.log[i];
    if (e.type === 'roll') return e.value;
  }
  return after.turn.dice ?? 1;
}

function hasEvent(before: GameState, after: GameState, type: GameState['log'][number]['type']): boolean {
  return after.log.slice(before.log.length).some((e) => e.type === type);
}

function lastFace(s: GameState): number {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.type === 'roll') return e.value;
  }
  return 1;
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
  // partida acabou: vai pro histórico na hora (mesmo que o app feche durante a animação)
  if (s && s.turn.phase === 'over') history.add(s);
}

export const match = new MatchStore();
