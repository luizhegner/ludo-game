// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from '../App.svelte';
import { match, TIMING } from '../stores/match.svelte';
import { players } from '../stores/players.svelte';
import { history } from '../stores/history.svelte';
import { nav } from '../stores/nav.svelte';
import { powerName } from '../lib/powers';

function text() {
  return document.body.textContent ?? '';
}
function click(sel: string) {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) throw new Error(`não achei ${sel}`);
  el.click();
  flushSync();
}
/** Clica no botão cujo texto contém `label`. */
function clickText(label: string, sel = 'button') {
  const el = [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(label));
  if (!el) throw new Error(`não achei botão "${label}"`);
  el.click();
  flushSync();
}

function resetAll() {
  localStorage.clear();
  match.clear();
  players.replaceAll([]);
  history.clear();
  nav.switchTab('home');
  document.body.innerHTML = '<div id="app"></div>';
}

/** Abre Nova partida e monta uma de 2 jogadores (cria os jogadores pelo cadastro). */
function startTwoPlayers() {
  const app = mount(App, { target: document.getElementById('app')! });
  flushSync();
  clickText('Nova partida');
  // passo 1: modo
  expect(text()).toContain('Clássico');
  clickText('Clássico', '.mode');
  // passo 2: cores × jogadores
  expect(text()).toContain('Escolha pelo menos 2 cores');
  const ana = players.create('Ana', '🦊');
  const bia = players.create('Bia', '🐼');
  clickText('Verde', '.slot');
  clickText('Ana', '.row');
  clickText('Vermelho', '.slot');
  clickText('Bia', '.row');
  expect(text()).toContain('Continuar com 2 jogadores');
  clickText('Continuar com 2 jogadores');
  // passo 3: regras
  expect(text()).toContain('Iniciar partida');
  clickText('Iniciar partida');
  return { app, ana, bia };
}

describe('App monta no navegador (jsdom)', () => {
  beforeEach(resetAll);

  it('abre na aba Jogar com a barra de abas', () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    expect(text()).toContain('Nova partida');
    expect(document.querySelectorAll('.tabbar .tab').length).toBe(5);
    unmount(app);
  });

  it('nova partida em 3 passos: modo → jogadores → regras → tabuleiro', () => {
    const { app, ana, bia } = startTwoPlayers();
    expect(document.querySelector('svg')).toBeTruthy();
    expect(document.querySelectorAll('.pawn').length).toBe(8);
    expect(document.querySelector('.dice')).toBeTruthy();
    // barra de abas some na partida
    expect(document.querySelector('.tabbar')).toBeNull();
    // partida ficou salva pra retomar, com os ids do cadastro
    const saved = JSON.parse(localStorage.getItem('ludo.match.v1')!);
    expect(saved.players.map((p: { playerId: string }) => p.playerId).sort()).toEqual([ana.id, bia.id].sort());
    // e a configuração fica lembrada pra próxima
    const setup = JSON.parse(localStorage.getItem('ludo.lastSetup.v2')!);
    expect(setup.slots.green).toBe(ana.id);
    expect(setup.slots.red).toBe(bia.id);
    unmount(app);
  });

  it('o mesmo jogador não pode ocupar duas cores', () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    players.create('Ana', '🦊');
    clickText('Nova partida');
    clickText('Clássico', '.mode');
    clickText('Verde', '.slot');
    clickText('Ana', '.row');
    clickText('Vermelho', '.slot');
    // Ana aparece desabilitada
    const row = [...document.querySelectorAll<HTMLButtonElement>('.row')].find((b) => b.textContent?.includes('Ana'))!;
    expect(row.disabled).toBe(true);
    unmount(app);
  });

  it('navega pelas abas e a página Jogadores cadastra alguém', () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    clickText('Jogadores', '.tab');
    expect(text()).toContain('Ninguém cadastrado');
    clickText('Cadastrar jogador');
    const input = document.querySelector('input:not([type])') as HTMLInputElement;
    input.value = 'Carlos';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    clickText('Criar jogador');
    expect(players.list.map((p) => p.name)).toEqual(['Carlos']);
    expect(text()).toContain('Carlos');
    expect(text()).toContain('ainda não jogou');

    clickText('Ranking', '.tab');
    expect(text()).toContain('Ainda não tem ranking');
    clickText('Histórico', '.tab');
    expect(text()).toContain('Nenhuma partida ainda');
    clickText('Ajustes', '.tab');
    expect(text()).toContain('Exportar backup');
    unmount(app);
  });
});

