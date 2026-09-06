<script lang="ts">
  import type { Snippet } from 'svelte';
  import { COLORS, type Color, type GameState } from '../engine/types';
  import {
    BASE_ORIGIN,
    BASE_SLOTS,
    HOME_CELLS,
    RING_CELLS,
    STAR_ABS,
    START_OFFSET,
    cellOf,
    toAbsolute,
    isRing,
  } from '../engine/board';
  import { COLOR_HEX, COLOR_DARK, COLOR_LIGHT, COLOR_ON } from '../lib/colors';
  import { destination, playerOf, progress } from '../engine/game';
  import Pawn from './Pawn.svelte';

  interface Props {
    state: GameState;
    /** Índices das peças da cor da vez que podem mover. */
    legal?: number[];
    onPiece?: (piece: number) => void;
    /** Conteúdo extra por cima do tabuleiro (ex.: dado). Recebe o tamanho de uma célula em px. */
    overlay?: Snippet<[number]>;
  }

  let { state: game, legal = [], onPiece, overlay }: Props = $props();

  let el: HTMLDivElement | undefined = $state();
  let size = $state(360);
  const cell = $derived(size / 15);

  $effect(() => {
    if (!el) return;
    size = el.clientWidth || size;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => (size = e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  });

  const turn = $derived(game.turn.color);
  const present = $derived(new Set(game.players.filter((p) => p.status !== 'removed').map((p) => p.color)));

  /** Casa de destino da(s) peça(s) legais, pra destacar. */
  const targets = $derived.by(() => {
    if (game.turn.phase !== 'move' || game.turn.dice === null) return [] as { x: number; y: number }[];
    const d = game.turn.dice;
    const seen = new Set<string>();
    const out: { x: number; y: number }[] = [];
    for (const i of legal) {
      const to = destination(game.pieces[turn][i], d);
      const c = cellOf(turn, to, i);
      const k = `${c.x},${c.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
    }
    return out;
  });

  /**
   * Peças renderizadas com posição e escala. Peças na mesma casa são
   * espalhadas levemente e encolhidas pra continuarem visíveis.
   */
  const pawns = $derived.by(() => {
    type P = { color: Color; index: number; x: number; y: number; scale: number; key: string };
    const groups = new Map<string, P[]>();
    for (const color of COLORS) {
      if (!present.has(color)) continue;
      game.pieces[color].forEach((pos, index) => {
        const c = cellOf(color, pos, index);
        const k = pos === -1 ? `${color}-base-${index}` : `${c.x},${c.y}`;
        const p: P = { color, index, x: c.x, y: c.y, scale: 1, key: `${color}-${index}` };
        const g = groups.get(k) ?? [];
        g.push(p);
        groups.set(k, g);
      });
    }
    const out: P[] = [];
    for (const g of groups.values()) {
      if (g.length === 1) {
        out.push(g[0]);
        continue;
      }
      const n = g.length;
      const s = n === 2 ? 0.82 : n === 3 ? 0.72 : 0.64;
      const r = n === 2 ? 0.16 : 0.2;
      g.forEach((p, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        out.push({ ...p, x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) + 0.04, scale: s });
      });
    }
    // peça da vez por cima
    out.sort((a, b) => (a.color === turn ? 1 : 0) - (b.color === turn ? 1 : 0) || a.y - b.y);
    return out;
  });

  function star(cx: number, cy: number, R: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? R * 0.45 : R;
      pts.push(`${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`);
    }
    return pts.join(' ');
  }

  const arrows: { color: Color; x: number; y: number; rot: number }[] = [
    { color: 'green', x: 0.5, y: 7.5, rot: 0 },
    { color: 'red', x: 7.5, y: 0.5, rot: 90 },
    { color: 'blue', x: 14.5, y: 7.5, rot: 180 },
    { color: 'yellow', x: 7.5, y: 14.5, rot: 270 },
  ];

  const ringColorOf = (abs: number): Color | null => {
    for (const c of COLORS) if (START_OFFSET[c] === abs) return c;
    return null;
  };
  const starColorOf = (abs: number): Color | null => {
    for (const c of COLORS) if (STAR_ABS[c] === abs) return c;
    return null;
  };
</script>

<div class="board" bind:this={el}>
  <svg viewBox="0 0 15 15" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="pawn-shadow" x="-40%" y="-40%" width="180%" height="200%">
        <feDropShadow dx="0" dy="0.1" stdDeviation="0.08" flood-color="#000" flood-opacity="0.45" />
      </filter>
      <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0.05" stdDeviation="0.05" flood-color="#000" flood-opacity="0.25" />
      </filter>
      {#each COLORS as c}
        <radialGradient id="g-{c}" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
          <stop offset="0.25" stop-color={COLOR_LIGHT[c]} />
          <stop offset="0.6" stop-color={COLOR_HEX[c]} />
          <stop offset="1" stop-color={COLOR_DARK[c]} />
        </radialGradient>
      {/each}
    </defs>

    <rect x="0" y="0" width="15" height="15" fill="#fff" />

    <!-- anel -->
    {#each RING_CELLS as c, i}
      {@const sc = ringColorOf(i)}
      <rect x={c.col} y={c.row} width="1" height="1" fill={sc ? COLOR_HEX[sc] : '#fff'} stroke="#2b2f3a" stroke-width="0.045" />
    {/each}

    <!-- retas finais -->
    {#each COLORS as k}
      {#each HOME_CELLS[k] as c}
        <rect x={c.col} y={c.row} width="1" height="1" fill={COLOR_HEX[k]} stroke="#2b2f3a" stroke-width="0.045" />
      {/each}
    {/each}

    <!-- estrelas: coloridas nas seguras, brancas nas saídas -->
    {#each RING_CELLS as c, i}
      {@const st = starColorOf(i)}
      {@const sc = ringColorOf(i)}
      {#if st}
        <polygon points={star(c.col + 0.5, c.row + 0.5, 0.36)} fill={COLOR_HEX[st]} opacity="0.9" />
      {:else if sc}
        <polygon points={star(c.col + 0.5, c.row + 0.5, 0.32)} fill="#fff" />
      {/if}
    {/each}

    <!-- setas de entrada -->
    {#each arrows as a}
      <polygon points="-.28,-.2 .12,0 -.28,.2" transform="translate({a.x} {a.y}) rotate({a.rot})" fill="#fff" opacity="0.9" />
    {/each}

    <!-- centro -->
    <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX.red} />
    <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX.blue} />
    <polygon points="9,9 6,9 7.5,7.5" fill={COLOR_HEX.yellow} />
    <polygon points="6,9 6,6 7.5,7.5" fill={COLOR_HEX.green} />
    <rect x="6" y="6" width="3" height="3" fill="none" stroke="#2b2f3a" stroke-width="0.045" />

    <!-- bases -->
    {#each COLORS as k}
      {@const o = BASE_ORIGIN[k]}
      {@const p = playerOf(game, k)}
      {@const active = p && p.status !== 'removed'}
      {@const isTurn = k === turn && game.turn.phase !== 'over'}
      <g class="base" class:empty={!active}>
        <rect x={o.col} y={o.row} width="6" height="6" fill={COLOR_HEX[k]} />
        {#if isTurn}
          <rect
            class="turn-glow"
            x={o.col + 0.18}
            y={o.row + 0.18}
            width="5.64"
            height="5.64"
            rx="0.5"
            fill="none"
            stroke="#fff"
            stroke-width="0.16"
          />
        {/if}
        <rect x={o.col + 0.9} y={o.row + 0.9} width="4.2" height="4.2" rx="0.35" fill="#fff" filter="url(#soft)" opacity={active ? 1 : 0.55} />
        {#each BASE_SLOTS as s}
          <circle cx={o.col + s.dc} cy={o.row + s.dr} r="0.62" fill={COLOR_LIGHT[k]} stroke={COLOR_DARK[k]} stroke-width="0.05" opacity="0.9" />
        {/each}
        {#if p && active}
          <text
            x={o.col + 3}
            y={o.row + 5.62}
            text-anchor="middle"
            font-size="0.6"
            font-weight="700"
            fill={COLOR_ON[k]}
            style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:.05"
          >
            {p.avatar} {p.name}
          </text>
          <text x={o.col + 3} y={o.row + 0.66} text-anchor="middle" font-size="0.48" font-weight="700" fill={COLOR_ON[k]} opacity="0.9">
            {Math.round(progress(game, k) * 100)}%
          </text>
          {#if p.stats.captures || p.stats.deaths}
            <text x={o.col + 5.75} y={o.row + 0.66} text-anchor="end" font-size="0.4" font-weight="700" fill={COLOR_ON[k]} opacity="0.85">
              ⚔{p.stats.captures} ☠{p.stats.deaths}
            </text>
          {/if}
        {:else}
          <text x={o.col + 3} y={o.row + 5.62} text-anchor="middle" font-size="0.5" font-weight="600" fill={COLOR_ON[k]} opacity="0.7">
            vazio
          </text>
        {/if}
      </g>
    {/each}

    <!-- destino(s) do movimento -->
    {#each targets as t}
      <circle class="target" cx={t.x} cy={t.y} r="0.42" fill="none" stroke={COLOR_HEX[turn]} stroke-width="0.1" />
    {/each}

    <!-- peças -->
    {#each pawns as p (p.key)}
      <Pawn
        color={p.color}
        x={p.x}
        y={p.y}
        scale={p.scale}
        selectable={p.color === turn && legal.includes(p.index)}
        dim={game.turn.phase === 'move' && p.color === turn && !legal.includes(p.index) && isRing(game.pieces[p.color][p.index])}
        onclick={() => onPiece?.(p.index)}
      />
    {/each}
  </svg>

  {#if overlay}
    <div class="overlay">{@render overlay(cell)}</div>
  {/if}
</div>

<style>
  .board {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 18px 40px -14px rgba(0, 0, 0, 0.45), 0 2px 0 rgba(0, 0, 0, 0.08);
  }
  svg {
    display: block;
  }
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .overlay :global(*) {
    pointer-events: auto;
  }
  .turn-glow {
    animation: pulse 1.4s ease-in-out infinite;
  }
  .target {
    animation: pulse 1s ease-in-out infinite;
  }
  .base.empty {
    opacity: 0.8;
  }
</style>
