// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { players, cleanName } from './players.svelte';
import { history } from './history.svelte';
import { settings, applySettings, DEFAULT_SETTINGS } from './settings.svelte';
import { loadSetup, saveSetup, clearSetup } from './setup.svelte';
import { createGame, DEFAULT_RULES, endGame, move, roll } from '../engine/game';
import { FINISH, type Color, type GameState } from '../engine/types';
import { makeBackup, parseBackup } from '../lib/backup';
import { standings, mostPlayedMode, modesPlayed, placeOf, winnerOf } from '../lib/stats';
import { timelineOf } from '../lib/timeline';

const P = (color: Color, id: string = color) => ({ color, playerId: id, name: id, avatar: '🙂' });

/** Partida de 2 terminada de verdade pelo motor (verde ganha), com log completo. */
function finishedGame(ids: [string, string] = ['ana', 'bia'], now = 1_000_000): GameState {
  let s = createGame({
    rules: DEFAULT_RULES,
    players: [P('green', ids[0]), P('red', ids[1])],
    seed: 7,
    first: 'green',
    now,
  });
  // coloca o verde a um passo de terminar tudo
  s = { ...s, pieces: { ...s.pieces, green: [FINISH, FINISH, FINISH, FINISH - 1] } };
  s = roll(s, 1, now + 1000);
  s = move(s, 3, now + 2000);
  expect(s.turn.phase).toBe('over');
  return s;
}

beforeEach(() => {
  localStorage.clear();
  players.replaceAll([]);
  history.clear();
  applySettings({}, true);
  clearSetup();
});

describe('cadastro de jogadores', () => {
  it('cria, edita, exclui e persiste', () => {
    const a = players.create('  Ana   Maria ', '🦊');
    expect(a.name).toBe('Ana Maria');
    expect(players.get(a.id)?.avatar).toBe('🦊');
    players.update(a.id, { name: 'Ana', avatar: '🐼' });
    expect(players.get(a.id)).toMatchObject({ name: 'Ana', avatar: '🐼' });
    expect(JSON.parse(localStorage.getItem('ludo.players.v1')!)[0].name).toBe('Ana');
    players.remove(a.id);
    expect(players.list.length).toBe(0);
  });

  it('nome vazio é rejeitado e nomes repetidos são detectados sem acento/caixa', () => {
    expect(() => players.create('   ', '🦊')).toThrow();
    players.create('João', '🦊');
    expect(players.nameTaken('joao')).toBe(true);
    expect(players.nameTaken('JOÃO ')).toBe(true);
    expect(players.nameTaken('Joana')).toBe(false);
  });

  it('limita o nome a 16 caracteres', () => {
    expect(cleanName('a'.repeat(30)).length).toBe(16);
  });

  it('resolve avatar/nome atuais por id e cai no fallback se foi excluído', () => {
    const a = players.create('Ana', '🦊');
    expect(players.nameOf(a.id, 'antigo')).toBe('Ana');
    players.remove(a.id);
    expect(players.nameOf(a.id, 'antigo')).toBe('antigo');
    expect(players.avatarOf(a.id, '🐸')).toBe('🐸');
    // foto de alguém excluído não é usada como fallback (não temos mais o arquivo)
    expect(players.avatarOf(a.id, 'data:image/jpeg;base64,xxx')).toBe('🙂');
  });
});

describe('histórico', () => {
  it('só arquiva partidas encerradas, idempotente, mais recente primeiro', () => {
    const running = createGame({ rules: DEFAULT_RULES, players: [P('green'), P('red')], seed: 1, now: 5 });
    history.add(running);
    expect(history.list.length).toBe(0);

    const g1 = finishedGame(['ana', 'bia'], 1000);
    const g2 = finishedGame(['ana', 'caio'], 2000);
    history.add(g1);
    history.add(g2);
    history.add(g1);
    expect(history.list.map((g) => g.id)).toEqual([g2.id, g1.id]);
    expect(JSON.parse(localStorage.getItem('ludo.history.v1')!).length).toBe(2);
  });

  it('troca fotos por emoji ao arquivar', () => {
    const g = finishedGame();
    g.players[0].avatar = 'data:image/jpeg;base64,AAAA';
    history.add(g);
    expect(history.list[0].players[0].avatar).toBe('🙂');
  });

  it('estatísticas por jogador: vitórias, sequência, colocação média', () => {
    history.add(finishedGame(['ana', 'bia'], 1000));
    history.add(finishedGame(['ana', 'bia'], 2000));
    history.add(finishedGame(['bia', 'ana'], 3000)); // bia (verde) ganha
    const ana = history.statsFor('ana');
    expect(ana.games).toBe(3);
    expect(ana.wins).toBe(2);
    expect(ana.bestStreak).toBe(2);
    expect(ana.streak).toBe(0);
    expect(ana.placeSum / ana.ranked).toBeCloseTo((1 + 1 + 2) / 3);
    const bia = history.statsFor('bia');
    expect(bia.wins).toBe(1);
    expect(bia.streak).toBe(1);
  });

  it('partida encerrada sem contar entra no histórico mas não nas estatísticas ranqueadas', () => {
    const s = createGame({ rules: DEFAULT_RULES, players: [P('green', 'ana'), P('red', 'bia')], seed: 1, now: 10 });
    history.add(endGame(s, false, 20));
    expect(history.list.length).toBe(1);
    const st = history.statsFor('ana');
    expect(st.games).toBe(1);
    expect(st.ranked).toBe(0);
    expect(placeOf(history.list[0], 'green')).toBeNull();
    expect(winnerOf(history.list[0])).toBeUndefined();
  });
});

