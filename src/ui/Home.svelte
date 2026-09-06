<script lang="ts">
  import { match } from '../stores/match.svelte';
  import { COLOR_HEX } from '../lib/colors';
  import { currentPlayer } from '../engine/game';

  interface Props {
    onContinue: () => void;
    onNew: () => void;
  }
  let { onContinue, onNew }: Props = $props();

  const resumable = $derived(match.active);
  const who = $derived(match.state ? currentPlayer(match.state) : undefined);
</script>

<div class="page">
  <div class="logo" aria-hidden="true">
    <span style="background:{COLOR_HEX.green}"></span>
    <span style="background:{COLOR_HEX.red}"></span>
    <span style="background:{COLOR_HEX.yellow}"></span>
    <span style="background:{COLOR_HEX.blue}"></span>
  </div>
  <h1>Ludo</h1>
  <p class="muted">Todo mundo no mesmo celular.</p>

  <div class="actions">
    {#if resumable}
      <button class="btn primary big block" onclick={onContinue}>
        Continuar partida
        {#if who}<span class="sub">vez de {who.avatar} {who.name}</span>{/if}
      </button>
      <button class="btn big block" onclick={onNew}>Nova partida</button>
    {:else}
      <button class="btn primary big block" onclick={onNew}>Nova partida</button>
    {/if}
  </div>

  <p class="muted foot">Fase 1 · Clássico. Ranking, histórico e poderes chegam nas próximas fases.</p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: calc(var(--safe-top) + 24px) 20px calc(var(--safe-bottom) + 24px);
    gap: 8px;
    text-align: center;
  }
  .logo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 88px;
    height: 88px;
    padding: 8px;
    border-radius: 24px;
    background: #fff;
    box-shadow: var(--shadow);
    margin-bottom: 8px;
  }
  .logo span {
    border-radius: 8px;
  }
  h1 {
    margin: 0;
    font-size: 40px;
    letter-spacing: -0.5px;
  }
  .actions {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 28px;
  }
  .btn {
    flex-direction: column;
    gap: 2px;
  }
  .sub {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.8;
  }
  .foot {
    margin-top: 40px;
    font-size: 13px;
    max-width: 300px;
  }
</style>
