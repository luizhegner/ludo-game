<script lang="ts">
  /**
   * Ícone com arte opcional: se houver arquivo em `src/assets/art/…`, mostra a
   * imagem numa caixa quadrada (`object-fit: contain` — nunca estica nem
   * distorce, sobra fica transparente); senão, o emoji/texto padrão.
   */
  interface Props {
    /** URL vinda de `powerIconUrl()` / `uiIconUrl()` (null = usa o fallback). */
    src: string | null;
    /** Emoji/texto padrão. */
    fallback: string;
    /** Lado da caixa, em px. */
    size?: number;
    /** Descrição pra leitores de tela (vazio = decorativo). */
    label?: string;
    class?: string;
  }
  let { src, fallback, size = 24, label = '', class: cls = '' }: Props = $props();
</script>

{#if src}
  <img class="icon {cls}" {src} alt={label} width={size} height={size} draggable="false" style="--s:{size}px" />
{:else}
  <span class="icon emoji {cls}" style="--s:{size}px" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>{fallback}</span>
{/if}

<style>
  .icon {
    display: inline-block;
    width: var(--s);
    height: var(--s);
    flex: none;
    vertical-align: middle;
  }
  img.icon {
    object-fit: contain;
    object-position: center;
    user-select: none;
    -webkit-user-drag: none;
  }
  .emoji {
    display: inline-grid;
    place-items: center;
    /* o emoji ocupa ~80% da caixa, como um ícone com margem de respiro */
    font-size: calc(var(--s) * 0.78);
    line-height: 1;
    text-align: center;
  }
</style>
