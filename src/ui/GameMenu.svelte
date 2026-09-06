<script lang="ts">
  import { match } from '../stores/match.svelte';
  import { COLOR_HEX, COLOR_NAME } from '../lib/colors';
  import { COLORS } from '../engine/types';
  import { playerOf } from '../engine/game';
  import Sheet from './Sheet.svelte';

  interface Props {
    onClose: () => void;
    onExit: () => void;
  }
  let { onClose, onExit }: Props = $props();

  type View = 'main' | 'players' | 'rules' | 'end';
  let view: View = $state('main');

  const game = $derived(match.state!);
  const modeName: Record<string, string> = {
    classic: 'Clássico',
    powers: 'Poderes',
    team: '2v2',
    teamPowers: '2v2 Poderes',
    quick: 'Rápido',
    fiveMin: '5 Minutos',
    deathmatch: 'Deathmatch',
  };

  let newName = $state('');

  function add(color: (typeof COLORS)[number]) {
    const name = newName.trim() || COLOR_NAME[color];
    match.addPlayer({ color, playerId: `${Date.now()}`, name, avatar: '🙂' });
    newName = '';
  }
</script>

<Sheet {onClose} title={view === 'main' ? 'Menu' : view === 'players' ? 'Jogadores' : view === 'rules' ? 'Regras da partida' : 'Encerrar partida'} onBack={view === 'main' ? undefined : () => (view = 'main')}>
  {#if view === 'main'}
    <div class="list">
      <button class="row" onclick={() => (view = 'players')}>👥 Jogadores</button>
      <button class="row" onclick={() => (view = 'rules')}>📜 Regras</button>
      <button class="row" onclick={() => (view = 'end')}>🏁 Encerrar partida</button>
      <button class="row" onclick={onExit}>💾 Sair e salvar</button>
    </div>
  {:else if view === 'players'}
    <div class="list">
      {#each COLORS as c}
        {@const p = playerOf(game, c)}
        <div class="prow" style="--c:{COLOR_HEX[c]}">
          <span class="swatch"></span>
          <div class="pinfo">
            <div class="pname">{p && p.status !== 'removed' ? `${p.avatar} ${p.name}` : COLOR_NAME[c]}</div>
            <div class="psub muted">
              {#if !p || p.status === 'removed'}livre{:else if p.status === 'paused'}pausado{:else if game.finished.includes(c)}terminou{:else}jogando{/if}
            </div>
          </div>
          <div class="actions">
            {#if !p || p.status === 'removed'}
              <button class="chip" onclick={() => add(c)}>+ Adicionar</button>
            {:else if game.finished.includes(c)}
              <!-- nada -->
            {:else}
              {#if p.status === 'paused'}
                <button class="chip" onclick={() => match.resumePlayer(c)}>▶ Voltar</button>
              {:else}
                <button class="chip" onclick={() => match.pausePlayer(c)}>⏸ Pausar</button>
              {/if}
              <button class="chip danger" onclick={() => confirm(`Remover ${p.name}? Ele fica em último lugar nesta partida.`) && match.removePlayer(c)}>✕</button>
            {/if}
          </div>
        </div>
      {/each}
      <label class="field">
        <span class="muted">Nome pra quem entrar</span>
        <input bind:value={newName} placeholder="ex.: Maria" maxlength="16" />
      </label>
    </div>
  {:else if view === 'rules'}
    <div class="rules">
      <div><b>Modo:</b> {modeName[game.rules.mode]}</div>
      <div><b>Sair da base:</b> só com 6</div>
      <div><b>6:</b> joga de novo · três 6 seguidos: última peça movida volta pra base e perde a vez</div>
      <div><b>Casas seguras:</b> saída de cada cor + as 4 estrelas</div>
      <div><b>Comer:</b> cair em adversário fora de casa segura manda ele pra base{game.rules.captureBonus ? ' e você joga de novo' : ''}</div>
      <div><b>Centro:</b> número exato</div>
      <div><b>Fim:</b> a partida continua até sobrar um</div>
    </div>
  {:else}
    <div class="list">
      <p class="muted">Como encerrar?</p>
      <button class="btn block" onclick={() => { match.endGame(true); onClose(); }}>Encerrar e ranquear por progresso</button>
      <button class="btn block ghost" onclick={() => { match.endGame(false); onClose(); }}>Encerrar sem contar</button>
    </div>
  {/if}
</Sheet>

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
    gap: 12px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--bg);
  }
  .swatch {
    width: 18px;
    height: 34px;
    border-radius: 6px;
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
    padding: 8px 12px;
    border-radius: 999px;
    background: var(--panel);
    font-weight: 700;
    font-size: 14px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), 0 3px 10px -6px rgba(0, 0, 0, 0.3);
    min-height: 40px;
  }
  .chip.danger {
    color: var(--red);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }
  input {
    font: inherit;
    font-size: 17px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid var(--line);
    background: var(--panel);
    color: var(--ink);
  }
  .rules {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 15px;
    line-height: 1.4;
  }
</style>
