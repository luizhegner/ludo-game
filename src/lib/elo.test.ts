import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_RULES } from '../engine/game';
import type { Color, GameState, Mode } from '../engine/types';
import {
  ELO_INITIAL,
  ELO_K,
  calculateElo,
  changesForGame,
  deltaForGame,
  eloEvolution,
  eloStandings,
  expectedScore,
  participantsOf,
  ratingFor,
  roundedDelta,
  roundedRating,
} from './elo';

const player = (color: Color, id = color) => ({ color, playerId: id, name: id, avatar: '🙂' });

function game(
  id: string,
  mode: Mode = 'classic',
  order: Color[] = ['green', 'red'],
  at = Number(id.replace(/\D/g, '') || 1),
): GameState {
  const s = createGame({
    id,
    now: at - 10,
    rules: { ...DEFAULT_RULES, mode },
    players: order.map((color) => player(color)),
    first: order[0],
  });
  return { ...s, updatedAt: at, placements: order, endReason: 'finished', turn: { ...s.turn, phase: 'over' } };
}

describe('Elo derivado do histórico', () => {
  it('usa 0,5 para dois ratings iguais', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it('atualiza uma partida de dois jogadores com K 32', () => {
    const r = calculateElo([game('g1')], 'classic');
    expect(ratings(r, 'green')).toBe(1016);
    expect(ratings(r, 'red')).toBe(984);
  });

  it('é soma zero e o vencedor recebe delta positivo', () => {
    const r = calculateElo([game('g1')], 'classic');
    const c = r.changes;
    expect(c[0].delta + c[1].delta).toBeCloseTo(0);
    expect(c.find((x) => x.playerId === 'green')!.delta).toBeGreaterThan(0);
    expect(c.find((x) => x.playerId === 'red')!.delta).toBeLessThan(0);
  });

  it('recalcula as partidas em ordem cronológica, não na ordem do array', () => {
    const lateWinner = game('g2', 'classic', ['red', 'green'], 200);
    const earlyWinner = game('g1', 'classic', ['green', 'red'], 100);
    const a = calculateElo([lateWinner, earlyWinner], 'classic');
    const b = calculateElo([earlyWinner, lateWinner], 'classic');
    expect(a.ratingById).toEqual(b.ratingById);
    expect(a.games).toBe(2);
  });

  it('ignora partidas abandonadas e modos diferentes', () => {
    const abandoned = { ...game('g1'), placements: null, endReason: 'abandoned' as const };
    const other = game('g2', 'quick', ['green', 'red'], 2);
    const r = calculateElo([abandoned, other], 'classic');
    expect(r.games).toBe(0);
    expect(ratings(r, 'green')).toBe(ELO_INITIAL);
  });

  it('jogador sem partida começa em 1000', () => {
    expect(ratingFor([], 'nobody', 'classic')).toBe(ELO_INITIAL);
  });

  it('mantém o resultado determinístico quando há empate de rating', () => {
    const g = game('g1');
    const r = calculateElo([g], 'classic');
    // A expectativa de uma partida nasce em 0,5 quando os dois começam iguais.
    expect(expectedScore(ratings(r, 'green'), ratings(r, 'red'))).toBeGreaterThan(0.5);
    expect(ratings(r, 'green') + ratings(r, 'red')).toBe(2000);
  });

  it('compara todos os pares numa partida com quatro jogadores', () => {
    const r = calculateElo([game('g1', 'classic', ['green', 'red', 'blue', 'yellow'])], 'classic');
    expect(r.changes).toHaveLength(4);
    expect([...r.ratings.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(4000);
    expect(ratings(r, 'green')).toBeGreaterThan(ratings(r, 'red'));
    expect(ratings(r, 'red')).toBeGreaterThan(ratings(r, 'blue'));
  });

  it('expõe mudanças da partida e o delta individual', () => {
    const g = game('g1');
    const all = changesForGame([g], 'g1');
    expect(all).toHaveLength(2);
    expect(deltaForGame([g], 'g1', 'green')).toBe(16);
    expect(deltaForGame([g], 'missing', 'green')).toBe(0);
  });

  it('produz evolução começando no rating inicial', () => {
    const points = eloEvolution([game('g1', 'classic', ['green', 'red'], 10), game('g2', 'classic', ['red', 'green'], 20)], 'green', 'classic');
    expect(points[0]).toMatchObject({ rating: ELO_INITIAL, gameId: null });
    expect(points).toHaveLength(3);
    expect(points[2].rating).toBeCloseTo(998.53, 1);
  });

  it('calcula delta e partidas do período sem apagar o rating histórico', () => {
    const games = [game('g1', 'classic', ['green', 'red'], 100), game('g2', 'classic', ['red', 'green'], 200)];
    const rows = eloStandings(games, 'classic', 150);
    expect(rows.map((x) => x.playerId)).toEqual(['red', 'green']);
    expect(rows[0].periodGames).toBe(1);
    expect(rows[0].periodWins).toBe(1);
    expect(rows[0].rating).toBeGreaterThan(ELO_INITIAL);
    expect(rows[0].periodDelta).toBeGreaterThan(0);
  });

  it('ordena a classificação pelo Elo, depois pelos desempates', () => {
    const rows = eloStandings([game('g1')], 'classic');
    expect(rows[0].playerId).toBe('green');
    expect(rows[0].games).toBe(1);
    expect(rows[0].wins).toBe(1);
  });

  it('2v2 compara a média dos dois times e aplica o mesmo delta à dupla', () => {
    const g = game('g1', 'team', ['green', 'blue', 'red', 'yellow']);
    const r = calculateElo([g], 'team');
    expect(ratings(r, 'green')).toBe(ratings(r, 'blue'));
    expect(ratings(r, 'red')).toBe(ratings(r, 'yellow'));
    expect(ratings(r, 'green')).toBe(1016);
    expect(ratings(r, 'red')).toBe(984);
  });

  it('2v2 mantém os ratings de todos os participantes em soma zero', () => {
    const g = game('g1', 'team', ['red', 'yellow', 'green', 'blue']);
    const r = calculateElo([g], 'team');
    expect([...r.ratings.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(4000);
    expect(r.changes.every((c) => c.participants === 4)).toBe(true);
  });

  it('jogador adicionado no meio entra com 1000 e não herda Elo de outro', () => {
    const first = game('g1', 'classic', ['green', 'red'], 10);
    const second = game('g2', 'classic', ['blue', 'green'], 20);
    const r = calculateElo([first, second], 'classic');
    expect(r.changes.find((c) => c.playerId === 'blue')!.before).toBe(ELO_INITIAL);
    expect(ratings(r, 'blue')).toBeGreaterThan(ELO_INITIAL);
  });

  it('inclui jogador removido na última colocação', () => {
    const g = game('g1');
    g.players[1].status = 'removed';
    const ps = participantsOf(g);
    expect(ps.map((p) => p.playerId)).toEqual(['green', 'red']);
    expect(ps.find((p) => p.playerId === 'red')!.place).toBe(2);
  });

  it('substituído fica como participante separado e empatado em último', () => {
    const g = game('g1');
    g.players[1].playerId = 'caio';
    g.players[1].name = 'caio';
    g.substituted = [{ playerId: 'bia', name: 'bia', avatar: '🙂', color: 'red', leftAt: 15 }];
    const ps = participantsOf(g);
    expect(ps.map((p) => p.playerId)).toEqual(['green', 'caio', 'bia']);
    expect(ps.find((p) => p.playerId === 'bia')!.place).toBe(2);
  });

  it('preserva a ordem de entrada quando duas partidas têm o mesmo horário', () => {
    const first = game('g1', 'classic', ['green', 'red'], 100);
    const second = game('g2', 'classic', ['red', 'green'], 100);
    const r = calculateElo([second, first], 'classic');
    expect(r.changes.filter((c) => c.playerId === 'green').map((c) => c.gameId)).toEqual(['g2', 'g1']);
  });

  it('arredonda rating e delta apenas na apresentação', () => {
    expect(roundedRating(1000.49)).toBe(1000);
    expect(roundedRating(1000.5)).toBe(1001);
    expect(roundedDelta(-0.4)).toBe(0);
    expect(ELO_K).toBe(32);
  });
});

function ratings(replay: ReturnType<typeof calculateElo>, id: string): number {
  return replay.ratings.get(id) ?? ELO_INITIAL;
}
