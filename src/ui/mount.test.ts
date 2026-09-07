// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from '../App.svelte';
import { match, TIMING } from '../stores/match.svelte';

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

  function startTwoPlayers() {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    (document.querySelector('.btn.primary') as HTMLButtonElement).click();
    flushSync();
    (document.querySelector('.btn.primary') as HTMLButtonElement).click();
    flushSync();
    return app;
  }

  /** Avança o relógio (timers encadeados disparam em sequência) e atualiza a UI. */
  function tick(ms: number) {
    vi.advanceTimersByTime(ms);
    flushSync();
  }

  it('rola o dado, move peças e chega ao fim de jogo com 2 jogadores', () => {
    const app = startTwoPlayers();

    // joga até acabar (ou até um limite de segurança)
    let guard = 0;
    while (!document.querySelector('.podium') && guard++ < 6000) {
      const dice = document.querySelector('.dice:not([disabled])') as HTMLButtonElement | null;
      if (dice) {
        dice.click();
        flushSync();
        tick(TIMING.dice + TIMING.hold + TIMING.autoMove + 100);
        continue;
      }
      const pawn = document.querySelector('.pawn.selectable') as SVGGElement | null;
      if (pawn) {
        pawn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        flushSync();
        continue;
      }
      // animação em andamento (peça andando, dado girando…)
      tick(TIMING.step * 7 + TIMING.home);
    }
    expect(document.querySelector('.podium')).toBeTruthy();
    expect(document.body.textContent).toContain('🥇');
    unmount(app);
  }, 30000);

  it('peça anda casa a casa (não teleporta) e a UI fica travada durante o movimento', () => {
    const app = startTwoPlayers();
    const s0 = match.state!;
    const color = s0.turn.color;

    // tira a peça 0 da base com um 6 forçado (auto-move: todas na base)
    match.roll(6);
    tick(TIMING.dice + 10);
    expect(match.busy).toBe(true); // auto-move agendado → salto base→saída
    tick(TIMING.autoMove + TIMING.out + 100);
    expect(match.moving).toBeNull();
    expect(match.state!.pieces[color][0]).toBe(0);
    expect(match.state!.turn.phase).toBe('roll'); // 6 joga de novo

    // agora anda 4 casas com a peça 0
    match.roll(4);
    tick(TIMING.dice + TIMING.autoMove);
    // o motor já decidiu, mas a UI ainda mostra o começo do caminho
    expect(match.moving).not.toBeNull();
    expect(match.moving!.pos).toBe(0);
    expect(match.moving!.to).toBe(4);
    expect(match.busy).toBe(true);
    expect(match.state!.pieces[color][0]).toBe(0); // estado exibido ainda não avançou
    // e o estado final já está persistido
    expect(JSON.parse(localStorage.getItem('ludo.match.v1')!).pieces[color][0]).toBe(4);

    // UI travada: dado desabilitado, nenhuma peça selecionável, cliques ignorados
    expect(document.querySelector('.dice:not([disabled])')).toBeNull();
    expect(document.querySelectorAll('.pawn.selectable').length).toBe(0);
    expect(document.querySelectorAll('.pawn.moving').length).toBe(1);
    const stateBefore = match.state;
    match.roll(3);
    match.move(1);
    expect(match.state).toBe(stateBefore);

    // observa a peça passar por todas as casas intermediárias, uma por vez
    const seen: number[] = [match.moving!.pos];
    for (let i = 0; i < 4; i++) {
      tick(TIMING.step);
      expect(match.moving).not.toBeNull(); // ainda não pousou
      seen.push(match.moving!.pos);
      expect(match.state!.pieces[color][0]).toBe(0); // estado exibido só muda no pouso
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);

    // pouso: estado aplicado e passa a vez
    tick(TIMING.step + 50);
    expect(match.moving).toBeNull();
    expect(match.busy).toBe(false);
    expect(match.state!.pieces[color][0]).toBe(4);
    expect(match.state!.turn.color).not.toBe(color);
    unmount(app);
  });
});