describe('fluxo de jogo pela UI', () => {
  beforeEach(() => {
    resetAll();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  /** Avança o relógio (timers encadeados disparam em sequência) e atualiza a UI. */
  function tick(ms: number) {
    vi.advanceTimersByTime(ms);
    flushSync();
  }

  it('rola o dado, move peças, chega ao fim de jogo e a partida vai pro histórico', () => {
    const { app, ana, bia } = startTwoPlayers();

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
    expect(text()).toContain('🥇');

    // histórico recebeu a partida
    expect(history.list.length).toBe(1);
    const g = history.list[0];
    expect(g.placements?.length).toBe(2);
    const winner = g.players.find((p) => p.color === g.placements![0])!;
    expect([ana.id, bia.id]).toContain(winner.playerId);

    // "Início" limpa a partida e volta pra aba Jogar, que mostra o top 3 e a última partida
    clickText('Início');
    expect(match.state).toBeNull();
    expect(text()).toContain('Top 3');
    expect(text()).toContain('Últimas partidas');
    expect(text()).toContain(`${winner.name} venceu`);

    // estatísticas do vencedor
    const st = history.statsFor(winner.playerId);
    expect(st.games).toBe(1);
    expect(st.wins).toBe(1);
    expect(st.streak).toBe(1);
    unmount(app);
  }, 30000);

  it('peça anda casa a casa (não teleporta) e a UI fica travada durante o movimento', () => {
    const { app } = startTwoPlayers();
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

  it('menu ⋮ → Jogadores adiciona alguém do cadastro numa cor livre', () => {
    const { app } = startTwoPlayers();
    const caio = players.create('Caio', '🦁');
    click('.menu-btn');
    clickText('Jogadores', '.row');
    // azul está livre
    const addBtns = [...document.querySelectorAll<HTMLButtonElement>('.chip')].filter((b) => b.textContent?.includes('Adicionar'));
    expect(addBtns.length).toBe(2); // azul e amarelo
    addBtns[0].click();
    flushSync();
    clickText('Caio', '.row');
    const s = match.state!;
    expect(s.players.length).toBe(3);
    expect(s.players.find((p) => p.playerId === caio.id)).toBeTruthy();
    unmount(app);
  });
});

describe('modo Poderes pela UI', () => {
  beforeEach(() => {
    resetAll();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function tick(ms: number) {
    vi.advanceTimersByTime(ms);
    flushSync();
  }

  /** Nova partida em Poderes com 2 jogadores; desliga as minas no passo 3. */
  function startPowers() {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    clickText('Nova partida');
    clickText('Poderes', '.mode');
    players.create('Ana', '🦊');
    players.create('Bia', '🐼');
    clickText('Verde', '.slot');
    clickText('Ana', '.row');
    clickText('Vermelho', '.slot');
    clickText('Bia', '.row');
    clickText('Continuar com 2 jogadores');
    expect(text()).toContain('11 de 11 ligados');
    clickText('Mina', '.prow');
    expect(text()).toContain('10 de 11 ligados');
    clickText('Iniciar partida');
    return app;
  }

  it('nova partida em Poderes: toggles por poder, casas no tabuleiro, configuração lembrada', () => {
    const app = startPowers();
    const s = match.state!;
    expect(s.rules.mode).toBe('powers');
    expect(s.rules.disabledPowers).toEqual(['mine']);
    // sem minas: 10 casas visíveis, todas desenhadas
    expect(s.powers!.cells.length).toBe(10);
    expect(s.powers!.cells.every((c) => !c.hidden)).toBe(true);
    expect(document.querySelectorAll('.power').length).toBe(10);
    // configuração lembrada
    const setup = JSON.parse(localStorage.getItem('ludo.lastSetup.v2')!);
    expect(setup.mode).toBe('powers');
    expect(setup.disabledPowers).toEqual(['mine']);
    // ⋮ → Regras lista os poderes e marca a mina como desligada
    click('.menu-btn');
    clickText('Regras', '.row');
    expect(text()).toContain('Casas de poder');
    expect(text()).toContain('Mina — desligado');
    expect(text()).toContain('Escudo');
    unmount(app);
  });

  it('segurar o dedo numa casa de poder mostra a explicação na área de status', () => {
    const app = startPowers();
    const cellEl = document.querySelector('.power') as SVGGElement;
    cellEl.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    tick(400);
    expect(match.info).not.toBeNull();
    expect(document.querySelector('.pinfo')).toBeTruthy();
    expect(document.querySelector('.pinfo')!.textContent).toContain(powerName(match.info!.power));
    cellEl.dispatchEvent(new Event('pointerup', { bubbles: true }));
    flushSync();
    // ainda dá tempo de ler depois de soltar
    expect(match.info).not.toBeNull();
    tick(TIMING.infoLinger + 50);
    expect(match.info).toBeNull();
    expect(document.querySelector('.pinfo')).toBeNull();
    unmount(app);
  });

  it('foguete: a peça voa num arco só e o toast conta as casas', () => {
    const app = startPowers();
    const color = match.state!.turn.color;
    // arma o cenário: peça 0 na casa 0, foguete na casa relativa 3 (absoluta pra cor)
    const s0 = structuredClone(match.state!);
    s0.pieces[color][0] = 0;
    s0.powers!.cells = [{ abs: (3 + (color === 'green' ? 0 : 13)) % 52, power: 'rocket' }];
    (match as unknown as { state: typeof s0 }).state = s0; // injeta o cenário direto no store
    match.roll(3);
    tick(TIMING.dice + TIMING.autoMove + 10);
    // anda 3 casas
    tick(TIMING.step * 3 + 10);
    // pausa na casa de poder, depois voa
    tick(TIMING.power + 100);
    expect(match.moving).not.toBeNull();
    expect(match.moving!.flying).toBe(true);
    expect(document.querySelector('.pawn.flying')).toBeTruthy();
    tick(TIMING.fly + 200);
    expect(match.moving).toBeNull();
    const after = match.state!;
    const fly = after.log.find((e) => e.type === 'fly') as { n: number; to: number } | undefined;
    expect(fly).toBeTruthy();
    expect(after.pieces[color][0]).toBe(fly!.to);
    expect(text()).toContain(`voou ${fly!.n} casas`);
    unmount(app);
  });

  it('dado personalizável: abre o seletor e a escolha move a peça', () => {
    const app = startPowers();
    const color = match.state!.turn.color;
    const s0 = structuredClone(match.state!);
    s0.pieces[color][0] = 0;
    s0.powers!.cells = [{ abs: (2 + (color === 'green' ? 0 : 13)) % 52, power: 'magicDice' }];
    (match as unknown as { state: typeof s0 }).state = s0;
    match.roll(2);
    tick(TIMING.dice + TIMING.autoMove + TIMING.step * 2 + TIMING.power + 200);
    expect(match.state!.turn.phase).toBe('pick');
    expect(document.querySelector('.picker')).toBeTruthy();
    expect(document.querySelectorAll('.pick:not([disabled])').length).toBe(6);
    // dado travado enquanto escolhe
    expect(document.querySelector('.dice:not([disabled])')).toBeNull();
    clickText('4', '.pick');
    tick(TIMING.step * 4 + 200);
    expect(match.state!.pieces[color][0]).toBe(6);
    expect(match.state!.turn.color).not.toBe(color);
    expect(document.querySelector('.picker')).toBeNull();
    unmount(app);
  });

  it('partida inteira em Poderes pela UI chega ao pódio', () => {
    const app = startPowers();
    let guard = 0;
    while (!document.querySelector('.podium') && guard++ < 8000) {
      const dice = document.querySelector('.dice:not([disabled])') as HTMLButtonElement | null;
      if (dice) {
        dice.click();
        flushSync();
        tick(TIMING.dice + TIMING.hold + TIMING.autoMove + 100);
        continue;
      }
      const pick = document.querySelector('.pick:not([disabled])') as HTMLButtonElement | null;
      if (pick) {
        pick.click();
        flushSync();
        continue;
      }
      const pawn = document.querySelector('.pawn.selectable') as SVGGElement | null;
      if (pawn) {
        pawn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        flushSync();
        continue;
      }
      tick(TIMING.step * 7 + TIMING.fly + TIMING.power + TIMING.home);
    }
    expect(document.querySelector('.podium')).toBeTruthy();
    const g = history.list[0];
    expect(g.rules.mode).toBe('powers');
    expect(g.log.some((e) => e.type === 'power')).toBe(true);
    unmount(app);
  }, 60000);
});
