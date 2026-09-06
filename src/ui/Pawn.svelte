<script lang="ts">
  import type { Color } from '../engine/types';
  import { COLOR_DARK } from '../lib/colors';

  interface Props {
    color: Color;
    /** Centro, em unidades de célula do tabuleiro. */
    x: number;
    y: number;
    /** Escala relativa (peças empilhadas ficam menores). */
    scale?: number;
    selectable?: boolean;
    dim?: boolean;
    onclick?: () => void;
  }

  let { color, x, y, scale = 1, selectable = false, dim = false, onclick }: Props = $props();
</script>

<!--
  Peão desenhado em SVG com gradiente radial por cor (definido no Board).
  Transição de posição via CSS pra animar o movimento casa a casa.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
  class="pawn"
  class:selectable
  class:dim
  style="transform: translate({x}px, {y}px) scale({scale});"
  role={selectable ? 'button' : undefined}
  aria-label={selectable ? 'Mover peça' : undefined}
  onclick={selectable ? onclick : undefined}
  onkeydown={selectable ? (e) => (e.key === 'Enter' || e.key === ' ') && onclick?.() : undefined}
  tabindex={selectable ? 0 : undefined}
>
  {#if selectable}
    <circle class="halo" r="0.55" cy="0.08" fill="none" stroke="#fff" stroke-width="0.12" />
    <circle r="0.62" cy="0.08" fill="#fff" opacity="0.001" />
  {/if}
  <ellipse cx="0" cy="0.36" rx="0.36" ry="0.13" fill="#000" opacity="0.32" />
  <path
    d="M-.34,.34 C-.34,.15 -.16,.08 -.11,-.06 L-.11,-.1 C-.24,-.16 -.28,-.42 -.05,-.44 L.05,-.44 C.28,-.42 .24,-.16 .11,-.1 L.11,-.06 C.16,.08 .34,.15 .34,.34 Z"
    fill="url(#g-{color})"
    stroke={COLOR_DARK[color]}
    stroke-width="0.04"
    filter="url(#pawn-shadow)"
  />
  <circle cx="0" cy="-0.26" r="0.2" fill="url(#g-{color})" stroke={COLOR_DARK[color]} stroke-width="0.04" />
  <ellipse cx="-0.07" cy="-0.32" rx="0.07" ry="0.05" fill="#fff" opacity="0.8" />
</g>

<style>
  .pawn {
    transition: transform 0.16s ease-in-out;
    transform-box: fill-box;
    transform-origin: 0 0;
  }
  .pawn.selectable {
    cursor: pointer;
  }
  .pawn.dim {
    opacity: 0.55;
  }
  .halo {
    transform-origin: 0 0.08px;
    animation: halo 1.1s ease-in-out infinite;
  }
</style>
