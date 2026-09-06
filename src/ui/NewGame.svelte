<script lang="ts">
  import { COLORS, type Color } from '../engine/types';
  import { COLOR_HEX, COLOR_NAME, COLOR_ON } from '../lib/colors';
  import { match } from '../stores/match.svelte';

  interface Props {
    onStart: () => void;
    onBack: () => void;
  }
  let { onStart, onBack }: Props = $props();

  const KEY = 'ludo.lastSetup.v1';

  type Slot = { on: boolean; name: string; avatar: string };
  const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐯', '🐵', '🐧', '🦄', '🐙', '🐝', '🐲', '🦉'];

  function defaultSlots(): Record<Color, Slot> {
    return {
      green: { on: true, name: '', avatar: '🦊' },
      red: { on: true, name: '', avatar: '🐼' },
      blue: { on: false, name: '', avatar: '🦁' },
      yellow: { on: false, name: '', avatar: '🐸' },
    };
  }

  function loadLast(): { slots: Record<Color, Slot>; captureBonus: boolean } {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        return { slots: { ...defaultSlots(), ...v.slots }, captureBonus: !!v.captureBonus };
      }
    } catch {
      /* ignora */
    }
    return { slots: defaultSlots(), captureBonus: false };
  }

  const last = loadLast();
  let slots = $state(last.slots);
  let captureBonus = $state(last.captureBonus);

  const count = $derived(COLORS.filter((c) => slots[c].on).length);
  const canStart = $derived(count >= 2);

  function cycleAvatar(c: Color) {
    const i = AVATARS.indexOf(slots[c].avatar);
    slots[c].avatar = AVATARS[(i + 1) % AVATARS.length];
  }

  function start() {
    if (!canStart) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ slots: $state.snapshot(slots), captureBonus }));
    } catch {
      /* ignora */
    }
    match.start({
      rules: { mode: 'classic', captureBonus },
      players: COLORS.filter((c) => slots[c].on).map((c) => ({
        color: c,
        playerId: `local-${c}`,
        name: slots[c].name.trim() || COLOR_NAME[c],
        avatar: slots[c].avatar,
      })),
    });
    onStart();
  }
</script>

<div class="page">
  <header>
    <button class="icon" aria-label="Voltar" onclick={onBack}>‹</button>
    <h1>Nova partida</h1>
    <span class="icon"></span>
  </header>

  <p class="muted step">Clássico · toque numa cor pra ligar/desligar, depois dê os nomes</p>

  <!-- grade 2×2 na mesma disposição do tabuleiro -->
  <div class="grid">
    {#each COLORS as c}
      {@const s = slots[c]}
      <div class="slot" class:on={s.on} style="--c:{COLOR_HEX[c]}; --on:{COLOR_ON[c]}">
        <button class="head" onclick={() => (slots[c].on = !slots[c].on)} aria-pressed={s.on}>
          <span class="cname">{COLOR_NAME[c]}</span>
          <span class="check">{s.on ? '✓' : '+'}</span>
        </button>
        {#if s.on}
          <div class="body">
            <button class="avatar" onclick={() => cycleAvatar(c)} aria-label="Trocar avatar">{s.avatar}</button>
            <input bind:value={slots[c].name} placeholder={COLOR_NAME[c]} maxlength="14" aria-label="Nome do jogador {COLOR_NAME[c]}" />
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <label class="toggle card">
    <div>
      <div class="tl">Jogada extra ao comer</div>
      <div class="muted small">Quem come uma peça rola o dado de novo</div>
    </div>
    <input type="checkbox" bind:checked={captureBonus} />
    <span class="sw"></span>
  </label>

  <div class="spacer"></div>
  <button class="btn primary big block" disabled={!canStart} onclick={start}>
    {canStart ? `Começar com ${count} jogadores` : 'Escolha pelo menos 2 cores'}
  </button>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    padding: calc(var(--safe-top) + 8px) 16px calc(var(--safe-bottom) + 16px);
    gap: 12px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 20px;
  }
  .icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    font-size: 28px;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .step {
    margin: 0;
    font-size: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .slot {
    border-radius: 18px;
    background: var(--c);
    color: var(--on);
    overflow: hidden;
    opacity: 0.55;
    transition: opacity 0.2s, transform 0.1s;
    box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.5);
  }
  .slot.on {
    opacity: 1;
  }
  .head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px;
    color: inherit;
    font-weight: 800;
    font-size: 17px;
  }
  .check {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
    color: var(--ink);
    display: grid;
    place-items: center;
    font-weight: 900;
  }
  .body {
    display: flex;
    gap: 8px;
    padding: 0 10px 12px;
    align-items: center;
  }
  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.9);
    font-size: 24px;
    flex: none;
  }
  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 16px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 0;
    background: rgba(255, 255, 255, 0.92);
    color: var(--ink);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    position: relative;
  }
  .toggle > div {
    flex: 1;
  }
  .tl {
    font-weight: 700;
  }
  .small {
    font-size: 13px;
  }
  .toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .sw {
    width: 50px;
    height: 30px;
    border-radius: 999px;
    background: var(--line);
    position: relative;
    transition: background 0.2s;
    flex: none;
  }
  .sw::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s;
  }
  .toggle input:checked + .sw {
    background: var(--green);
  }
  .toggle input:checked + .sw::after {
    transform: translateX(20px);
  }
  .spacer {
    flex: 1;
  }
  .btn:disabled {
    opacity: 0.5;
  }
</style>
