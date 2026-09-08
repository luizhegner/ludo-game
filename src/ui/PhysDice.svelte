<script lang="ts">
  import { onMount } from 'svelte';
  import type { Color } from '../engine/types';
  import type { DieScene } from '../lib/die/types';
  import Dice from './Dice.svelte';

  interface Props {
    color: Color;
    value: number | null;
    enabled: boolean;
    size?: number;
    /** Sem `value`, o store sorteia; com `value`, o motor usa a face física. */
    onRoll: (value?: number) => void;
    /** Animação usada apenas pelo fallback CSS. */
    rolling?: boolean;
  }

  let { color, value, enabled, size = 64, onRoll, rolling = false }: Props = $props();
  let canvas: HTMLCanvasElement | undefined = $state();
  let scene: DieScene | null = $state(null);
  let fallback = $state(false);
  let active = $state(false);
  let pointer: { x: number; y: number } | null = null;

  onMount(() => {
    let alive = true;
    void (async () => {
      if (!canvas || !supportsWebGL(canvas)) {
        fallback = true;
        return;
      }
      try {
        // O dado físico é um chunk separado: quem prefere o modo padrão não
        // baixa Three/cannon até realmente abrir uma partida física.
        const { PhysicsDie } = await import('../lib/die/physics');
        if (!alive || !canvas) return;
        scene = new PhysicsDie(canvas, { color, size });
      } catch {
        // WebGL pode existir no navegador, mas estar bloqueado pelo aparelho ou
        // pelo preview. O dado CSS continua sendo totalmente jogável.
        fallback = true;
      }
    })();
    return () => {
      alive = false;
      scene?.dispose();
    };
  });

  function supportsWebGL(target: HTMLCanvasElement): boolean {
    try {
      return !!target.getContext('webgl2') || !!target.getContext('webgl');
    } catch {
      return false;
    }
  }

  $effect(() => {
    scene?.resize(size);
  });

  function down(e: PointerEvent) {
    if (!enabled || active) return;
    pointer = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function up(e: PointerEvent) {
    if (!pointer || !enabled || active) {
      pointer = null;
      return;
    }
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer = null;
    e.preventDefault();
    if (!scene) {
      onRoll();
      return;
    }
    active = true;
    scene.roll(dx, dy).then((result) => {
      active = false;
      onRoll(result.value);
    });
  }

  function keydown(e: KeyboardEvent) {
    if (enabled && !active && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (scene) {
        active = true;
        scene.roll().then((result) => {
          active = false;
          onRoll(result.value);
        });
      } else onRoll();
    }
  }
</script>

{#if fallback}
  <Dice color={color} value={value} {enabled} {size} {rolling} onRoll={() => onRoll()} />
{:else}
  <div
    class="phys"
    class:enabled
    class:active
    style="--s:{size}px"
    role="button"
    tabindex={enabled && !active ? 0 : -1}
    aria-label={enabled ? 'Arraste ou toque no dado físico para rolar' : value ? `Dado: ${value}` : 'Dado físico'}
    aria-busy={active}
    onpointerdown={down}
    onpointerup={up}
    onpointercancel={() => (pointer = null)}
    onkeydown={keydown}
  >
    <canvas bind:this={canvas} width={size} height={size}></canvas>
    {#if active}<span class="sr">Dado rolando…</span>{/if}
  </div>
{/if}

<style>
  .phys {
    position: relative;
    width: var(--s);
    height: calc(var(--s) * 1.16);
    touch-action: none;
    cursor: grab;
    filter: saturate(0.92);
  }
  .phys.enabled {
    filter: none;
  }
  .phys:focus-visible {
    outline: 3px solid var(--edge, #1f2430);
    outline-offset: 5px;
    border-radius: 14px;
  }
  .phys:active {
    cursor: grabbing;
  }
  canvas {
    display: block;
    width: var(--s);
    height: var(--s);
  }
  .phys.enabled::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    border: 2px solid currentColor;
    color: var(--ink);
    opacity: 0.32;
    animation: halo 1.2s ease-in-out infinite;
    pointer-events: none;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
