#!/usr/bin/env python3
"""
Separa a FOLHA de ícones do jogo original (tira horizontal com o fundo xadrez
"de transparência" queimado no PNG) em ícones 128×128 de fundo transparente,
salvos em `src/assets/art/og/powers/`.

Ordem padrão da folha (esquerda → direita), igual ao mapeamento combinado:
  rocket · shield · fire · freeze · mine · bomb · spring · magic-dice

Como funciona:
  1) se o PNG já tem alfa verdadeiro, usa o alfa como fundo;
  2) senão, detecta as cores do xadrez nas bordas. Com xadrez ESCURO, fundo é
     "cinza até a casa clara + folga" (casa clara, casa escura, sombras e o
     antialiasing da borda do sprite — tudo cinzento e apagado) mais o que
     bater com uma das duas cores; com xadrez CLARO vale só "perto de uma das
     duas cores". Flood-fill a partir das bordas decide o que é fundo —
     buraco fechado dentro do ícone (miolo branco do foguete) sobrevive;
  3) MATTE SUAVE: cada pixel que sobrou recebe alfa proporcional à distância
     dele pra cor do fundo (pixels saturados do desenho ficam opacos). É isso
     que come a franja de antialiasing que, composta sobre a placa clara da
     casa, parece "ícone com fundo branco";
  4) corta em N colunas (segmentos de primeiro plano; se não der N, divide em
     partes iguais), centra o conteúdo em ~85% da tela (regra 2 do ARTE.md §1)
     e salva 128×128 otimizados;
  5) --contato monta uma prévia dupla: os recortes a 40 px SOBRE A PLACA DA
     FAMÍLIA (como o jogo desenha) e a 128 px sobre branco — é assim que tem
     que ser conferido, não sobre fundo escuro; --debug salva a máscara.

Uso:
  pip install pillow
  python3 tools/og-folha.py folha.png                       # 8 nomes padrão
  python3 tools/og-folha.py folha.png out/ --contato
  python3 tools/og-folha.py folha.png --nomes a b c d       # outra lista
  python3 tools/og-folha.py folha.png --tol=24              # ajuste fino

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
TOL = 26         # distância RGB pra "é exatamente a cor do xadrez"
FADE_LO = 16     # distância do fundo abaixo disso = transparente (matte suave)
FADE_HI = 90     # acima disso = opaco
SAT_KEEP = 60    # pixel saturado (max-min) acima disso nunca some (é do desenho)


def dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def border_colors(rgb: Image.Image, tol: int) -> 'tuple[tuple[int, int, int], tuple[int, int, int]]':
    """As duas cores dominantes do xadrez nas bordas da folha (mais clara primeiro)."""
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
    buck: dict[tuple[int, int, int], list[tuple[tuple[int, int, int], int]]] = {}
    for c, n in cnt.items():
        buck.setdefault((c[0] // 8, c[1] // 8, c[2] // 8), []).append((c, n))
    clusters = sorted(
        ((max(g, key=lambda t: t[1])[0], sum(n for _, n in g)) for g in buck.values()),
        key=lambda t: -t[1],
    )
    a = clusters[0][0]
    b = clusters[1][0] if len(clusters) > 1 and clusters[1][1] > clusters[0][1] * 0.15 else a
    if sum(a) < sum(b):
        a, b = b, a
    if dist(a, b) <= tol:
        b = a
    return a, b


def make_fg(rgb: Image.Image, tol: int):
    """Retorna (fg, dark, ca, cb, lim, how) — fg[x]=1 é desenho, 0 é fundo alcançável."""
    w, h = rgb.size
    px = rgb.load()
    ca, cb = border_colors(rgb, tol)
    dark = max(ca) <= 160
    cand = bytearray(w * h)
    lim = max(ca) + 33  # teto de "cinza do fundo" (casa clara + sombra + AA)
    for y in range(h):
        base = y * w
        for x in range(w):
            p = px[x, y]
            sat = max(p) - min(p)
            if dark and sat <= 16 and max(p) <= lim:
                cand[base + x] = 1  # cinza escuro/claro do xadrez (ou sombra dele)
            elif dist(p, ca) <= tol or dist(p, cb) <= tol:
                cand[base + x] = 1
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
    fg = bytearray(1 - v for v in seen)
    how = f'xadrez {"escuro" if dark else "claro"} (cores {ca}/{cb}, tol {tol})'
    return fg, dark, ca, cb, lim, how


def soft_alpha(fg: bytearray, rgb: Image.Image, dark: bool, ca: tuple[int, int, int], cb: tuple[int, int, int], lim: int) -> bytearray:
    """
    Matte suave LOCAL: cada pixel do desenho começa opaco; só quem toca o fundo
    (ou a franja já desbotada dele) pode desbotar, pela distância até a cor do
    xadrez. Assim a franja de antialiasing some, mas um miolo claro FECHADO
    dentro do ícone (corpo branco do foguete sobre xadrez claro) sobrevive —
    uma passada global de "perto do fundo = fade" comeria ele.
    """
    w, h = rgb.size
    px = rgb.load()
    a = bytearray(255 if fg[i] else 0 for i in range(w * h))

    def fade(p: tuple[int, int, int]) -> int:
        if max(p) - min(p) >= SAT_KEEP:
            return 255
        d = min(dist(p, ca), dist(p, cb))
        if dark and max(p) <= lim and d > FADE_LO:
            d = max(d, lim - max(p) + FADE_LO)
        if d <= FADE_LO:
            return 0
        if d >= FADE_HI:
            return 255
        return round(255 * (d - FADE_LO) / (FADE_HI - FADE_LO))

    for _ in range(8):  # converge rápido: a frente anda 1 px por volta
        changed = False
        for y in range(h):
            base = y * w
            for x in range(w):
                i = base + x
                cur = a[i]
                if cur == 0:
                    continue
                nb = 255
                for j in (i - 1, i + 1, i - w, i + w):
                    if 0 <= j < w * h and a[j] < nb:
                        nb = a[j]
                if nb >= 255:
                    continue
                cand = fade(px[x, y])
                if cand < cur:
                    a[i] = cand
                    changed = True
        if not changed:
            break
    return a


def split_columns(fg: bytearray, w: int, h: int, n: int) -> 'list[tuple[int, int]]':
    colfg = [False] * w
    for x in range(w):
        for y in range(h):
            if fg[y * w + x]:
                colfg[x] = True
                break
    segs: list[tuple[int, int]] = []
    start = None
    for x in range(w + 1):
        on = x < w and colfg[x]
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start > max(4, w // (n * 6)):
                segs.append((start, x))
            start = None
    if len(segs) == n:
        return segs
    step = w / n
    return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(n)]


def cut_icon(rgb: Image.Image, alpha: bytearray, x0: int, x1: int) -> Image.Image:
    w, h = rgb.size
    px = rgb.load()
    bx0, by0, bx1, by1 = x1, h, x0, 0
    for y in range(h):
        for x in range(x0, x1):
            if alpha[y * w + x] > 24:
                if x < bx0: bx0 = x
                if x > bx1: bx1 = x
                if y < by0: by0 = y
                if y > by1: by1 = y
    if bx1 < bx0 or by1 < by0:
        raise SystemExit('fatia sem primeiro plano — a máscara comeu o ícone todo (suba --tol?)')
    out = Image.new('RGBA', (CELL_PX, CELL_PX), (0, 0, 0, 0))
    op = Image.new('RGB', (bx1 - bx0 + 1, by1 - by0 + 1), (0, 0, 0))
    oa = Image.new('L', op.size, 0)
    opp, oap = op.load(), oa.load()
    for y in range(by0, by1 + 1):
        for x in range(bx0, bx1 + 1):
            a = alpha[y * w + x]
            if a == 0:
                continue
            opp[x - bx0, y - by0] = px[x, y]
            oap[x - bx0, y - by0] = a
    op = op.convert('RGBA')
    op.putalpha(oa)
    s = (CELL_PX * FILL) / max(op.size)
    nw, nh = max(1, round(op.width * s)), max(1, round(op.height * s))
    op = op.resize((nw, nh), Image.LANCZOS)
    out.paste(op, ((CELL_PX - nw) // 2, (CELL_PX - nh) // 2), op)
    return out


def parse(argv: list[str]) -> tuple[str, str, list[str], int, bool, bool]:
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
    return rest[0], (rest[1] if len(rest) > 1 else OUT_DIR), names or NAMES, tol, contato, debug


def main(argv: list[str]) -> None:
    src, out_dir, names, tol, contato, debug = parse(argv[1:])
    im = Image.open(src)
    w, h = im.size
    rgb = im.convert('RGB')
    src_alpha = None
    fg = dark = lim = ca = cb = how = None
    if im.mode == 'RGBA':
        a = im.getchannel('A')
        av = a.get_flattened_data() if hasattr(a, 'get_flattened_data') else list(a.getdata())
        if any(v <= 8 for v in av[::17]):  # alfa real manda (xadrez é só do visual do editor)
            fg = bytearray(1 if v > 8 else 0 for v in av)
            src_alpha = a
            how = 'alfa'
            dark, ca, cb, lim = False, (0, 0, 0), (0, 0, 0), 0
    if fg is None:
        fg, dark, ca, cb, lim, how = make_fg(rgb, tol)
    if src_alpha is None:
        alpha = soft_alpha(fg, rgb, dark, ca, cb, lim)
    else:
        av2 = src_alpha.get_flattened_data() if hasattr(src_alpha, 'get_flattened_data') else list(src_alpha.getdata())
        alpha = bytearray(v for v in av2)
    n = len(names)
    segs = split_columns(fg, w, h, n)
    if len(segs) != n:
        print(f'aviso: {len(segs)} segmentos, esperava {n}; cortando em partes iguais', file=sys.stderr)
        segs = [(round(i * w / n), round((i + 1) * w / n)) for i in range(n)]
    print(f'fundo removido por: {how}  ·  {n} ícones  ·  tol={tol}')
    os.makedirs(out_dir, exist_ok=True)
    icons: list[tuple[str, Image.Image]] = []
    for name, (x0, x1) in zip(names, segs):
        icon = cut_icon(rgb, alpha, x0, x1)
        icon.save(os.path.join(out_dir, f'{name}.png'), optimize=True)
        icons.append((name, icon))
        print(f'{name:<11} col {x0:>4}–{x1:<4} → {out_dir}/{name}.png ({os.path.getsize(os.path.join(out_dir, name + ".png")) // 1024 + 1} KB)')
    if debug:
        Image.frombytes('L', (w, h), bytes(alpha)).save(os.path.splitext(src)[0] + '.fg.png')
    if contato:
        # prévia 1: sobre placa da família a 40 px (44 no tabuleiro); prévia 2: 128 px sobre branco
        pastels = {'rocket': '#ffe1bf', 'shield': '#d2e8ff', 'fire': '#ffcfcf', 'freeze': '#d2e8ff',
                   'mine': '#ffcfcf', 'bomb': '#ffcfcf', 'spring': '#ffe1bf', 'magic-dice': '#e9d8ff'}
        cell = 46
        top = Image.new('RGB', (n * cell + 1, cell + 1), (244, 240, 232))
        bot = Image.new('RGBA', (n * 136 + 1, 137), (255, 255, 255, 255))
        for i, (name, icon) in enumerate(icons):
            paste = icon.resize((40, 40), Image.LANCZOS)
            tile = Image.new('RGB', (40, 40), pastels.get(name, '#e9d8ff'))
            tile.paste(paste, (0, 0), paste)
            top.paste(tile, (i * cell + 3, 3))
            bot.paste(icon, (i * 136 + 4, 4), icon)
        top.save(os.path.splitext(src)[0] + '.placas.png')
        bot.convert('RGB').save(os.path.splitext(src)[0] + '.128.png')
        print(f'prévias: {os.path.splitext(src)[0]}.placas.png (como no jogo) · {os.path.splitext(src)[0]}.128.png (branco)')


if __name__ == '__main__':
    main(sys.argv)
