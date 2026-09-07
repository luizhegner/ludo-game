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
    /** Voo de foguete/mola: arco longo de uma vez só. */
    flying?: boolean;
    /** Efeitos do modo Poderes. */
    shield?: boolean;
    fire?: boolean;
    frozen?: boolean;
    mult?: 2 | 3;
    onclick?: () => void;
  }

  let {
    color,
    x,
    y,
    scale = 1,
    selectable = false,
    dim = false,
    moving = false,
    home = false,
    flying = false,
    shield = false,
    fire = false,
    frozen = false,
    mult,
    onclick,
  }: Props = $props();
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
  class:flying
  class:frozen
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
  {#if fire}
    <g class="fire">
      <ellipse cx="0" cy="0.1" rx="0.42" ry="0.5" fill="#ff9800" opacity="0.35" />
      <ellipse cx="0" cy="0.05" rx="0.3" ry="0.4" fill="#ffeb3b" opacity="0.45" />
    </g>
  {/if}
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
  {#if shield}
    <circle class="shield" r="0.5" cy="0" fill="rgba(74,144,217,0.15)" stroke="#4a90d9" stroke-width="0.07" />
  {/if}
  {#if frozen}
    <g class="ice">
      <rect x="-0.4" y="-0.5" width="0.8" height="0.9" rx="0.18" fill="rgba(180,225,255,0.55)" stroke="#7cc4ff" stroke-width="0.05" />
      <text y="0.12" text-anchor="middle" font-size="0.36">❄️</text>
    </g>
  {/if}
  {#if mult}
    <g class="mult">
      <circle cx="0.3" cy="-0.42" r="0.2" fill="#9b6ddb" stroke="#fff" stroke-width="0.04" />
      <text x="0.3" y="-0.35" text-anchor="middle" font-size="0.24" font-weight="800" fill="#fff">×{mult}</text>
    </g>
  {/if}
  {#if fire}
    <text class="flame" y="-0.55" text-anchor="middle" font-size="0.4">🔥</text>
  {/if}
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
  /* voo de foguete/mola: arco longo */
  .pawn.flying {
    transition: transform 0.7s cubic-bezier(0.4, 0, 0.3, 1);
  }
  .pawn.flying .body {
    animation: fly-far 0.7s ease-in-out;
  }
  .pawn.flying .shadow {
    transform-origin: 0 0.36px;
    animation: fly-far-shadow 0.7s ease-in-out;
  }
  .pawn.frozen .body {
    filter: saturate(0.5) brightness(1.1);
  }
  .shield {
    animation: shield-pulse 1.6s ease-in-out infinite;
  }
  .flame {
    animation: flicker 0.35s ease-in-out infinite alternate;
  }
  .fire {
    animation: flicker 0.25s ease-in-out infinite alternate;
    transform-origin: 0 0.3px;
  }
  @keyframes shield-pulse {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }
  @keyframes flicker {
    from {
      transform: scale(0.92) translateY(0.02px);
    }
    to {
      transform: scale(1.08) translateY(-0.03px);
    }
  }
  @keyframes fly-far {
    0% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-1.6px) scale(1.5);
    }
    100% {
      transform: translateY(0) scale(1);
    }
  }
  @keyframes fly-far-shadow {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.32;
    }
    50% {
      transform: scale(0.4);
      opacity: 0.1;
    }
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
