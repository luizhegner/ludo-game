<script lang="ts">
  import { match } from '../stores/match.svelte';
  import { players as roster, type Player } from '../stores/players.svelte';
  import { COLOR_HEX, COLOR_NAME } from '../lib/colors';
  import { modeName } from '../lib/modes';
  import { POWER_ICON, POWER_ORDER, powerBg, powerBorder, powerBlurb, powerName } from '../lib/powers';
  import { enabledPowers, hasPowers } from '../engine/powers';
  import { COLORS, type Color } from '../engine/types';
  import { playerOf } from '../engine/game';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';
  import PlayerPicker from './PlayerPicker.svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    onClose: () => void;
    onExit: () => void;
  }
  let { onClose, onExit }: Props = $props();

  type View = 'main' | 'players' | 'rules' | 'end';
  let view: View = $state('main');

  /** Seletor aberto pra adicionar (`add`) ou substituir (`sub`) nesta cor. */
  let picking: { color: Color; kind: 'add' | 'sub' } | null = $state(null);

  const game = $derived(match.state!);
  const powersOn = $derived(hasPowers(game.rules) ? new Set(enabledPowers(game.rules)) : null);

  /** Ids já em jogo (não podem entrar de novo em outra cor). */
  const inGame = $derived(game.players.filter((p) => p.status !== 'removed').map((p) => p.playerId));

  const titles: Record<View, string> = {
    main: 'Menu',
    players: 'Jogadores',
    rules: 'Regras da partida',
    end: 'Encerrar partida',
  };

  function go(v: View) {
    sound.play('tap');
    view = v;
  }

  function picked(p: Player) {
    if (!picking) return;
    const { color, kind } = picking;
    picking = null;
    if (kind === 'add') match.addPlayer({ color, playerId: p.id, name: p.name, avatar: p.avatar });
    else match.substitutePlayer(color, { playerId: p.id, name: p.name, avatar: p.avatar });
  }

  function remove(color: Color, name: string) {
    if (!confirm(`Remover ${name}? As peças somem e ele fica em último lugar nesta partida.`)) return;
    match.removePlayer(color);
  }
</script>

