<script lang="ts">
  import { COLORS, type Color, type Mode } from '../engine/types';
  import { COLOR_HEX, COLOR_NAME, COLOR_ON } from '../lib/colors';
  import { MODES, MODE_BY_ID } from '../lib/modes';
  import { sound } from '../lib/sound';
  import { match } from '../stores/match.svelte';
  import { players, type Player } from '../stores/players.svelte';
  import { loadSetup } from '../stores/setup.svelte';
  import Avatar from './Avatar.svelte';
  import PlayerPicker from './PlayerPicker.svelte';
  import Toggle from './Toggle.svelte';

  interface Props {
    onStart: () => void;
    onBack: () => void;
  }
  let { onStart, onBack }: Props = $props();

  // --- estado do assistente (pré-preenchido com a última partida) ---
  const last = loadSetup();
  let step = $state<1 | 2 | 3>(1);
  let mode = $state<Mode>(MODE_BY_ID[last.mode]?.available ? last.mode : 'classic');
  let slots = $state<Record<Color, string | null>>({ ...last.slots });
  let captureBonus = $state(last.captureBonus);
  let picking: Color | null = $state(null);

  // jogador apagado do cadastro some do slot
  $effect(() => {
    for (const c of COLORS) if (slots[c] && !players.get(slots[c])) slots[c] = null;
  });

  const info = $derived(MODE_BY_ID[mode]);
  const chosen = $derived(COLORS.filter((c) => !!slots[c]));
  const count = $derived(chosen.length);
  const usedIds = $derived(chosen.map((c) => slots[c]!) as string[]);
  const enough = $derived(count >= info.minPlayers && count <= info.maxPlayers);
  const needText = $derived(
    info.minPlayers === info.maxPlayers ? `Precisa de exatamente ${info.minPlayers} jogadores` : `Escolha pelo menos ${info.minPlayers} cores`,
  );

  /** Duplas do 2v2: verde+azul × vermelho+amarelo. */
  const teamOf: Record<Color, 'A' | 'B'> = { green: 'A', blue: 'A', red: 'B', yellow: 'B' };

  /** Grade 2×2 na mesma disposição do tabuleiro: verde ↖ vermelho ↗ amarelo ↙ azul ↘. */
  const GRID: Color[] = ['green', 'red', 'yellow', 'blue'];

  const stepTitle = ['', 'Modo', 'Jogadores', 'Regras'];

  function pickMode(m: Mode) {
    if (!MODE_BY_ID[m].available) return;
    sound.play('tap');
    mode = m;
    next();
  }

  function next() {
    sound.play('tap');
    if (step === 1) step = 2;
    else if (step === 2 && enough) step = 3;
  }
  function prev() {
    sound.play('tap');
    if (step === 1) onBack();
    else step = (step - 1) as 1 | 2;
  }

  function assign(c: Color, p: Player) {
    // se já estava em outra cor, tira de lá
    for (const k of COLORS) if (slots[k] === p.id) slots[k] = null;
    slots[c] = p.id;
    picking = null;
  }

  function start() {
    if (!enough) return;
    if (match.active && !confirm('Tem uma partida em andamento. Começar outra apaga ela. Continuar?')) return;
    sound.play('tap');
    match.start({
      rules: { mode, captureBonus },
      players: chosen.map((c) => {
        const p = players.get(slots[c])!;
        return { color: c, playerId: p.id, name: p.name, avatar: p.avatar };
      }),
    });
    onStart();
  }
</script>

