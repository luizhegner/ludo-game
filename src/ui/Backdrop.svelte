<script lang="ts">
  /**
   * Fundo "Aurora": manchas de cor vibrantes, bem desfocadas, em movimento
   * lento atrás da interface. Cada mancha é uma <div> com gradiente radial e
   * animação própria (transform-only, roda na GPU). O desfoque vem de um
   * `filter: blur` no contêiner — barato porque o fundo é uma camada fixa
   * que não muda de tamanho.
   */
  import { settings } from '../stores/settings.svelte';

  // tema OG: bokeh dourado grande e fagulhas de 4 pontas flutuando devagar
  const bokeh = [
    { x: 18, y: 12, size: 11, dur: 41, delay: 0, o: 0.09 },
    { x: 72, y: 8, size: 8, dur: 47, delay: -12, o: 0.07 },
    { x: 86, y: 38, size: 13, dur: 53, delay: -25, o: 0.06 },
    { x: 10, y: 62, size: 9, dur: 44, delay: -7, o: 0.08 },
    { x: 58, y: 82, size: 12, dur: 50, delay: -31, o: 0.07 },
    { x: 34, y: 90, size: 7, dur: 39, delay: -18, o: 0.09 },
  ];
  const sparks = [
    { x: 8, y: 20, dur: 6.5, delay: 0 },
    { x: 26, y: 6, dur: 7.2, delay: -2.1 },
    { x: 64, y: 14, dur: 5.8, delay: -4.4 },
    { x: 91, y: 26, dur: 8.1, delay: -1.3 },
    { x: 14, y: 48, dur: 6.9, delay: -3.7 },
    { x: 82, y: 56, dur: 7.7, delay: -5.2 },
    { x: 40, y: 72, dur: 6.1, delay: -0.8 },
    { x: 70, y: 88, dur: 8.6, delay: -2.9 },
    { x: 22, y: 94, dur: 7.4, delay: -6.0 },
    { x: 94, y: 78, dur: 5.5, delay: -3.3 },
  ];

  const blobs = [
    { color: '#ff6b9d', x: 12, y: 18, size: 62, dur: 26, delay: 0 },
    { color: '#ffd166', x: 78, y: 12, size: 56, dur: 31, delay: -8 },
    { color: '#4cc9f0', x: 74, y: 70, size: 68, dur: 29, delay: -15 },
    { color: '#7bed9f', x: 18, y: 78, size: 58, dur: 34, delay: -21 },
    { color: '#b57bff', x: 50, y: 45, size: 52, dur: 37, delay: -5 },
  ];
</script>

{#if settings.theme === 'og'}
  <div class="og" aria-hidden="true">
    <div class="vignette"></div>
    {#each bokeh as b, i (i)}
      <div class="bokeh" style="left:{b.x}%; top:{b.y}%; width:{b.size}vmax; height:{b.size}vmax; opacity:{b.o}; animation-duration:{b.dur}s; animation-delay:{b.delay}s"></div>
    {/each}
    {#each sparks as s, i (i)}
      <div class="spark" style="left:{s.x}%; top:{s.y}%; animation-duration:{s.dur}s; animation-delay:{s.delay}s"></div>
    {/each}
  </div>
{:else if settings.theme === 'aurora'}
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
  /* ---- OG: mesa escura vinho/marrom, vinheta, bokeh dourado e fagulhas ---- */
  .og {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: radial-gradient(120% 90% at 50% 20%, #4a2420 0%, #351a1c 45%, #22100f 100%);
    pointer-events: none;
  }
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(90% 70% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
  }
  .bokeh {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, #ffd27a 0%, rgba(255, 210, 122, 0.6) 45%, transparent 72%);
    transform: translate(-50%, -50%);
    filter: blur(6px);
    animation-name: og-drift;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-direction: alternate;
    will-change: transform;
  }
  .spark {
    position: absolute;
    width: 10px;
    height: 10px;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, #fff6d5 0%, rgba(255, 246, 213, 0.9) 22%, transparent 32%),
      linear-gradient(#ffe9a8, #ffe9a8) center/2px 100% no-repeat,
      linear-gradient(#ffe9a8, #ffe9a8) center/100% 2px no-repeat;
    opacity: 0;
    animation-name: og-twinkle;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }
  @keyframes og-drift {
    0% {
      transform: translate(-50%, -50%) translate(0, 0);
    }
    100% {
      transform: translate(-50%, -50%) translate(6vmax, -4vmax);
    }
  }
  @keyframes og-twinkle {
    0%,
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) translateY(0) scale(0.6);
    }
    50% {
      opacity: 0.9;
      transform: translate(-50%, -50%) translateY(-14px) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bokeh,
    .spark {
      animation: none;
    }
    .spark {
      opacity: 0.5;
    }
  }

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
