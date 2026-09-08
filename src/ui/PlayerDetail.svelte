<script lang="ts">
  import { players } from '../stores/players.svelte';
  import { history } from '../stores/history.svelte';
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

    <p class="muted note">O Elo por modo e o gráfico de evolução chegam na fase 6.</p>

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
  .note {
    font-size: 12px;
    text-align: center;
    margin: 0;
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
