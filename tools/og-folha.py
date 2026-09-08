#!/usr/bin/env python3
"""
Separa a FOLHA de ícones do jogo original (tira horizontal, fundo xadrez
"de transparência" queimado no PNG) em ícones PNG 128×128 com fundo
transparente de verdade, salvos em `src/assets/art/og/powers/`.

Ordem padrão da folha (esquerda → direita), igual ao mapeamento combinado:
  rocket · shield · fire · freeze · mine · bomb · spring · magic-dice

Como funciona:
  1) se o PNG já tem alfa verdadeiro, usa o alfa como fundo;
  2) senão, detecta as duas cores do xadrez nas bordas e o tamanho da casa
     (runs de pixels ao longo das bordas), marca como candidato a fundo cada
     pixel que bate com a cor esperada DAQUELA casa do xadrez (tolerância
     `--tol`) e enxuga por flood-fill a partir das bordas — buraco branco
     FECHADO dentro do ícone (corpo do foguete) não é comido;
  3) corta em N colunas (segmentos contíguos de primeiro plano; se a conta
     não fechar em N, divide em partes iguais), centraliza o conteúdo em
     ~85% da tela (regra 2 do ARTE.md §1) e salva 128×128 otimizados;
  4) `--contato` salva uma prévia da folha limpa + tira dos recortes, e
     `--debug` salva a máscara crua — pra conferir de olho.

Uso:
  pip install pillow
  python3 tools/og-folha.py folha.png                     # 8 nomes padrão
  python3 tools/og-folha.py folha.png out/                # outra pasta
  python3 tools/og-folha.py folha.png --nomes a b c d --contato --debug
  python3 tools/og-folha.py folha.png --tol=24            # máscara mais gorda

Nada disso é obrigatório pro jogo — é só a linha de montagem da arte.
"""
from __future__ import annotations

