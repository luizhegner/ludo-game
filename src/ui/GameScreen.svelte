<script lang="ts">
  import { match } from '../stores/match.svelte';
  import { dmStore } from '../stores/dm.svelte';
  import { sound } from '../lib/sound';
  import { COLOR_HEX, COLOR_ON } from '../lib/colors';
  import { BASE_ORIGIN } from '../engine/board';
  import { COLORS, type Color } from '../engine/types';
  import { controllerOf, currentPlayer, legalPicks, piecesColorFor } from '../engine/game';
  import { fmtClock } from '../lib/format';
  import { POWER_ICON, powerBg, powerBorder, powerBlurb, powerName } from '../lib/powers';
  import { powerIconUrl } from '../lib/art.svelte';
  import Icon from './Icon.svelte';
  import { players } from '../stores/players.svelte';
  import { settings } from '../stores/settings.svelte';
  import Avatar from './Avatar.svelte';
  import Board from './Board.svelte';
  import PhysDice from './PhysDice.svelte';
  import GameMenu from './GameMenu.svelte';
  import GameOver from './GameOver.svelte';

  interface Props {
    onExit: () => void;
  }
  let { onExit }: Props = $props();

  let menuOpen = $state(false);

  const game = $derived(match.state!);
  /** Quem está jogando (no 2v2 pode ser o parceiro da cor da vez). */
  const turn = $derived(controllerOf(game, game.turn.color));
  /** Cor das peças que vão andar. */
  const piecesColor = $derived(piecesColorFor(game, game.turn.color));
  const me = $derived(currentPlayer(game));
  /** Tema OG: cabeçalho compacto (avatar emoldurado + ✕/☠ + 👉) e moldura de madeira no tabuleiro. */
  const og = $derived(settings.theme === 'og');
  /** Cronômetro: pisca nos últimos 30 s. */
  const urgent = $derived(match.timed && match.remainingMs <= 30_000 && match.remainingMs > 0);

  // ---- Deathmatch: tempo real, um dado por jogador na própria base ----
  const dm = $derived(match.deathmatch);
  /** Cores presentes (ativas ou pausadas) — cada uma ganha um dado. */
  const dmColors = $derived(dm ? game.players.filter((p) => p.status !== 'removed').map((p) => p.color) : []);
  const dmLegal = $derived.by(() => {
    if (!dm) return {} as Partial<Record<Color, number[]>>;
    void dmStore.anim; // reage às animações
    const out: Partial<Record<Color, number[]>> = {};
    for (const c of dmColors) out[c] = dmStore.legal(c, game);
    return out;
  });
  /** Relógio de parede pro anel de proteção (atualiza 4×/s enquanto a partida corre). */
  let dmNow = $state(0);
  $effect(() => {
    if (!dm || game.turn.phase === 'over') return;
    dmNow = Date.now();
    const id = setInterval(() => (dmNow = Date.now()), 250);
    return () => clearInterval(id);
  });
  /** Líder atual (pro cabeçalho). */
  const dmLead = $derived.by(() => {
    if (!dm) return null;
    const list = game.players.filter((p) => p.status !== 'removed');
    const best = [...list].sort((a, b) => b.stats.captures - a.stats.captures || a.stats.deaths - b.stats.deaths)[0];
    return best ?? null;
  });
  /**
   * Onde o dado descansa: no tema OG, no quadrado-avatar (canto externo da base,
   * como no jogo original); nos outros temas, no centro da base.
   */
  const CORNER_IN = 1.9;
  const dieHome = (c: Color) => {
    const o = BASE_ORIGIN[c];
    if (!og) return { x: o.col + 3, y: o.row + 3 };
    return { x: o.col === 0 ? CORNER_IN : 15 - CORNER_IN, y: o.row === 0 ? CORNER_IN : 15 - CORNER_IN };
  };
  /** Jogadores nos cantos do tabuleiro (tema OG): o da vez tem o dado no quadrado. */
  const cornerPlayers = $derived(game.players.filter((p) => p.status !== 'removed'));

  // menu aberto pausa o relógio (ações explícitas, sem efeito reativo)
  function openMenu() {
    sound.play('tap');
    menuOpen = true;
    match.holdClock('menu');
  }
  function closeMenu() {
    menuOpen = false;
    match.releaseClock('menu');
  }
  const canRoll = $derived(game.turn.phase === 'roll' && !match.busy);
  const legal = $derived(game.turn.phase === 'move' ? game.turn.legal : []);
  /** Dado personalizável: números que a peça consegue andar. */
  const picks = $derived(game.turn.phase === 'pick' && !match.busy ? legalPicks(game) : []);

  /** Face do dado: enquanto gira, o valor já sorteado; parado, a última face. */
  const diceValue = $derived(match.rollingValue ?? match.diceFace);

  /** Um dado por cor no Deathmatch; no modo clássico, o dado da vez. */
  const diceTokens = $derived.by(() => {
    if (dm) {
      return dmColors.map((c) => {
        const h = dieHome(c);
        return { id: c, color: c, homeX: h.x, homeY: h.y, enabled: dmStore.canRoll(c, game) };
      });
    }
    const h = dieHome(turn);
    return [{ id: 'main', color: turn, homeX: h.x, homeY: h.y, enabled: canRoll }];
  });
  const diceFaces = $derived.by(() =>
    dm
      ? Object.fromEntries(dmColors.map((c) => [c, dmStore.anim[c].rollingValue ?? dmStore.anim[c].face]))
      : { main: diceValue },
  );
  const diceRolling = $derived.by(() =>
    dm
      ? Object.fromEntries(dmColors.map((c) => [c, dmStore.anim[c].rolling]))
      : { main: match.rolling },
  );
