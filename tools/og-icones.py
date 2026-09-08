#!/usr/bin/env python3
"""
Recorta as casas de poder de prints (capturas de tela) do jogo original e
salva cada ícone em `src/assets/art/og/powers/<poder>.png`, no tamanho exato
da casa, com cantos arredondados transparentes. Também serve pra recortar
qualquer região (dado, estrela, avatar) com `--caixa`.

Como funciona:
  1) acha o tabuleiro no print pela cor dos 4 quadrantes (verde ↖, vermelho ↗,
     azul ↘, amarelo ↙) — não depende de resolução nem de proporção da tela;
  2) divide em 15 × 15 casas;
  3) `listar` monta uma folha de contato das 52 casas do anel + setas com o
     número de cada uma, pra você dizer qual é qual;
  4) `recortar` salva as casas indicadas com o nome do poder.

Uso:
  python3 tools/og-icones.py listar  print.png                 # gera print.contato.png
  python3 tools/og-icones.py recortar print.png 5=shield 17=fire 30=x2 ...
  python3 tools/og-icones.py recortar print.png --caixa 340,95,80,80=dado-6
  (números = índice da casa na folha de contato; nomes = coluna "Arquivo" do ARTE.md)

Precisa do pacote python `pillow`. Nada disso é obrigatório pro jogo.
"""
from __future__ import annotations

import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit('instale o pillow: pip install pillow')

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'assets', 'art', 'og', 'powers')
CELL_PX = 128  # lado do PNG final (a casa no celular tem ~24 px; 128 dá folga pra tablet)

# Cores médias dos quadrantes no jogo original (RGB) e tolerância.
QUAD = {
    'green': (73, 188, 69),
    'red': (233, 68, 68),
    'yellow': (231, 201, 40),
    'blue': (26, 122, 216),
}
TOL = 40


def close(p: tuple[int, int, int], q: tuple[int, int, int]) -> bool:
    return all(abs(a - b) <= TOL for a, b in zip(p, q))


def _span(counts: list[int], lo_frac: float = 0.15, max_gap: int = 3) -> tuple[int, int]:
    """Trecho contíguo (tolerando buracos pequenos) em volta do máximo, onde há "bastante" pixels da cor."""
    peak = max(counts)
    if peak == 0:
        return (0, 0)
    thr = peak * lo_frac
    i = counts.index(peak)
    a = b = i
    gap = 0
    while a > 0:
        if counts[a - 1] >= thr:
            a -= 1
            gap = 0
        elif gap < max_gap:
            a -= 1
            gap += 1
        else:
            break
    while counts[a] < thr:
        a += 1
    gap = 0
    while b < len(counts) - 1:
        if counts[b + 1] >= thr:
            b += 1
            gap = 0
        elif gap < max_gap:
            b += 1
            gap += 1
        else:
            break
    while counts[b] < thr:
        b -= 1
    return a, b


def find_board(im: Image.Image) -> 'Board':
    """
    Devolve (x0, y0, lado) do tabuleiro 15×15. Procura, pra cada cor de
    quadrante, o maior bloco contínuo de pixels daquela cor (histograma por
    linha e por coluna) — elementos pequenos da interface com a mesma cor
    (botões, borda do avatar) ficam de fora porque são finos/isolados.
    """
    scale = 1.0
    small = im.convert('RGB')
    if small.width > 720:
        scale = 720 / small.width
        small = small.resize((720, int(round(small.height * scale))), Image.BILINEAR)
    w, h = small.size
    px = small.load()
    rows = {k: [0] * h for k in QUAD}
    cols = {k: [0] * w for k in QUAD}
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            for k, c in QUAD.items():
                if close(p, c):
                    rows[k][y] += 1
                    cols[k][x] += 1
                    break
    box = {}
    for k in QUAD:
        y0, y1 = _span(rows[k])
        x0, x1 = _span(cols[k])
        box[k] = (x0, y0, x1, y1)
    g, r, b, yl = box['green'], box['red'], box['blue'], box['yellow']
    x0 = min(g[0], yl[0])
    y0 = min(g[1], r[1])
    x1 = max(r[2], b[2]) + 1
    y1 = max(b[3], yl[3]) + 1
    bw, bh = x1 - x0, y1 - y0
    if bw <= 0 or bh <= 0:
        raise SystemExit('não achei os quadrantes coloridos nesse print (confira se o tabuleiro aparece inteiro)')
    if abs(bw - bh) > max(bw, bh) * 0.03:
        # vídeo reescalado sem manter proporção (ex.: 1080×2400 → 480×854): casas ficam retangulares; tratamos largura e altura separadas
        print(f'aviso: tabuleiro não é quadrado no print ({bw}×{bh}); usando escalas separadas', file=sys.stderr)
    return Board(int(round(x0 / scale)), int(round(y0 / scale)), bw / scale, bh / scale)


