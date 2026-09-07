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
    /** Andando casa a casa: pulinho + sombra encolhendo a cada passo. */
    moving?: boolean;
    /** Voltando pra base (comida / três 6): voo curto. */
    home?: boolean;
    onclick?: () => void;
  }

  let { color, x, y, scale = 1, selectable = false, dim = false, moving = false, home = false, onclick }: Props = $props();
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
  class:moving
  class:home
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
  <ellipse class="shadow" cx="0" cy="0.36" rx="0.36" ry="0.13" fill="#000" opacity="0.32" />
  <g class="body">
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
  /* movimento casa a casa: a posição é trocada pelo store a cada 150 ms;
     o corpo dá um pulinho e a sombra encolhe enquanto ele está "no ar" */
  .pawn.moving {
    transition: transform 0.15s linear;
  }
  .pawn.moving .body {
    animation: hop 0.15s ease-out infinite;
  }
  .pawn.moving .shadow {
    transform-origin: 0 0.36px;
    animation: hop-shadow 0.15s ease-out infinite;
  }
  /* voo de volta pra base */
  .pawn.home {
    transition: transform 0.55s cubic-bezier(0.3, 0.9, 0.4, 1);
  }
  .pawn.home .body {
    animation: fly 0.55s ease-in-out;
  }
  @keyframes hop {
    0% {
      transform: translateY(0);
    }
    45% {
      transform: translateY(-0.22px);
    }
    100% {
      transform: translateY(0);
    }
  }
  @keyframes hop-shadow {
    0% {
      transform: scale(1);
      opacity: 0.32;
    }
    45% {
      transform: scale(0.6);
      opacity: 0.18;
    }
    100% {
      transform: scale(1);
      opacity: 0.32;
    }
  }
  @keyframes fly {
    0% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-0.9px) scale(1.25);
    }
    100% {
      transform: translateY(0) scale(1);
    }
  }
</style>
