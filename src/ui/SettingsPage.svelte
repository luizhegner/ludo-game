<script lang="ts">
  import { settings, saveSettings, applySettings, haptic, type HapticsLevel, type Theme } from '../stores/settings.svelte';
  import { players } from '../stores/players.svelte';
  import { history } from '../stores/history.svelte';
  import { match } from '../stores/match.svelte';
  import { clearSetup } from '../stores/setup.svelte';
  import { backupFileName, downloadText, makeBackup, parseBackup } from '../lib/backup';
  import { formatWhen, plural } from '../lib/format';
  import { sound } from '../lib/sound';
  import Toggle from './Toggle.svelte';

  const version = __APP_VERSION__;

  let fileInput: HTMLInputElement | undefined = $state();
  let msg = $state<{ text: string; ok: boolean } | null>(null);
  let msgTimer: ReturnType<typeof setTimeout> | undefined;

  function flash(text: string, ok = true) {
    msg = { text, ok };
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (msg = null), 4000);
  }

  // qualquer mudança nos toggles persiste na hora
  $effect(() => {
    void settings.sound;
    void settings.haptics;
    void settings.autoMove;
    void settings.diceMode;
    void settings.theme;
    saveSettings();
  });

  const HAPTICS: { id: HapticsLevel; name: string; hint: string }[] = [
    { id: 'off', name: 'Desligada', hint: 'Nenhuma vibração' },
    { id: 'soft', name: 'Suave', hint: 'Toques curtíssimos, tipo clique. Pensado pro celular apoiado na mesa: não zumbe nem chacoalha.' },
    { id: 'normal', name: 'Normal', hint: 'Pulsos um pouco mais longos e vibra também a cada casa andada. Melhor com o celular na mão.' },
  ];
  const THEMES: { id: Theme; name: string; hint: string }[] = [
    { id: 'cream', name: 'Creme', hint: 'Fundo liso e discreto. Gasta menos bateria.' },
    { id: 'aurora', name: 'Aurora', hint: 'Manchas de cor vibrantes e desfocadas, em movimento lento atrás do jogo.' },
    { id: 'og', name: 'OG', hint: 'O visual do jogo original: mesa escura com brilhos dourados, tabuleiro com moldura de madeira, bases chapadas e placar dentro do tabuleiro.' },
  ];

  function setHaptics(level: HapticsLevel) {
    sound.play('tap');
    settings.haptics = level;
    // amostra do nível escolhido
    setTimeout(() => haptic('capture'), 60);
  }
  function setTheme(t: Theme) {
    sound.play('tap');
    settings.theme = t;
  }

  async function exportBackup() {
    sound.play('tap');
    try {
      await history.flush();
      const b = makeBackup($state.snapshot(players.list), history.list, $state.snapshot(settings));
      downloadText(JSON.stringify(b), backupFileName());
      flash('Backup gerado. Guarde o arquivo num lugar seguro.');
    } catch {
      flash('Não deu pra gerar o backup.', false);
    }
  }

  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const b = parseBackup(await file.text());
      const when = b.exportedAt ? ` de ${formatWhen(b.exportedAt)}` : '';
      const ok = confirm(
        `Importar backup${when} com ${plural(b.players.length, 'jogador', 'jogadores')} e ${plural(b.history.length, 'partida', 'partidas')}?\n\nIsso SUBSTITUI os jogadores e o histórico atuais.`,
      );
      if (!ok) return;
      players.replaceAll(b.players);
      history.replaceAll(b.history);
      if (b.settings) applySettings(b.settings);
      flash('Backup importado.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Não deu pra importar esse arquivo.', false);
    }
  }

  function wipe() {
    if (!confirm('Apagar TUDO? Jogadores, histórico, ranking e a partida em andamento. Isso não tem volta.')) return;
    if (!confirm('Tem certeza? Se quiser, exporte um backup antes.')) return;
    match.clear();
    history.clear();
    players.replaceAll([]);
    clearSetup();
    applySettings({}, true);
    flash('Tudo apagado.');
  }
</script>

