<script lang="ts">
  import { history } from '../stores/history.svelte';
  import { players } from '../stores/players.svelte';
  import { nav } from '../stores/nav.svelte';
  import { COLOR_HEX } from '../lib/colors';
  import { modeName } from '../lib/modes';
  import { formatWhen } from '../lib/format';
  import { winnerOf } from '../lib/stats';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';

  /** Agrupa por dia pra lista não virar um paredão. */
  const groups = $derived.by(() => {
    const out: { label: string; items: typeof history.list }[] = [];
    const dayKey = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    let curKey = '';
    for (const g of history.list) {
      const k = dayKey(g.updatedAt);
      if (k !== curKey) {
        curKey = k;
        out.push({ label: formatWhen(g.updatedAt).replace(/ \d\d:\d\d$/, ''), items: [] });
      }
      out[out.length - 1].items.push(g);
    }
    return out;
  });
</script>

<div class="page">
  <header>
    <h1>Histórico</h1>
  </header>

  {#if history.list.length === 0}
    <div class="empty card">
      <div class="big">📜</div>
      <p><b>Nenhuma partida ainda.</b></p>
      <p class="muted">Cada partida encerrada fica guardada aqui, com a linha do tempo do que aconteceu.</p>
    </div>
  {:else}
    {#each groups as grp (grp.label)}
      <section>
        <h2>{grp.label}</h2>
        <ul class="list">
          {#each grp.items as g (g.id)}
            {@const w = winnerOf(g)}
            <li>
              <button class="row card" onclick={() => { sound.play('tap'); nav.go({ page: 'match', id: g.id }); }}>
                {#if w}
                  <Avatar avatar={players.avatarOf(w.playerId, w.avatar)} size={40} ring={COLOR_HEX[w.color]} />
                {:else}
                  <span class="noWin" aria-hidden="true">—</span>
                {/if}
                <span class="info">
                  <span class="l1">{w ? `${players.nameOf(w.playerId, w.name)} venceu` : 'Encerrada sem contar'}</span>
                  <span class="l2 muted">{modeName(g.rules.mode)} · {formatWhen(g.updatedAt).replace(/^.* /, '')}</span>
                  <span class="parts">
                    {#each g.players as p (p.color)}
                      <span class="pp" style="--c:{COLOR_HEX[p.color]}">
                        <span class="sw"></span>{players.nameOf(p.playerId, p.name)}
                      </span>
                    {/each}
                  </span>
                </span>
                <span class="chev">›</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 12px) 16px 16px;
    gap: 14px;
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
  .empty p {
    margin: 4px 0;
  }
  .big {
    font-size: 44px;
  }
  h2 {
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
    gap: 12px;
    padding: 10px 12px 10px 14px;
    min-height: 64px;
    text-align: left;
    transition: transform 0.08s;
  }
  .row:active {
    transform: scale(0.99);
  }
  .noWin {
    width: 40px;
    height: 40px;
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
    gap: 3px;
  }
  .l1 {
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .l2 {
    font-size: 12px;
  }
  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }
  .pp {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .sw {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .chev {
    color: var(--muted);
    font-size: 24px;
  }
</style>