describe('classificação (stats.ts)', () => {
  it('ordena por vitórias, filtra por modo e período', () => {
    const g1 = finishedGame(['ana', 'bia'], 1000);
    const g2 = finishedGame(['ana', 'bia'], 2000);
    const g3 = finishedGame(['bia', 'ana'], 3000);
    const quick = { ...finishedGame(['caio', 'ana'], 4000), rules: { ...DEFAULT_RULES, mode: 'quick' as const } };
    const all = [g1, g2, g3, quick];

    const classic = standings(all, 'classic');
    expect(classic.map((s) => [s.playerId, s.wins, s.games])).toEqual([
      ['ana', 2, 3],
      ['bia', 1, 3],
    ]);
    expect(standings(all, 'quick').map((s) => s.playerId)).toEqual(['caio', 'ana']);
    // período: updatedAt = now + 2000 → g1=3000, g2=4000, g3=5000; corte em 4500 pega só g3
    expect(standings(all, 'classic', 4500).map((s) => [s.playerId, s.wins])).toEqual([
      ['bia', 1],
      ['ana', 0],
    ]);
    expect(mostPlayedMode(all)).toBe('classic');
    expect(modesPlayed(all).sort()).toEqual(['classic', 'quick']);
  });
});

describe('linha do tempo', () => {
  it('descreve os marcos da partida em ordem, com horário', () => {
    const g = finishedGame(['ana', 'bia']);
    const items = timelineOf(g, (c) => (c === 'green' ? 'Ana' : 'Bia'));
    expect(items[0].text).toContain('Ana joga primeiro');
    expect(items.some((i) => i.text === 'Ana colocou uma peça no centro')).toBe(true);
    expect(items.some((i) => i.text === 'Ana terminou em 1º')).toBe(true);
    expect(items[items.length - 1].text).toContain('Ana venceu');
    for (let i = 1; i < items.length; i++) expect(items[i].t).toBeGreaterThanOrEqual(items[i - 1].t);
  });
});

describe('ajustes', () => {
  it('aplica parcial, ignora lixo e volta ao padrão', () => {
    applySettings({ sound: false, diceMode: 'physics', autoMove: 'sim' as unknown as boolean });
    expect(settings.sound).toBe(false);
    expect(settings.diceMode).toBe('physics');
    expect(settings.autoMove).toBe(true);
    applySettings({}, true);
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('última configuração de partida', () => {
  it('salva e recarrega, com padrão seguro', () => {
    expect(loadSetup().mode).toBe('classic');
    saveSetup({ mode: 'quick', slots: { green: 'a', red: 'b', blue: null, yellow: null }, captureBonus: true });
    const s = loadSetup();
    expect(s.mode).toBe('quick');
    expect(s.slots.green).toBe('a');
    expect(s.captureBonus).toBe(true);
    clearSetup();
    expect(loadSetup().slots.green).toBeNull();
  });
});

describe('backup JSON', () => {
  it('exporta e reimporta jogadores, histórico e ajustes', () => {
    const a = players.create('Ana', '🦊');
    history.add(finishedGame([a.id, 'bia']));
    applySettings({ sound: false });
    const b = makeBackup(players.list, history.list, settings, 123);
    const text = JSON.stringify(b);

    players.replaceAll([]);
    history.clear();
    applySettings({}, true);

    const parsed = parseBackup(text);
    expect(parsed.exportedAt).toBe(123);
    players.replaceAll(parsed.players);
    history.replaceAll(parsed.history);
    applySettings(parsed.settings ?? {});
    expect(players.list[0].name).toBe('Ana');
    expect(history.list.length).toBe(1);
    expect(settings.sound).toBe(false);
  });

  it('rejeita arquivos inválidos com mensagem legível', () => {
    expect(() => parseBackup('{')).toThrow(/JSON/);
    expect(() => parseBackup('{"app":"outro"}')).toThrow(/backup do Ludo/);
    expect(() => parseBackup('{"app":"ludo","version":99}')).toThrow(/versão mais nova/);
    // entradas estragadas são descartadas em vez de quebrar
    const p = parseBackup('{"app":"ludo","version":1,"players":[{"id":"x"},{"id":"y","name":"Y","avatar":"🙂"}],"history":[{}]}');
    expect(p.players.map((x) => x.id)).toEqual(['y']);
    expect(p.history).toEqual([]);
  });
});
