/**
 * Sons do jogo.
 *
 * - `sound.play(nome)` nunca lança erro e respeita `settings.sound`.
 * - Cada som tem uma versão sintetizada via WebAudio (funciona offline, sem arquivos).
 * - Se existir `public/sounds/<arquivo>.mp3` ou `.ogg`, o sample substitui o sintetizado
 *   (ver SONS.md pra lista e descrição de cada um).
 * - Pacotes: com `settings.soundPack === 'og'` procura primeiro em
 *   `public/sounds/og/<arquivo>`; o que não existir lá cai no pacote padrão
 *   (`public/sounds/<arquivo>` → sintetizado). Trocar o pacote não exige recarregar.
 * - O AudioContext é criado/desbloqueado no primeiro toque do usuário (regra dos navegadores).
 */
import { settings, type SoundPack } from '../stores/settings.svelte';

export type SoundName =
  | 'dice'
  | 'diceLand'
  | 'step'
  | 'out'
  | 'capture'
  | 'six'
  | 'threeSixes'
  | 'noMoves'
  | 'finish'
  | 'playerDone'
  | 'victory'
  | 'turn'
  | 'tap'
  // --- modo Poderes ---
  | 'power'
  | 'fly'
  | 'shield'
  | 'boom'
  | 'mine'
  | 'magicDice'
  | 'multiplier'
  | 'repopulate'
  | 'landing'
  | 'spring';

/** Nome do arquivo (sem extensão) em public/sounds/ pra cada som. */
export const SOUND_FILES: Record<SoundName, string> = {
  dice: 'dice-roll',
  diceLand: 'dice-land',
  step: 'piece-step',
  out: 'piece-out',
  capture: 'capture',
  six: 'six',
  threeSixes: 'three-sixes',
  noMoves: 'no-moves',
  finish: 'finish',
  playerDone: 'player-done',
  victory: 'victory',
  turn: 'turn',
  tap: 'tap',
  power: 'power',
  fly: 'fly',
  shield: 'shield',
  boom: 'boom',
  mine: 'mine',
  magicDice: 'magic-dice',
  multiplier: 'multiplier',
  repopulate: 'repopulate',
  landing: 'landing',
  spring: 'spring',
};

const EXTENSIONS = ['mp3', 'ogg'] as const;

type Wave = OscillatorType;

interface Synth {
  (ctx: AudioContext, out: AudioNode, t0: number): void;
}

