<script lang="ts">
  import type { Color } from '../engine/types';
  import { history } from '../stores/history.svelte';
  import { players } from '../stores/players.svelte';
  import { match } from '../stores/match.svelte';
  import { nav } from '../stores/nav.svelte';
  import { COLOR_HEX, COLOR_NAME } from '../lib/colors';
  import { modeName } from '../lib/modes';
  import { formatDuration, formatTime, formatWhen } from '../lib/format';
  import { rollsByColor, timelineOf } from '../lib/timeline';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';

  interface Props {
    id: string;
  }
  let { id }: Props = $props();

  const game = $derived(history.get(id));

  const nameOf = (c: Color) => {
    const p = game?.players.find((x) => x.color === c);
    return p ? players.nameOf(p.playerId, p.name) : COLOR_NAME[c];
  };

  const rows = $derived.by(() => {
    if (!game) return [];
    const order = game.placements ?? game.players.map((p) => p.color);
    const rolls = rollsByColor(game);
    return order
      .map((c, i) => {
        const p = game.players.find((x) => x.color === c);
        return p ? { color: c, place: game.placements ? i + 1 : null, p, rolls: rolls[c] ?? 0 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  });

  const timeline = $derived(game ? timelineOf(game, nameOf) : []);
  const medal = (place: number | null) => (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : place ? `${place}º` : '·');

  function back() {
    sound.play('tap');
    nav.back({ page: 'history' });
  }

  function rematch() {
    if (!game) return;
    if (match.active && !confirm('Tem uma partida em andamento. Começar outra apaga ela. Continuar?')) return;
    sound.play('tap');
    match.start({
      rules: game.rules,
      players: game.players
        .filter((p) => p.status !== 'removed')
        .map((p) => {
          const cur = players.get(p.playerId);
          return { color: p.color, playerId: p.playerId, name: cur?.name ?? p.name, avatar: cur?.avatar ?? p.avatar };
        }),
    });
    nav.switchTab('home');
    nav.go({ page: 'game' });
  }

  function remove() {
    if (!game) return;
    if (!confirm('Apagar esta partida do histórico? Isso não tem volta.')) return;
    history.remove(game.id);
    nav.back({ page: 'history' });
  }
</script>

<div class="page">
  <header>
    <button class="icon" aria-label="Voltar" onclick={back}>‹</button>
    <h1>Partida</h1>
    <span class="icon"></span>
  </header>

  {#if !game && !history.ready}
    <p class="muted" style="text-align:center">Carregando…</p>
  {:else if !game}
    <div class="card empty">
      <p><b>Partida não encontrada.</b></p>
      <p class="muted">Ela pode ter sido apagada do histórico.</p>
    </div>
  {:else}
    <section class="card summary">
      <div class="mode">{modeName(game.rules.mode)}</div>
      <div class="muted when">
        {formatWhen(game.createdAt)} · {formatDuration(game.updatedAt - game.createdAt)} ·
        {game.log.filter((e) => e.type === 'roll').length} lançamentos
      </div>
      {#if game.endReason === 'abandoned'}
        <div class="tag">Encerrada sem contar</div>
      {:else if game.endReason === 'ranked'}
        <div class="tag">Encerrada e ranqueada por progresso</div>
      {/if}
      {#if game.rules.captureBonus}
        <div class="muted small">Regra extra: jogada extra ao comer</div>
      {/if}
      {#if game.rules.visibleMines}
        <div class="muted small">Regra extra: minas visíveis</div>
      {/if}
    </section>

    <section class="card table">
      <div class="thead muted">
        <span class="pos"></span>
        <span class="who">Jogador</span>
        <span class="n" title="Peças comidas">⚔</span>
        <span class="n" title="Peças perdidas">☠</span>
        <span class="n" title="Seis tirados">6</span>
        <span class="n" title="Lançamentos">🎲</span>
        {#if game.powers}<span class="n" title="Poderes pegos">✨</span>{/if}
      </div>
      {#each rows as r (r.color)}
        <div class="tr" class:first={r.place === 1} style="--c:{COLOR_HEX[r.color]}">
          <span class="pos">{medal(r.place)}</span>
          <span class="who">
            <Avatar avatar={players.avatarOf(r.p.playerId, r.p.avatar)} size={32} ring={COLOR_HEX[r.color]} />
            <span class="nm">{players.nameOf(r.p.playerId, r.p.name)}{r.p.status === 'removed' ? ' (saiu)' : ''}</span>
          </span>
          <span class="n">{r.p.stats.captures}</span>
          <span class="n">{r.p.stats.deaths}</span>
          <span class="n">{r.p.stats.sixes}</span>
          <span class="n">{r.rolls}</span>
          {#if game.powers}<span class="n">{r.p.stats.powers}</span>{/if}
        </div>
      {/each}
      {#if game.substituted?.length}
        <div class="muted small subs">
          Saíram por substituição: {game.substituted.map((s) => `${players.nameOf(s.playerId, s.name)} (${COLOR_NAME[s.color].toLowerCase()})`).join(', ')}
        </div>
      {/if}
    </section>

    <section>
      <h2>Linha do tempo</h2>
      <ol class="timeline">
        {#each timeline as it, i (i)}
          <li class={it.kind} style="--c:{it.color ? COLOR_HEX[it.color] : 'var(--muted)'}">
            <span class="time">{formatTime(it.t)}</span>
            <span class="dot"></span>
            <span class="txt">{it.text}</span>
          </li>
        {/each}
      </ol>
    </section>

    <div class="actions">
      <button class="btn primary big block" onclick={rematch}>Revanche com os mesmos</button>
      <button class="btn ghost block danger" onclick={remove}>Apagar do histórico</button>
    </div>
  {/if}
</div>

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
  .empty {
    padding: 20px;
    text-align: center;
  }
  .empty p {
    margin: 4px 0;
  }
  .summary {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
  .mode {
    font-size: 22px;
    font-weight: 900;
  }
  .when {
    font-size: 13px;
  }
  .tag {
    margin-top: 6px;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--bg);
    color: var(--muted);
  }
  .small {
    font-size: 12px;
  }
  .table {
    padding: 4px 10px 8px;
  }
  .thead,
  .tr {
    display: grid;
    grid-template-columns: 30px 1fr 34px 34px 34px 40px;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
  }
  .thead {
    font-size: 12px;
    font-weight: 800;
    border-bottom: 1px solid var(--line);
  }
  .thead .n {
    text-align: right;
  }
  .tr {
    min-height: 50px;
    font-size: 15px;
  }
  .tr + .tr {
    border-top: 1px solid var(--line);
  }
  .tr.first .nm {
    font-weight: 900;
  }
  .pos {
    text-align: center;
    font-weight: 800;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .nm {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .subs {
    padding: 6px 2px 0;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0 0 0 2px;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 58px;
    top: 10px;
    bottom: 10px;
    width: 2px;
    background: var(--line);
  }
  .timeline li {
    display: grid;
    grid-template-columns: 44px 30px 1fr;
    align-items: center;
    gap: 0;
    min-height: 38px;
    font-size: 14px;
    position: relative;
  }
  .time {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px var(--line);
    justify-self: center;
    z-index: 1;
  }
  .txt {
    padding: 8px 10px;
    border-radius: 10px;
    line-height: 1.3;
  }
  li.capture .txt,
  li.done .txt,
  li.over .txt {
    font-weight: 700;
  }
  li.capture .dot {
    transform: scale(1.2);
  }
  li.penalty .txt {
    color: var(--muted);
  }
  li.power .txt {
    background: #f3ecff;
  }
  li.over .txt {
    background: var(--panel);
    box-shadow: var(--shadow);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  .danger {
    color: var(--red);
  }
</style>
