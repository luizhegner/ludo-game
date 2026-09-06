<script lang="ts">
  import type { GameState } from '../engine/types';
  import { COLOR_HEX, COLOR_ON } from '../lib/colors';
  import { playerOf } from '../engine/game';
  import { match } from '../stores/match.svelte';

  interface Props {
    state: GameState;
    onExit: () => void;
  }
  let { state: game, onExit }: Props = $props();

  const medals = ['🥇', '🥈', '🥉', '4º'];

  const rows = $derived(
    (game.placements ?? []).map((c, i) => ({ color: c, place: i + 1, p: playerOf(game, c)! })),
  );

  const durationMin = $derived(Math.max(1, Math.round((game.updatedAt - game.createdAt) / 60000)));

  function rematch() {
    const players = game.players
      .filter((p) => p.status !== 'removed')
      .map((p) => ({ color: p.color, playerId: p.playerId, name: p.name, avatar: p.avatar }));
    match.start({ rules: game.rules, players });
  }
</script>

<div class="backdrop">
  <div class="card panel">
    <h1>{game.endReason === 'abandoned' ? 'Partida encerrada' : 'Fim de jogo'}</h1>
    {#if game.placements}
      <ol class="podium">
        {#each rows as r (r.color)}
          <li style="--c:{COLOR_HEX[r.color]}; --on:{COLOR_ON[r.color]}" class:first={r.place === 1}>
            <span class="medal">{medals[r.place - 1] ?? `${r.place}º`}</span>
            <span class="av">{r.p.avatar}</span>
            <span class="nm">{r.p.name}</span>
            <span class="st muted">⚔{r.p.stats.captures} ☠{r.p.stats.deaths} · {r.p.stats.sixes}× 6</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="muted">Encerrada sem contar pro ranking.</p>
    {/if}
    <p class="muted small">{durationMin} min · {game.log.filter((e) => e.type === 'roll').length} lançamentos</p>
    <div class="actions">
      <button class="btn primary big block" onclick={rematch}>Revanche</button>
      <button class="btn block" onclick={onExit}>Início</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(31, 36, 48, 0.5);
    display: grid;
    place-items: center;
    padding: 20px;
    z-index: 40;
    animation: fade 0.2s ease-out;
  }
  .panel {
    width: 100%;
    max-width: 420px;
    padding: 22px 18px calc(var(--safe-bottom) + 18px);
    animation: pop 0.3s ease-out;
  }
  h1 {
    margin: 0 0 14px;
    text-align: center;
    font-size: 24px;
  }
  .podium {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: grid;
    grid-template-columns: 40px 34px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--bg);
    border-left: 6px solid var(--c);
    font-weight: 700;
  }
  li.first {
    background: var(--c);
    color: var(--on);
  }
  li.first .st {
    color: var(--on);
    opacity: 0.85;
  }
  .medal {
    font-size: 22px;
    text-align: center;
  }
  .av {
    font-size: 22px;
  }
  .nm {
    font-size: 17px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .small {
    text-align: center;
    font-size: 13px;
    margin: 12px 0 6px;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