<div class="page">
  <header>
    <button class="icon" aria-label="Voltar" onclick={prev}>‹</button>
    <div class="title">
      <h1>Nova partida</h1>
      <div class="steps" aria-label="Passo {step} de 3">
        {#each [1, 2, 3] as n}
          <span class="dot" class:on={n === step} class:done={n < step}></span>
        {/each}
        <span class="stepname">{stepTitle[step]}</span>
      </div>
    </div>
    <span class="icon"></span>
  </header>

  {#if step === 1}
    <!-- ---------------- passo 1: modo ---------------- -->
    <div class="modes">
      {#each MODES as m (m.id)}
        <button class="mode card" class:on={m.id === mode} class:soon={!m.available} disabled={!m.available} onclick={() => pickMode(m.id)}>
          <div class="mrow">
            <span class="mname">{m.name}</span>
            {#if !m.available}
              <span class="badge">em breve</span>
            {:else if m.id === mode}
              <span class="check">✓</span>
            {/if}
          </div>
          <div class="mblurb muted">{m.blurb}</div>
          <div class="mmeta muted">
            {m.minPlayers === m.maxPlayers ? `${m.minPlayers} jogadores` : `${m.minPlayers}–${m.maxPlayers} jogadores`}
            {#if m.teams}· duplas{/if}
            {#if m.timed}· cronômetro{/if}
          </div>
        </button>
      {/each}
    </div>
  {:else if step === 2}
    <!-- ---------------- passo 2: cores × jogadores ---------------- -->
    <p class="muted hint">{info.name} · toque numa cor pra escolher quem joga com ela</p>
    <div class="grid" class:teams={info.teams}>
      {#each GRID as c (c)}
        {@const id = slots[c]}
        {@const p = players.get(id)}
        <button class="slot" class:on={!!p} style="--c:{COLOR_HEX[c]}; --on:{COLOR_ON[c]}" onclick={() => { sound.play('tap'); picking = c; }}>
          <div class="shead">
            <span class="cname">{COLOR_NAME[c]}</span>
            {#if info.teams}<span class="team">Dupla {teamOf[c]}</span>{/if}
          </div>
          <div class="sbody">
            {#if p}
              <Avatar avatar={p.avatar} size={52} />
              <span class="pname">{p.name}</span>
            {:else}
              <span class="plus">+</span>
              <span class="pname empty">vazio</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
    {#if info.teams}
      <p class="muted hint small">Verde + Azul contra Vermelho + Amarelo</p>
    {/if}
    <div class="spacer"></div>
    <button class="btn primary big block" disabled={!enough} onclick={next}>
      {enough ? `Continuar com ${count} jogadores` : needText}
    </button>
  {:else}
    <!-- ---------------- passo 3: regras ---------------- -->
    <div class="summary card">
      <div class="srow"><span class="muted">Modo</span><b>{info.name}</b></div>
      <div class="srow players">
        <span class="muted">Jogadores</span>
        <span class="avs">
          {#each chosen as c (c)}
            {@const p = players.get(slots[c])!}
            <Avatar avatar={p.avatar} size={30} ring={COLOR_HEX[c]} />
          {/each}
        </span>
      </div>
    </div>

    <div class="card rules">
      <Toggle label="Jogada extra ao comer" hint="Quem come uma peça rola o dado de novo" bind:checked={captureBonus} />
    </div>

    <ul class="fixed muted">
      <li>Sai da base só com 6 · 6 joga de novo · três 6 seguidos: última peça movida volta pra base e perde a vez</li>
      <li>Casas seguras: saída de cada cor e as 4 estrelas</li>
      <li>Centro só com número exato</li>
      {#if mode === 'quick'}
        <li>Vence quem colocar o <b>primeiro peão</b> no centro</li>
      {:else}
        <li>A partida continua até sobrar um</li>
      {/if}
      <li>Quem começa é sorteado</li>
    </ul>

    <div class="spacer"></div>
    <button class="btn primary big block" onclick={start}>Iniciar partida</button>
  {/if}
</div>

{#if picking}
  <PlayerPicker
    title="Quem joga com {COLOR_NAME[picking]}?"
    accent={COLOR_HEX[picking]}
    excludeIds={usedIds}
    selectedId={slots[picking]}
    onPick={(p) => assign(picking!, p)}
    onClear={() => {
      slots[picking!] = null;
      picking = null;
    }}
    onClose={() => (picking = null)}
  />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    padding: calc(var(--safe-top) + 8px) 16px calc(var(--safe-bottom) + 16px);
    gap: 12px;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: 20px;
  }
  .steps {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--line);
  }
  .dot.done {
    background: var(--muted);
  }
  .dot.on {
    background: var(--ink);
    transform: scale(1.2);
  }
  .stepname {
    margin-left: 4px;
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
  .hint {
    margin: 0;
    font-size: 14px;
    text-align: center;
  }
  .hint.small {
    font-size: 13px;
  }

  /* passo 1 */
  .modes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mode {
    text-align: left;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 2.5px solid transparent;
    transition: border-color 0.15s, transform 0.08s;
  }
  .mode:active {
    transform: scale(0.99);
  }
  .mode.on {
    border-color: var(--ink);
  }
  .mode.soon {
    opacity: 0.55;
  }
  .mrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .mname {
    font-weight: 800;
    font-size: 18px;
  }
  .badge {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--bg);
    color: var(--muted);
  }
  .check {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--ink);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 900;
    font-size: 14px;
  }
  .mblurb {
    font-size: 14px;
    line-height: 1.35;
  }
  .mmeta {
    font-size: 12px;
    font-weight: 700;
  }

  /* passo 2 */
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .slot {
    border-radius: 18px;
    background: var(--c);
    color: var(--on);
    overflow: hidden;
    opacity: 0.6;
    transition: opacity 0.2s, transform 0.1s;
    box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    text-align: left;
    min-height: 140px;
  }
  .slot:active {
    transform: scale(0.98);
  }
  .slot.on {
    opacity: 1;
  }
  .shead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 0;
    font-weight: 800;
    font-size: 16px;
  }
  .team {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.85);
    color: var(--ink);
  }
  .sbody {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px 14px;
  }
  .plus {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
    color: var(--ink);
    display: grid;
    place-items: center;
    font-size: 30px;
    font-weight: 400;
  }
  .pname {
    font-weight: 800;
    font-size: 16px;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
  .pname.empty {
    font-weight: 600;
    opacity: 0.85;
  }

  /* passo 3 */
  .summary {
    padding: 6px 16px;
  }
  .srow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 48px;
    gap: 12px;
  }
  .srow + .srow {
    border-top: 1px solid var(--line);
  }
  .avs {
    display: inline-flex;
    gap: 8px;
  }
  .rules {
    padding: 2px 0;
  }
  .fixed {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 13px;
    line-height: 1.5;
  }
  .fixed b {
    color: var(--ink);
  }

  .spacer {
    flex: 1;
  }
  .btn:disabled {
    opacity: 0.5;
  }
</style>
