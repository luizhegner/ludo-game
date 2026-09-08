<script lang="ts">
  import { players, type Player } from '../stores/players.svelte';
  import { history } from '../stores/history.svelte';
  import { nav } from '../stores/nav.svelte';
  import { sound } from '../lib/sound';
  import { plural } from '../lib/format';
  import { mostPlayedMode } from '../lib/stats';
  import { eloStandings, roundedRating } from '../lib/elo';
  import Avatar from './Avatar.svelte';
  import PlayerEditor from './PlayerEditor.svelte';

  let creating = $state(false);

  /** Resumo por jogador: partidas ranqueadas e vitórias. */
  const summary = $derived.by(() => {
    const map = new Map<string, { games: number; wins: number; last: number }>();
    for (const g of history.list) {
      for (const p of g.players) {
        const cur = map.get(p.playerId) ?? { games: 0, wins: 0, last: 0 };
        if (g.placements) {
          cur.games++;
          if (g.placements[0] === p.color) cur.wins++;
        }
        cur.last = Math.max(cur.last, g.updatedAt);
        map.set(p.playerId, cur);
      }
    }
    return map;
  });

  const eloMode = $derived(mostPlayedMode(history.list));
  const eloByPlayer = $derived.by(() => {
    if (!eloMode) return new Map<string, number>();
    return new Map(eloStandings(history.list, eloMode).map((r) => [r.playerId, r.rating]));
  });

  /** Quem jogou mais recentemente primeiro; quem nunca jogou, por nome. */
  const sorted = $derived(
    [...players.list].sort(
      (a, b) => (summary.get(b.id)?.last ?? 0) - (summary.get(a.id)?.last ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
    ),
  );

  function open(p: Player) {
    sound.play('tap');
    nav.go({ page: 'player', id: p.id });
  }
</script>

<div class="page">
  <header>
    <h1>Jogadores</h1>
    <button class="btn" onclick={() => { sound.play('tap'); creating = true; }}>+ Novo</button>
  </header>

  {#if sorted.length === 0}
    <div class="empty card">
      <div class="big">👥</div>
      <p><b>Ninguém cadastrado ainda.</b></p>
      <p class="muted">Cadastre quem joga com você: cada um tem seu avatar, histórico e ranking.</p>
      <button class="btn primary big block" onclick={() => { sound.play('tap'); creating = true; }}>Cadastrar jogador</button>
    </div>
  {:else}
    <ul class="list">
      {#each sorted as p (p.id)}
        {@const s = summary.get(p.id)}
        <li>
          <button class="row card" onclick={() => open(p)}>
            <Avatar avatar={p.avatar} size={48} />
            <span class="info">
              <span class="nm">{p.name}</span>
              <span class="muted sub">
                {#if s && s.games}
                  {roundedRating(eloByPlayer.get(p.id) ?? 1000)} Elo · {plural(s.games, 'partida', 'partidas')} · {plural(s.wins, 'vitória', 'vitórias')}
                {:else}
                  ainda não jogou · 1000 Elo
                {/if}
              </span>
            </span>
            <span class="chev">›</span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="muted foot">Toque num jogador pra ver detalhes, editar ou excluir.</p>
  {/if}
</div>

{#if creating}
  <PlayerEditor onClose={() => (creating = false)} onSaved={() => (creating = false)} />
{/if}

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
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 48px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    letter-spacing: -0.3px;
  }
  .empty {
    padding: 24px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 20px;
  }
  .empty p {
    margin: 0;
  }
  .empty .btn {
    margin-top: 12px;
  }
  .big {
    font-size: 44px;
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
    gap: 12px;
    padding: 10px 14px;
    min-height: 64px;
    text-align: left;
    transition: transform 0.08s;
  }
  .row:active {
    transform: scale(0.99);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nm {
    font-weight: 800;
    font-size: 17px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: 13px;
  }
  .chev {
    color: var(--muted);
    font-size: 24px;
  }
  .foot {
    font-size: 13px;
    text-align: center;
  }
</style>
