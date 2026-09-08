<script lang="ts">
  import { players } from '../stores/players.svelte';
  import { history } from '../stores/history.svelte';
  import type { Mode } from '../engine/types';
  import { ELO_MODES, eloEvolution, eloStandings, roundedRating } from '../lib/elo';
  import { nav } from '../stores/nav.svelte';
  import { COLOR_HEX } from '../lib/colors';
  import { modeName } from '../lib/modes';
  import { formatWhen, percent, plural } from '../lib/format';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';
  import PlayerEditor from './PlayerEditor.svelte';

  interface Props {
    id: string;
  }
  let { id }: Props = $props();

  let editing = $state(false);

  const player = $derived(players.get(id));
  const stats = $derived(history.statsFor(id));
  const recent = $derived(history.forPlayer(id).slice(0, 10));

  const avgPlace = $derived(stats.ranked ? (stats.placeSum / stats.ranked).toFixed(1).replace('.', ',') : '—');
  const winRate = $derived(stats.ranked ? percent(stats.wins / stats.ranked) : '—');

  const eloRows = $derived(
    ELO_MODES.map((mode) => {
      const row = eloStandings(history.list, mode).find((r) => r.playerId === id);
      return {
        mode,
        rating: row?.rating ?? 1000,
        games: row?.games ?? 0,
        wins: row?.wins ?? 0,
        delta: row?.delta ?? 0,
      };
    }),
  );
  let chartMode = $state<Mode>('classic');
  const chartPoints = $derived(eloEvolution(history.list, id, chartMode));
  const chartPath = $derived.by(() => {
    if (chartPoints.length < 2) return '';
    const min = Math.min(...chartPoints.map((p) => p.rating));
    const max = Math.max(...chartPoints.map((p) => p.rating));
    const span = Math.max(1, max - min);
    return chartPoints
      .map((p, i) => `${(i / (chartPoints.length - 1)) * 100},${92 - ((p.rating - min) / span) * 78}`)
      .join(' ');
  });

  const medal = (place: number | null) => (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : place ? `${place}º` : '—');

  function back() {
    sound.play('tap');
    nav.back({ page: 'players' });
  }
</script>

