<script lang="ts">
  /**
   * Sprite animado (tira horizontal de quadros quadrados) desenhado DENTRO do
   * SVG do tabuleiro, em unidades de célula. Usa `steps()` do CSS: um quadro
   * por passo, sem interpolação, sem esticar (cada quadro é exibido no mesmo
   * quadrado `size × size`, centrado em `x, y`).
   */
  import type { FxSprite } from '../lib/art.svelte';

  interface Props {
    sprite: FxSprite;
    /** Centro, em células. */
    x?: number;
    y?: number;
    /** Lado do quadro, em células. */
    size?: number;
    /** Repete pra sempre (fogo, escudo) ou toca uma vez (explosão). */
    loop?: boolean;
    opacity?: number;
  }
  let { sprite, x = 0, y = 0, size = 1, loop = true, opacity = 1 }: Props = $props();

  const dur = $derived(sprite.frames / sprite.fps);
  const id = `clip-${Math.random().toString(36).slice(2, 9)}`;
</script>

<!-- a <image> tem largura frames×size e é deslocada quadro a quadro dentro do clip -->
<g transform="translate({x - size / 2} {y - size / 2})" clip-path="url(#{id})" {opacity} pointer-events="none">
  <clipPath {id}><rect width={size} height={size} /></clipPath>
  <image
    class="strip"
    href={sprite.url}
    width={size * sprite.frames}
    height={size}
    preserveAspectRatio="none"
    style="--w:{size * sprite.frames}px; --dur:{dur}s; --frames:{sprite.frames}; animation-iteration-count:{loop ? 'infinite' : 1}"
  />
</g>

<style>
  .strip {
    animation-name: strip;
    animation-duration: var(--dur);
    animation-timing-function: steps(var(--frames), end);
    animation-fill-mode: forwards;
    image-rendering: auto;
  }
  @keyframes strip {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(calc(-1 * var(--w)));
    }
  }
</style>
