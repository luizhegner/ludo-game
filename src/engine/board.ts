/**
 * Geometria do tabuleiro 15×15.
 *
 * O anel tem 52 casas indexadas em sentido horário a partir da casa de saída
 * do VERDE (linha 6, coluna 1). Cada cor entra no anel com um deslocamento
 * de 13 casas em relação à anterior.
 *
 * As posições das peças no motor são sempre relativas à própria cor
 * (0 = saída da cor). `toAbsolute` converte pra índice absoluto do anel.
 */
import { COLORS, type Color, RING, HOME_START, FINISH, BASE } from './types';

export interface Cell {
  row: number;
  col: number;
}

/** Deslocamento da casa de saída de cada cor no anel absoluto. */
export const START_OFFSET: Record<Color, number> = {
  green: 0,
  red: 13,
  blue: 26,
  yellow: 39,
};

/** Casas seguras em índice absoluto: saída de cada cor + estrela 8 casas depois. */
export const SAFE_ABS: ReadonlySet<number> = new Set(
  COLORS.flatMap((c) => [START_OFFSET[c], (START_OFFSET[c] + 8) % RING]),
);

/** Índice absoluto das 4 estrelas (a cor é a "dona" do canhão no Deathmatch). */
export const STAR_ABS: Record<Color, number> = {
  green: 8,
  red: 21,
  blue: 34,
  yellow: 47,
};

/** Casa do anel em coordenadas (linha, coluna) do grid 15×15. */
export const RING_CELLS: readonly Cell[] = (() => {
  const cells: Cell[] = [];
  const push = (row: number, col: number) => cells.push({ row, col });
  // braço esquerdo, linha 6, indo pra direita (saída do verde em col 1)
  for (let c = 1; c <= 5; c++) push(6, c);
  // sobe pelo braço de cima, coluna 6
  for (let r = 5; r >= 0; r--) push(r, 6);
  push(0, 7);
  // desce pela coluna 8 (saída do vermelho em row 1)
  for (let r = 0; r <= 5; r++) push(r, 8);
  // braço direito, linha 6, indo pra direita
  for (let c = 9; c <= 14; c++) push(6, c);
  push(7, 14);
  // volta pela linha 8 (saída do azul em col 13)
  for (let c = 14; c >= 9; c--) push(8, c);
  // desce pela coluna 8
  for (let r = 9; r <= 14; r++) push(r, 8);
  push(14, 7);
  // sobe pela coluna 6 (saída do amarelo em row 13)
  for (let r = 14; r >= 9; r--) push(r, 6);
  // braço esquerdo, linha 8, indo pra esquerda
  for (let c = 5; c >= 0; c--) push(8, c);
  push(7, 0);
  push(6, 0);
  if (cells.length !== RING) throw new Error(`anel com ${cells.length} casas`);
  return cells;
})();

/** As 5 casas da reta final de cada cor, da entrada até antes do centro. */
export const HOME_CELLS: Record<Color, readonly Cell[]> = {
  green: [1, 2, 3, 4, 5].map((c) => ({ row: 7, col: c })),
  red: [1, 2, 3, 4, 5].map((r) => ({ row: r, col: 7 })),
  blue: [13, 12, 11, 10, 9].map((c) => ({ row: 7, col: c })),
  yellow: [13, 12, 11, 10, 9].map((r) => ({ row: r, col: 7 })),
};

/** Canto superior-esquerdo (linha, coluna) do quadrado 6×6 da base de cada cor. */
export const BASE_ORIGIN: Record<Color, Cell> = {
  green: { row: 0, col: 0 },
  red: { row: 0, col: 9 },
  blue: { row: 9, col: 9 },
  yellow: { row: 9, col: 0 },
};

/** Centro (em células) de cada um dos 4 alvéolos dentro da base. */
export const BASE_SLOTS: readonly { dr: number; dc: number }[] = [
  { dr: 1.9, dc: 1.9 },
  { dr: 1.9, dc: 4.1 },
  { dr: 4.1, dc: 1.9 },
  { dr: 4.1, dc: 4.1 },
];

export const CENTER: Cell = { row: 7.5, col: 7.5 };

/**
 * Vagas das peças que já chegaram, dentro do triângulo da própria cor no
 * centro (verde = esquerda, vermelho = cima, azul = direita, amarelo = baixo).
 * Quatro posições por cor, em leque, encostadas no ponto central.
 */
export const FINISH_SLOTS: Record<Color, readonly { x: number; y: number }[]> = (() => {
  // no triângulo de cima (vermelho), em coordenadas relativas ao centro:
  // uma peça perto do vértice e uma fileira de três encostada na base do
  // triângulo. Pensado pra peça desenhada a ~0,72 da escala normal
  // (FINISH_SCALE na UI): assim as quatro cabem sem sair da cor.
  const top = [
    { x: 0, y: -0.5 },
    { x: -0.72, y: -1.15 },
    { x: 0, y: -1.17 },
    { x: 0.72, y: -1.15 },
  ];
  const rot = (k: number) =>
    top.map(({ x, y }) => {
      // gira k × 90° em sentido horário
      let px = x;
      let py = y;
      for (let i = 0; i < k; i++) [px, py] = [-py, px];
      return { x: CENTER.col + px, y: CENTER.row + py };
    });
  return { red: rot(0), blue: rot(1), yellow: rot(2), green: rot(3) };
})();

/** Converte posição relativa (0..51) em índice absoluto do anel. */
export function toAbsolute(color: Color, rel: number): number {
  return (rel + START_OFFSET[color]) % RING;
}

export function isRing(pos: number): boolean {
  return pos >= 0 && pos < HOME_START;
}
export function isHome(pos: number): boolean {
  return pos >= HOME_START && pos < FINISH;
}
export function isBase(pos: number): boolean {
  return pos === BASE;
}
export function isFinished(pos: number): boolean {
  return pos === FINISH;
}

/** Casa segura? Só faz sentido pra posições no anel. */
export function isSafe(color: Color, pos: number): boolean {
  return isRing(pos) && SAFE_ABS.has(toAbsolute(color, pos));
}

/** Coordenadas (em células, centro da casa) de uma peça, pra a UI. */
export function cellOf(color: Color, pos: number, pieceIndex: number): { x: number; y: number } {
  if (isBase(pos)) {
    const o = BASE_ORIGIN[color];
    const s = BASE_SLOTS[pieceIndex];
    return { x: o.col + s.dc, y: o.row + s.dr };
  }
  if (isFinished(pos)) return FINISH_SLOTS[color][pieceIndex] ?? { x: CENTER.col, y: CENTER.row };
  if (isHome(pos)) {
    const c = HOME_CELLS[color][pos - HOME_START];
    return { x: c.col + 0.5, y: c.row + 0.5 };
  }
  const c = RING_CELLS[toAbsolute(color, pos)];
  return { x: c.col + 0.5, y: c.row + 0.5 };
}

/** Progresso 0..1 de uma cor (média das peças; centro = 1). */
export function progressOf(pieces: number[]): number {
  const total = pieces.reduce((acc, p) => acc + (p === BASE ? 0 : p + 1), 0);
  return total / (pieces.length * (FINISH + 1));
}