{#if picking}
  <PlayerPicker
    title={picking.kind === 'add' ? `Quem entra com ${COLOR_NAME[picking.color]}?` : `Quem assume ${COLOR_NAME[picking.color]}?`}
    accent={COLOR_HEX[picking.color]}
    excludeIds={inGame}
    onPick={picked}
    onClose={() => (picking = null)}
  />
{:else}
  <Sheet {onClose} title={titles[view]} onBack={view === 'main' ? undefined : () => go('main')}>
    {#if view === 'main'}
      <div class="list">
        <button class="row" onclick={() => go('players')}>👥 Jogadores</button>
        <button class="row" onclick={() => go('rules')}>📜 Regras</button>
        <button class="row" onclick={() => go('end')}>🏁 Encerrar partida</button>
        <button class="row" onclick={() => { sound.play('tap'); onExit(); }}>💾 Sair e salvar</button>
      </div>
    {:else if view === 'players'}
      <div class="list">
        {#each COLORS as c (c)}
          {@const p = playerOf(game, c)}
          {@const present = !!p && p.status !== 'removed'}
          {@const done = game.finished.includes(c)}
          <div class="prow" style="--c:{COLOR_HEX[c]}">
            <span class="swatch"></span>
            {#if present}
              <Avatar avatar={roster.avatarOf(p.playerId, p.avatar)} size={38} />
            {/if}
            <div class="pinfo">
              <div class="pname">{present ? roster.nameOf(p.playerId, p.name) : COLOR_NAME[c]}</div>
              <div class="psub muted">
                {#if !present}livre{:else if p.status === 'paused'}pausado{:else if done}terminou{:else}jogando{/if}
              </div>
            </div>
            <div class="actions">
              {#if !present}
                <button class="chip" onclick={() => { sound.play('tap'); picking = { color: c, kind: 'add' }; }}>+ Adicionar</button>
              {:else if done}
                <!-- terminou: nada a fazer -->
              {:else}
                {#if p.status === 'paused'}
                  <button class="chip" onclick={() => match.resumePlayer(c)}>▶ Voltar</button>
                {:else}
                  <button class="chip" onclick={() => match.pausePlayer(c)} aria-label="Pausar">⏸</button>
                {/if}
                <button class="chip" onclick={() => { sound.play('tap'); picking = { color: c, kind: 'sub' }; }} aria-label="Substituir">🔁</button>
                <button class="chip danger" onclick={() => remove(c, roster.nameOf(p.playerId, p.name))} aria-label="Remover">✕</button>
              {/if}
            </div>
          </div>
        {/each}
        <p class="muted legend">⏸ pausar (pula a vez) · 🔁 substituir (quem sai fica em último) · ✕ remover</p>
      </div>
    {:else if view === 'rules'}
      <div class="rules">
        <div><b>Modo:</b> {modeName(game.rules.mode)}</div>
        <div><b>Sair da base:</b> só com 6</div>
        <div><b>6:</b> joga de novo · três 6 seguidos: última peça movida volta pra base e perde a vez</div>
        <div><b>Casas seguras:</b> saída de cada cor + as 4 estrelas</div>
        <div><b>Comer:</b> cair em adversário fora de casa segura manda ele pra base{game.rules.captureBonus ? ' e você joga de novo' : ''}</div>
        <div><b>Centro:</b> número exato · quem coloca uma peça no centro joga de novo</div>
        {#if game.rules.mode === 'quick'}
          <div><b>Fim:</b> vence quem colocar o primeiro peão no centro</div>
        {:else}
          <div><b>Fim:</b> a partida continua até sobrar um</div>
        {/if}
        {#if powersOn}
          <div class="ptitle"><b>Casas de poder</b></div>
          <div class="muted small">
            10 no anel ({game.rules.visibleMines ? '8 poderes + 2 minas, tudo visível' : '8 visíveis + 2 minas escondidas'}), nunca em casa segura. O poder é consumido ao pisar; quando sobram 4, aparecem 10 novas.
            Casa de poder não é segura. Se um poder levar a peça a outra casa de poder, ativa de novo. Segure o dedo numa casa pra ver o que ela faz.
          </div>
          <div class="plist">
            {#each POWER_ORDER as p (p)}
              {@const on = powersOn.has(p)}
              <div class="prow" class:off={!on} style="--bg:{powerBg(p)}; --bd:{powerBorder(p)}">
                <span class="picon">{POWER_ICON[p]}</span>
                <div class="ptxt">
                  <b>{powerName(p)}{on ? '' : ' — desligado'}</b>
                  <div class="muted small">{powerBlurb(p)}</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="list">
        <p class="muted">Como encerrar?</p>
        <button class="btn block" onclick={() => { match.endGame(true); onClose(); }}>Encerrar e ranquear por progresso</button>
        <button class="btn block ghost" onclick={() => { match.endGame(false); onClose(); }}>Encerrar sem contar</button>
      </div>
    {/if}
  </Sheet>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    text-align: left;
    padding: 16px;
    border-radius: 14px;
    background: var(--bg);
    font-weight: 700;
    font-size: 17px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--bg);
  }
  .swatch {
    width: 8px;
    height: 36px;
    border-radius: 4px;
    background: var(--c);
    flex: none;
  }
  .pinfo {
    flex: 1;
    min-width: 0;
  }
  .pname {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .psub {
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .chip {
    padding: 0 12px;
    border-radius: 999px;
    background: var(--panel);
    font-weight: 700;
    font-size: 14px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), 0 3px 10px -6px rgba(0, 0, 0, 0.3);
    min-height: 40px;
    min-width: 40px;
  }
  .chip.danger {
    color: var(--red);
  }
  .legend {
    font-size: 12px;
    margin: 0;
    text-align: center;
  }
  .rules {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 15px;
    line-height: 1.4;
  }
  .ptitle {
    margin-top: 10px;
  }
  .plist {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--bg);
    border: 2px solid var(--bd);
  }
  .prow.off {
    filter: grayscale(1);
    opacity: 0.55;
  }
  .prow .picon {
    font-size: 22px;
    width: 30px;
    text-align: center;
    flex: none;
  }
  .prow .ptxt {
    min-width: 0;
  }
</style>