</script>

<div class="screen" class:og class:dm>
  <header>
    {#if dm}
      <!-- Deathmatch: placar em vez de "vez de" -->
      <div class="dm-head">
        <span class="dm-title">⚔ Deathmatch</span>
        <span class="dm-sub muted">
          {#if dmLead && dmLead.stats.captures > 0}
            {players.nameOf(dmLead.playerId, dmLead.name)} lidera · {dmLead.stats.captures}/{game.dm?.target ?? 8}
          {:else}
            primeiro a {game.dm?.target ?? 8} capturas
          {/if}
        </span>
      </div>
    {:else if og && me}
      <!-- OG: quem joga aparece nos cantos do tabuleiro; o cabeçalho fica limpo -->
      <div class="who-og" aria-label="quem joga">
        <span class="name">{players.nameOf(me.playerId, me.name)}</span>
        {#if piecesColor !== turn}
          <span class="for" style="--pc:{COLOR_HEX[piecesColor]}" title="jogando com as peças do parceiro"></span>
        {/if}
      </div>
    {:else}
    <div class="who" style="--c:{COLOR_HEX[turn]}; --on:{COLOR_ON[turn]}">
      <span class="dot"></span>
      {#if me}
        <Avatar avatar={players.avatarOf(me.playerId, me.avatar)} size={28} />
        <span class="name">{players.nameOf(me.playerId, me.name)}</span>
        {#if piecesColor !== turn}
          <span class="for" style="--pc:{COLOR_HEX[piecesColor]}" title="jogando com as peças do parceiro"></span>
        {/if}
      {/if}
    </div>
    {/if}
    <div class="hright">
      {#if match.timed}
        <span class="clock" class:urgent class:paused={game.clock?.runningSince === null && (game.clock?.elapsedMs ?? 0) > 0 && game.turn.phase !== 'over'} aria-label="Tempo restante">
          ⏱ {fmtClock(match.remainingMs)}
        </span>
      {/if}
      <button class="menu-btn" aria-label="Menu" onclick={openMenu}>⋮</button>
    </div>
  </header>

  <div class="board-wrap">
    <Board
      state={game}
      {legal}
      moving={match.moving}
      movings={dm ? dmStore.movings : []}
      {dmLegal}
      {dmNow}
      dmOverrides={dm ? dmStore.overrides : {}}
      onDmPiece={(c, i) => { sound.play('tap'); dmStore.move(c, i); }}
      goingHome={match.goingHome}
      busy={match.busy}
      onPiece={(i) => { sound.play('tap'); match.move(i); }}
      onPowerHold={(p) => match.showInfo(p)}
      onPowerRelease={() => match.hideInfo()}
    >
      {#snippet overlay(cell)}
        {#if game.turn.phase !== 'over'}
          <!-- Dado 3D (fallback CSS automático se não houver WebGL): o número é sorteado
               no toque, antes do deslize; a física é só animação e pousa na face certa. -->
          <PhysDice
            boardPx={cell * 15}
            tokens={diceTokens}
            faces={diceFaces}
            rolling={diceRolling}
            onRoll={(id, value, visual) => {
              const opts = { visualDone: visual ?? value != null };
              if (dm) dmStore.roll(id as Color, value, opts);
              else match.roll(value, opts);
            }}
          />
          {#if og && !dm && canRoll}
            <!-- mãozinha no quadrado de quem joga (como no original) -->
            {@const h = dieHome(turn)}
            <div
              class="point-og"
              style="left:{(h.x + (h.x < 7.5 ? 2.5 : -2.5)) * cell}px; top:{(h.y + (h.y < 7.5 ? 2.4 : -2.4)) * cell}px"
              aria-hidden="true"
            >
              👉
            </div>
          {/if}
          {#if og && !dm}
            <!-- avatares nos cantos do tabuleiro; no quadrado da vez mora o dado -->
            {#each cornerPlayers as p (p.color)}
              {@const h = dieHome(p.color)}
              {@const isTurn = p.color === turn}
              <div
                class="pcorner"
                class:turn={isTurn}
                style="left:{h.x * cell}px; top:{(h.y + (isTurn ? (h.y < 7.5 ? 2.15 : -2.15) : 0)) * cell}px; --c:{COLOR_HEX[p.color]}; --cell:{cell}px"
              >
                {#if !isTurn}
                  <span class="pframe"><Avatar avatar={players.avatarOf(p.playerId, p.avatar)} size={30} /></span>
                {/if}
                <span class="pname">{players.nameOf(p.playerId, p.name)}</span>
                <span class="pstats" aria-label="capturas e mortes">✕ {p.stats.captures} · ☠ {p.stats.deaths}</span>
              </div>
            {/each}
          {/if}
        {/if}
        {#if picks.length}
          <!-- dado personalizável: escolha do número, no centro do tabuleiro -->
          <div class="picker" style="--c:{COLOR_HEX[turn]}; --on:{COLOR_ON[turn]}; --cell:{cell}px">
            <div class="ptitle">🎯 Escolha o número</div>
            <div class="pgrid">
              {#each [1, 2, 3, 4, 5, 6] as v}
                <button class="pick" disabled={!picks.includes(v)} onclick={() => { sound.play('tap'); match.pick(v); }}>{v}</button>
              {/each}
            </div>
          </div>
        {/if}
      {/snippet}
    </Board>
  </div>

  <div class="status" style="--c:{dm ? 'var(--ink)' : COLOR_HEX[turn]}">
    {#if match.info}
      {@const p = match.info.power}
      <div class="pinfo" style="--bg:{powerBg(p)}; --bd:{powerBorder(p)}">
        <span class="picon"><Icon src={powerIconUrl(p)} fallback={POWER_ICON[p]} size={32} /></span>
        <div>
          <b>{powerName(p)}</b>
          <div class="small">{powerBlurb(p)}</div>
        </div>
      </div>
    {:else if match.toasts.length}
      {#each match.toasts as t (t.id)}
        <div class="toast" style="--c:{t.color ? COLOR_HEX[t.color] : 'var(--ink)'}">{t.text}</div>
      {/each}
    {:else}
      <div class="hint">{match.status}</div>
    {/if}
  </div>

  {#if menuOpen}
    <GameMenu onClose={closeMenu} {onExit} />
  {/if}

  {#if game.turn.phase === 'over'}
    <GameOver state={game} {onExit} />
  {/if}
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    padding: calc(var(--safe-top) + 8px) 12px calc(var(--safe-bottom) + 12px);
    gap: 10px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
  }
  .hright {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    font-size: 17px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--panel);
    box-shadow: var(--shadow);
    letter-spacing: 0.02em;
  }
  .clock.paused {
    opacity: 0.55;
  }
  .clock.urgent {
    color: #fff;
    background: #d9483f;
    animation: blink 1s steps(2, end) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.55;
    }
  }
  .for {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--pc);
    border: 2px solid #fff;
    margin-left: -2px;
  }
  /* ---- cabeçalho do tema OG ---- */
  .who-og {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    font-weight: 800;
    font-size: 16px;
    min-width: 0;
  }
  .who-og .name {
    max-width: 34vw;
  }
  @keyframes point {
    0%,
    100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(6px);
    }
  }
  .screen.og .menu-btn,
  .screen.og .clock {
    background: rgba(0, 0, 0, 0.35);
    color: #fbf3e6;
    box-shadow: 0 0 0 1px rgba(255, 235, 205, 0.14) inset;
  }
  .screen.og .hint {
    color: #e6d6c6;
  }

  .who {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 5px 14px 5px 8px;
    border-radius: 999px;
    background: var(--c);
    color: var(--on);
    font-weight: 800;
    font-size: 16px;
    box-shadow: 0 4px 14px -6px rgba(0, 0, 0, 0.4);
    transition: background 0.25s;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    opacity: 0.9;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50vw;
  }
  .menu-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    font-size: 24px;
    font-weight: 800;
    background: var(--panel);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), 0 4px 14px -6px rgba(0, 0, 0, 0.25);
  }
  .board-wrap {
    width: min(100%, calc(100dvh - 190px));
    margin: 0 auto;
  }
  /* Tema OG: tabuleiro no meio da tela; sobra espaço para deslizar o dado (layout do original) */
  .screen.og .board-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .screen.og .status {
    flex: none;
  }
  /* quadrado-avatar de cada jogador no canto externo da base */
  .pcorner {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: calc(var(--cell) * 4.2);
    pointer-events: none;
    z-index: 5;
  }
  .pcorner :global(*) {
    pointer-events: none;
  }
  .pframe {
    display: inline-grid;
    place-items: center;
    width: calc(var(--cell) * 2.4);
    height: calc(var(--cell) * 2.4);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    border: 3px solid var(--c);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35), 0 0 14px -2px var(--c);
  }
  .pname {
    max-width: 100%;
    font-size: calc(var(--cell) * 0.62);
    font-weight: 800;
    line-height: 1.05;
    color: #fbf3e6;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pstats {
    font-size: calc(var(--cell) * 0.55);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: #fbf3e6;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  }
  .point-og {
    position: absolute;
    transform: translate(-50%, -50%);
    font-size: clamp(22px, calc(var(--cell) * 1.4), 40px);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    animation: point 0.9s ease-in-out infinite;
    z-index: 5;
    pointer-events: none !important;
  }
  .dm-head {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
  }
  .dm-title {
    font-weight: 800;
    font-size: 17px;
  }
  .dm-sub {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 56vw;
  }
  .status {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-height: 64px;
    padding-top: 4px;
  }
  .hint {
    font-size: 17px;
    font-weight: 600;
    color: var(--muted);
    padding: 10px 16px;
  }
  .toast {
    padding: 10px 16px;
    border-radius: 12px;
    background: var(--panel);
    border-left: 5px solid var(--c);
    font-weight: 700;
    box-shadow: var(--shadow);
    animation: pop 0.25s ease-out;
    max-width: 100%;
  }
  .pinfo {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--bg);
    border: 2px solid var(--bd);
    animation: pop 0.2s ease-out;
    max-width: 100%;
    text-align: left;
  }
  .picon {
    display: grid;
    place-items: center;
    flex: none;
  }
  .picker {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    border-radius: 16px;
    padding: 10px 12px 12px;
    box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.5);
    border: 3px solid var(--c);
    animation: pop 0.25s ease-out;
    z-index: 2;
  }
  .ptitle {
    font-weight: 800;
    text-align: center;
    margin-bottom: 8px;
    white-space: nowrap;
  }
  .pgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .pick {
    width: max(44px, calc(var(--cell) * 2));
    height: max(44px, calc(var(--cell) * 2));
    border-radius: 12px;
    font-size: 22px;
    font-weight: 800;
    background: var(--c);
    color: var(--on);
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.2);
  }
  .pick:disabled {
    opacity: 0.3;
  }
  .pick:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: none;
  }
</style>
