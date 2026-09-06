<script lang="ts">
  import type { Color } from '../engine/types';
  import { COLOR_HEX } from '../lib/colors';

  interface Props {
    color: Color;
    /** Valor mostrado quando parado (null = ainda não rolou neste turno). */
    value: number | null;
    /** Pode ser lançado agora? */
    enabled: boolean;
    /** Tamanho em px. */
    size?: number;
    /** Chamado ao terminar a animação; o valor final vem do motor. */
    onRoll: () => void;
    rolling?: boolean;
  }

  let { color, value, enabled, size = 56, onRoll, rolling = false }: Props = $props();

  // Rotações que deixam cada face pra cima (frente = face visível).
  const FACE_ROT: Record<number, [number, number]> = {
    1: [0, 0],
    2: [0, -90],
    3: [-90, 0],
    4: [90, 0],
    5: [0, 90],
    6: [0, 180],
  };

  let spinning = $state(false);
  let extraX = $state(0);
  let extraY = $state(0);

  const shown = $derived(value ?? 1);
  const rot = $derived.by(() => {
    const [rx, ry] = FACE_ROT[shown];
    return { x: rx + extraX, y: ry + extraY };
  });

  function tap() {
    if (!enabled || spinning) return;
    spinning = true;
    // voltas inteiras extras; a face final é determinada pelo `value` que o motor devolve
    extraX += 360 * (2 + Math.floor(Math.random() * 2));
    extraY += 360 * (2 + Math.floor(Math.random() * 2));
    onRoll();
    setTimeout(() => (spinning = false), 700);
  }

  const PIPS: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
  };
  // face → transform 3D dentro do cubo
  const FACES: { n: number; t: string }[] = [
    { n: 1, t: 'rotateY(0deg)' },
    { n: 6, t: 'rotateY(180deg)' },
    { n: 2, t: 'rotateY(90deg)' },
    { n: 5, t: 'rotateY(-90deg)' },
    { n: 3, t: 'rotateX(90deg)' },
    { n: 4, t: 'rotateX(-90deg)' },
  ];
</script>

<button
  class="dice"
  class:enabled
  class:spinning={spinning || rolling}
  style="--s:{size}px; --edge:{COLOR_HEX[color]}"
  onclick={tap}
  disabled={!enabled}
  aria-label={enabled ? 'Rolar o dado' : value ? `Dado: ${value}` : 'Dado'}
>
  <div class="cube" style="transform: rotateX({rot.x}deg) rotateY({rot.y}deg)">
    {#each FACES as f}
      <div class="face" style="transform: {f.t} translateZ(calc(var(--s) / 2))">
        <svg viewBox="0 0 100 100">
          {#each PIPS[f.n] as [cx, cy]}
            <circle {cx} {cy} r="9" fill="#1f2430" />
          {/each}
        </svg>
      </div>
    {/each}
  </div>
  <div class="shadow"></div>
</button>

<style>
  .dice {
    position: relative;
    width: var(--s);
    height: var(--s);
    perspective: calc(var(--s) * 5);
    transform-style: preserve-3d;
    filter: saturate(0.85);
    transition: filter 0.2s;
  }
  .dice.enabled {
    filter: none;
  }
  .dice.enabled::after {
    content: '';
    position: absolute;
    inset: -14px;
    border-radius: 50%;
    border: 3px solid var(--edge);
    opacity: 0.6;
    animation: halo 1.2s ease-in-out infinite;
    pointer-events: none;
  }
  .cube {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .spinning .cube {
    transition-duration: 0.7s;
  }
  .face {
    position: absolute;
    inset: 0;
    background: linear-gradient(145deg, #ffffff, #e9e9ee);
    border: calc(var(--s) * 0.06) solid var(--edge);
    border-radius: calc(var(--s) * 0.18);
    backface-visibility: hidden;
    display: grid;
    place-items: center;
  }
  .face svg {
    width: 78%;
    height: 78%;
  }
  .shadow {
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -18%;
    height: 22%;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.35), transparent 70%);
    transform: translateZ(-1px);
  }
</style>
