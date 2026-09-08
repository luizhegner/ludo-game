// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from '../App.svelte';
import { match } from '../stores/match.svelte';
import { players } from '../stores/players.svelte';
import { history } from '../stores/history.svelte';
import { nav } from '../stores/nav.svelte';
import { settings } from '../stores/settings.svelte';
import { createGame, DEFAULT_RULES, endGame, move, roll } from '../engine/game';
import { FINISH, type Color, type GameState } from '../engine/types';

const text = () => document.body.textContent ?? '';
function clickText(label: string, sel = 'button') {
  const el = [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(label));
  if (!el) throw new Error(`não achei "${label}" em ${sel}`);
  el.click();
  flushSync();
}

/** Partida terminada pelo motor: `winner` (verde) ganha de `loser` (vermelho), com uma captura no meio. */
function finished(winner: string, loser: string, now: number, mode: 'classic' | 'quick' = 'classic'): GameState {
  let s = createGame({
    rules: { ...DEFAULT_RULES, mode },
    players: [
      { color: 'green', playerId: winner, name: players.nameOf(winner, winner), avatar: '🙂' },
      { color: 'red', playerId: loser, name: players.nameOf(loser, loser), avatar: '🙂' },
    ],
    seed: 3,
    first: 'green',
    now,
  });
  // verde na casa 4 come o vermelho que está na casa absoluta 5 (relativa do vermelho: 5 - 13 + 52 = 44)
  s = { ...s, pieces: { ...s.pieces, green: [4, FINISH, FINISH, FINISH - 1], red: [44, -1, -1, -1] } };
  s = roll(s, 1, now + 60_000);
  s = move(s, 0, now + 61_000); // captura → vez do vermelho
  expect(s.turn.color).toBe('red');
  s = roll(s, 2, now + 120_000); // vermelho sem jogada (tudo na base) → volta pro verde
  expect(s.turn.color).toBe('green');
  // atalho de teste: deixa o verde a um passo de terminar
  s = { ...s, pieces: { ...s.pieces, green: [FINISH, FINISH, FINISH, FINISH - 1] } };
  s = roll(s, 1, now + 180_000);
  s = move(s, 3, now + 181_000); // última peça no centro → acabou
  expect(s.turn.phase).toBe('over');
  return s;
}

beforeEach(() => {
  localStorage.clear();
  match.clear();
  players.replaceAll([]);
  history.clear();
  nav.switchTab('home');
  document.body.innerHTML = '<div id="app"></div>';
});

