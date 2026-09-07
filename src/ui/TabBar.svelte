<script lang="ts">
  import { nav, type Tab } from '../stores/nav.svelte';
  import { sound } from '../lib/sound';
  import { uiIconUrl } from '../lib/art.svelte';
  import Icon from './Icon.svelte';

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: 'Jogar', icon: '🎲' },
    { id: 'players', label: 'Jogadores', icon: '👥' },
    { id: 'ranking', label: 'Ranking', icon: '🏆' },
    { id: 'history', label: 'Histórico', icon: '📜' },
    { id: 'settings', label: 'Ajustes', icon: '⚙️' },
  ];

  function pick(id: Tab) {
    sound.play('tap');
    nav.switchTab(id);
  }
</script>

<nav class="tabbar" aria-label="Seções">
  {#each tabs as t (t.id)}
    <button class="tab" class:on={nav.tab === t.id} onclick={() => pick(t.id)} aria-current={nav.tab === t.id ? 'page' : undefined}>
      <span class="ic" aria-hidden="true"><Icon src={uiIconUrl(`tab-${t.id}`)} fallback={t.icon} size={24} /></span>
      <span class="lb">{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    padding: 6px 6px calc(var(--safe-bottom) + 6px);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-top: 1px solid var(--line);
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 52px;
    border-radius: 12px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    transition: background 0.15s, color 0.15s;
  }
  .tab.on {
    color: var(--ink);
    background: var(--bg);
  }
  .ic {
    display: grid;
    place-items: center;
    filter: grayscale(1) opacity(0.75);
    transition: filter 0.15s, transform 0.15s;
  }
  .tab.on .ic {
    filter: none;
    transform: translateY(-1px);
  }
  .lb {
    line-height: 1;
  }
</style>
