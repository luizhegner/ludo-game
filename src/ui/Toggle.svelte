<script lang="ts">
  interface Props {
    label: string;
    hint?: string;
    checked: boolean;
    disabled?: boolean;
    /** Chamado com o novo valor (além do bind). */
    onchange?: (checked: boolean) => void;
  }
  let { label, hint, checked = $bindable(), disabled = false, onchange }: Props = $props();
</script>

<label class="toggle" class:disabled>
  <div class="txt">
    <div class="tl">{label}</div>
    {#if hint}<div class="muted small">{hint}</div>{/if}
  </div>
  <input type="checkbox" bind:checked {disabled} onchange={(e) => onchange?.((e.currentTarget as HTMLInputElement).checked)} />
  <span class="sw"></span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    position: relative;
    min-height: var(--tap);
    cursor: pointer;
  }
  .toggle.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .txt {
    flex: 1;
    min-width: 0;
  }
  .tl {
    font-weight: 700;
  }
  .small {
    font-size: 13px;
    margin-top: 2px;
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .sw {
    width: 50px;
    height: 30px;
    border-radius: 999px;
    background: var(--line);
    position: relative;
    transition: background 0.2s;
    flex: none;
  }
  .sw::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s;
  }
  input:checked + .sw {
    background: var(--green);
  }
  input:checked + .sw::after {
    transform: translateX(20px);
  }
  input:focus-visible + .sw {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>
