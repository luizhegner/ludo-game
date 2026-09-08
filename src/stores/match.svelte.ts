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
import { isDeathmatch } from '../engine/deathmatch';
import { toAbsolute } from '../engine/board';
import { BASE, type Color, type GameState, type Power } from '../engine/types';
import { settings, haptic, type Haptic } from './settings.svelte';
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
  /** Voo de mola / volta por escudo (uma parábola só). */
  fly: 700,
  /** Foguete: tremor + decolagem antes de sair do chão. */
  liftoff: 520,
  /** Foguete: voo até o destino. */
  rocket: 750,
  /** Foguete: pouso caótico (quique + inclinação) até assentar. */
  landing: 650,
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
  /** Que tipo de voo: foguete (decola, voa e aterrissa), mola (salto) ou volta (escudo). */
  flyKind?: 'rocket' | 'spring' | 'back';
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
  /** Cronômetro (modos com tempo): ms restantes, atualizado a cada tique. */
  remainingMs = $state(Infinity);
  /** Quem pediu pausa do relógio (menu aberto, app em segundo plano). */
  private clockHolds = new Set<string>();
  private ticker: ReturnType<typeof setInterval> | null = null;

  private toastId = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    this.state = load();
    if (this.state) {
      this.diceFace = lastFace(this.state);
      this.refreshStatus();
      // ao reabrir o app, o relógio só volta a correr no próximo lançamento
      if (this.state.clock?.runningSince !== null && this.state.clock) {
        this.state = engine.pauseClock(this.state);
        persist(this.state);
      }
    }
    this.tick();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.holdClock('hidden');
        else this.releaseClock('hidden');
      });
    }
  }

  // -------------------------------------------------------------------------
  // Cronômetro
  // -------------------------------------------------------------------------

  /** Tem cronômetro nesta partida. */
  get timed(): boolean {
    return !!this.state?.clock;
  }

  /** Pausa o relógio enquanto `who` estiver segurando (menu, segundo plano). */
  holdClock(who: string): void {
    this.clockHolds.add(who);
    if (!this.state?.clock) return;
    const paused = engine.pauseClock(this.state);
    if (paused !== this.state) {
      this.state = paused;
      persist(paused);
    }
    this.tick();
  }

  /** Solta a pausa; se ninguém mais segura e a partida já tinha começado, volta a correr. */
  releaseClock(who: string): void {
    this.clockHolds.delete(who);
    if (this.clockHolds.size || !this.state?.clock || !this.active) return;
    if (this.state.clock.elapsedMs === 0) return; // ainda não começou (começa no primeiro lançamento)
    const started = engine.startClock(this.state);
    if (started !== this.state) {
      this.state = started;
      persist(started);
    }
    this.tick();
  }

  /** Atualiza `remainingMs` e fecha a partida quando o tempo acaba (depois das animações). */
  private tick(): void {
    const s = this.state;
    if (!s?.clock || s.turn.phase === 'over') {
      const v = s?.clock ? engine.remainingMs(s) : Infinity;
      if (v !== this.remainingMs) this.remainingMs = v;
      this.stopTicker();
      return;
    }
    const rem = engine.remainingMs(s);
    if (Math.ceil(rem / 1000) !== Math.ceil(this.remainingMs / 1000)) this.remainingMs = rem;
    if (rem <= 0) {
      if (this.busy) {
        // deixa a jogada em andamento terminar; o próximo commit fecha
        this.startTicker();
        return;
      }
      this.stopTicker();
      const before = s;
      const after = engine.timeUp(before);
      if (after !== before) {
        sound.play('victory');
        haptic('victory');
        this.toast('⏱ Acabou o tempo!');
        this.commit(after, false, before);
      }
      return;
    }
    if (s.clock.runningSince !== null) this.startTicker();
    else this.stopTicker();
  }

  private startTicker(): void {
    if (this.ticker !== null || typeof setInterval === 'undefined') return;
    // 250 ms pra virar o segundo no momento certo; `remainingMs` só é reescrito quando o segundo muda
    this.ticker = setInterval(() => this.tick(), 250);
  }
  private stopTicker(): void {
    if (this.ticker === null) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  get active(): boolean {
    return !!this.state && this.state.turn.phase !== 'over';
  }

  /** UI travada: dado e peças não respondem. */
  get busy(): boolean {
    return this.rolling || this.moving !== null || this.holding || this.autoPending || this.dmPending > 0;
  }

  /** Deathmatch: tempo real. */
  get deathmatch(): boolean {
    return !!this.state && isDeathmatch(this.state);
  }

  /** Cronômetro zerou (a UI recusa novas ações e deixa o tique fechar a partida). */
  timeIsUp(): boolean {
    if (!this.state) return false;
    if (engine.isTimeUp(this.state)) {
      this.tick();
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Deathmatch (a store `dm` cuida da animação por cor; aqui só o estado)
  // -------------------------------------------------------------------------

  /** Movimentos do Deathmatch ainda em animação (segura o fechamento por tempo). */
  private dmPending = 0;
  /** Estado mais recente do motor (pode estar à frente do `state` exibido, durante animações). */
  private dmLatest: GameState | null = null;

  /**
   * Aplica uma ação do Deathmatch. Persiste na hora. Com `deferVisual`, o
   * `state` exibido NÃO avança (a peça está andando); `revealDm` faz isso no
   * pouso. Como várias ações podem se sobrepor, o "exibido" é reconstruído a
   * partir do estado real do motor a cada revelação.
   */
  applyDm(after: GameState, before: GameState, deferVisual = false): void {
    this.dmLatest = after;
    persist(after);
    if (deferVisual) {
      this.dmPending++;
      // enquanto a peça anda, os OUTROS jogadores precisam ver o estado novo dos ciclos (dado deles);
      // mostramos o estado novo, mas com a peça que está andando ainda na origem (o tabuleiro a desenha à parte)
      this.state = after;
      this.refreshStatus();
      this.tick();
      return;
    }
    this.state = after;
    this.emitToasts(before, after);
    this.refreshStatus();
    this.tick();
  }

  /** Pouso da peça no Deathmatch: toasts/sons dos eventos daquela jogada, e libera o fechamento por tempo. */
  revealDm(after: GameState, before: GameState): void {
    this.dmPending = Math.max(0, this.dmPending - 1);
    this.emitToasts(before, after);
    this.animateHome(before, after);
    // o estado exibido é sempre o mais recente do motor
    if (this.dmLatest && this.dmLatest !== this.state) this.state = this.dmLatest;
    this.refreshStatus();
    this.tick();
  }

  start(cfg: engine.NewGameConfig): void {
    this.reset();
    this.state = engine.createGame(cfg);
    this.diceFace = 1;
    this.toasts = [];
    persist(this.state);
    this.refreshStatus();
    this.tick();
    // lembra a configuração pra "Nova partida" já vir pré-preenchida (vale pra revanche também)
    const slots = { ...EMPTY_SLOTS };
    for (const p of cfg.players) slots[p.color] = p.playerId;
    const prev = loadSetup();
    saveSetup({
      mode: cfg.rules.mode,
      slots,
      disabledPowers: cfg.rules.disabledPowers ?? prev.disabledPowers,
      visibleMines: cfg.rules.visibleMines ?? prev.visibleMines,
    });
  }

  clear(): void {
    this.reset();
    this.state = null;
    this.toasts = [];
    persist(null);
    this.tick();
  }

  /** Rola o dado; `forced` vem do dado físico. `visualDone` = a animação 3D já parou. */
  roll(forced?: number, opts?: { visualDone?: boolean }): void {
    if (!this.state || this.state.turn.phase !== 'roll' || this.busy) return;
    if (isDeathmatch(this.state)) return; // Deathmatch: dmStore.roll(cor)
    if (engine.isTimeUp(this.state)) {
      this.tick();
      return;
    }
    const before = this.state;
    const after = engine.roll(before, forced);
    const value = rolledValue(before, after);
    persist(after);

    this.rolling = true;
    this.rollingValue = value;
    if (!opts?.visualDone) {
      sound.play('dice');
      haptic('diceStart');
    }

    this.later(() => {
      this.rolling = false;
      this.diceFace = value;
      this.rollingValue = null;
      sound.play('diceLand');
      haptic('diceLand');
      if (after.turn.mult) sound.play('multiplier');
      else if (value === 6) {
        sound.play('six');
        haptic('six');
      }

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
    }, opts?.visualDone ? 60 : TIMING.dice);
  }

  move(piece: number): void {
    if (!this.state || this.state.turn.phase !== 'move' || this.busy) return;
    if (isDeathmatch(this.state)) return;
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
    const color = engine.piecesColorFor(before, before.turn.color);
    const from = before.pieces[color][piece];
    const fresh = after.log.slice(before.log.length);

    // trechos: [de, até, tipo de voo]
    type Leg = { from: number; to: number; fly?: 'rocket' | 'spring' | 'back' };
    const legs: Leg[] = [];
    let cur = from;
    for (const e of fresh) {
      if (e.type === 'move' && e.color === color && e.piece === piece) {
        legs.push({ from: cur, to: e.to });
        cur = e.to;
      } else if (e.type === 'fly' && e.color === color && e.piece === piece) {
        legs.push({ from: cur, to: e.to, fly: e.power });
        cur = e.to;
      } else if (e.type === 'shieldBlock' && e.attacker === color && e.piece === piece) {
        legs.push({ from: cur, to: e.back, fly: 'back' });
        cur = e.back;
      }
    }
    if (!legs.length) legs.push({ from, to: after.pieces[color][piece] });

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

      if (leg.fly === 'rocket') {
        // 1) tremor + decolagem no lugar  2) voo até o destino  3) pouso caótico
        this.moving = { color, piece, pos: leg.from, to: leg.to, step: 0, flying: true, flyKind: 'rocket' };
        sound.play('fly');
        haptic('fly');
        this.later(() => {
          this.moving = { color, piece, pos: leg.to, to: leg.to, step: 1, flying: true, flyKind: 'rocket' };
          this.later(() => {
            this.moving = { color, piece, pos: leg.to, to: leg.to, step: 2, flying: true, flyKind: 'rocket' };
            sound.play('landing');
            haptic('landing');
            this.later(runLeg, TIMING.landing + pause);
          }, TIMING.rocket);
        }, TIMING.liftoff);
        return;
      }

      if (leg.fly) {
        // mola: agacha e salta; volta por escudo: arco de volta
        this.moving = { color, piece, pos: leg.from, to: leg.to, step: 0, flying: true, flyKind: leg.fly };
        if (leg.fly === 'back') {
          sound.play('shield');
          haptic('shield');
        } else {
          sound.play('spring');
          haptic('fly');
        }
        this.later(() => {
          this.moving = { color, piece, pos: leg.to, to: leg.to, step: 1, flying: true, flyKind: leg.fly };
          this.later(runLeg, TIMING.fly + pause);
        }, 20);
        return;
      }

      if (leg.from === BASE) {
        // salto único da base pra casa de saída
        this.moving = { color, piece, pos: leg.from, to: leg.to, step: 0 };
        sound.play('out');
        haptic('out');
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
        haptic('step');
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
    const color = engine.piecesColorFor(s, s.turn.color);
    // uma jogada só, ou várias equivalentes (todas as peças legais na mesma casa: base, ou empilhadas na saída no 5 Minutos)
    const samePlace = legal.length > 0 && legal.every((i) => s.pieces[color][i] === s.pieces[color][legal[0]]);
    if (legal.length === 1 || samePlace) {
      this.autoPending = true;
      this.later(() => {
        this.autoPending = false;
        this.move(legal[0]);
      }, TIMING.autoMove);
    }
  }

  private afterMove(s: GameState): void {
    // depois de mover, ou o jogador rola de novo, ou escolhe o número (dado personalizável)
    if (s.turn.phase === 'pick') {
      sound.play('magicDice');
      haptic('power');
    }
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
    this.tick();
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
        const hp = POWER_HAPTIC[e.type];
        if (hp) haptic(hp);
        continue;
      }
      switch (e.type) {
        case 'capture':
          this.toast(`${name(e.by)} comeu ${name(e.victim)}!`, e.by);
          sound.play('capture');
          haptic('capture');
          break;
        case 'threeSixes':
          this.toast(`Três 6 seguidos! ${name(e.color)} perde a vez`, e.color);
          sound.play('threeSixes');
          haptic('threeSixes');
          break;
        case 'finish': {
          // quem terminou as 4 peças não joga de novo (sai da rodada)
          const done = fresh.some((x) => x.type === 'playerDone' && x.color === e.color);
          this.toast(`${name(e.color)} colocou uma peça no centro${done ? '' : ' — joga de novo'}`, e.color);
          sound.play('finish');
          haptic('finish');
          break;
        }
        case 'playerDone':
          this.toast(`🏁 ${name(e.color)} terminou em ${e.place}º!`, e.color);
          sound.play('playerDone');
          haptic('playerDone');
          break;
        case 'noMoves':
          this.toast(`${name(e.color)}: ${e.value} — sem jogadas`, e.color);
          sound.play('noMoves');
          haptic('noMoves');
          break;
        case 'gameOver':
          sound.play('victory');
          haptic('victory');
          break;
        case 'turn':
          sound.play('turn');
          haptic('turn');
          break;
        case 'partnerTurn':
          this.toast(`${name(e.color)} joga com as peças de ${name(e.forPartner)}`, e.color);
          break;
        case 'cannon':
          this.toast(`💥 Canhão de ${name(e.by)} abateu ${name(e.victim)}!`, e.by);
          sound.play('boom');
          haptic('boom');
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
    if (isDeathmatch(s)) {
      if (s.turn.phase === 'over') this.status = 'Fim de jogo';
      else if (s.clock && s.clock.elapsedMs === 0 && s.clock.runningSince === null) this.status = 'Todo mundo joga ao mesmo tempo · o relógio começa no primeiro lançamento';
      else {
        const lead = [...s.players].filter((p) => p.status !== 'removed').sort((a, b) => b.stats.captures - a.stats.captures)[0];
        this.status = lead && lead.stats.captures > 0 ? `${lead.name} lidera com ${lead.stats.captures} ${lead.stats.captures === 1 ? 'captura' : 'capturas'} · alvo ${s.dm!.target}` : `Primeiro a ${s.dm!.target} capturas vence`;
      }
      return;
    }
    const me = engine.currentPlayer(s)?.name ?? '';
    switch (s.turn.phase) {
      case 'roll': {
        const pend = s.powers?.pending[engine.piecesColorFor(s, s.turn.color)];
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
    this.dmPending = 0;
    this.dmLatest = null;
    resetDmAnim?.();
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

/** Vibração pra cada evento de poder. */
const POWER_HAPTIC: Partial<Record<GameState['log'][number]['type'], Haptic>> = {
  power: 'power',
  shieldBreak: 'shield',
  boom: 'boom',
  mineRevealed: 'mine',
  mineDetonated: 'boom',
  capture: 'capture',
  pick: 'pick',
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

/** Registrado pela store do Deathmatch (evita import circular). */
let resetDmAnim: (() => void) | null = null;
export function registerDmReset(fn: () => void): void {
  resetDmAnim = fn;
}

export const match = new MatchStore();
