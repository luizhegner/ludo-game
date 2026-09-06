// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from '../App.svelte';
import { match } from '../stores/match.svelte';

describe('App monta no navegador (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('abre na home, cria partida e mostra o tabuleiro', async () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    expect(document.body.textContent).toContain('Nova partida');

    (document.querySelector('.btn.primary') as HTMLButtonElement).click();
    flushSync();
    expect(document.body.textContent).toContain('Começar com 2 jogadores');

    (document.querySelector('.btn.primary') as HTMLButtonElement).click();
    flushSync();
    expect(document.querySelector('svg')).toBeTruthy();
    expect(document.querySelectorAll('.pawn').length).toBe(8);
    expect(document.querySelector('.dice')).toBeTruthy();
    // partida ficou salva pra retomar
    expect(localStorage.getItem('ludo.match.v1')).toBeTruthy();

    unmount(app);
  });
});

describe('fluxo de jogo pela UI', () => {
  beforeEach(() => {
    localStorage.clear();
    match.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('rola o dado, move peças e chega ao fim de jogo com 2 jogadores', async () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    (document.querySelector('.btn.primary') as HTMLButtonElement).click();
    flushSync();
    (document.querySelector('.btn.primary') as HTMLButtonElement).click();
    flushSync();

    // joga até acabar (ou até um limite de segurança)
    let guard = 0;
    while (!document.querySelector('.podium') && guard++ < 4000) {
      const dice = document.querySelector('.dice:not([disabled])') as HTMLButtonElement | null;
      if (dice) {
        dice.click();
        flushSync();
        vi.advanceTimersByTime(800); // animação do dado
        flushSync();
        vi.advanceTimersByTime(400); // auto-move
        flushSync();
        continue;
      }
      const pawn = document.querySelector('.pawn.selectable') as SVGGElement | null;
      if (pawn) {
        pawn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        flushSync();
        continue;
      }
      vi.advanceTimersByTime(200);
      flushSync();
    }
    expect(document.querySelector('.podium')).toBeTruthy();
    expect(document.body.textContent).toContain('🥇');
    unmount(app);
  });
});