describe('páginas com dados', () => {
  it('histórico → detalhe com linha do tempo e estatísticas; ranking por modo e período; detalhes do jogador', () => {
    const ana = players.create('Ana', '🦊');
    const bia = players.create('Bia', '🐼');
    const t0 = Date.now() - 3 * 86400000; // 3 dias atrás
    history.add(finished(ana.id, bia.id, t0));
    history.add(finished(bia.id, ana.id, t0 + 3600_000));
    history.add(finished(ana.id, bia.id, Date.now() - 600_000, 'quick'));
    history.add(endGame(createGame({ rules: DEFAULT_RULES, players: [{ color: 'green', playerId: ana.id, name: 'Ana', avatar: '🦊' }, { color: 'blue', playerId: bia.id, name: 'Bia', avatar: '🐼' }], seed: 1, now: Date.now() - 300_000 }), false, Date.now() - 200_000));

    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();

    // home: top 3 do modo mais jogado (clássico, 2 partidas) e últimas 3
    expect(text()).toContain('Top 3 · Clássico');
    expect(document.querySelectorAll('.recent li').length).toBe(3);
    expect(text()).toContain('Encerrada sem contar');

    // histórico agrupado por dia
    clickText('Histórico', '.tab');
    expect(document.querySelectorAll('.list .row').length).toBe(4);
    expect(text()).toContain('Hoje');

    // abre o detalhe da partida rápida (mais recente com vencedor)
    const rows = [...document.querySelectorAll<HTMLElement>('.list .row')];
    rows.find((r) => r.textContent?.includes('Rápido'))!.click();
    flushSync();
    expect(nav.route.page).toBe('match');
    expect(text()).toContain('Rápido');
    expect(text()).toContain('Linha do tempo');
    expect(text()).toContain('Ana comeu Bia');
    expect(text()).toContain('Ana venceu');
    expect(document.querySelectorAll('.timeline li').length).toBeGreaterThanOrEqual(4);
    // tabela de estatísticas: 1 captura pra Ana, 1 morte pra Bia
    const trs = [...document.querySelectorAll<HTMLElement>('.table .tr')];
    expect(trs[0].textContent).toContain('Ana');
    expect(trs[0].querySelectorAll('.n')[0].textContent).toBe('1');
    expect(trs[1].querySelectorAll('.n')[1].textContent).toBe('1');

    // voltar (botão) → histórico
    clickText('‹');
    expect(nav.route.page).toBe('history');

    // ranking: chips por modo, filtro por período
    clickText('Ranking', '.tab');
    expect(document.querySelectorAll('.chip').length).toBe(2); // Clássico, Rápido
    let trRows = [...document.querySelectorAll<HTMLElement>('.table .tr')];
    expect(trRows.length).toBe(2);
    // clássico: 1 vitória cada → desempate por % (igual) → colocação média (igual) → partidas (igual) → nome
    expect(trRows[0].textContent).toContain('Ana');
    clickText('Rápido', '.chip');
    trRows = [...document.querySelectorAll<HTMLElement>('.table .tr')];
    expect(trRows[0].textContent).toContain('Ana');
    expect(trRows[0].querySelectorAll('.n')[0].textContent).toBe('1');
    expect(trRows[1].querySelectorAll('.n')[0].textContent).toBe('0');
    // semana: só a partida rápida de hoje conta pro Rápido; no clássico, nenhuma nos últimos 7 dias? (3 dias atrás → conta)
    clickText('Semana', '.segb');
    expect(document.querySelectorAll('.table .tr').length).toBe(2);
    clickText('Clássico', '.chip');
    expect(document.querySelectorAll('.table .tr').length).toBe(2);

    // toca num jogador do ranking → detalhes
    (document.querySelector('.table .tr') as HTMLElement).click();
    flushSync();
    expect(nav.route.page).toBe('player');
    expect(text()).toContain('Ana');
    expect(text()).toContain('vitórias');
    // Ana: 4 partidas (3 ranqueadas + 1 sem contar), 2 vitórias, 2 capturas
    const vals = [...document.querySelectorAll<HTMLElement>('.stat .v')].map((e) => e.textContent);
    expect(vals[0]).toBe('2'); // vitórias
    expect(vals[1]).toBe('67%'); // 2 de 3 ranqueadas
    expect(vals[4]).toBe('2'); // peças comidas
    expect(vals[5]).toBe('1'); // peças perdidas
    expect(text()).toContain('4 partidas');
    expect(document.querySelectorAll('.list .row').length).toBe(4);

    // editar → excluir jogador
    clickText('Editar');
    expect(text()).toContain('Editar jogador');
    const origConfirm = window.confirm;
    window.confirm = () => true;
    clickText('Excluir jogador');
    window.confirm = origConfirm;
    expect(players.get(ana.id)).toBeUndefined();
    // volta pra tela de onde veio (ranking); o histórico continua com o nome antigo
    flushSync();
    expect(nav.depth).toBe(1);
    expect(nav.tab).toBe('ranking');
    expect(history.list.length).toBe(4);
    unmount(app);
  });

  it('gesto "voltar" do Android (popstate) fecha a tela de cima em vez de sair do app', async () => {
    const ana = players.create('Ana', '🦊');
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    expect(nav.depth).toBe(1);
    nav.switchTab('players');
    flushSync();
    nav.go({ page: 'player', id: ana.id });
    flushSync();
    expect(nav.depth).toBe(2);
    expect(text()).toContain('Editar');

    // simula o botão voltar do navegador
    window.history.back();
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
    expect(nav.depth).toBe(1);
    expect(nav.route.page).toBe('players');
    expect(nav.tab).toBe('players');
    unmount(app);
  });

  it('partida em andamento: abrir o app cai direto no tabuleiro e "Sair e salvar" volta pra home com "Continuar"', () => {
    const ana = players.create('Ana', '🦊');
    const bia = players.create('Bia', '🐼');
    match.start({
      rules: DEFAULT_RULES,
      players: [
        { color: 'green', playerId: ana.id, name: 'Ana', avatar: '🦊' },
        { color: 'red', playerId: bia.id, name: 'Bia', avatar: '🐼' },
      ],
    });
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    expect(nav.route.page).toBe('game');
    expect(document.querySelector('.dice')).toBeTruthy();
    (document.querySelector('.menu-btn') as HTMLElement).click();
    flushSync();
    clickText('Sair e salvar', '.row');
    expect(nav.route.page).toBe('home');
    expect(text()).toContain('Continuar partida');
    expect(text()).toContain('vez de');
    expect(document.querySelector('.tabbar')).toBeTruthy();
    // continuar volta pra partida
    clickText('Continuar partida');
    expect(nav.route.page).toBe('game');
    unmount(app);
  });

  it('ajustes: toggles persistem e "apagar tudo" limpa jogadores, histórico e partida', () => {
    players.create('Ana', '🦊');
    const app = mount(App, { target: document.getElementById('app')! });
    flushSync();
    clickText('Ajustes', '.tab');
    const toggles = [...document.querySelectorAll<HTMLInputElement>('.toggle input')];
    const sound = toggles[0];
    const ogSounds = toggles[1];
    expect(sound.checked).toBe(true);
    // switch "Sons do jogo original": independente do tema, persiste como soundPack
    expect(ogSounds.checked).toBe(false);
    ogSounds.click();
    flushSync();
    expect(settings.soundPack).toBe('og');
    expect(JSON.parse(localStorage.getItem('ludo.settings.v1')!).soundPack).toBe('og');
    expect(settings.theme).toBe('cream');
    ogSounds.click();
    flushSync();
    expect(settings.soundPack).toBe('default');

    sound.click();
    flushSync();
    expect(JSON.parse(localStorage.getItem('ludo.settings.v1')!).sound).toBe(false);
    expect(ogSounds.disabled).toBe(true); // sem sons, o pacote não importa

    clickText('Física real', '.opt');
    expect(JSON.parse(localStorage.getItem('ludo.settings.v1')!).diceMode).toBe('physics');

    const origConfirm = window.confirm;
    window.confirm = () => true;
    clickText('Apagar tudo', '.row');
    window.confirm = origConfirm;
    expect(players.list.length).toBe(0);
    expect(history.list.length).toBe(0);
    expect(text()).toContain('Tudo apagado');
    // ajustes voltam ao padrão
    expect(JSON.parse(localStorage.getItem('ludo.settings.v1')!).sound).toBe(true);
    unmount(app);
  });
});