// ---------------------------------------------------------------------------
// Helpers de síntese
// ---------------------------------------------------------------------------

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
  opts: {
    freq: number;
    to?: number;
    dur: number;
    type?: Wave;
    gain?: number;
    attack?: number;
    delay?: number;
  },
): void {
  const { freq, to, dur, type = 'sine', gain = 0.2, attack = 0.005, delay = 0 } = opts;
  const t = t0 + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;
function noise(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
  opts: { dur: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType; delay?: number },
): void {
  const { dur, gain = 0.2, freq = 1200, q = 0.8, type = 'bandpass', delay = 0 } = opts;
  const t = t0 + delay;
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate; // 1 s
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// ---------------------------------------------------------------------------
// Os 23 sons sintetizados
// ---------------------------------------------------------------------------

const SYNTH: Record<SoundName, Synth> = {
  // dado chacoalhando: sequência de cliques secos com timbre variado (~0,7 s)
  dice: (ctx, out, t0) => {
    let t = 0;
    let i = 0;
    while (t < 0.62) {
      noise(ctx, out, t0, { dur: 0.035, gain: 0.16 + Math.random() * 0.08, freq: 1800 + Math.random() * 1600, q: 2, delay: t });
      tone(ctx, out, t0, { freq: 900 + Math.random() * 500, dur: 0.03, type: 'square', gain: 0.03, delay: t });
      t += 0.055 + i * 0.006 + Math.random() * 0.02;
      i++;
    }
  },
  // dado parando na mesa: "toc" grave curto
  diceLand: (ctx, out, t0) => {
    noise(ctx, out, t0, { dur: 0.08, gain: 0.3, freq: 700, q: 1, type: 'lowpass' });
    tone(ctx, out, t0, { freq: 220, to: 90, dur: 0.12, type: 'triangle', gain: 0.35 });
  },
  // peça pulando uma casa: "tic" de madeira, bem curto
  step: (ctx, out, t0) => {
    noise(ctx, out, t0, { dur: 0.04, gain: 0.18, freq: 2600, q: 1.5 });
    tone(ctx, out, t0, { freq: 660, to: 440, dur: 0.06, type: 'triangle', gain: 0.22 });
  },
  // peça saindo da base: "plop" ascendente
  out: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 300, to: 720, dur: 0.18, type: 'sine', gain: 0.3 });
    noise(ctx, out, t0, { dur: 0.05, gain: 0.1, freq: 2000, delay: 0.16 });
  },
  // captura: impacto + descida dramática
  capture: (ctx, out, t0) => {
    noise(ctx, out, t0, { dur: 0.16, gain: 0.35, freq: 900, q: 0.7, type: 'lowpass' });
    tone(ctx, out, t0, { freq: 520, to: 130, dur: 0.38, type: 'sawtooth', gain: 0.22 });
    tone(ctx, out, t0, { freq: 780, to: 200, dur: 0.3, type: 'square', gain: 0.08, delay: 0.04 });
  },
  // tirou 6: arpejo curto pra cima
  six: (ctx, out, t0) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, t0, { freq: f, dur: 0.14, type: 'triangle', gain: 0.22, delay: i * 0.07 }));
  },
  // três 6: "womp womp" descendente
  threeSixes: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 330, to: 250, dur: 0.28, type: 'sawtooth', gain: 0.18 });
    tone(ctx, out, t0, { freq: 260, to: 150, dur: 0.45, type: 'sawtooth', gain: 0.18, delay: 0.3 });
  },
  // sem jogadas: dois toques neutros pra baixo
  noMoves: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 440, dur: 0.12, type: 'sine', gain: 0.2 });
    tone(ctx, out, t0, { freq: 349, dur: 0.2, type: 'sine', gain: 0.2, delay: 0.15 });
  },
  // peça chegou no centro: sininho brilhante
  finish: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 1047, dur: 0.5, type: 'sine', gain: 0.25 });
    tone(ctx, out, t0, { freq: 1568, dur: 0.6, type: 'sine', gain: 0.15, delay: 0.08 });
    tone(ctx, out, t0, { freq: 2093, dur: 0.7, type: 'sine', gain: 0.08, delay: 0.16 });
  },
  // jogador terminou as 4 peças: fanfarra curta
  playerDone: (ctx, out, t0) => {
    [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]].forEach(([f, d]) =>
      tone(ctx, out, t0, { freq: f, dur: 0.22, type: 'square', gain: 0.1, delay: d }),
    );
    tone(ctx, out, t0, { freq: 1047, dur: 0.6, type: 'triangle', gain: 0.2, delay: 0.48 });
    tone(ctx, out, t0, { freq: 1319, dur: 0.6, type: 'triangle', gain: 0.14, delay: 0.48 });
  },
  // fim da partida: fanfarra completa (~1,6 s)
  victory: (ctx, out, t0) => {
    const seq: [number, number, number][] = [
      [523, 0, 0.16],
      [523, 0.18, 0.16],
      [523, 0.36, 0.16],
      [659, 0.54, 0.3],
      [587, 0.86, 0.16],
      [659, 1.04, 0.6],
    ];
    for (const [f, d, dur] of seq) {
      tone(ctx, out, t0, { freq: f, dur, type: 'square', gain: 0.1, delay: d });
      tone(ctx, out, t0, { freq: f * 2, dur, type: 'triangle', gain: 0.12, delay: d });
    }
    tone(ctx, out, t0, { freq: 1319, dur: 0.6, type: 'triangle', gain: 0.1, delay: 1.04 });
    tone(ctx, out, t0, { freq: 1568, dur: 0.6, type: 'triangle', gain: 0.1, delay: 1.04 });
  },
  // passou a vez: "blip" discreto
  turn: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 880, dur: 0.07, type: 'sine', gain: 0.12 });
    tone(ctx, out, t0, { freq: 1175, dur: 0.1, type: 'sine', gain: 0.12, delay: 0.07 });
  },
  // toque em botão/peça: clique suave
  tap: (ctx, out, t0) => {
    noise(ctx, out, t0, { dur: 0.025, gain: 0.12, freq: 3000, q: 1.2 });
    tone(ctx, out, t0, { freq: 1200, to: 900, dur: 0.04, type: 'sine', gain: 0.1 });
  },

  // --- modo Poderes ---

  // pegou um poder: "brilho" de duas notas com cauda
  power: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 880, dur: 0.12, type: 'triangle', gain: 0.18 });
    tone(ctx, out, t0, { freq: 1319, dur: 0.3, type: 'sine', gain: 0.18, delay: 0.09 });
    noise(ctx, out, t0, { dur: 0.12, gain: 0.05, freq: 5000, q: 1, delay: 0.09 });
  },
  // foguete: chiado de ignição crescendo, depois o "whoosh" da decolagem
  fly: (ctx, out, t0) => {
    noise(ctx, out, t0, { dur: 0.5, gain: 0.12, freq: 400, q: 0.5, type: 'lowpass' });
    tone(ctx, out, t0, { freq: 60, to: 140, dur: 0.5, type: 'sawtooth', gain: 0.08 });
    noise(ctx, out, t0, { dur: 0.7, gain: 0.28, freq: 1100, q: 0.6, type: 'bandpass', delay: 0.45 });
    tone(ctx, out, t0, { freq: 180, to: 1600, dur: 0.7, type: 'sawtooth', gain: 0.07, delay: 0.45 });
  },
  // foguete pousando: baque + dois quiques menores
  landing: (ctx, out, t0) => {
    noise(ctx, out, t0, { dur: 0.1, gain: 0.3, freq: 600, q: 0.8, type: 'lowpass' });
    tone(ctx, out, t0, { freq: 260, to: 90, dur: 0.16, type: 'triangle', gain: 0.32 });
    tone(ctx, out, t0, { freq: 300, to: 120, dur: 0.1, type: 'triangle', gain: 0.18, delay: 0.24 });
    tone(ctx, out, t0, { freq: 340, to: 150, dur: 0.07, type: 'triangle', gain: 0.1, delay: 0.42 });
  },
  // mola: "boing" — mola comprimindo e soltando
  spring: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 220, to: 120, dur: 0.12, type: 'triangle', gain: 0.2 });
    tone(ctx, out, t0, { freq: 150, to: 900, dur: 0.3, type: 'square', gain: 0.07, delay: 0.1 });
    tone(ctx, out, t0, { freq: 900, to: 600, dur: 0.25, type: 'sine', gain: 0.12, delay: 0.38 });
  },
  // escudo absorvendo: "clang" metálico curto
  shield: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 1500, to: 1100, dur: 0.22, type: 'square', gain: 0.08 });
    tone(ctx, out, t0, { freq: 2250, to: 1800, dur: 0.3, type: 'triangle', gain: 0.12 });
    noise(ctx, out, t0, { dur: 0.06, gain: 0.2, freq: 3500, q: 2 });
  },
  // bomba / mega bomba / mina: estouro grave com cauda de ruído
  boom: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 140, to: 40, dur: 0.5, type: 'sine', gain: 0.5 });
    noise(ctx, out, t0, { dur: 0.45, gain: 0.35, freq: 500, q: 0.5, type: 'lowpass' });
    noise(ctx, out, t0, { dur: 0.12, gain: 0.25, freq: 2500, q: 0.8, delay: 0.01 });
  },
  // mina revelada: "tic-tic" de relógio + zumbido de alerta
  mine: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 1800, dur: 0.04, type: 'square', gain: 0.08 });
    tone(ctx, out, t0, { freq: 1800, dur: 0.04, type: 'square', gain: 0.08, delay: 0.12 });
    tone(ctx, out, t0, { freq: 300, to: 260, dur: 0.3, type: 'sawtooth', gain: 0.08, delay: 0.2 });
  },
  // dado personalizável: pergunta em duas notas pra cima
  magicDice: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 659, dur: 0.12, type: 'triangle', gain: 0.18 });
    tone(ctx, out, t0, { freq: 988, dur: 0.22, type: 'triangle', gain: 0.18, delay: 0.13 });
  },
  // multiplicador em ação: dois "pings" rápidos subindo
  multiplier: (ctx, out, t0) => {
    tone(ctx, out, t0, { freq: 1047, dur: 0.1, type: 'sine', gain: 0.2 });
    tone(ctx, out, t0, { freq: 1568, dur: 0.16, type: 'sine', gain: 0.2, delay: 0.1 });
  },
  // novas casas de poder: arpejo suave de "surgimento"
  repopulate: (ctx, out, t0) => {
    [784, 988, 1175, 1568].forEach((f, i) => tone(ctx, out, t0, { freq: f, dur: 0.25, type: 'sine', gain: 0.1, delay: i * 0.06 }));
  },
};

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Sample decodificado por `pacote/som`; `null` = não existe arquivo nesse pacote. */
  private samples = new Map<string, AudioBuffer | null>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private unlocked = false;
  private listenersInstalled = false;

  constructor() {
    this.installUnlock();
  }

  /** Toca um som. Nunca lança. */
  play(name: SoundName): void {
    try {
      if (!settings.sound) return;
      const ctx = this.context();
      if (!ctx || !this.master) return;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

      // ordem de preferência: pacote escolhido → pacote padrão → sintetizado
      for (const pack of packOrder(settings.soundPack)) {
        const key = `${pack}/${name}`;
        const cached = this.samples.get(key);
        if (cached) {
          this.playBuffer(ctx, cached);
          return;
        }
        if (cached === undefined) {
          // primeira vez: tenta carregar o sample em paralelo; enquanto isso, sintetiza
          void this.loadSample(pack, name);
        }
      }
      SYNTH[name](ctx, this.master, ctx.currentTime);
    } catch {
      /* som nunca pode quebrar o jogo */
    }
  }

  /** Cria/desbloqueia o contexto (chamado no primeiro toque). */
  unlock(): void {
    try {
      const ctx = this.context();
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      if (!this.unlocked) {
        // buffer vazio pra "acordar" o áudio no iOS/Android
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
        this.unlocked = true;
      }
    } catch {
      /* ignora */
    }
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC: typeof AudioContext | undefined =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private playBuffer(ctx: AudioContext, buf: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master!);
    src.start();
  }

  private loadSample(pack: SoundPack, name: SoundName): Promise<AudioBuffer | null> {
    const key = `${pack}/${name}`;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const p = (async (): Promise<AudioBuffer | null> => {
      const ctx = this.ctx;
      if (!ctx || typeof fetch !== 'function') return null;
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const dir = pack === 'default' ? 'sounds/' : `sounds/${pack}/`;
      for (const ext of EXTENSIONS) {
        try {
          const res = await fetch(`${base}${dir}${SOUND_FILES[name]}.${ext}`);
          if (!res.ok) continue;
          const type = res.headers.get('content-type') ?? '';
          if (type.includes('text/html')) continue; // SPA fallback devolveu o index.html
          const data = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(data.slice(0));
          return buf;
        } catch {
          /* tenta a próxima extensão */
        }
      }
      return null;
    })();
    this.loading.set(key, p);
    void p.then(
      (buf) => this.samples.set(key, buf),
      () => this.samples.set(key, null),
    );
    return p;
  }

  /**
   * Pré-carrega os samples de um pacote (chamado ao ligar o switch nos Ajustes,
   * pra não sintetizar as primeiras vezes). Nunca lança.
   */
  preload(pack: SoundPack = settings.soundPack): void {
    try {
      if (!this.context()) return;
      for (const p of packOrder(pack)) for (const name of Object.keys(SOUND_FILES) as SoundName[]) void this.loadSample(p, name);
    } catch {
      /* ignora */
    }
  }

  private installUnlock(): void {
    if (this.listenersInstalled || typeof window === 'undefined') return;
    this.listenersInstalled = true;
    const once = () => {
      this.unlock();
      for (const ev of EVENTS) window.removeEventListener(ev, once, true);
    };
    for (const ev of EVENTS) window.addEventListener(ev, once, { capture: true, passive: true });
  }
}

const EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'] as const;

/** Pacotes a tentar, do preferido pro padrão. */
export function packOrder(pack: SoundPack): SoundPack[] {
  return pack === 'default' ? ['default'] : [pack, 'default'];
}

export const sound = new SoundPlayer();
