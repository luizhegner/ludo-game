<script lang="ts">
  import type { Snippet } from 'svelte';
  import { COLORS, FINISH, type Color, type GameState, type Power } from '../engine/types';
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
  import { isPhoto } from '../lib/avatars';
  import { controllerOf, destination, piecesColorFor, playerOf, progress } from '../engine/game';
  import { peekEffects } from '../engine/powers';
  import { POWER_ICON, powerBg, powerBorder } from '../lib/powers';
  import { powerIconUrl, isOgPowerIcon } from '../lib/art.svelte';
  import { players as roster } from '../stores/players.svelte';
  import { settings } from '../stores/settings.svelte';
  import Pawn from './Pawn.svelte';
  import type { Moving } from '../stores/match.svelte';

  interface Props {
    state: GameState;
    /** Índices das peças da cor da vez que podem mover. */
    legal?: number[];
    /** Peça andando casa a casa (desenhada em `moving.pos`, por cima das outras). */
    moving?: Moving | null;
    /** Peças voando de volta pra base (chaves `cor-índice`). */
    goingHome?: string[];
    /** UI travada (animação em andamento): nada é selecionável. */
    busy?: boolean;
    onPiece?: (piece: number) => void;
    /** Segurou o dedo numa casa de poder (mostrar explicação) / soltou. */
    onPowerHold?: (power: Power) => void;
    onPowerRelease?: () => void;
    /** Conteúdo extra por cima do tabuleiro (ex.: dado). Recebe o tamanho de uma célula em px. */
    overlay?: Snippet<[number]>;
  }

  let {
    state: game,
    legal = [],
    moving = null,
    goingHome = [],
    busy = false,
    onPiece,
    onPowerHold,
    onPowerRelease,
    overlay,
  }: Props = $props();

  /** Peças que já chegaram são desenhadas menores, pra caberem no triângulo da cor. */
  const FINISH_SCALE = 0.72;

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

  /** Tema "OG": visual do jogo original (moldura de madeira, bases chapadas, anel creme). */
  const og = $derived(settings.theme === 'og');
  /** Cores das bases no OG: mais saturadas/chapadas; anel creme com grade cinza-clara. */
  const OG_HEX: Record<Color, string> = { green: '#2db84d', red: '#ef3b36', blue: '#1e88e5', yellow: '#f7d51d' };
  const OG_INNER: Record<Color, string> = { green: '#27a343', red: '#d9302c', blue: '#1976cf', yellow: '#e6c414' };
  const OG_SLOT: Record<Color, string> = { green: '#229a3c', red: '#c8281f', blue: '#166cbd', yellow: '#d8b60f' };
  const hex = $derived(og ? OG_HEX : COLOR_HEX);
  const ringFill = $derived(og ? '#f3efe4' : '#fff');
  const gridStroke = $derived(og ? '#cfc8ba' : '#2b2f3a');
  const gridWidth = $derived(og ? 0.035 : 0.045);
  /** Cor cujas peças se movem nesta vez (no 2v2 pode ser a do parceiro). */
  const turn = $derived(piecesColorFor(game, game.turn.color));
  /** Cor de quem está jogando (base que brilha). */
  const actor = $derived(controllerOf(game, game.turn.color));
  const present = $derived(new Set(game.players.filter((p) => p.status !== 'removed').map((p) => p.color)));

  /** Casas de poder visíveis (minas escondidas não aparecem). */
  const powerCells = $derived(
    (game.powers?.cells ?? [])
      .filter((c) => !c.hidden)
      .map((c) => ({ ...c, cell: RING_CELLS[c.abs], art: powerIconUrl(c.power), full: isOgPowerIcon(c.power) })),
  );

  // segurar o dedo numa casa de poder → explicação na área de status
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  function holdStart(power: Power) {
    holdEnd();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      onPowerHold?.(power);
    }, 350);
  }
  function holdEnd() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    } else {
      onPowerRelease?.();
    }
  }

  /** Efeitos visuais de cada peça (escudo, fogo, gelo, multiplicador pendente). */
  function fxOf(color: Color, index: number) {
    const e = peekEffects(game, color, index);
    const pend = game.powers?.pending[color];
    return {
      shield: !!e.shield,
      fire: (e.fire ?? 0) > 0,
      frozen: (e.frozen ?? 0) > 0,
      mult: pend && pend.piece === index ? pend.factor : undefined,
    };
  }

  /** Casa de destino da(s) peça(s) legais, pra destacar. */
  const targets = $derived.by(() => {
    if (moving || busy) return [] as { x: number; y: number }[];
    if (game.turn.phase !== 'move' || game.turn.dice === null) return [] as { x: number; y: number }[];
    const d = game.turn.dice * (game.turn.mult ?? 1);
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
    type P = {
      color: Color;
      index: number;
      x: number;
      y: number;
      scale: number;
      key: string;
      moving?: boolean;
      flying?: boolean;
      flyKind?: 'rocket' | 'spring' | 'back';
      flyStep?: number;
    };
    const groups = new Map<string, P[]>();
    for (const color of COLORS) {
      if (!present.has(color)) continue;
      game.pieces[color].forEach((pos, index) => {
        if (moving && moving.color === color && moving.piece === index) return; // desenhada à parte
        const c = cellOf(color, pos, index);
        const k = pos === -1 ? `${color}-base-${index}` : `${c.x},${c.y}`;
        const p: P = { color, index, x: c.x, y: c.y, scale: pos === FINISH ? FINISH_SCALE : 1, key: `${color}-${index}` };
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
    // peça em movimento sempre por último (acima de todas), na casa atual da animação
    if (moving) {
      const c = cellOf(moving.color, moving.pos, moving.piece);
      const scale = moving.pos === FINISH ? FINISH_SCALE : 1;
      out.push({
        color: moving.color,
        index: moving.piece,
        x: c.x,
        y: c.y,
        scale,
        key: `${moving.color}-${moving.piece}`,
        moving: !moving.flying,
        flying: !!moving.flying,
        flyKind: moving.flyKind,
        flyStep: moving.step,
      });
    }
    return out;
  });

  /** OG: rastro "fantasma" nas 3 casas anteriores da peça que está andando casa a casa. */
  const trail = $derived.by(() => {
    if (!og || !moving || moving.flying) return [] as { x: number; y: number; k: number; o: number }[];
    const out: { x: number; y: number; k: number; o: number }[] = [];
    // início do trecho: from = pos - step; só casas do anel/reta (nunca a base)
    const start = moving.pos - moving.step;
    for (let d = 1; d <= 3; d++) {
      const p = moving.pos - d;
      if (p < 0 || p < start) break;
      const c = cellOf(moving.color, p, moving.piece);
      out.push({ x: c.x, y: c.y, k: p, o: 0.45 - d * 0.12 });
    }
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

  /**
   * Contorno do brilho da vez: segue a forma real da base — o canto que
   * encosta na borda do tabuleiro é arredondado (concêntrico ao raio do
   * tabuleiro), os outros três são retos com um raio pequeno só pra não
   * ficarem pontudos. Tudo em unidades de célula.
   */
  function baseOutline(color: Color, inset: number): string {
    const o = BASE_ORIGIN[color];
    const x0 = o.col + inset;
    const y0 = o.row + inset;
    const x1 = o.col + 6 - inset;
    const y1 = o.row + 6 - inset;
    // raio do tabuleiro (14px) em células, menos o recuo → canto externo concêntrico
    const R = Math.max(0.35, ((og ? 6 : 14) / size) * 15 - inset);
    const r = 0.22; // cantos internos
    // qual canto é o externo: verde ↖, vermelho ↗, azul ↘, amarelo ↙
    const rr = { tl: r, tr: r, br: r, bl: r };
    if (color === 'green') rr.tl = R;
    else if (color === 'red') rr.tr = R;
    else if (color === 'blue') rr.br = R;
    else rr.bl = R;
    return [
      `M${x0 + rr.tl},${y0}`,
      `H${x1 - rr.tr}`,
      `A${rr.tr},${rr.tr} 0 0 1 ${x1},${y0 + rr.tr}`,
      `V${y1 - rr.br}`,
      `A${rr.br},${rr.br} 0 0 1 ${x1 - rr.br},${y1}`,
      `H${x0 + rr.bl}`,
      `A${rr.bl},${rr.bl} 0 0 1 ${x0},${y1 - rr.bl}`,
      `V${y0 + rr.tl}`,
      `A${rr.tl},${rr.tl} 0 0 1 ${x0 + rr.tl},${y0}`,
      'Z',
    ].join(' ');
  }

  const ringColorOf = (abs: number): Color | null => {
    for (const c of COLORS) if (START_OFFSET[c] === abs) return c;
    return null;
  };
  const starColorOf = (abs: number): Color | null => {
    for (const c of COLORS) if (STAR_ABS[c] === abs) return c;
    return null;
  };
</script>

<div class="board" class:og>
  <div class="inner" bind:this={el}>
  <svg viewBox="0 0 15 15" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="pawn-shadow" x="-40%" y="-40%" width="180%" height="200%">
        <feDropShadow dx="0" dy="0.1" stdDeviation="0.08" flood-color="#000" flood-opacity="0.45" />
      </filter>
      <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0.05" stdDeviation="0.05" flood-color="#000" flood-opacity="0.25" />
      </filter>
      <!-- recorte arredondado pros ícones OG que ocupam a casa inteira -->
      <clipPath id="pcell" clipPathUnits="objectBoundingBox">
        <rect width="1" height="1" rx="0.2" ry="0.2" />
      </clipPath>
      {#each COLORS as c}
        <radialGradient id="g-{c}" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
          <stop offset="0.25" stop-color={COLOR_LIGHT[c]} />
          <stop offset="0.6" stop-color={COLOR_HEX[c]} />
          <stop offset="1" stop-color={COLOR_DARK[c]} />
        </radialGradient>
      {/each}
      <radialGradient id="og-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="0.45" stop-color="#fff" stop-opacity="0.22" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <clipPath id="avatar-clip" clipPathUnits="objectBoundingBox">
        <circle cx="0.5" cy="0.5" r="0.5" />
      </clipPath>
    </defs>

    <rect x="0" y="0" width="15" height="15" fill={ringFill} />

    <!-- anel -->
    {#each RING_CELLS as c, i}
      {@const sc = ringColorOf(i)}
      <rect x={c.col} y={c.row} width="1" height="1" fill={sc ? hex[sc] : ringFill} stroke={gridStroke} stroke-width={gridWidth} />
    {/each}

    <!-- retas finais -->
    {#each COLORS as k}
      {#each HOME_CELLS[k] as c}
        <rect x={c.col} y={c.row} width="1" height="1" fill={hex[k]} stroke={gridStroke} stroke-width={gridWidth} />
      {/each}
    {/each}

    <!-- estrelas: coloridas nas seguras, brancas nas saídas -->
    {#each RING_CELLS as c, i}
      {@const st = starColorOf(i)}
      {@const sc = ringColorOf(i)}
      {#if st}
        <polygon points={star(c.col + 0.5, c.row + 0.5, og ? 0.4 : 0.36)} fill={hex[st]} opacity={og ? 1 : 0.9} stroke={og ? COLOR_DARK[st] : 'none'} stroke-width="0.02" stroke-linejoin="round" />
      {:else if sc}
        <polygon points={star(c.col + 0.5, c.row + 0.5, og ? 0.36 : 0.32)} fill="#fff" />
      {/if}
    {/each}

    <!-- casas de poder (modo Poderes) -->
    {#each powerCells as pc (pc.abs)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        class="power"
        onpointerdown={(e) => { e.preventDefault(); holdStart(pc.power); }}
        onpointerup={holdEnd}
        onpointercancel={holdEnd}
        onpointerleave={holdEnd}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <rect
          x={pc.cell.col + 0.07}
          y={pc.cell.row + 0.07}
          width="0.86"
          height="0.86"
          rx="0.18"
          fill={powerBg(pc.power)}
          stroke={powerBorder(pc.power)}
          stroke-width="0.05"
        />
        {#if pc.art && pc.full}
          <!-- recorte do jogo original: já vem com o fundo da casa, ocupa a casa inteira (cantos arredondados) -->
          <image href={pc.art} x={pc.cell.col + 0.07} y={pc.cell.row + 0.07} width="0.86" height="0.86" preserveAspectRatio="xMidYMid slice" clip-path="url(#pcell)" pointer-events="none" />
        {:else if pc.art}
          <!-- arte própria: quadrado de 0,7 célula, centrado, sem esticar -->
          <image href={pc.art} x={pc.cell.col + 0.15} y={pc.cell.row + 0.15} width="0.7" height="0.7" preserveAspectRatio="xMidYMid meet" pointer-events="none" />
        {:else}
          <text x={pc.cell.col + 0.5} y={pc.cell.row + 0.5} text-anchor="middle" dominant-baseline="central" font-size={pc.power === 'x2' || pc.power === 'x3' ? 0.42 : 0.56} font-weight="800" fill="#1f2430">
            {pc.power === 'x2' ? '×2' : pc.power === 'x3' ? '×3' : POWER_ICON[pc.power]}
          </text>
        {/if}
      </g>
    {/each}

    <!-- setas de entrada -->
    {#each arrows as a}
      <polygon points="-.28,-.2 .12,0 -.28,.2" transform="translate({a.x} {a.y}) rotate({a.rot})" fill="#fff" opacity="0.9" />
    {/each}

    <!-- centro -->
    <polygon points="6,6 9,6 7.5,7.5" fill={hex.red} />
    <polygon points="9,6 9,9 7.5,7.5" fill={hex.blue} />
    <polygon points="9,9 6,9 7.5,7.5" fill={hex.yellow} />
    <polygon points="6,9 6,6 7.5,7.5" fill={hex.green} />
    <rect x="6" y="6" width="3" height="3" fill="none" stroke={gridStroke} stroke-width={gridWidth} />

    <!-- bases -->
    {#each COLORS as k}
      {@const o = BASE_ORIGIN[k]}
      {@const p = playerOf(game, k)}
      {@const active = p && p.status !== 'removed'}
      {@const isTurn = k === actor && game.turn.phase !== 'over'}
      <g class="base" class:empty={!active}>
        <rect x={o.col} y={o.row} width="6" height="6" fill={hex[k]} />
        {#if og}
          <!-- OG: quadrado interno na mesma cor, um tom mais escuro, e 4 círculos marcando as vagas -->
          <rect x={o.col + 0.9} y={o.row + 0.9} width="4.2" height="4.2" rx="0.5" fill={OG_INNER[k]} opacity={active ? 1 : 0.7} />
          {#each BASE_SLOTS as s}
            <circle cx={o.col + s.dc} cy={o.row + s.dr} r="0.5" fill={OG_SLOT[k]} />
          {/each}
          {#if isTurn}
            <!-- pulso radial branco no meio do quadrante (jogador da vez) -->
            <circle class="og-pulse" cx={o.col + 3} cy={o.row + 3} r="2.6" fill="url(#og-glow)" />
          {/if}
        {:else}
          {#if isTurn}
            <path class="turn-glow" d={baseOutline(k, 0.2)} fill="none" stroke="#fff" stroke-width="0.16" stroke-linejoin="round" />
          {/if}
          <rect x={o.col + 0.9} y={o.row + 0.9} width="4.2" height="4.2" rx="0.35" fill="#fff" filter="url(#soft)" opacity={active ? 1 : 0.55} />
          {#each BASE_SLOTS as s}
            <circle cx={o.col + s.dc} cy={o.row + s.dr} r="0.62" fill={COLOR_LIGHT[k]} stroke={COLOR_DARK[k]} stroke-width="0.05" opacity="0.9" />
          {/each}
        {/if}
        {#if p && active}
          {@const avatar = roster.avatarOf(p.playerId, p.avatar)}
          {@const name = roster.nameOf(p.playerId, p.name)}
          {@const outer = k === 'green' || k === 'red' ? o.row + 0.72 : o.row + 5.62}
          {@const inner = k === 'green' || k === 'red' ? o.row + 5.62 : o.row + 0.66}
          {#if og}
            <!-- OG: nome na borda externa do quadrante (longe do centro), % e ⚔/☠ na borda interna -->
            <text
              x={o.col + 3}
              y={outer}
              text-anchor="middle"
              font-size="0.6"
              font-weight="800"
              fill="#fff"
              style="paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:.07"
            >
              {name.length > 12 ? name.slice(0, 11) + '…' : name}
            </text>
            <text x={o.col + 3} y={inner} text-anchor="middle" font-size="0.5" font-weight="800" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:.06">
              {Math.round(progress(game, k) * 100)}%
            </text>
            {#if p.stats.captures || p.stats.deaths}
              <text x={o.col + 5.75} y={inner} text-anchor="end" font-size="0.4" font-weight="700" fill="#fff" opacity="0.9" style="paint-order:stroke;stroke:rgba(0,0,0,.4);stroke-width:.05">
                ⚔{p.stats.captures} ☠{p.stats.deaths}
              </text>
            {/if}
          {:else}
          {#if isPhoto(avatar)}
              <!-- foto: círculo recortado + nome ao lado -->
              <image
                href={avatar}
                x={o.col + 0.55}
                y={o.row + 5.18}
                width="0.72"
                height="0.72"
                clip-path="url(#avatar-clip)"
                preserveAspectRatio="xMidYMid slice"
              />
              <circle cx={o.col + 0.91} cy={o.row + 5.54} r="0.36" fill="none" stroke="#fff" stroke-width="0.06" />
              <text
                x={o.col + 1.45}
                y={o.row + 5.74}
                text-anchor="start"
                font-size="0.58"
                font-weight="700"
                fill={COLOR_ON[k]}
                style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:.05"
              >
                {name.length > 10 ? name.slice(0, 9) + '…' : name}
              </text>
            {:else}
              <text
                x={o.col + 3}
                y={o.row + 5.62}
                text-anchor="middle"
                font-size="0.6"
                font-weight="700"
                fill={COLOR_ON[k]}
                style="paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:.05"
              >
                {avatar} {name.length > 11 ? name.slice(0, 10) + '…' : name}
              </text>
            {/if}
            <text x={o.col + 3} y={o.row + 0.66} text-anchor="middle" font-size="0.48" font-weight="700" fill={COLOR_ON[k]} opacity="0.9">
              {Math.round(progress(game, k) * 100)}%
            </text>
            {#if p.stats.captures || p.stats.deaths}
              <text x={o.col + 5.75} y={o.row + 0.66} text-anchor="end" font-size="0.4" font-weight="700" fill={COLOR_ON[k]} opacity="0.85">
                ⚔{p.stats.captures} ☠{p.stats.deaths}
              </text>
            {/if}
          {/if}
        {:else}
          <text x={o.col + 3} y={o.row + 5.62} text-anchor="middle" font-size="0.5" font-weight="600" fill={COLOR_ON[k]} opacity="0.7">
            vazio
          </text>
        {/if}
      </g>
    {/each}

    <!-- OG: rastro fantasma da peça em movimento -->
    {#each trail as t (t.k)}
      <circle class="ghost" cx={t.x} cy={t.y + 0.06} r="0.3" fill={hex[moving!.color]} opacity={t.o} />
    {/each}

    <!-- destino(s) do movimento -->
    {#each targets as t}
      <circle class="target" cx={t.x} cy={t.y} r="0.42" fill="none" stroke={COLOR_HEX[turn]} stroke-width="0.1" />
    {/each}

    <!-- peças -->
    {#each pawns as p (p.key)}
      {@const fx = game.powers ? fxOf(p.color, p.index) : undefined}
      <Pawn
        color={p.color}
        x={p.x}
        y={p.y}
        scale={p.scale}
        selectable={!busy && !moving && p.color === turn && legal.includes(p.index)}
        dim={!moving && game.turn.phase === 'move' && p.color === turn && !legal.includes(p.index) && isRing(game.pieces[p.color][p.index])}
        moving={!!p.moving}
        flying={!!p.flying}
        flyKind={p.flyKind}
        flyStep={p.flyStep}
        home={goingHome.includes(p.key)}
        shield={fx?.shield}
        fire={fx?.fire}
        frozen={fx?.frozen}
        mult={fx?.mult}
        onclick={() => onPiece?.(p.index)}
      />
    {/each}
  </svg>

  {#if overlay}
    <div class="overlay">{@render overlay(cell)}</div>
  {/if}
  </div>
</div>

<style>
  .board {
    width: 100%;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 18px 40px -14px rgba(0, 0, 0, 0.45), 0 2px 0 rgba(0, 0, 0, 0.08);
  }
  .inner {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
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
  .og-pulse {
    transform-box: fill-box;
    transform-origin: center;
    animation: og-pulse 1.2s ease-in-out infinite;
  }
  @keyframes og-pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
  }
  /* moldura de madeira do tema OG (o Board recebe a classe via GameScreen) */
  .board.og {
    border-radius: 12px;
    background: linear-gradient(160deg, #6b3a22, #3e2013 60%, #2c150c);
    padding: 2.2%;
    box-shadow: 0 0 0 1px rgba(255, 220, 170, 0.12) inset, 0 22px 44px -16px rgba(0, 0, 0, 0.8);
  }
  .board.og svg {
    border-radius: 6px;
    overflow: hidden;
  }
  .target {
    animation: pulse 1s ease-in-out infinite;
  }
  .base.empty {
    opacity: 0.8;
  }
  .power {
    cursor: help;
    touch-action: none;
    animation: power-in 0.5s ease-out;
  }
  .power text {
    pointer-events: none;
    user-select: none;
  }
  @keyframes power-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
