<script lang="ts">
  import { players, type Player } from '../stores/players.svelte';
  import { history } from '../stores/history.svelte';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';
  import Sheet from './Sheet.svelte';
  import PlayerEditor from './PlayerEditor.svelte';

  interface Props {
    title?: string;
    /** Ids que já estão em outra cor (aparecem desabilitados). */
    excludeIds?: string[];
    /** Id selecionado atualmente nesta cor (destacado). */
    selectedId?: string | null;
    /** Cor do slot, só pra pintar o destaque. */
    accent?: string;
    onPick: (p: Player) => void;
    /** Presente = mostra "Deixar vazio". */
    onClear?: () => void;
    onClose: () => void;
  }
  let { title = 'Quem joga?', excludeIds = [], selectedId = null, accent, onPick, onClear, onClose }: Props = $props();

  let query = $state('');
  let creating = $state(false);

  const norm = (s: string) =>
    s
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  /** Ordena por último jogo (mais recente primeiro), depois nome. */
  const sorted = $derived.by(() => {
    const last = new Map<string, number>();
    for (const g of history.list) for (const p of g.players) if (!last.has(p.playerId)) last.set(p.playerId, g.updatedAt);
    return [...players.list].sort(
      (a, b) => (last.get(b.id) ?? 0) - (last.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
    );
  });

  const filtered = $derived.by(() => {
    const q = norm(query.trim());
    if (!q) return sorted;
    return sorted.filter((p) => norm(p.name).includes(q));
  });

  const canCreateFromQuery = $derived(!!query.trim() && !players.nameTaken(query));

  function pick(p: Player) {
    if (excludeIds.includes(p.id) && p.id !== selectedId) return;
    sound.play('tap');
    onPick(p);
  }
</script>

{#if creating}
  <PlayerEditor
    initialName={query.trim()}
    onClose={() => (creating = false)}
    onSaved={(p) => {
      creating = false;
      onPick(p);
    }}
  />
{:else}
  <Sheet {title} {onClose}>
    <div class="picker" style="--accent:{accent ?? 'var(--ink)'}">
      {#if players.list.length > 5}
        <input class="search" bind:value={query} placeholder="Buscar ou criar…" autocomplete="off" aria-label="Buscar jogador" />
      {/if}

      <div class="list">
        {#if players.list.length === 0}
          <p class="muted empty">Ninguém cadastrado ainda. Crie o primeiro jogador — leva 5 segundos e fica salvo pras próximas partidas.</p>
        {:else if filtered.length === 0}
          <p class="muted empty">Ninguém com esse nome.</p>
        {/if}
        {#each filtered as p (p.id)}
          {@const busy = excludeIds.includes(p.id) && p.id !== selectedId}
          <button class="row" class:on={p.id === selectedId} class:busy disabled={busy} onclick={() => pick(p)}>
            <Avatar avatar={p.avatar} size={44} />
            <span class="nm">{p.name}</span>
            {#if p.id === selectedId}
              <span class="tag on">✓</span>
            {:else if busy}
              <span class="tag muted">em outra cor</span>
            {/if}
          </button>
        {/each}

        <button
          class="row create"
          onclick={() => {
            sound.play('tap');
            creating = true;
          }}
        >
          <span class="plus">+</span>
          <span class="nm">{canCreateFromQuery ? `Criar "${query.trim()}"` : 'Novo jogador'}</span>
        </button>
      </div>

      {#if onClear}
        <button class="btn ghost block" onclick={onClear}>Deixar essa cor vazia</button>
      {/if}
    </div>
  </Sheet>
{/if}

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .search {
    font: inherit;
    font-size: 17px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    width: 100%;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .empty {
    text-align: center;
    margin: 6px 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    min-height: 60px;
    border-radius: 14px;
    background: var(--bg);
    text-align: left;
    font-weight: 700;
    font-size: 17px;
    transition: transform 0.08s;
  }
  .row:active {
    transform: scale(0.99);
  }
  .row.on {
    box-shadow: inset 0 0 0 2.5px var(--accent);
    background: #fff;
  }
  .row.busy {
    opacity: 0.45;
  }
  .nm {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    font-size: 13px;
    font-weight: 700;
  }
  .tag.on {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    display: grid;
    place-items: center;
  }
  .create {
    background: transparent;
    border: 2px dashed var(--line);
    color: var(--ink);
  }
  .plus {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--ink);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 26px;
    font-weight: 400;
    flex: none;
  }
</style>