class Board:
    def __init__(self, x0: int, y0: int, w: float, h: float) -> None:
        self.x0, self.y0, self.w, self.h = x0, y0, w, h

    @property
    def cw(self) -> float:
        return self.w / 15

    @property
    def ch(self) -> float:
        return self.h / 15


def cell_box(bd: 'Board', col: int, row: int, pad: float = 0.0) -> tuple[int, int, int, int]:
    return (
        int(round(bd.x0 + (col + pad) * bd.cw)),
        int(round(bd.y0 + (row + pad) * bd.ch)),
        int(round(bd.x0 + (col + 1 - pad) * bd.cw)),
        int(round(bd.y0 + (row + 1 - pad) * bd.ch)),
    )


def ring_cells() -> list[tuple[int, int]]:
    """As 52 casas do anel na ordem do motor (0 = saída do verde), (col, row)."""
    cells: list[tuple[int, int]] = []
    # mesmo traçado de src/engine/board.ts
    for c in range(1, 6):
        cells.append((c, 6))  # 0–4: braço esquerdo, linha de cima → indo pra direita
    for r in range(5, -1, -1):
        cells.append((6, r))  # 5–10: sobe pela coluna 6
    cells.append((7, 0))  # 11: topo
    for r in range(0, 6):
        cells.append((8, r))  # 12–17: desce pela coluna 8
    for c in range(9, 15):
        cells.append((c, 6))  # 18–23: braço direito, linha de cima
    cells.append((14, 7))  # 24
    for c in range(14, 8, -1):
        cells.append((c, 8))  # 25–30: braço direito, linha de baixo, voltando
    for r in range(9, 15):
        cells.append((8, r))  # 31–36: desce coluna 8
    cells.append((7, 14))  # 37
    for r in range(14, 8, -1):
        cells.append((6, r))  # 38–43: sobe coluna 6
    for c in range(5, -1, -1):
        cells.append((c, 8))  # 44–49: braço esquerdo, linha de baixo, voltando
    cells.append((0, 7))  # 50
    cells.append((0, 6))  # 51
    return cells


def contact_sheet(path: str) -> None:
    im = Image.open(path).convert('RGBA')
    bd = find_board(im)
    cells = ring_cells()
    n = len(cells)
    cols = 13
    rows = (n + cols - 1) // cols
    tile = 96
    sheet = Image.new('RGBA', (cols * tile, rows * (tile + 18)), (40, 40, 40, 255))
    d = ImageDraw.Draw(sheet)
    for i, (c, r) in enumerate(cells):
        box = cell_box(bd, c, r)
        crop = im.crop(box).resize((tile - 6, tile - 6), Image.LANCZOS)
        tx = (i % cols) * tile + 3
        ty = (i // cols) * (tile + 18) + 3
        sheet.paste(crop, (tx, ty))
        d.text((tx + 2, ty + tile - 6), str(i), fill=(255, 255, 255, 255))
    out = os.path.splitext(path)[0] + '.contato.png'
    sheet.save(out)
    print(f'tabuleiro em x={bd.x0} y={bd.y0} {bd.w:.0f}×{bd.h:.0f} px (casa ≈ {bd.cw:.1f}×{bd.ch:.1f} px)')
    print(f'folha de contato: {out}  — anote "índice=nome" das casas com poder')


def rounded_mask(size: int, radius: float) -> Image.Image:
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def save_icon(crop: Image.Image, name: str, out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    icon = crop.resize((CELL_PX, CELL_PX), Image.LANCZOS).convert('RGBA')
    icon.putalpha(rounded_mask(CELL_PX, CELL_PX * 0.2))  # mesmo raio do clip-path do tabuleiro (rx=0.2)
    out = os.path.join(out_dir, f'{name}.png')
    icon.save(out, optimize=True)
    return out


def recortar(path: str, args: list[str], out_dir: str = OUT_DIR) -> None:
    im = Image.open(path).convert('RGBA')
    bd = find_board(im)
    cells = ring_cells()
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--caixa':
            spec = args[i + 1]
            i += 2
            box, name = spec.split('=')
            bx, by, bw, bh = (int(v) for v in box.split(','))
            crop = im.crop((bx, by, bx + bw, by + bh))
            out = save_icon(crop, name, out_dir)
            print(f'{name:<12} caixa {box} → {out}')
            continue
        idx, name = a.split('=')
        c, r = cells[int(idx)]
        # pad 0.06: fica de fora a linha da grade; o clip arredondado faz o resto
        crop = im.crop(cell_box(bd, c, r, pad=0.06))
        out = save_icon(crop, name, out_dir)
        print(f'{name:<12} casa {idx:>2} (col {c}, row {r}) → {out}')
        i += 1


def main(argv: list[str]) -> None:
    if len(argv) >= 3 and argv[1] == 'listar':
        contact_sheet(argv[2])
    elif len(argv) >= 4 and argv[1] == 'recortar':
        recortar(argv[2], argv[3:])
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == '__main__':
    main(sys.argv)