<div class="page">
  <header>
    <button class="icon" aria-label="Voltar" onclick={back}>‹</button>
    <h1>Jogador</h1>
    {#if player}
      <button class="edit" onclick={() => { sound.play('tap'); editing = true; }}>Editar</button>
    {:else}
      <span class="icon"></span>
    {/if}
  </header>

  {#if !player}
    <div class="card empty">
      <p><b>Jogador não encontrado.</b></p>
      <p class="muted">Ele pode ter sido excluído. O histórico das partidas continua guardado.</p>
    </div>
  {:else}
    <section class="hero">
      <Avatar avatar={player.avatar} size={96} />
      <h2>{player.name}</h2>
      <p class="muted">
        {#if stats.games}
          {plural(stats.games, 'partida', 'partidas')}{stats.lastPlayedAt ? ` · última ${formatWhen(stats.lastPlayedAt)}` : ''}
        {:else}
          ainda não jogou
        {/if}
      </p>
    </section>

    <section class="grid">
      <div class="stat card"><span class="v">{stats.wins}</span><span class="k">vitórias</span></div>
      <div class="stat card"><span class="v">{winRate}</span><span class="k">% vitória</span></div>
      <div class="stat card"><span class="v">{avgPlace}</span><span class="k">colocação média</span></div>
      <div class="stat card"><span class="v">{stats.bestStreak}</span><span class="k">maior sequência</span></div>
      <div class="stat card"><span class="v">{stats.captures}</span><span class="k">peças comidas</span></div>
      <div class="stat card"><span class="v">{stats.deaths}</span><span class="k">peças perdidas</span></div>
      <div class="stat card"><span class="v">{stats.sixes}</span><span class="k">seis tirados</span></div>
      <div class="stat card"><span class="v">{stats.powers}</span><span class="k">poderes</span></div>
    </section>

    <section class="elo card">
      <div class="section-head">
        <h3>Elo por modo</h3>
        <span class="muted small">início: 1000 · K: 32</span>
      </div>
      <div class="elo-list">
        {#each eloRows as r (r.mode)}
          <button class="elo-row" class:on={chartMode === r.mode} onclick={() => (chartMode = r.mode)}>
            <span class="emode">{modeName(r.mode)}</span>
            <span class="erating">{roundedRating(r.rating)}</span>
            <span class="muted egames">{r.games}J · {r.wins}V</span>
          </button>
        {/each}
      </div>
      <div class="chart-title"><b>Evolução</b><span class="muted">{modeName(chartMode)}</span></div>
      {#if chartPoints.length > 1}
        <svg class="chart" viewBox="0 0 100 100" role="img" aria-label="Gráfico de evolução do Elo">
          <line x1="0" y1="92" x2="100" y2="92" stroke="var(--line)" stroke-width="1" />
          <line x1="0" y1="53" x2="100" y2="53" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 2" />
          <polyline points={chartPath} fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          {#each chartPoints as p, i (i)}
            <circle cx={(i / (chartPoints.length - 1)) * 100} cy={92 - ((p.rating - Math.min(...chartPoints.map((x) => x.rating))) / Math.max(1, Math.max(...chartPoints.map((x) => x.rating)) - Math.min(...chartPoints.map((x) => x.rating)))) * 78} r="2" fill="var(--ink)" />
          {/each}
        </svg>
      {:else}
        <p class="muted empty-chart">Ainda não há partidas nesse modo.</p>
      {/if}
    </section>

    {#if recent.length}
      <section>
        <h3>Últimas partidas</h3>
        <ul class="list">
          {#each recent as r (r.game.id)}
            <li>
              <button class="row card" onclick={() => { sound.play('tap'); nav.go({ page: 'match', id: r.game.id }); }}>
                <span class="medal">{medal(r.place)}</span>
                <span class="sw" style="background:{COLOR_HEX[r.color]}"></span>
                <span class="info">
                  <span class="l1">{modeName(r.game.rules.mode)} · {r.game.players.length} jogadores</span>
                  <span class="l2 muted">{formatWhen(r.game.updatedAt)}{r.place === null ? ' · sem contar' : ''}</span>
                </span>
                <span class="st muted">⚔{r.slot.stats.captures} ☠{r.slot.stats.deaths}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>

{#if editing && player}
  <PlayerEditor
    {player}
    onClose={() => (editing = false)}
    onSaved={() => (editing = false)}
    onDeleted={() => {
      editing = false;
      nav.back({ page: 'players' });
    }}
  />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 8px) 16px 16px;
    gap: 14px;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 18px;
    color: var(--muted);
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
  .edit {
    min-width: 44px;
    height: 44px;
    padding: 0 8px;
    font-weight: 800;
    color: var(--ink);
  }
  .empty {
    padding: 20px;
    text-align: center;
  }
  .empty p {
    margin: 4px 0;
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  h2 {
    margin: 6px 0 0;
    font-size: 26px;
  }
  .hero p {
    margin: 0;
    font-size: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 4px;
    gap: 2px;
    text-align: center;
  }
  .v {
    font-size: 20px;
    font-weight: 900;
  }
  .k {
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1.2;
  }
  .elo {
    padding: 12px;
  }
  .section-head,
  .chart-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .section-head h3 {
    margin-bottom: 0;
  }
  .small {
    font-size: 11px;
  }
  .elo-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin: 10px 0 14px;
  }
  .elo-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 6px;
    text-align: left;
    padding: 8px 10px;
    min-height: 50px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--bg);
  }
  .elo-row.on {
    border-color: var(--ink);
  }
  .emode {
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .erating {
    grid-row: 1 / 3;
    grid-column: 2;
    align-self: center;
    font-size: 18px;
    font-weight: 900;
  }
  .egames {
    font-size: 11px;
  }
  .chart-title {
    font-size: 12px;
    margin-bottom: 4px;
  }
  .chart {
    display: block;
    width: 100%;
    height: 88px;
    overflow: visible;
  }
  .empty-chart {
    font-size: 12px;
    margin: 12px 0 4px;
    text-align: center;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    min-height: 56px;
    text-align: left;
  }
  .medal {
    width: 30px;
    text-align: center;
    font-size: 18px;
    font-weight: 800;
  }
  .sw {
    width: 8px;
    height: 32px;
    border-radius: 4px;
    flex: none;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .l1 {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .l2 {
    font-size: 12px;
  }
  .st {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
</style>
