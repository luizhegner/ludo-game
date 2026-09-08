<script lang="ts">
  import type { Color } from '../engine/types';
  import { COLOR_DARK } from '../lib/colors';
  import { fxSprite } from '../lib/art.svelte';
  import Sprite from './Sprite.svelte';

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
    /** Tipo do voo e etapa (foguete: 0 = decolando, 1 = voando, 2 = pousando). */
    flyKind?: 'rocket' | 'spring' | 'back';
    flyStep?: number;
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
    flyKind = undefined,
    flyStep = 0,
    shield = false,
    fire = false,
    frozen = false,
    mult,
    onclick,
  }: Props = $props();

  // sprites opcionais (src/assets/art/fx/): quando existem, substituem o desenho padrão
  const fireFx = $derived(fire ? fxSprite('fire') : null);
  const shieldFx = $derived(shield ? fxSprite('shield') : null);
  const freezeFx = $derived(frozen ? fxSprite('freeze') : null);
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
  class:flying={flying && flyKind !== 'rocket'}
  class:spring={flying && flyKind === 'spring'}
  class:liftoff={flying && flyKind === 'rocket' && flyStep === 0}
  class:cruise={flying && flyKind === 'rocket' && flyStep === 1}
  class:landing={flying && flyKind === 'rocket' && flyStep === 2}
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
  {#if fire && !fireFx}
    <g class="fire">
      <ellipse cx="0" cy="0.1" rx="0.42" ry="0.5" fill="#ff9800" opacity="0.35" />
      <ellipse cx="0" cy="0.05" rx="0.3" ry="0.4" fill="#ffeb3b" opacity="0.45" />
    </g>
  {/if}
  {#if shieldFx}
    <!-- escudo animado atrás do peão (1,2 célula, centrado no corpo) -->
    <Sprite sprite={shieldFx} x={0} y={-0.02} size={1.2} />
  {/if}
  <g class="body">
  {#if flying && flyKind === 'rocket' && flyStep < 2}
    <!-- chama do foguete: sai por baixo do peão e acompanha a inclinação dele -->
    <g class="exhaust">
      <path d="M-.16,.3 Q0,1.05 .16,.3 Z" fill="#ff9800" opacity="0.9" />
      <path d="M-.09,.3 Q0,.8 .09,.3 Z" fill="#ffeb3b" />
      <circle class="smoke" cx="-0.22" cy="0.62" r="0.11" fill="#cfd8dc" opacity="0.7" />
      <circle class="smoke s2" cx="0.2" cy="0.7" r="0.14" fill="#cfd8dc" opacity="0.6" />
    </g>
  {/if}
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
  {#if fireFx}
    <!-- fogo animado por cima do peão: quadro de 1,1 célula, base alinhada aos pés -->
    <Sprite sprite={fireFx} x={0} y={-0.2} size={1.1} />
  {/if}
  {#if shield && !shieldFx}
    <circle class="shield" r="0.5" cy="0" fill="rgba(74,144,217,0.15)" stroke="#4a90d9" stroke-width="0.07" />
  {/if}
  {#if freezeFx}
    <Sprite sprite={freezeFx} x={0} y={-0.05} size={1.1} />
  {:else if frozen}
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
  {#if fire && !fireFx}
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
  /* mola / volta por escudo: arco longo */
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
  /* mola: agacha (esmaga) e dispara pra cima antes do arco */
  .pawn.spring .body {
    animation: spring-jump 0.7s cubic-bezier(0.3, 0, 0.2, 1);
    transform-origin: 0 0.34px;
  }

  /* ---- foguete ----
     ato 1 (liftoff, 520 ms): fica na casa, treme, acende a chama e sobe reto
     ato 2 (cruise, 750 ms): translada até o destino inclinado, alto, com chama
     ato 3 (landing, 650 ms): cai, quica torto duas vezes e assenta */
  .pawn.liftoff {
    transition: none;
  }
  .pawn.liftoff .body {
    animation: liftoff 0.52s cubic-bezier(0.6, 0, 0.9, 0.4) forwards;
    transform-origin: 0 0.34px;
  }
  .pawn.liftoff .shadow {
    transform-origin: 0 0.36px;
    animation: liftoff-shadow 0.52s ease-in forwards;
  }
  .pawn.liftoff .exhaust {
    animation: exhaust-grow 0.52s ease-in forwards;
    transform-origin: 0 0.3px;
  }
  .pawn.cruise {
    transition: transform 0.75s cubic-bezier(0.35, 0, 0.25, 1);
  }
  .pawn.cruise .body {
    animation: cruise 0.75s ease-in-out forwards;
    transform-origin: 0 0.34px;
  }
  .pawn.cruise .shadow {
    transform-origin: 0 0.36px;
    animation: cruise-shadow 0.75s ease-in-out forwards;
  }
  .pawn.cruise .exhaust {
    animation: exhaust-flicker 0.12s ease-in-out infinite alternate;
    transform-origin: 0 0.3px;
  }
  .pawn.landing {
    transition: none;
  }
  .pawn.landing .body {
    animation: crash-land 0.65s cubic-bezier(0.3, 0.7, 0.4, 1) forwards;
    transform-origin: 0 0.34px;
  }
  .pawn.landing .shadow {
    transform-origin: 0 0.36px;
    animation: crash-shadow 0.65s ease-out forwards;
  }
  .smoke {
    animation: smoke 0.5s ease-out infinite;
  }
  .smoke.s2 {
    animation-delay: -0.25s;
  }

  @keyframes spring-jump {
    0% {
      transform: translateY(0) scale(1, 1);
    }
    18% {
      transform: translateY(0.14px) scale(1.25, 0.65);
    }
    30% {
      transform: translateY(-0.5px) scale(0.85, 1.25);
    }
    60% {
      transform: translateY(-1.5px) scale(1, 1);
    }
    88% {
      transform: translateY(0.05px) scale(1.12, 0.88);
    }
    100% {
      transform: translateY(0) scale(1, 1);
    }
  }
  @keyframes liftoff {
    0% {
      transform: translate(0, 0) rotate(0);
    }
    10% {
      transform: translate(-0.03px, 0) rotate(-2deg);
    }
    20% {
      transform: translate(0.03px, 0) rotate(2deg);
    }
    30% {
      transform: translate(-0.03px, 0) rotate(-3deg);
    }
    40% {
      transform: translate(0.03px, -0.02px) rotate(3deg);
    }
    50% {
      transform: translate(-0.02px, -0.06px) rotate(-2deg);
    }
    60% {
      transform: translate(0.02px, -0.16px) rotate(1deg);
    }
    100% {
      transform: translate(0, -2.2px) rotate(0) scale(1.15);
    }
  }
  @keyframes liftoff-shadow {
    0% {
      transform: scale(1);
      opacity: 0.32;
    }
    60% {
      transform: scale(0.95);
      opacity: 0.3;
    }
    100% {
      transform: scale(0.35);
      opacity: 0.08;
    }
  }
  @keyframes exhaust-grow {
    0% {
      transform: scale(0.2, 0.1);
      opacity: 0;
    }
    30% {
      transform: scale(0.8, 0.5);
      opacity: 1;
    }
    100% {
      transform: scale(1.1, 1.4);
      opacity: 1;
    }
  }
  @keyframes exhaust-flicker {
    from {
      transform: scale(1, 1.2);
    }
    to {
      transform: scale(1.15, 1.5);
    }
  }
  @keyframes cruise {
    0% {
      transform: translateY(-2.2px) rotate(0) scale(1.15);
    }
    25% {
      transform: translateY(-2.5px) rotate(28deg) scale(1.25);
    }
    75% {
      transform: translateY(-2.5px) rotate(28deg) scale(1.25);
    }
    100% {
      transform: translateY(-2.1px) rotate(12deg) scale(1.15);
    }
  }
  @keyframes cruise-shadow {
    0%,
    100% {
      transform: scale(0.35);
      opacity: 0.08;
    }
  }
  @keyframes crash-land {
    0% {
      transform: translateY(-2.1px) rotate(12deg) scale(1.15);
    }
    38% {
      transform: translateY(0.06px) rotate(-14deg) scale(1.2, 0.8);
    }
    55% {
      transform: translateY(-0.5px) rotate(18deg) scale(0.95, 1.1);
    }
    72% {
      transform: translateY(0.04px) rotate(-8deg) scale(1.12, 0.88);
    }
    85% {
      transform: translateY(-0.16px) rotate(5deg) scale(1);
    }
    100% {
      transform: translateY(0) rotate(0) scale(1);
    }
  }
  @keyframes crash-shadow {
    0% {
      transform: scale(0.35);
      opacity: 0.08;
    }
    38% {
      transform: scale(1.3);
      opacity: 0.4;
    }
    55% {
      transform: scale(0.8);
      opacity: 0.22;
    }
    72% {
      transform: scale(1.15);
      opacity: 0.36;
    }
    100% {
      transform: scale(1);
      opacity: 0.32;
    }
  }
  @keyframes smoke {
    0% {
      transform: translate(0, 0) scale(0.6);
      opacity: 0.7;
    }
    100% {
      transform: translate(0.1px, 0.5px) scale(1.6);
      opacity: 0;
    }
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
