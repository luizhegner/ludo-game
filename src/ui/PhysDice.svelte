<script lang="ts">
  import { onMount } from 'svelte';
  import type { DiePose, DieToken } from '../lib/die/types';
  import type { PhysicsTable } from '../lib/die/physics';
  import { sound } from '../lib/sound';
  import { haptic } from '../stores/settings.svelte';
  import Dice from './Dice.svelte';

  interface Props {
    tokens: DieToken[];
    boardPx: number;
    /** Sem `value`, o store sorteia; com `value`, o motor usa a face física. */
    onRoll: (id: string, value?: number) => void;
    /** Fallback CSS: face e giro. */
    faces?: Record<string, number | null>;
    rolling?: Record<string, boolean>;
  }

  let { tokens, boardPx, onRoll, faces = {}, rolling = {} }: Props = $props();
  let canvas: HTMLCanvasElement | undefined = $state();
  let table: PhysicsTable | null = $state(null);
  let fallback = $state(false);
  let poses: Record<string, DiePose> = $state({});
  let grabbing: string | null = $state(null);
  let pointer: { x: number; y: number } | null = null;

  const cell = $derived(boardPx / 15);

  onMount(() => {
    let alive = true;
    void (async () => {
      if (!canvas || !supportsWebGL(canvas)) {
        fallback = true;
        return;
      }
      try {
        const { PhysicsTable } = await import('../lib/die/physics');
        if (!alive || !canvas) return;
        table = new PhysicsTable(canvas, {
          size: boardPx,
          onPose: (list) => {
            const next: Record<string, DiePose> = {};
            for (const p of list) next[p.id] = p;
            poses = next;
          },
        });
      } catch {
        fallback = true;
      }
    })();
    return () => {
      alive = false;
      table?.dispose();
    };
  });

  function soundStart() {
    sound.play('dice');
    haptic('diceStart');
  }

  function supportsWebGL(target: HTMLCanvasElement): boolean {
    try {
      return !!target.getContext('webgl2') || !!target.getContext('webgl');
    } catch {
      return false;
    }
  }

  $effect(() => {
    table?.resize(boardPx);
  });

  $effect(() => {
    if (!table) return;
    table.sync(tokens.map((t) => t.id));
    for (const t of tokens) table.ensureDie(t.id, t.color, t.homeX, t.homeY);
  });

  function down(id: string, e: PointerEvent) {
    const tok = tokens.find((t) => t.id === id);
    if (!tok?.enabled || grabbing || poses[id]?.rolling) return;
    grabbing = id;
    pointer = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function up(e: PointerEvent) {
    if (!grabbing || !pointer) {
      pointer = null;
      grabbing = null;
      return;
    }
    const id = grabbing;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer = null;
    grabbing = null;
    e.preventDefault();
    if (!table) {
      onRoll(id);
      return;
    }
    soundStart();
    table.roll(id, dx, dy).then((result) => onRoll(id, result.value));
  }

  function keydown(id: string, e: KeyboardEvent) {
    const tok = tokens.find((t) => t.id === id);
    if (!tok?.enabled || grabbing || poses[id]?.rolling) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    soundStart();
    if (table) table.roll(id).then((result) => onRoll(id, result.value));
    else onRoll(id);
  }

  function left(t: DieToken): number {
    return (poses[t.id]?.x ?? t.homeX) * cell;
  }
  function top(t: DieToken): number {
    return (poses[t.id]?.y ?? t.homeY) * cell;
  }
</script>

{#if fallback}
  {#each tokens as t (t.id)}
    <div class="dice-pos" style="left:{t.homeX * cell}px; top:{t.homeY * cell}px; --size:{Math.max(80, cell * 3.2)}px">
      <Dice color={t.color} value={faces[t.id] ?? 1} enabled={t.enabled} size={Math.max(80, cell * 3.2)} rolling={!!rolling[t.id]} onRoll={() => onRoll(t.id)} />
    </div>
  {/each}
{:else}
  <div class="table" style="--board:{boardPx}px">
    <canvas bind:this={canvas} width={boardPx} height={boardPx}></canvas>
    {#each tokens as t (t.id)}
      {@const busy = !!poses[t.id]?.rolling}
      <button
        class="grab"
        class:enabled={t.enabled && !busy}
        class:busy
        style="left:{left(t)}px; top:{top(t)}px; --s:{cell * 2.6}px"
        disabled={!t.enabled || busy}
        aria-label={t.enabled ? 'Arraste o dado para rolar pelo tabuleiro' : 'Dado'}
        aria-busy={busy}
        onpointerdown={(e) => down(t.id, e)}
        onpointerup={up}
        onpointercancel={() => { pointer = null; grabbing = null; }}
        onkeydown={(e) => keydown(t.id, e)}
      ></button>
    {/each}
  </div>
{/if}

<style>
  .table {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 4;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .grab {
    position: absolute;
    width: var(--s);
    height: var(--s);
    transform: translate(-50%, -50%);
    border-radius: 18px;
    pointer-events: auto !important;
    touch-action: none;
    cursor: grab;
    background: transparent;
  }
  .grab:disabled {
    cursor: default;
  }
  .grab.enabled::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 3px solid #1f2430;
    opacity: 0.35;
    animation: halo 1.2s ease-in-out infinite;
    pointer-events: none;
  }
  .grab:active {
    cursor: grabbing;
  }
  .dice-pos {
    position: absolute;
    transform: translate(-50%, -50%);
    width: var(--size);
    height: var(--size);
    z-index: 3;
  }
</style>
