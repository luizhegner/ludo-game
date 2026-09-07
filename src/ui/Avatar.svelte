<script lang="ts">
  import { isPhoto } from '../lib/avatars';

  interface Props {
    /** Emoji ou data URL de foto. */
    avatar: string;
    /** Diâmetro em px. */
    size?: number;
    /** Cor do anel ao redor (ex.: cor do jogador). */
    ring?: string;
  }
  let { avatar, size = 40, ring }: Props = $props();
  const photo = $derived(isPhoto(avatar));
</script>

<span class="avatar" class:ringed={!!ring} style="--s:{size}px; --ring:{ring ?? 'transparent'}" aria-hidden="true">
  {#if photo}
    <img src={avatar} alt="" draggable="false" />
  {:else}
    <span class="emoji">{avatar}</span>
  {/if}
</span>

<style>
  .avatar {
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    overflow: hidden;
    flex: none;
    vertical-align: middle;
  }
  .avatar.ringed {
    box-shadow: 0 0 0 calc(var(--s) * 0.07) var(--ring), 0 1px 3px rgba(0, 0, 0, 0.18);
  }
  .emoji {
    font-size: calc(var(--s) * 0.58);
    line-height: 1;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
