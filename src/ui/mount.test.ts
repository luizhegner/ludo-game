// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from '../App.svelte';
import { match, TIMING } from '../stores/match.svelte';
import { players } from '../stores/players.svelte';
import { history } from '../stores/history.svelte';
import { nav } from '../stores/nav.svelte';
import { settings } from '../stores/settings.svelte';
import { dmStore } from '../stores/dm.svelte';
import { STAR_ABS, START_OFFSET } from '../engine/board';
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

  it('foguete: decola, voa e pousa em três atos; o toast conta as casas', () => {
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
    // pausa na casa de poder, depois decola no lugar (tremor + chama)
    tick(TIMING.power + 100);
    expect(match.moving).not.toBeNull();
    expect(match.moving!.flying).toBe(true);
    expect(match.moving!.flyKind).toBe('rocket');
    expect(match.moving!.step).toBe(0);
    expect(document.querySelector('.pawn.liftoff .exhaust')).toBeTruthy();
    // voo até o destino
    tick(TIMING.liftoff);
    expect(match.moving!.step).toBe(1);
    expect(document.querySelector('.pawn.cruise')).toBeTruthy();
    // pouso caótico
    tick(TIMING.rocket);
    expect(match.moving!.step).toBe(2);
    expect(document.querySelector('.pawn.landing')).toBeTruthy();
    expect(document.querySelector('.exhaust')).toBeNull();
    tick(TIMING.landing + 200);
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
      tick(TIMING.step * 7 + TIMING.liftoff + TIMING.rocket + TIMING.landing + TIMING.power + TIMING.home);
    }
    expect(document.querySelector('.podium')).toBeTruthy();
    const g = history.list[0];
    expect(g.rules.mode).toBe('powers');
    expect(g.log.some((e) => e.type === 'power')).toBe(true);
    unmount(app);
  }, 60000);
});

