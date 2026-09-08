<script lang="ts">
  import type { Mode } from '../engine/types';
  import { history } from '../stores/history.svelte';
  import { players } from '../stores/players.svelte';
  import { nav } from '../stores/nav.svelte';
  import { MODES, modeName } from '../lib/modes';
  import { PERIOD_MS, modesPlayed, mostPlayedMode, type Period } from '../lib/stats';
  import { eloStandings, roundedDelta, roundedRating } from '../lib/elo';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';

  const played = $derived(modesPlayed(history.list));
  const options = $derived(MODES.filter((m) => played.includes(m.id)));

  let mode = $state<Mode | null>(null);
  let period = $state<Period>('all');

  // modo padrão: o mais jogado (recalcula se o escolhido sumir do histórico)
  const activeMode = $derived(mode && played.includes(mode) ? mode : mostPlayedMode(history.list));

  const since = $derived.by(() => {
    const ms = PERIOD_MS[period];
    return ms ? Date.now() - ms : null;
  });

  const rows = $derived(activeMode ? eloStandings(history.list, activeMode, since) : []);

  const periods: { id: Period; label: string }[] = [
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mês' },
    { id: 'year', label: 'Ano' },
    { id: 'all', label: 'Tudo' },
  ];

  const medals = ['🥇', '🥈', '🥉'];
</script>

<div class="page">
  <header>
    <h1>Ranking</h1>
  </header>

  {#if !history.ready && history.list.length === 0}
    <p class="muted loading">Carregando…</p>
  {:else if !activeMode}
    <div class="empty card">
      <div class="big">🏆</div>
      <p><b>Ainda não tem ranking.</b></p>
      <p class="muted">Termine uma partida e o ranking aparece aqui, separado por modo.</p>
    </div>
  {:else}
    {#if options.length > 1}
      <div class="chips" role="tablist" aria-label="Modo">
        {#each options as m (m.id)}
          <button class="chip" class:on={m.id === activeMode} role="tab" aria-selected={m.id === activeMode} onclick={() => { sound.play('tap'); mode = m.id; }}>{m.name}</button>
        {/each}
      </div>
    {:else}
      <p class="muted single">{modeName(activeMode)}</p>
    {/if}

    <div class="seg" role="tablist" aria-label="Período">
      {#each periods as p (p.id)}
        <button class="segb" class:on={p.id === period} role="tab" aria-selected={p.id === period} onclick={() => { sound.play('tap'); period = p.id; }}>{p.label}</button>
      {/each}
    </div>

    {#if rows.length === 0}
      <p class="muted none">Nenhuma partida de {modeName(activeMode)} nesse período.</p>
    {:else}
      <div class="table card">
        <div class="thead muted">
          <span class="pos">#</span>
          <span class="who">Jogador · Elo</span>
          <span class="n">V</span>
          <span class="n">J</span>
          <span class="n">Δ</span>
        </div>
        {#each rows as r, i (r.playerId)}
          <button class="tr" onclick={() => { sound.play('tap'); if (players.get(r.playerId)) nav.go({ page: 'player', id: r.playerId }); }}>
            <span class="pos">{medals[i] ?? i + 1}</span>
            <span class="who">
              <Avatar avatar={players.avatarOf(r.playerId, r.avatar)} size={34} />
              <span class="nm">
                <span>{players.nameOf(r.playerId, r.name)}</span>
                <span class="elo-line"><b>{roundedRating(r.rating)}</b> Elo <span class:up={roundedDelta(r.periodDelta) > 0} class:down={roundedDelta(r.periodDelta) < 0}>{roundedDelta(r.periodDelta) > 0 ? '+' : ''}{roundedDelta(r.periodDelta)}</span></span>
              </span>
            </span>
            <span class="n b">{r.periodWins}</span>
            <span class="n">{r.periodGames}</span>
            <span class="n" class:up={roundedDelta(r.periodDelta) > 0} class:down={roundedDelta(r.periodDelta) < 0}>{roundedDelta(r.periodDelta) > 0 ? '+' : ''}{roundedDelta(r.periodDelta)}</span>
          </button>
        {/each}
      </div>
      <p class="muted foot">Elo separado por modo · V = vitórias · J = partidas · Δ = variação no período.</p>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 12px) 16px 16px;
    gap: 12px;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }
  header {
    min-height: 48px;
    display: flex;
    align-items: center;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    letter-spacing: -0.3px;
  }
  .empty {
    padding: 24px 20px;
    text-align: center;
    margin-top: 20px;
  }
  .loading {
    text-align: center;
    margin-top: 40px;
  }
  .empty p {
    margin: 4px 0;
  }
  .big {
    font-size: 44px;
  }
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    padding: 0 14px;
    min-height: 40px;
    border-radius: 999px;
    background: var(--panel);
    font-weight: 700;
    font-size: 14px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), 0 3px 10px -6px rgba(0, 0, 0, 0.3);
  }
  .chip.on {
    background: var(--ink);
    color: #fff;
  }
  .single {
    margin: 0;
    font-weight: 700;
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: var(--line);
    border-radius: 12px;
    padding: 3px;
    gap: 3px;
  }
  .segb {
    min-height: 38px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
    color: var(--muted);
  }
  .segb.on {
    background: #fff;
    color: var(--ink);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .none {
    text-align: center;
    margin: 20px 0;
  }
  .table {
    padding: 4px 8px 4px 8px;
    display: flex;
    flex-direction: column;
  }
  .thead,
  .tr {
    display: grid;
    grid-template-columns: 34px 1fr 40px 40px 48px;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
  }
  .thead {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--line);
  }
  .tr {
    text-align: left;
    min-height: 54px;
    font-size: 15px;
  }
  .tr + .tr {
    border-top: 1px solid var(--line);
  }
  .pos {
    text-align: center;
    font-weight: 800;
    font-size: 16px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .nm {
    font-weight: 700;
    min-width: 0;
    display: flex;
    flex-direction: column;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .elo-line {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.1;
  }
  .up {
    color: #16834d;
  }
  .down {
    color: var(--red);
  }
  .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .b {
    font-weight: 800;
  }
  .foot {
    font-size: 12px;
    text-align: center;
  }
</style>
