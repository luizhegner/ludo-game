<script lang="ts">
  import { EMOJI_AVATARS, fileToAvatar, isPhoto, randomAvatar } from '../lib/avatars';
  import { NAME_MAX, cleanName, players, type Player } from '../stores/players.svelte';
  import { sound } from '../lib/sound';
  import Avatar from './Avatar.svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    /** Jogador existente (editar) ou undefined (criar). */
    player?: Player;
    /** Nome sugerido ao criar (ex.: o que foi digitado na busca). */
    initialName?: string;
    onClose: () => void;
    onSaved: (p: Player) => void;
    onDeleted?: (p: Player) => void;
  }
  let { player, initialName = '', onClose, onSaved, onDeleted }: Props = $props();

  // o formulário captura os valores na abertura (editar não acompanha mudanças externas)
  // svelte-ignore state_referenced_locally
  let name = $state(player?.name ?? initialName);
  // svelte-ignore state_referenced_locally
  let avatar = $state(player?.avatar ?? randomAvatar(players.list.map((p) => p.avatar)));
  let error = $state('');
  let busyPhoto = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let nameInput: HTMLInputElement | undefined = $state();

  const clean = $derived(cleanName(name));
  const taken = $derived(!!clean && players.nameTaken(clean, player?.id));
  const canSave = $derived(!!clean && !taken && !busyPhoto);

  $effect(() => {
    // foco no nome ao criar (teclado sobe direto)
    if (!player && nameInput) setTimeout(() => nameInput?.focus(), 250);
  });

  function save() {
    if (!canSave) return;
    sound.play('tap');
    try {
      const saved = player ? players.update(player.id, { name: clean, avatar }) : players.create(clean, avatar);
      if (saved) onSaved(saved);
    } catch (e) {
      error = e instanceof Error ? e.message : 'não deu pra salvar';
    }
  }

  function del() {
    if (!player) return;
    if (!confirm(`Excluir ${player.name}? O histórico das partidas dele continua guardado.`)) return;
    players.remove(player.id);
    onDeleted?.(player);
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busyPhoto = true;
    error = '';
    try {
      avatar = await fileToAvatar(file);
    } catch {
      error = 'Não deu pra ler essa imagem. Tenta outra?';
    } finally {
      busyPhoto = false;
    }
  }
</script>

<Sheet title={player ? 'Editar jogador' : 'Novo jogador'} {onClose}>
  <form
    class="form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <div class="top">
      <div class="preview">
        <Avatar {avatar} size={84} />
        {#if busyPhoto}<span class="spin" aria-label="Processando foto"></span>{/if}
      </div>
      <div class="photo-actions">
        <button type="button" class="btn" onclick={() => fileInput?.click()} disabled={busyPhoto}>📷 Foto</button>
        {#if isPhoto(avatar)}
          <button type="button" class="btn ghost" onclick={() => (avatar = randomAvatar())}>Usar emoji</button>
        {/if}
        <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
      </div>
    </div>

    <label class="field">
      <span class="lbl">Nome</span>
      <input
        bind:this={nameInput}
        bind:value={name}
        maxlength={NAME_MAX}
        placeholder="ex.: Maria"
        autocomplete="off"
        autocapitalize="words"
        enterkeyhint="done"
        aria-invalid={taken}
      />
      {#if taken}
        <span class="err">Já existe um jogador com esse nome.</span>
      {:else}
        <span class="muted small">{clean.length}/{NAME_MAX}</span>
      {/if}
    </label>

    <div class="lbl">Emoji</div>
    <div class="emojis" role="listbox" aria-label="Escolher emoji">
      {#each EMOJI_AVATARS as e (e)}
        <button
          type="button"
          class="emo"
          class:on={avatar === e}
          role="option"
          aria-selected={avatar === e}
          onclick={() => {
            avatar = e;
          }}>{e}</button
        >
      {/each}
    </div>

    {#if error}<p class="err">{error}</p>{/if}

    <div class="actions">
      <button type="submit" class="btn primary big block" disabled={!canSave}>{player ? 'Salvar' : 'Criar jogador'}</button>
      {#if player && onDeleted}
        <button type="button" class="btn ghost block danger" onclick={del}>Excluir jogador</button>
      {/if}
    </div>
  </form>
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .preview {
    position: relative;
  }
  .spin {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top-color: var(--ink);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .photo-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lbl {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  input:not([type]) {
    font: inherit;
    font-size: 18px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    width: 100%;
  }
  input[aria-invalid='true'] {
    border-color: var(--red);
  }
  .small {
    font-size: 12px;
    align-self: flex-end;
  }
  .err {
    color: var(--red);
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }
  .emojis {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
  }
  .emo {
    aspect-ratio: 1;
    border-radius: 12px;
    font-size: 24px;
    background: var(--bg);
    display: grid;
    place-items: center;
    transition: transform 0.1s, box-shadow 0.15s;
  }
  .emo.on {
    box-shadow: 0 0 0 3px var(--ink);
    transform: scale(1.06);
    background: #fff;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }
  .danger {
    color: var(--red);
  }
  .btn:disabled {
    opacity: 0.5;
  }
</style>
