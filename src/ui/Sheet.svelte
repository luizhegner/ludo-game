<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    onClose: () => void;
    onBack?: () => void;
    children: Snippet;
  }
  let { title, onClose, onBack, children }: Props = $props();
</script>

<!-- Painel que sobe de baixo, padrão de celular -->
<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />
<div class="backdrop" role="presentation" onclick={onClose}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="grab"></div>
    <header>
      {#if onBack}
        <button class="icon" aria-label="Voltar" onclick={onBack}>‹</button>
      {:else}
        <span class="icon"></span>
      {/if}
      <h2>{title}</h2>
      <button class="icon" aria-label="Fechar" onclick={onClose}>✕</button>
    </header>
    <div class="content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(31, 36, 48, 0.45);
    display: flex;
    align-items: flex-end;
    z-index: 50;
    animation: fade 0.18s ease-out;
  }
  .sheet {
    width: 100%;
    max-height: 86dvh;
    background: var(--panel);
    border-radius: 22px 22px 0 0;
    padding: 6px 16px calc(var(--safe-bottom) + 18px);
    display: flex;
    flex-direction: column;
    animation: up 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .grab {
    width: 42px;
    height: 5px;
    border-radius: 3px;
    background: var(--line);
    margin: 4px auto 6px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }
  .icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 22px;
    font-weight: 700;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .content {
    overflow-y: auto;
    padding-bottom: 6px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes up {
    from {
      transform: translateY(40px);
      opacity: 0.6;
    }
  }
</style>
