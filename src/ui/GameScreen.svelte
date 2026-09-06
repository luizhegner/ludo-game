<script lang="ts">
  import { match } from '../stores/match.svelte';
  import { COLOR_HEX, COLOR_ON } from '../lib/colors';
  import { BASE_ORIGIN } from '../engine/board';
  import { currentPlayer } from '../engine/game';
  import Board from './Board.svelte';
  import Dice from './Dice.svelte';
  import GameMenu from './GameMenu.svelte';
  import GameOver from './GameOver.svelte';

  interface Props {
    onExit: () => void;
  }
  let { onExit }: Props = $props();

  let menuOpen = $state(false);

  const game = $derived(match.state!);
  const turn = $derived(game.turn.color);
  const me = $derived(currentPlayer(game));
  const canRoll = $derived(game.turn.phase === 'roll' && !match.rolling);
  const legal = $derived(game.turn.phase === 'move' ? game.turn.legal : []);

  /** Valor mostrado no dado: o último rolado neste turno (do log). */
  const diceValue = $derived.by(() => {
    if (match.rolling) return null;
    if (game.turn.phase === 'move') return game.turn.dice;
    // último roll do jogador da vez neste turno
    for (let i = game.log.length - 1; i >= 0; i--) {
      const e = game.log[i];
      if (e.type === 'turn') break;
      if (e.type === 'roll' && e.color === turn) return e.value;
    }
    return null;
  });

  /** Posição do dado dentro da base da cor da vez, em células. */
  const dicePos = $derived.by(() => {
    const o = BASE_ORIGIN[turn];
    return { x: o.col + 3, y: o.row + 3 };
  });
</script>

<div class="screen">
  <header>
    <div class="who" style="--c:{COLOR_HEX[turn]}; --on:{COLOR_ON[turn]}">
      <span class="dot"></span>
      <span class="name">{me?.avatar} {me?.name}</span>
    </div>
    <button class="menu-btn" aria-label="Menu" onclick={() => (menuOpen = true)}>⋮</button>
  </header>

  <div class="board-wrap">
    <Board state={game} {legal} onPiece={(i) => match.move(i)}>
      {#snippet overlay(cell)}
        {#if game.turn.phase !== 'over'}
          <div
            class="dice-pos"
            style="left:{dicePos.x * cell}px; top:{dicePos.y * cell}px; --size:{Math.max(44, cell * 1.9)}px"
          >
            <Dice color={turn} value={diceValue} enabled={canRoll} size={Math.max(44, cell * 1.9)} rolling={match.rolling} onRoll={() => match.roll()} />
          </div>
        {/if}
      {/snippet}
    </Board>
  </div>

  <div class="status" style="--c:{COLOR_HEX[turn]}">
    {#if match.toasts.length}
      {#each match.toasts as t (t.id)}
        <div class="toast" style="--c:{t.color ? COLOR_HEX[t.color] : 'var(--ink)'}">{t.text}</div>
      {/each}
    {:else}
      <div class="hint">{match.status}</div>
    {/if}
  </div>

  {#if menuOpen}
    <GameMenu onClose={() => (menuOpen = false)} {onExit} />
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
  .who {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px 6px 8px;
    border-radius: 999px;
    background: var(--c);
    color: var(--on);
    font-weight: 800;
    font-size: 16px;
    box-shadow: 0 4px 14px -6px rgba(0, 0, 0, 0.4);
    transition: background 0.25s;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    opacity: 0.9;
    animation: pulse 1.4s ease-in-out infinite;
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
  .dice-pos {
    position: absolute;
    transform: translate(-50%, -50%);
    width: var(--size);
    height: var(--size);
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
</style>
