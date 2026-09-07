/**
 * Arte opcional — ícones e efeitos animados que substituem os emojis e os
 * desenhos padrão QUANDO o arquivo existe (ver ARTE.md na raiz).
 *
 * A detecção é feita na build via `import.meta.glob`: basta colocar o arquivo
 * com o nome certo em `src/assets/art/<pasta>/`. Sem o arquivo, o jogo usa o
 * padrão. Nada aqui é obrigatório e nenhum arquivo faltando quebra nada.
 *
 * Pastas:
 * - `powers/` — ícone de cada poder (`rocket.svg`, `mega-bomb.png`…)
 * - `ui/`     — ícones da interface (`tab-home.svg`, `tab-ranking.png`…)
 * - `fx/`     — sprite sheets animados (`fire.png`, `shield@16.webp`…):
 *               tira horizontal de quadros quadrados; nº de quadros é lido
 *               do tamanho da imagem (largura ÷ altura); `@N` no nome = fps.
 */
import type { Power } from '../engine/types';

type Files = Record<string, string>;

const POWER_FILES = import.meta.glob('../assets/art/powers/*.{svg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Files;
const UI_FILES = import.meta.glob('../assets/art/ui/*.{svg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Files;
const FX_FILES = import.meta.glob('../assets/art/fx/*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Files;

/** Se existirem dois formatos do mesmo ícone, vale o primeiro desta lista. */
const EXT_PRIORITY = ['svg', 'webp', 'png'];

/** `mega-bomb`, `megaBomb`, `Mega_Bomb` → `megabomb`. */
export function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[-_\s]/g, '');
}

function index(files: Files): Map<string, string> {
  const best = new Map<string, { url: string; rank: number }>();
  for (const [path, url] of Object.entries(files)) {
    const file = path.split('/').pop() ?? '';
    const m = /^(.*)\.([a-z0-9]+)$/i.exec(file);
    if (!m) continue;
    const key = normalizeKey(m[1]);
    const rank = EXT_PRIORITY.indexOf(m[2].toLowerCase());
    const cur = best.get(key);
    if (!cur || rank < cur.rank) best.set(key, { url, rank });
  }
  return new Map([...best].map(([k, v]) => [k, v.url]));
}

const powerIcons = index(POWER_FILES);
const uiIcons = index(UI_FILES);

/** URL do ícone do poder, ou null pra usar o emoji. */
export function powerIconUrl(p: Power): string | null {
  return powerIcons.get(normalizeKey(p)) ?? null;
}

/** URL de um ícone da interface (`tab-home`, `menu`…), ou null pra usar o emoji. */
export function uiIconUrl(name: string): string | null {
  return uiIcons.get(normalizeKey(name)) ?? null;
}

// ---------------------------------------------------------------------------
// Sprites animados
// ---------------------------------------------------------------------------

/** Efeitos que o jogo sabe animar (ver ARTE.md pra o que cada um representa). */
export type FxName = 'fire' | 'shield' | 'freeze' | 'boom' | 'pickup';

export interface FxSprite {
  url: string;
  /** Quadros na tira (largura ÷ altura da imagem). */
  frames: number;
  fps: number;
}

const DEFAULT_FPS = 12;

/** Sprites encontrados na build (antes de medir). Exportado pra diagnóstico/testes. */
export const FX_DECLARED: Record<string, { url: string; fps: number }> = {};
for (const [path, url] of Object.entries(FX_FILES)) {
  const file = path.split('/').pop() ?? '';
  const m = /^(.+?)(?:@(\d+))?\.(png|webp)$/i.exec(file);
  if (!m) continue;
  const fps = m[2] ? Math.min(60, Math.max(1, Number(m[2]))) : DEFAULT_FPS;
  FX_DECLARED[normalizeKey(m[1])] = { url, fps };
}

/** Medidos em tempo de execução (precisa carregar a imagem pra saber o nº de quadros). */
const fxMeta: Record<string, FxSprite | null> = $state({});

/** Sprite pronto pra usar, ou null pra usar o desenho padrão. */
export function fxSprite(name: FxName): FxSprite | null {
  return fxMeta[name] ?? null;
}

function measure(): void {
  if (typeof Image === 'undefined') return;
  for (const [key, { url, fps }] of Object.entries(FX_DECLARED)) {
    const img = new Image();
    img.onload = () => {
      const frames = Math.max(1, Math.round(img.naturalWidth / Math.max(1, img.naturalHeight)));
      fxMeta[key] = { url, frames, fps };
    };
    img.onerror = () => {
      fxMeta[key] = null;
    };
    img.src = url;
  }
}
measure();
