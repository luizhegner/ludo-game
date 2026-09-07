<script lang="ts">
  /**
   * Fundo "Aurora": manchas de cor vibrantes, bem desfocadas, em movimento
   * lento atrás da interface. Cada mancha é uma <div> com gradiente radial e
   * animação própria (transform-only, roda na GPU). O desfoque vem de um
   * `filter: blur` no contêiner — barato porque o fundo é uma camada fixa
   * que não muda de tamanho.
   */
  import { settings } from '../stores/settings.svelte';

  const blobs = [
    { color: '#ff6b9d', x: 12, y: 18, size: 62, dur: 26, delay: 0 },
    { color: '#ffd166', x: 78, y: 12, size: 56, dur: 31, delay: -8 },
    { color: '#4cc9f0', x: 74, y: 70, size: 68, dur: 29, delay: -15 },
    { color: '#7bed9f', x: 18, y: 78, size: 58, dur: 34, delay: -21 },
    { color: '#b57bff', x: 50, y: 45, size: 52, dur: 37, delay: -5 },
  ];
</script>

{#if settings.theme === 'aurora'}
  <div class="aurora" aria-hidden="true">
    <div class="blur">
      {#each blobs as b, i (i)}
        <div
          class="blob"
          style="--c:{b.color}; left:{b.x}%; top:{b.y}%; width:{b.size}vmax; height:{b.size}vmax; animation-duration:{b.dur}s; animation-delay:{b.delay}s"
        ></div>
      {/each}
    </div>
    <div class="veil"></div>
  </div>
{/if}

<style>
  .aurora {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: #f3eef7;
    pointer-events: none;
  }
  .blur {
    position: absolute;
    inset: -20%;
    filter: blur(60px) saturate(1.35);
    transform: translateZ(0);
  }
  .blob {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, var(--c) 0%, color-mix(in srgb, var(--c) 70%, transparent) 40%, transparent 70%);
    transform: translate(-50%, -50%);
    animation-name: drift;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-direction: alternate;
    will-change: transform;
    opacity: 0.85;
  }
  /* véu claro por cima pra os cards e o texto continuarem legíveis */
  .veil {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.42));
  }
  @keyframes drift {
    0% {
      transform: translate(-50%, -50%) translate(0, 0) scale(1);
    }
    33% {
      transform: translate(-50%, -50%) translate(9vmax, -6vmax) scale(1.12);
    }
    66% {
      transform: translate(-50%, -50%) translate(-6vmax, 8vmax) scale(0.94);
    }
    100% {
      transform: translate(-50%, -50%) translate(4vmax, 3vmax) scale(1.06);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .blob {
      animation: none;
    }
  }
</style>