import os
import sys
from collections import Counter, deque

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit('instale o pillow: pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'src', 'assets', 'art', 'og', 'powers')

# folha padrão do jogo original, da esquerda pra direita
NAMES = ['rocket', 'shield', 'fire', 'freeze', 'mine', 'bomb', 'spring', 'magic-dice']

CELL_PX = 128    # lado do PNG final (mesmo do tools/og-icones.py)
FILL = 0.85      # conteúdo ocupando ~85% da tela (ARTE.md §1, regra 2)
TOL = 30         # distância RGB pra considerar "cor do xadrez"


def dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def border_colors(rgb: Image.Image, tol: int) -> 'tuple[tuple[int, int, int], tuple[int, int, int], int]':
    """As duas cores dominantes do xadrez (mais clara primeiro) e o lado da casa."""
    w, h = rgb.size
    px = rgb.load()
    band = max(2, min(w, h) // 50)
    cnt: Counter[tuple[int, int, int]] = Counter()
    for x in range(w):
        for y in list(range(min(band, h))) + list(range(max(0, h - band), h)):
            cnt[px[x, y]] += 1
    for y in range(h):
        for x in list(range(min(band, w))) + list(range(max(0, w - band), w)):
            cnt[px[x, y]] += 1
    if not cnt:
        raise SystemExit('sem pixels de borda pra amostrar?')
    # agrupa em clusters de 8 níveis por canal e pega os dois maiores
    buck: dict[tuple[int, int, int], list[tuple[tuple[int, int, int], int]]] = {}
    for c, n in cnt.items():
        buck.setdefault((c[0] // 8, c[1] // 8, c[2] // 8), []).append((c, n))
    clusters = sorted(
        ((max(g, key=lambda t: t[1])[0], sum(n for _, n in g)) for g in buck.values()),
        key=lambda t: -t[1],
    )
    a = clusters[0][0]
    # só aceita 2ª cor se ela também for "de borda" (o xadrez cobre a folha toda)
    b = clusters[1][0] if len(clusters) > 1 and clusters[1][1] > clusters[0][1] * 0.15 else a
    if sum(a) < sum(b):  # mais clara primeiro
        a, b = b, a
    if dist(a, b) <= tol:  # as "duas cores" são a mesma → fundo sólido
        b = a

    # tamanho da casa: mediana dos runs a/b ao longo de faixas de borda
    def runs(seq: list[int]) -> int:
        out = [1]
        for i in range(1, len(seq)):
            if seq[i] == seq[i - 1]:
                out[-1] += 1
            else:
                out.append(1)
        out = [r for r in out if r >= 3]
        out.sort()
        return out[len(out) // 2] if out else 0

    sizes = []
    for y in (band // 2, h - 1 - band // 2):
        if 0 <= y < h:
            sizes.append(runs([0 if dist(px[x, y], a) <= dist(px[x, y], b) else 1 for x in range(w)]))
    for x in (band // 2, w - 1 - band // 2):
        if 0 <= x < w:
            sizes.append(runs([0 if dist(px[x, y], a) <= dist(px[x, y], b) else 1 for y in range(h)]))
    sizes = [s for s in sizes if s]
    size = max(3, min(max(sizes), 96)) if sizes else 16
    return a, b, size


def make_mask(im: Image.Image, tol: int) -> 'tuple[Image.Image, str]':
    """Máscara 'L' (255 = fundo, 0 = ícone). Usa alfa real se houver; senão, xadrez."""
    w, h = im.size
    if im.mode == 'RGBA':
        px = im.load()
        step = 17
        clear = total = 0
        for i in range(0, w * h, step):
            p = px[i % w, i // w]
            total += 1
            if p[3] <= 8:
                clear += 1
        if total and clear / total > 0.05:
            a = im.getchannel('A').point(lambda v: 255 if v <= 8 else 0)
            return a, 'alfa'
    rgb = im.convert('RGB')
    ca, cb, cell = border_colors(rgb, tol)
    px = rgb.load()
    # fase do xadrez: (0,0) é a cor mais clara ou a mais escura?
    phase = 0 if dist(px[0, 0], ca) <= dist(px[0, 0], cb) else 1
    cand = bytearray(w * h)  # 1 = parece o fundo daquela casa
    for y in range(h):
        base = y * w
        for x in range(w):
            e = ca if (((x // cell) + (y // cell) + phase) % 2) == 0 else cb
            if dist(px[x, y], e) <= tol:
                cand[base + x] = 1
    # flood-fill 4-vizinhos a partir de todo pixel de borda candidato
    seen = bytearray(w * h)
    q: deque[int] = deque()

    def push(i: int) -> None:
        if cand[i] and not seen[i]:
            seen[i] = 1
            q.append(i)

    for x in range(w):
        push(x)
        push((h - 1) * w + x)
    for y in range(h):
        push(y * w)
        push(y * w + w - 1)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        if x:
            push(i - 1)
        if x < w - 1:
            push(i + 1)
        if y:
            push(i - w)
        if y < h - 1:
            push(i + w)
    mask = Image.frombytes('L', (w, h), bytes((255 * v for v in seen)))
    return mask, f'xadrez (cores {ca}/{cb}, casa {cell}px)'


def split_columns(mask: Image.Image, n: int) -> 'list[tuple[int, int]]':
    """Segmentos contíguos de colunas com primeiro plano; se não der N, divide igual."""
    w, h = mask.size
    m = mask.load()
    fg = [False] * w
    for x in range(w):
        for y in range(h):
            if m[x, y] == 0:
                fg[x] = True
                break
    segs: list[tuple[int, int]] = []
    start = None
    for x in range(w + 1):
        on = x < w and fg[x]
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start > max(4, w // (n * 6)):  # poeira entre ícones vira nada
                segs.append((start, x))
            start = None
    if len(segs) == n:
        return segs
    step = w / n
    return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(n)]


def cut_icon(rgb: Image.Image, mask: Image.Image, x0: int, x1: int) -> Image.Image:
    """Recorta o ícone de uma fatia, centra em CELL_PX com ~FILL de conteúdo."""
    m = mask.load()
    px = rgb.load()
    bx0, by0, bx1, by1 = x1, mask.height, x0, 0
    for x in range(x0, x1):
        for y in range(mask.height):
            if m[x, y] == 0:
                if x < bx0:
                    bx0 = x
                if x > bx1:
                    bx1 = x
                if y < by0:
                    by0 = y
                if y > by1:
                    by1 = y
    if bx1 < bx0 or by1 < by0:
        raise SystemExit('fatia sem primeiro plano — a máscara comeu o ícone todo (baixe --tol?)')
    crop = rgb.crop((bx0, by0, bx1 + 1, by1 + 1))
    alpha = Image.new('L', crop.size, 255)
    am = alpha.load()
    for y in range(crop.height):
        for x in range(crop.width):
            if m[bx0 + x, by0 + y] == 255:
                am[x, y] = 0
    crop.putalpha(alpha)
    side = CELL_PX * FILL
    s = side / max(crop.size)
    nw, nh = max(1, round(crop.width * s)), max(1, round(crop.height * s))
    crop = crop.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGBA', (CELL_PX, CELL_PX), (0, 0, 0, 0))
    out.paste(crop, ((CELL_PX - nw) // 2, (CELL_PX - nh) // 2), crop)
    return out


def parse(argv: list[str]) -> tuple[str, str, list[str], int, bool, bool]:
    src = out_dir = ''
    names: list[str] = []
    tol = TOL
    contato = debug = False
    mode = 'pos'
    rest: list[str] = []
    for a in argv:
        if a == '--nomes':
            mode = 'nomes'
            continue
        if a == '--contato':
            contato = True
            mode = 'pos'
            continue
        if a == '--debug':
            debug = True
            mode = 'pos'
            continue
        if a.startswith('--tol='):
            tol = int(a.split('=', 1)[1])
            mode = 'pos'
            continue
        if a.startswith('--'):
            raise SystemExit(f'opção desconhecida: {a}')
        if mode == 'nomes':
            names.append(a)
        else:
            rest.append(a)
    if not rest:
        print(__doc__)
        sys.exit(2)
    src = rest[0]
    out_dir = rest[1] if len(rest) > 1 else OUT_DIR
    return src, out_dir, names or NAMES, tol, contato, debug


def main(argv: list[str]) -> None:
    src, out_dir, names, tol, contato, debug = parse(argv[1:])
    im = Image.open(src)
    mask, how = make_mask(im, tol)
    n = len(names)
    segs = split_columns(mask, n)
    if len(segs) != n:
        print(f'aviso: achei {len(segs)} segmentos de primeiro plano, esperava {n}; cortando em partes iguais', file=sys.stderr)
        w = im.width
        segs = [(round(i * w / n), round((i + 1) * w / n)) for i in range(n)]
    print(f'fundo removido por: {how}  ·  {n} ícones  ·  tol={tol}')
    os.makedirs(out_dir, exist_ok=True)
    rgb = im.convert('RGB')
    strip = Image.new('RGBA', (n * 40, 40), (60, 60, 60, 255))
    for i, (name, (x0, x1)) in enumerate(zip(names, segs)):
        icon = cut_icon(rgb, mask, x0, x1)
        out = os.path.join(out_dir, f'{name}.png')
        icon.save(out, optimize=True)
        strip.paste(icon.resize((40, 40), Image.LANCZOS), (i * 40, 0), icon.resize((40, 40), Image.LANCZOS))
        print(f'{name:<12} col {x0:>4}–{x1:<4} → {out} ({os.path.getsize(out) // 1024 + 1} KB)')
    if debug:
        mask.save(os.path.splitext(src)[0] + '.mask.png')
    if contato:
        w, h = im.size
        over = rgb.convert('RGBA')
        pxx = over.load()
        mm = mask.load()
        for y in range(h):
            for x in range(w):
                if mm[x, y] == 255:
                    r = (x // 16 + y // 16) % 2 * 32 + 160
                    pxx[x, y] = (r, r, r, 255)
        over.paste(strip, (0, h - 40), strip)
        over.save(os.path.splitext(src)[0] + '.contato.png')
        print(f'prévia: {os.path.splitext(src)[0]}.contato.png')


if __name__ == '__main__':
    main(sys.argv)
