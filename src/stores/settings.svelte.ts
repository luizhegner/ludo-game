/** Ajustes do app, persistidos em localStorage. */

export type HapticsLevel = 'off' | 'soft' | 'normal';
export type Theme = 'cream' | 'aurora' | 'og';
/** Pacote de sons: 'default' = seus samples em `public/sounds/` (ou sintetizados); 'og' = os do jogo original (`public/sounds/og/`). */
export type SoundPack = 'default' | 'og';
/** Pacote de ícones dos poderes: 'default' = seus arquivos em `src/assets/art/powers/` (ou emoji); 'og' = a folha recortada do jogo original (`src/assets/art/og/powers/`). */
export type IconPack = 'default' | 'og';

export interface Settings {
  sound: boolean;
  /**
   * Vibração: 'off' · 'soft' (pulsos curtíssimos, pra celular na mesa) · 'normal'.
   * O navegador só controla a duração dos pulsos (não a força), então
   * "suave" = pulsos menores e menos eventos.
   */
  haptics: HapticsLevel;
  autoMove: boolean;
  /** Fundo: creme liso, "aurora" (manchas de cor desfocadas em movimento) ou "og" (mesa escura do jogo original). */
  theme: Theme;
  /**
   * Pacote de sons — independente do tema (o tema é só visual). Com 'og', cada
   * som que existir em `public/sounds/og/` é usado; o que faltar cai no pacote
   * padrão (sample próprio → sintetizado).
   */
  soundPack: SoundPack;
  /**
   * Pacote de ícones dos poderes — independente do tema (igual ao de sons). Com
   * 'og', cada ícone que existir em `src/assets/art/og/powers/` substitui o
   * emoji na casa de poder e nas listas; o que faltar cai no padrão.
   */
  iconPack: IconPack;
}

const KEY = 'ludo.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: 'soft',
  autoMove: true,
  theme: 'cream',
  soundPack: 'default',
  iconPack: 'default',
};

function sanitize(v: unknown): Partial<Settings> {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof o.sound === 'boolean') out.sound = o.sound;
  // versões anteriores guardavam boolean
  if (typeof o.haptics === 'boolean') out.haptics = o.haptics ? 'soft' : 'off';
  else if (o.haptics === 'off' || o.haptics === 'soft' || o.haptics === 'normal') out.haptics = o.haptics;
  if (typeof o.autoMove === 'boolean') out.autoMove = o.autoMove;
  if (o.theme === 'cream' || o.theme === 'aurora' || o.theme === 'og') out.theme = o.theme;
  if (o.soundPack === 'default' || o.soundPack === 'og') out.soundPack = o.soundPack;
  if (o.iconPack === 'default' || o.iconPack === 'og') out.iconPack = o.iconPack;
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
  settings.theme = next.theme;
  settings.soundPack = next.soundPack;
  settings.iconPack = next.iconPack;
  saveSettings();
}

// ---------------------------------------------------------------------------
// Vibração
// ---------------------------------------------------------------------------

/**
 * Eventos táteis do jogo. Cada um vira um padrão de pulsos por nível.
 *
 * Princípios (celular apoiado na mesa):
 * - pulsos curtos (≤ 40 ms) viram um "clique" no motor linear; pulsos longos
 *   fazem o aparelho zumbir e ressoar contra a mesa — por isso o nível "suave"
 *   nunca passa de ~25 ms por pulso e usa pausas pra dar ritmo em vez de força;
 * - a Vibration API não tem amplitude nem frequência: só duração ligado/desligado.
 */
export type Haptic =
  | 'tap' // toque em botão / seleção de peça
  | 'diceStart' // começou a rolar
  | 'diceLand' // dado parou
  | 'six'
  | 'step' // cada casa andada
  | 'out' // saiu da base
  | 'capture'
  | 'captured' // levou captura (quem perdeu a peça)
  | 'threeSixes'
  | 'noMoves'
  | 'finish' // peça no centro
  | 'playerDone'
  | 'victory'
  | 'turn' // sua vez
  | 'power' // pegou poder
  | 'fly' // decolagem do foguete / mola
  | 'landing' // pouso do foguete
  | 'shield'
  | 'boom'
  | 'mine' // mina revelada
  | 'pick'; // dado personalizável: escolheu

const SOFT: Record<Haptic, number | number[] | null> = {
  tap: 8,
  diceStart: 10,
  diceLand: 18,
  six: [12, 40, 12],
  step: null, // andar casa a casa: sem vibrar no suave (seria um zumbido contínuo)
  out: 15,
  capture: [20, 50, 25],
  captured: [15, 60, 15],
  threeSixes: [20, 70, 20, 70, 20],
  noMoves: 12,
  finish: [12, 40, 12, 40, 18],
  playerDone: [15, 50, 15, 50, 15, 50, 25],
  victory: [20, 60, 20, 60, 20, 60, 25],
  turn: 12,
  power: [10, 40, 15],
  fly: [8, 30, 10, 30, 14, 30, 18],
  landing: [22, 60, 12, 50, 8],
  shield: [18, 40, 10],
  boom: [25, 40, 25],
  mine: [10, 40, 10],
  pick: 10,
};

// "Peso" vem de repetir pulsos, nunca de alongar: nada acima de 40 ms ligado.
const NORMAL: Record<Haptic, number | number[] | null> = {
  tap: 10,
  diceStart: 15,
  diceLand: 30,
  six: [20, 40, 20],
  step: 6,
  out: 25,
  capture: [30, 40, 40],
  captured: [25, 60, 25],
  threeSixes: [40, 60, 40, 60, 40],
  noMoves: 20,
  finish: [20, 40, 20, 40, 35],
  playerDone: [30, 40, 30, 40, 30, 40, 40, 30, 40],
  victory: [40, 50, 40, 50, 40, 50, 40, 30, 40, 30, 40],
  turn: 18,
  power: [15, 40, 30],
  fly: [10, 30, 15, 30, 22, 30, 35],
  landing: [40, 50, 20, 50, 12],
  shield: [30, 40, 15],
  boom: [40, 30, 40, 30, 30],
  mine: [15, 40, 15],
  pick: 15,
};

export function haptic(name: Haptic): void {
  if (settings.haptics === 'off') return;
  const pattern = (settings.haptics === 'soft' ? SOFT : NORMAL)[name];
  if (pattern === null) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignora */
  }
}

/** Compatibilidade com chamadas antigas (padrão livre). */
export function vibrate(pattern: number | number[]): void {
  if (settings.haptics === 'off') return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignora */
  }
}
