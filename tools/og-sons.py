#!/usr/bin/env python3
"""
Recorta os efeitos sonoros do jogo original a partir de uma gravação de tela
(vídeo com áudio de mídia) e gera o pacote `public/sounds/og/`.

Uso:
  1) listar os "eventos" de som encontrados (início, fim, pico) pra rotular:
       python3 tools/og-sons.py detectar gravacao.mp4 > eventos.txt
  2) escrever um arquivo de cortes (uma linha por som; tempos em segundos ou m:ss.s):
       # inicio   fim      nome            (nome = coluna "Arquivo" do SONS.md, sem extensão)
       12.30      13.05    dice-roll
       13.05      13.30    dice-land
       0:41.2     0:41.9   capture
  3) gerar os mp3 (mono, 44,1 kHz, pico −1 dBFS, silêncio inicial removido):
       python3 tools/og-sons.py cortar gravacao.mp4 cortes.txt public/sounds/og

Precisa de ffmpeg no PATH (ou do pacote python `imageio-ffmpeg`).
Nada disso é obrigatório pro jogo: sem os arquivos, valem os sons padrão.
"""
from __future__ import annotations

import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import wave


def ffmpeg() -> str:
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit('ffmpeg não encontrado: instale-o ou rode `pip install imageio-ffmpeg`')


def to_wav(src: str, dst: str, sr: int = 44100) -> None:
    subprocess.run([ffmpeg(), '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', str(sr), '-c:a', 'pcm_s16le', dst], check=True)


def read_wav(path: str) -> tuple[list[float], int]:
    with wave.open(path) as w:
        sr = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
    samples = struct.unpack(f'<{n}h', raw)
    return [s / 32768.0 for s in samples], sr


def parse_time(t: str) -> float:
    m = re.fullmatch(r'(?:(\d+):)?(\d+(?:\.\d+)?)', t.strip())
    if not m:
        raise ValueError(f'tempo inválido: {t}')
    return (int(m.group(1) or 0)) * 60 + float(m.group(2))


def fmt(t: float) -> str:
    return f'{int(t // 60)}:{t % 60:05.2f}'


def detectar(src: str, floor_db: float = -55.0, gap: float = 0.25) -> None:
    """Imprime trechos com som separados por ≥ `gap` s de silêncio (gravação de mídia é silêncio digital entre efeitos)."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        to_wav(src, wav)
        x, sr = read_wav(wav)
    win = int(sr * 0.01)  # 10 ms
    n = len(x) // win
    loud = []
    for i in range(n):
        seg = x[i * win : (i + 1) * win]
        e = sum(s * s for s in seg) / len(seg)
        loud.append(10 * math.log10(e + 1e-12) > floor_db)
    events: list[tuple[float, float]] = []
    start = None
    last_loud = -1
    for i, on in enumerate(loud):
        t = i * 0.01
        if on:
            if start is None:
                start = t
            last_loud = i
        elif start is not None and (i - last_loud) * 0.01 >= gap:
            events.append((start, last_loud * 0.01 + 0.01))
            start = None
    if start is not None:
        events.append((start, n * 0.01))
    print(f'# {len(events)} trechos com som em {src} (piso {floor_db} dBFS, pausa ≥ {gap}s)')
    print('# inicio\tfim\tduracao\tnome (preencha)')
    for a, b in events:
        print(f'{a:.2f}\t{b:.2f}\t{b - a:.2f}\t')


def peak_db(ff: str, src: str, a: float, b: float) -> float:
    """Pico (dBFS) do trecho, medido com volumedetect."""
    r = subprocess.run(
        [ff, '-hide_banner', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', src, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
        capture_output=True,
        text=True,
    )
    m = re.search(r'max_volume:\s*(-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else 0.0


def ler_cortes(cuts: str) -> list[tuple[float, float, str]]:
    out: list[tuple[float, float, str]] = []
    with open(cuts, encoding='utf-8') as f:
        for ln in f:
            ln = ln.split('#', 1)[0].strip()
            if not ln:
                continue
            parts = ln.split()
            if len(parts) < 3:
                print(f'linha ignorada: {ln}', file=sys.stderr)
                continue
            a, b, name = parse_time(parts[0]), parse_time(parts[1]), parts[2]
            if not re.fullmatch(r'[a-z0-9-]+', name):
                print(f'nome inválido ({name}): use letras minúsculas, números e hífen', file=sys.stderr)
                continue
            if b <= a:
                print(f'trecho vazio ignorado: {ln}', file=sys.stderr)
                continue
            out.append((a, b, name))
    return out


def cortar(src: str, cuts: str, outdir: str, bitrate: str = '96k', target_db: float = -1.0) -> None:
    """
    Gera um mp3 por linha do arquivo de cortes. O ganho é ÚNICO pra todos os
    cortes (o pico mais alto da sessão vai pra `target_db`), preservando o
    balanço original do jogo — passo baixinho, captura alta etc.
    """
    os.makedirs(outdir, exist_ok=True)
    ff = ffmpeg()
    items = ler_cortes(cuts)
    if not items:
        sys.exit('nenhum corte válido')
    peaks = {name: peak_db(ff, src, a, b) for a, b, name in items}
    gain = target_db - max(peaks.values())
    print(f'ganho global: {gain:+.1f} dB (pico mais alto: {max(peaks, key=peaks.get)})')
    for a, b, name in items:
        out = os.path.join(outdir, f'{name}.mp3')
        # corte → tira o silêncio do começo (som tem que ser imediato) → ganho → fade-out de 15 ms → mp3 mono
        af = (
            'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005,'
            f'volume={gain:.2f}dB,'
            f'afade=t=out:st={max(0.0, (b - a) - 0.015):.3f}:d=0.015'
        )
        subprocess.run(
            [ff, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', src, '-vn', '-ac', '1', '-ar', '44100', '-af', af, '-c:a', 'libmp3lame', '-b:a', bitrate, out],
            check=True,
        )
        kb = os.path.getsize(out) / 1024
        print(f'{name:<14} {fmt(a)} → {fmt(b)}  pico {peaks[name] + gain:6.1f} dBFS  {kb:5.1f} KB')
    total = sum(os.path.getsize(os.path.join(outdir, f)) for f in os.listdir(outdir) if f.endswith('.mp3')) / 1024
    print(f'{len(items)} sons em {outdir} ({total:.0f} KB no total)')


def main(argv: list[str]) -> None:
    if len(argv) >= 3 and argv[1] == 'detectar':
        detectar(argv[2])
    elif len(argv) >= 5 and argv[1] == 'cortar':
        cortar(argv[2], argv[3], argv[4])
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == '__main__':
    main(sys.argv)