<div class="page">
  <header>
    <h1>Ajustes</h1>
  </header>

  <section>
    <h2>Jogo</h2>
    <div class="card group">
      <Toggle label="Sons" hint="Dado, peças, capturas, vitória" bind:checked={settings.sound} />
      <Toggle label="Mover sozinho" hint="Quando só existe uma jogada possível, a peça anda sem precisar tocar" bind:checked={settings.autoMove} />
    </div>
  </section>

  <section>
    <h2>Vibração</h2>
    <div class="card group">
      <div class="radio">
        {#each HAPTICS as h (h.id)}
          <button class="opt" class:on={settings.haptics === h.id} onclick={() => setHaptics(h.id)}>
            <span class="mark"></span>
            <span class="txt">
              <span class="tl">{h.name}</span>
              <span class="muted small">{h.hint}</span>
            </span>
          </button>
        {/each}
      </div>
      <p class="muted small note">
        No Android a vibração do navegador segue o perfil de som do aparelho: no modo silencioso ou "Não perturbe" ela não toca.
        Se não sentir nada, confira em Configurações → Sons e vibração → Intensidade da vibração → Interação por toque.
      </p>
    </div>
  </section>

  <section>
    <h2>Aparência</h2>
    <div class="card group">
      <div class="radio">
        {#each THEMES as t (t.id)}
          <button class="opt" class:on={settings.theme === t.id} onclick={() => setTheme(t.id)}>
            <span class="mark"></span>
            <span class="txt">
              <span class="tl">{t.name}</span>
              <span class="muted small">{t.hint}</span>
            </span>
            <span class="swatch {t.id}"></span>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <h2>Dado</h2>
    <div class="card group">
      <div class="radio">
        <button class="opt" class:on={settings.diceMode === 'seeded'} onclick={() => { sound.play('tap'); settings.diceMode = 'seeded'; }}>
          <span class="mark"></span>
          <span class="txt">
            <span class="tl">Sorteio + animação</span>
            <span class="muted small">O número é sorteado antes e o dado termina na face certa. Recomendado.</span>
          </span>
        </button>
        <button class="opt" class:on={settings.diceMode === 'physics'} onclick={() => { sound.play('tap'); settings.diceMode = 'physics'; }}>
          <span class="mark"></span>
          <span class="txt">
            <span class="tl">Física real</span>
            <span class="muted small">A face que ficar pra cima é o resultado. Vale a partir do dado 3D (fase 7).</span>
          </span>
        </button>
      </div>
    </div>
  </section>

  <section>
    <h2>Dados</h2>
    <div class="card group">
      <button class="row" onclick={exportBackup}>
        <span class="ic">📤</span>
        <span class="txt">
          <span class="tl">Exportar backup</span>
          <span class="muted small">{plural(players.list.length, 'jogador', 'jogadores')} · {plural(history.list.length, 'partida', 'partidas')} · arquivo JSON</span>
        </span>
      </button>
      <button class="row" onclick={() => { sound.play('tap'); fileInput?.click(); }}>
        <span class="ic">📥</span>
        <span class="txt">
          <span class="tl">Importar backup</span>
          <span class="muted small">Substitui jogadores e histórico pelos do arquivo</span>
        </span>
      </button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importBackup} />
      <button class="row danger" onclick={wipe}>
        <span class="ic">🗑️</span>
        <span class="txt">
          <span class="tl">Apagar tudo</span>
          <span class="muted small">Jogadores, histórico e partida em andamento</span>
        </span>
      </button>
    </div>
  </section>

  {#if msg}
    <div class="flash" class:bad={!msg.ok} role="status">{msg.text}</div>
  {/if}

  <p class="muted version">Ludo v{version} · funciona offline · dados só neste aparelho</p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 12px) 16px 16px;
    gap: 16px;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }
  header {
    min-height: 48px;
    display: flex;
    align-items: center;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    letter-spacing: -0.3px;
  }
  h2 {
    margin: 0 0 8px 4px;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .group {
    display: flex;
    flex-direction: column;
    padding: 2px 0;
  }
  .group > :global(* + *) {
    border-top: 1px solid var(--line);
  }
  .radio {
    display: flex;
    flex-direction: column;
  }
  .opt,
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    text-align: left;
    min-height: var(--tap);
    width: 100%;
  }
  .opt + .opt {
    border-top: 1px solid var(--line);
  }
  .mark {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--line);
    flex: none;
    position: relative;
    transition: border-color 0.15s;
  }
  .opt.on .mark {
    border-color: var(--ink);
  }
  .opt.on .mark::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: var(--ink);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tl {
    font-weight: 700;
  }
  .small {
    font-size: 13px;
  }
  .ic {
    font-size: 22px;
    width: 30px;
    text-align: center;
  }
  .danger .tl {
    color: var(--red);
  }
  .flash {
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--ink);
    color: #fff;
    font-weight: 700;
    text-align: center;
    animation: pop 0.25s ease-out;
  }
  .flash.bad {
    background: var(--red);
  }
  .version {
    text-align: center;
    font-size: 12px;
    margin: 8px 0 0;
  }
  .note {
    margin: 0;
    padding: 4px 16px 12px;
  }
  .swatch {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    flex: none;
    border: 2px solid rgba(0, 0, 0, 0.08);
  }
  .swatch.cream {
    background: #f6f1e7;
  }
  .swatch.og {
    background:
      radial-gradient(circle at 30% 30%, rgba(255, 210, 122, 0.55) 0, transparent 30%),
      radial-gradient(circle at 70% 70%, rgba(255, 210, 122, 0.35) 0, transparent 28%),
      linear-gradient(135deg, #4a2420, #22100f);
    border-color: #7a4a2a;
  }
  .swatch.aurora {
    background:
      radial-gradient(circle at 30% 30%, #ff6b9d 0, transparent 55%),
      radial-gradient(circle at 75% 25%, #ffd166 0, transparent 50%),
      radial-gradient(circle at 70% 75%, #4cc9f0 0, transparent 55%),
      radial-gradient(circle at 25% 75%, #7bed9f 0, transparent 50%),
      #f6f1e7;
  }
</style>
