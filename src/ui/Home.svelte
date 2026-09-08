<script lang="ts">
  import { match } from '../stores/match.svelte';
  import { history } from '../stores/history.svelte';
  import { players } from '../stores/players.svelte';
  import { nav } from '../stores/nav.svelte';
  import { COLOR_HEX } from '../lib/colors';
  import { modeName } from '../lib/modes';
  import { formatWhen } from '../lib/format';
  import { mostPlayedMode, winnerOf } from '../lib/stats';
  import { eloStandings, roundedRating } from '../lib/elo';
  import { currentPlayer } from '../engine/game';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';

  const resumable = $derived(match.active);
  /** Quem joga agora (no Deathmatch não existe vez: mostra o modo). */
  const who = $derived(match.state && match.state.rules.mode !== 'deathmatch' ? currentPlayer(match.state) : undefined);

  const topMode = $derived(mostPlayedMode(history.list));
  const top3 = $derived(topMode ? eloStandings(history.list, topMode).slice(0, 3) : []);
  const recent = $derived(history.list.slice(0, 3));

  const medals = ['🥇', '🥈', '🥉'];

  function tap(fn: () => void) {
    sound.play('tap');
    fn();
  }
</script>

<div class="page">
  <header class="hero">
    <div class="logo" aria-hidden="true">
      <span style="background:{COLOR_HEX.green}"></span>
      <span style="background:{COLOR_HEX.red}"></span>
      <span style="background:{COLOR_HEX.yellow}"></span>
      <span style="background:{COLOR_HEX.blue}"></span>
    </div>
    <div>
      <h1>Ludo</h1>
      <p class="muted">Todo mundo no mesmo celular.</p>
    </div>
  </header>

  <div class="actions">
    {#if resumable}
      <button class="btn primary big block" onclick={() => tap(() => nav.go({ page: 'game' }))}>
        Continuar partida
        {#if who}
          <span class="sub"><Avatar avatar={players.avatarOf(who.playerId, who.avatar)} size={20} /> vez de {players.nameOf(who.playerId, who.name)}</span>
        {:else if match.state}
          <span class="sub">{modeName(match.state.rules.mode)}</span>
        {/if}
      </button>
      <button class="btn big block" onclick={() => tap(() => nav.go({ page: 'new' }))}>Nova partida</button>
    {:else}
      <button class="btn primary big block" onclick={() => tap(() => nav.go({ page: 'new' }))}>Nova partida</button>
    {/if}
  </div>

  {#if top3.length}
    <section class="card block-card">
      <div class="head">
        <h2>Top 3 · {modeName(topMode!)}</h2>
        <button class="link" onclick={() => tap(() => nav.switchTab('ranking'))}>Ranking ›</button>
      </div>
      <ol class="top">
        {#each top3 as s, i (s.playerId)}
          <li>
            <span class="medal">{medals[i]}</span>
            <Avatar avatar={players.avatarOf(s.playerId, s.avatar)} size={36} />
            <span class="nm">{players.nameOf(s.playerId, s.name)}</span>
            <span class="muted st">{roundedRating(s.rating)} Elo · {s.wins} {s.wins === 1 ? 'vitória' : 'vitórias'} · {s.games} {s.games === 1 ? 'partida' : 'partidas'}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if recent.length}
    <section class="card block-card">
      <div class="head">
        <h2>Últimas partidas</h2>
        <button class="link" onclick={() => tap(() => nav.switchTab('history'))}>Histórico ›</button>
      </div>
      <ul class="recent">
        {#each recent as g (g.id)}
          {@const w = winnerOf(g)}
          <li>
            <button class="row" onclick={() => tap(() => nav.go({ page: 'match', id: g.id }))}>
              {#if w}
                <Avatar avatar={players.avatarOf(w.playerId, w.avatar)} size={36} ring={COLOR_HEX[w.color]} />
              {:else}
                <span class="noWin" aria-hidden="true">—</span>
              {/if}
              <span class="info">
                <span class="l1">{w ? `${players.nameOf(w.playerId, w.name)} venceu` : 'Encerrada sem contar'}</span>
                <span class="l2 muted">{modeName(g.rules.mode)} · {g.players.length} jogadores · {formatWhen(g.updatedAt)}</span>
              </span>
              <span class="chev">›</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if !top3.length && !recent.length}
    <p class="muted foot">Cadastre os jogadores na aba <b>Jogadores</b> ou crie direto ao montar a partida.</p>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 20px) 16px 16px;
    gap: 16px;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 4px;
  }
  .hero p {
    margin: 0;
    font-size: 14px;
  }
  .logo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    width: 60px;
    height: 60px;
    padding: 6px;
    border-radius: 18px;
    background: #fff;
    box-shadow: var(--shadow);
    flex: none;
  }
  .logo span {
    border-radius: 6px;
  }
  h1 {
    margin: 0;
    font-size: 32px;
    letter-spacing: -0.5px;
    line-height: 1.1;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .actions .btn {
    flex-direction: column;
    gap: 2px;
  }
  .sub {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    opacity: 0.85;
  }
  .block-card {
    padding: 14px 14px 10px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .link {
    font-weight: 700;
    color: var(--ink);
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 14px;
  }
  .top,
  .recent {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .top li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    font-weight: 700;
    font-size: 16px;
  }
  .top li + li {
    border-top: 1px solid var(--line);
  }
  .medal {
    width: 28px;
    text-align: center;
    font-size: 20px;
  }
  .nm {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    text-align: left;
    min-height: 56px;
  }
  .recent li + li .row {
    border-top: 1px solid var(--line);
  }
  .noWin {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg);
    display: grid;
    place-items: center;
    color: var(--muted);
    font-weight: 700;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chev {
    color: var(--muted);
    font-size: 22px;
  }
  .foot {
    text-align: center;
    font-size: 14px;
    margin-top: 20px;
  }
</style>