describe('fase 4 pela UI: 5 Minutos e 2v2', () => {
  beforeEach(() => {
    resetAll();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  function tick(ms: number) {
    vi.advanceTimersByTime(ms);
    flushSync();
  }
  function setupPlayers(n: 2 | 4) {
    const names = ['Ana', 'Bia', 'Caio', 'Duda'];
    const colors = ['Verde', 'Vermelho', 'Azul', 'Amarelo'];
    for (let i = 0; i < n; i++) players.create(names[i], '🙂');
    for (let i = 0; i < n; i++) {
      clickText(colors[i], '.slot');
      clickText(names[i], '.row');
    }
  }

  it('5 Minutos: peças começam fora, cronômetro só começa no primeiro lançamento, pausa com o menu e fecha por tempo', () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    clickText('Nova partida');
    clickText('5 Minutos', '.mode');
    setupPlayers(2);
    clickText('Continuar com 2 jogadores');
    expect(text()).toContain('Cronômetro de 5:00');
    clickText('Iniciar partida');
    const s = match.state!;
    expect(s.rules.mode).toBe('fiveMin');
    expect(s.pieces.green).toEqual([0, 0, 0, 0]);
    expect(document.querySelector('.clock')!.textContent).toContain('5:00');
    // ainda parado
    tick(5000);
    expect(document.querySelector('.clock')!.textContent).toContain('5:00');
    // primeiro lançamento liga o relógio (auto-move: as 4 peças empilhadas são equivalentes)
    const first = match.state!.turn.color;
    match.roll(2);
    tick(TIMING.dice + TIMING.autoMove + TIMING.step * 2 + 200);
    expect(match.state!.pieces[first][0]).toBe(2);
    tick(10_000);
    expect(match.remainingMs).toBeLessThanOrEqual(300_000 - 10_000);
    expect(document.querySelector('.clock')!.textContent).not.toContain('5:00');
    // menu aberto pausa (o estado guarda o tempo consumido e para de contar)
    click('.menu-btn');
    const paused = match.state!.clock!;
    expect(paused.runningSince).toBeNull();
    const shown = document.querySelector('.clock')!.textContent;
    tick(20_000);
    expect(match.state!.clock).toEqual(paused);
    expect(document.querySelector('.clock')!.textContent).toBe(shown);
    click('.sheet [aria-label="Fechar"]');
    expect(match.state!.clock!.runningSince).not.toBeNull();
    tick(2000);
    expect(document.querySelector('.clock')!.textContent).not.toBe(shown);
    // avança até acabar (em blocos, pra não acumular milhares de tiques)
    for (let i = 0; i < 31 && match.state!.turn.phase !== 'over'; i++) tick(10_000);
    expect(match.state!.turn.phase).toBe('over');
    expect(match.state!.endReason).toBe('time');
    expect(document.querySelector('.podium')).toBeTruthy();
    expect(text()).toContain('Acabou o tempo');
    expect(history.list.length).toBe(1);
    unmount(app);
  });

  it('2v2: exige 4 jogadores, mostra as duplas e quem termina as 4 joga com as peças do parceiro', () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    clickText('Nova partida');
    clickText('2v2', '.mode');
    expect(text()).toContain('Precisa de exatamente 4 jogadores');
    setupPlayers(4);
    expect(text()).toContain('Dupla A');
    clickText('Continuar com 4 jogadores');
    expect(text()).toContain('8 peças');
    clickText('Iniciar partida');
    expect(match.state!.rules.mode).toBe('team');
    // cenário: verde terminou as 4; azul tem peças em jogo; é a vez do verde
    const s0 = structuredClone(match.state!);
    s0.pieces.green = [56, 56, 56, 56];
    s0.finished = ['green'];
    s0.pieces.blue = [3, 7, -1, -1];
    s0.turn = { color: 'green', phase: 'roll', dice: null, legal: [], sixStreak: 0, lastMoved: null };
    (match as unknown as { state: typeof s0 }).state = s0;
    flushSync();
    // cabeçalho: Ana (verde) jogando, com a bolinha azul do parceiro
    expect(document.querySelector('.who')!.textContent).toContain('Ana');
    expect(document.querySelector('.who .for')).toBeTruthy();
    match.roll(2);
    tick(TIMING.dice + 50);
    expect(match.state!.turn.legal).toEqual([0, 1]);
    // as peças azuis é que estão selecionáveis
    const sel = [...document.querySelectorAll('.pawn.selectable')];
    expect(sel.length).toBe(2);
    (sel[0] as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    tick(TIMING.step * 2 + 200);
    expect(match.state!.pieces.blue).toEqual([5, 7, -1, -1]);
    unmount(app);
  });
  it('tema OG: cabeçalho compacto com ✕/☠ e 👉, quadrante da vez pulsa e a peça deixa rastro fantasma', () => {
    settings.theme = 'og';
    const { app } = startTwoPlayers();
    flushSync();
    expect(document.documentElement.dataset.theme).toBe('og');
    const color = match.state!.turn.color;

    // tabuleiro centralizado: quem joga aparece nos cantos — o quadrado da vez é o do dado
    expect(document.querySelector('.screen.og')).not.toBeNull();
    const turnCard = document.querySelector('.pcorner.turn')!;
    expect(turnCard).not.toBeNull();
    expect(turnCard.textContent).toContain('✕ 0');
    expect(turnCard.textContent).toContain('☠ 0');
    expect(document.querySelector('.point-og')).not.toBeNull();
    expect(document.querySelector('.pcorner:not(.turn) .pframe')).not.toBeNull(); // avatar no canto do adversário
    expect(document.querySelector('.who')).toBeNull(); // o pill do tema claro não aparece

    // tabuleiro com moldura e pulso só no quadrante da vez
    expect(document.querySelector('.board.og')).not.toBeNull();
    expect(document.querySelectorAll('.og-pulse').length).toBe(1);
    // nome e % dentro do quadrante (texto do svg)
    expect(document.querySelector('.board svg')!.textContent).toContain('%');

    // sai da base e anda 4: durante o passo 3 o rastro mostra as casas anteriores
    match.roll(6);
    tick(TIMING.dice + TIMING.autoMove + TIMING.out + 100);
    expect(match.state!.pieces[color][0]).toBe(0);
    expect(document.querySelector('.point-og')).not.toBeNull(); // 6 → rola de novo
    match.roll(4);
    tick(TIMING.dice + TIMING.autoMove);
    expect(document.querySelector('.point-og')).toBeNull(); // movendo: sem mãozinha
    tick(TIMING.step * 3);
    expect(match.moving!.pos).toBe(3);
    const ghosts = document.querySelectorAll('.board .ghost');
    expect(ghosts.length).toBe(3); // casas 0, 1 e 2
    tick(TIMING.step * 2 + 100);
    expect(match.moving).toBeNull();
    expect(document.querySelectorAll('.board .ghost').length).toBe(0);

    // voltar pro tema claro devolve o cabeçalho normal
    settings.theme = 'cream';
    flushSync();
    expect(document.querySelector('.who-og')).toBeNull();
    expect(document.querySelector('.who')).not.toBeNull();
    expect(document.querySelector('.board.og')).toBeNull();
    unmount(app);
  });
  it('Deathmatch: um dado por jogador, ações simultâneas, captura no pouso, canhão, anel de proteção e fim por tempo', () => {
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    clickText('Nova partida');
    clickText('Deathmatch', '.mode');
    setupPlayers(2);
    clickText('Continuar com 2 jogadores');
    expect(text()).toContain('Todo mundo joga ao mesmo tempo');
    expect(text()).not.toContain('Jogada extra ao comer');
    clickText('Iniciar partida');
    const s0 = match.state!;
    expect(s0.rules.mode).toBe('deathmatch');
    expect(s0.dm).toBeTruthy();

    // dois dados na tela (um por jogador), os dois habilitados; sem "vez de"
    expect(document.querySelectorAll('.dice-pos .dice').length).toBe(2);
    expect(document.querySelectorAll('.dice:not([disabled])').length).toBe(2);
    expect(document.querySelector('.who')).toBeNull();
    expect(text()).toContain('Deathmatch');
    expect(document.querySelector('.board svg')!.textContent).toContain('Alvo ⚔ 8');

    // os dois rolam "ao mesmo tempo": verde tira 6 (sai), vermelho tira 3 (sem jogada)
    dmStore.roll('green', 6);
    dmStore.roll('red', 3);
    expect(dmStore.anim.green.rolling).toBe(true);
    expect(dmStore.anim.red.rolling).toBe(true);
    expect(match.state!.clock!.runningSince).not.toBeNull(); // relógio ligou no primeiro lançamento
    tick(TIMING.dice + 10);
    expect(dmStore.anim.red.holding).toBe(true); // "sem jogada" segurando o número
    // verde: auto-move (todas na base) → salto pra saída
    tick(TIMING.autoMove + TIMING.out + 100);
    expect(match.state!.pieces.green[0]).toBe(0);
    expect(dmStore.canRoll('green')).toBe(true); // 6 não dá jogada extra, mas o ciclo é sempre rolar de novo
    tick(TIMING.hold);
    expect(dmStore.canRoll('red')).toBe(true);

    // arma uma captura: vermelho parado na casa abs 5 (rel 44 do vermelho); verde em 2 anda 3
    const st = structuredClone(match.state!);
    st.pieces.green = [2, -1, -1, -1];
    st.pieces.red = [(5 - START_OFFSET.red + 52) % 52, -1, -1, -1];
    localStorage.setItem('ludo.match.v1', JSON.stringify(st));
    match.applyDm(st, match.state!);
    dmStore.roll('green', 3);
    tick(TIMING.dice + TIMING.autoMove + 10);
    // enquanto a peça verde anda, a vermelha continua desenhada na casa (vítima só some no pouso)
    expect(match.state!.pieces.red[0]).toBe(-1); // motor já decidiu
    expect(dmStore.overrides['red-0']).toBe((5 - START_OFFSET.red + 52) % 52); // UI segura
    expect(document.querySelectorAll('.pawn').length).toBe(8);
    tick(TIMING.step * 3 + 100);
    expect(dmStore.overrides['red-0']).toBeUndefined();
    expect(match.state!.players.find((p) => p.color === 'green')!.stats.captures).toBe(1);
    expect(text()).toContain('comeu');
    expect(document.querySelector('.board svg')!.textContent).toContain('⚔ 1');

    // anel de proteção: verde para na saída do vermelho (abs 13, segura sem canhão) → anel cheio
    const st2 = structuredClone(match.state!);
    st2.pieces.green = [12, -1, -1, -1];
    localStorage.setItem('ludo.match.v1', JSON.stringify(st2));
    match.applyDm(st2, match.state!);
    dmStore.roll('green', 1);
    tick(TIMING.dice + TIMING.autoMove + TIMING.step + 100);
    expect(match.state!.pieces.green[0]).toBe(13);
    expect(document.querySelector('.board svg path[stroke="#fff"][stroke-linecap="round"]')).toBeTruthy();
    // 15 s depois: vulnerável (anel tracejado)
    tick(15_500);
    expect(document.querySelector('.board svg .vuln')).toBeTruthy();

    // canhão: verde para na estrela do vermelho (abs 21) → abatida, captura pro vermelho
    const st3 = structuredClone(match.state!);
    st3.pieces.green = [STAR_ABS.red - 2, -1, -1, -1];
    localStorage.setItem('ludo.match.v1', JSON.stringify(st3));
    match.applyDm(st3, match.state!);
    dmStore.roll('green', 2);
    tick(TIMING.dice + TIMING.autoMove + TIMING.step * 2 + 100);
    expect(dmStore.overrides['green-0']).toBe(STAR_ABS.red); // fica um instante na estrela
    tick(TIMING.power + 50);
    expect(match.state!.pieces.green[0]).toBe(-1);
    expect(match.state!.players.find((p) => p.color === 'red')!.stats.captures).toBe(1);
    expect(text()).toContain('Canhão');

    // acaba o tempo → ranking por capturas (1 × 1, desempate por menos mortes: vermelho morreu 1, verde 1 → ordem de cor)
    for (let i = 0; i < 31 && match.state!.turn.phase !== 'over'; i++) tick(10_000);
    expect(match.state!.turn.phase).toBe('over');
    expect(match.state!.endReason).toBe('time');
    expect(document.querySelector('.podium')).toBeTruthy();
    expect(document.querySelectorAll('.dice-pos').length).toBe(0);
    expect(history.list.length).toBe(1);
    unmount(app);
  });
});
