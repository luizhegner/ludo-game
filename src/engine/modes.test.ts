/** Fase 4 — modos 5 Minutos e 2v2 (com e sem poderes). */
import { describe, expect, it } from 'vitest';
import {
  computePlacements,
  controllerOf,
  createGame,
  currentPlayer,
  DEFAULT_RULES,
  elapsedMs,
  isPlayable,
  isTimeUp,
  legalMoves,
  move,
  nextColor,
  pauseClock,
  piecesColorFor,
  remainingMs,
  removePlayer,
  roll,
  startClock,
  timeUp,
} from './game';
import { partnerOf, sameSide } from './powers';
import { BASE, FINISH, type Color, type GameState, type Rules } from './types';
import { toAbsolute } from './board';

const P = (color: Color) => ({ color, playerId: color, name: color, avatar: '🙂' });
const ALL: Color[] = ['green', 'red', 'blue', 'yellow'];

function game(rules: Partial<Rules>, colors: Color[] = ALL, first: Color = 'green', now = 0) {
  return createGame({ rules: { ...DEFAULT_RULES, ...rules }, players: colors.map(P), seed: 1, first, now });
}
function withPieces(s: GameState, pieces: Partial<Record<Color, number[]>>): GameState {
  const c = structuredClone(s);
  for (const k of Object.keys(pieces) as Color[]) c.pieces[k] = [...pieces[k]!];
  return c;
}
/** Sequência de eventos novos desde `before`. */
const fresh = (before: GameState, after: GameState) => after.log.slice(before.log.length);

// ---------------------------------------------------------------------------
describe('5 Minutos', () => {
  it('todas as peças começam fora, empilhadas na saída; cronômetro parado até o primeiro lançamento', () => {
    const g = game({ mode: 'fiveMin' });
    for (const c of ALL) expect(g.pieces[c]).toEqual([0, 0, 0, 0]);
    expect(g.clock).toEqual({ elapsedMs: 0, runningSince: null });
    expect(g.rules.durationMs).toBe(300_000);
    expect(remainingMs(g, 999_999)).toBe(300_000);
    expect(isTimeUp(g, 999_999)).toBe(false);
  });

  it('qualquer número move (não precisa de 6 pra sair); 6 continua dando jogada extra', () => {
    const g = game({ mode: 'fiveMin' });
    expect(legalMoves(g, 'green', 1)).toEqual([0, 1, 2, 3]);
    const a = roll(g, 3, 1000);
    expect(a.turn.phase).toBe('move');
    expect(a.clock!.runningSince).toBe(1000);
    const b = move(a, 0, 1500);
    expect(b.pieces.green[0]).toBe(3);
    expect(b.turn.color).toBe('red');
  });

  it('o relógio conta só enquanto corre; pausa e retomada não perdem tempo', () => {
    const g = roll(game({ mode: 'fiveMin' }), 2, 1000);
    expect(elapsedMs(g, 4000)).toBe(3000);
    const p = pauseClock(g, 4000);
    expect(p.clock).toEqual({ elapsedMs: 3000, runningSince: null });
    expect(elapsedMs(p, 50_000)).toBe(3000); // parado
    const r = startClock(p, 60_000);
    expect(elapsedMs(r, 61_000)).toBe(4000);
    expect(remainingMs(r, 61_000)).toBe(296_000);
  });

  it('cada lançamento rebaseia o relógio (fechar o app perde no máximo o trecho desde o último)', () => {
    const g = roll(game({ mode: 'fiveMin' }), 2, 1000);
    const m = move(g, 0, 1200);
    const r2 = roll(m, 4, 10_000);
    expect(r2.clock).toEqual({ elapsedMs: 9000, runningSince: 10_000 });
  });

  it('acabou o tempo: rolar é proibido, timeUp fecha com colocação por peças no centro e depois progresso', () => {
    let g = roll(game({ mode: 'fiveMin', durationMs: 10_000 }), 2, 0);
    g = move(g, 0, 100); // verde: peça 0 em 2
    // arruma um cenário claro
    g = withPieces(g, {
      green: [FINISH, 5, 0, 0], // 1 no centro
      red: [FINISH, FINISH, 0, 0], // 2 no centro → 1º
      blue: [30, 30, 30, 0], // 0 no centro, muito progresso → 3º
      yellow: [FINISH, 40, 0, 0], // 1 no centro, mais progresso que o verde → 2º
    });
    expect(isTimeUp(g, 9_999)).toBe(false);
    expect(timeUp(g, 9_999)).toBe(g); // ainda não
    expect(isTimeUp(g, 10_000)).toBe(true);
    expect(() => roll(g, 1, 10_000)).toThrow(/tempo/);
    const over = timeUp(g, 10_000);
    expect(over.turn.phase).toBe('over');
    expect(over.endReason).toBe('time');
    expect(over.placements).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(over.clock).toEqual({ elapsedMs: 10_000, runningSince: null });
    expect(over.log.at(-1)).toMatchObject({ type: 'gameOver', reason: 'time' });
    expect(timeUp(over, 20_000)).toBe(over); // idempotente
  });

  it('se alguém colocar as 4 antes do tempo, a partida segue até sobrar um (ou acabar o tempo)', () => {
    let g = game({ mode: 'fiveMin' }, ['green', 'red']);
    g = withPieces(roll(g, 1, 0), { green: [FINISH, FINISH, FINISH, 55] });
    const a = move(g, 3, 10);
    expect(a.finished).toEqual(['green']);
    expect(a.turn.phase).toBe('over'); // com 2 jogadores, sobrou um
    expect(a.endReason).toBe('finished');
    expect(a.placements).toEqual(['green', 'red']);
  });

  it('modos sem cronômetro não têm clock e nunca "esgotam"', () => {
    const g = game({ mode: 'classic' });
    expect(g.clock).toBeUndefined();
    expect(remainingMs(g, 1e12)).toBe(Infinity);
    expect(isTimeUp(g, 1e12)).toBe(false);
    expect(timeUp(g, 1e12)).toBe(g);
  });
});

// ---------------------------------------------------------------------------
describe('2v2', () => {
  it('precisa de exatamente 4 jogadores; duplas são verde+azul × vermelho+amarelo', () => {
    expect(() => game({ mode: 'team' }, ['green', 'red', 'blue'])).toThrow(/4 jogadores/);
    const g = game({ mode: 'team' });
    expect(partnerOf('green')).toBe('blue');
    expect(partnerOf('yellow')).toBe('red');
    expect(sameSide(g, 'green', 'blue')).toBe(true);
    expect(sameSide(g, 'green', 'red')).toBe(false);
    expect(sameSide(game({ mode: 'classic' }), 'green', 'blue')).toBe(false);
  });

  it('cair na casa do parceiro come normalmente (azar): ele volta pra base, mas não conta captura nem dá bônus', () => {
    let g = game({ mode: 'team', captureBonus: true });
    // verde em rel 5 (abs 5); azul precisa estar no abs 5: rel = 5 - 26 = -21 → 31
    g = withPieces(g, { green: [2, BASE, BASE, BASE], blue: [(5 - 26 + 52) % 52, BASE, BASE, BASE] });
    expect(toAbsolute('blue', g.pieces.blue[0])).toBe(5);
    const a = move(roll(g, 3), 0);
    expect(a.pieces.blue[0]).toBe(BASE);
    expect(a.pieces.green[0]).toBe(5);
    const cap = fresh(g, a).find((e) => e.type === 'capture');
    expect(cap).toMatchObject({ by: 'green', victim: 'blue' });
    expect(a.players.find((p) => p.color === 'green')!.stats.captures).toBe(0);
    expect(a.players.find((p) => p.color === 'blue')!.stats.deaths).toBe(1);
    expect(a.turn.color).toBe('red'); // sem jogada extra por "comer" o parceiro
  });

  it('comer adversário conta captura normalmente', () => {
    let g = game({ mode: 'team', captureBonus: true });
    g = withPieces(g, { green: [2, BASE, BASE, BASE], red: [(5 - 13 + 52) % 52, BASE, BASE, BASE] });
    const a = move(roll(g, 3), 0);
    expect(a.pieces.red[0]).toBe(BASE);
    expect(a.players.find((p) => p.color === 'green')!.stats.captures).toBe(1);
    expect(a.turn.color).toBe('green'); // bônus de captura
  });

  it('fogo NÃO queima o parceiro ao passar por cima, mas queima adversário', () => {
    let g = game({ mode: 'teamPowers', disabledPowers: [] });
    g = structuredClone(g);
    g.powers!.cells = [];
    g.powers!.effects.green = [{ fire: 2 }];
    // verde em 2 vai andar 4 (passa por 3, 4, 5, para em 6). azul em abs 4, vermelho em abs 5 (nenhuma segura)
    g = withPieces(g, {
      green: [2, BASE, BASE, BASE],
      blue: [(4 - 26 + 52) % 52, BASE, BASE, BASE],
      red: [(5 - 13 + 52) % 52, BASE, BASE, BASE],
    });
    const a = move(roll(g, 4), 0);
    expect(a.pieces.blue[0]).not.toBe(BASE); // parceiro poupado
    expect(a.pieces.red[0]).toBe(BASE); // adversário queimado
    expect(fresh(g, a).some((e) => e.type === 'capture' && e.how === 'fire' && e.victim === 'red')).toBe(true);
  });

  it('a dupla vence quando as 8 peças estão no centro; colocação 1º/2º pra dupla vencedora', () => {
    let g = game({ mode: 'team' });
    g = withPieces(g, {
      green: [FINISH, FINISH, FINISH, 55],
      blue: [FINISH, FINISH, FINISH, FINISH],
      red: [FINISH, 10, 3, BASE],
      yellow: [20, 20, BASE, BASE],
    });
    g = structuredClone(g);
    g.finished = ['blue'];
    const a = move(roll(g, 1), 3);
    expect(a.turn.phase).toBe('over');
    expect(a.endReason).toBe('finished');
    // dupla A: azul terminou primeiro mas o verde tem a mesma pontuação (4 no centro) → ordem por score, depois cor
    expect(a.placements!.slice(0, 2).sort()).toEqual(['blue', 'green']);
    // dupla B: vermelho (1 no centro) na frente do amarelo
    expect(a.placements!.slice(2)).toEqual(['red', 'yellow']);
  });

  it('só uma peça no centro NÃO encerra nada; quem termina as 4 continua jogando com as peças do parceiro', () => {
    let g = game({ mode: 'team' });
    g = withPieces(g, { green: [FINISH, FINISH, FINISH, 55], blue: [10, 12, BASE, BASE] });
    const a = move(roll(g, 1), 3);
    expect(a.turn.phase).not.toBe('over');
    expect(a.finished).toEqual(['green']);
    // verde continua na rotação
    expect(isPlayable(a, 'green')).toBe(true);
    expect(piecesColorFor(a, 'green')).toBe('blue');
    // a vez volta pro verde depois do amarelo (verde teve jogada extra por chegar ao centro)
    expect(a.turn.color).toBe('green');
    const b = roll(a, 2);
    expect(b.turn.legal).toEqual([0, 1]); // peças do azul
    const c = move(b, 1);
    expect(c.pieces.blue[1]).toBe(14);
    expect(c.pieces.green).toEqual([FINISH, FINISH, FINISH, FINISH]);
    expect(c.turn.color).toBe('red');
  });

  it('ao passar a vez pra quem joga pelo parceiro, o log registra partnerTurn', () => {
    let g = game({ mode: 'team' }, ALL, 'yellow');
    g = structuredClone(g);
    g.pieces.green = [FINISH, FINISH, FINISH, FINISH];
    g.finished = ['green'];
    g.pieces.yellow = [5, BASE, BASE, BASE];
    const a = move(roll(g, 2), 0); // amarelo joga; a vez vai pro verde (que joga pelo azul)
    expect(a.turn.color).toBe('green');
    expect(a.log.at(-1)).toMatchObject({ type: 'partnerTurn', color: 'green', forPartner: 'blue' });
  });

  it('jogador removido: o parceiro assume as peças dele (ficam no tabuleiro) e quem saiu é último', () => {
    let g = game({ mode: 'team' });
    g = withPieces(g, { green: [10, BASE, BASE, BASE], blue: [20, BASE, BASE, BASE] });
    const a = removePlayer(g, 'blue', 500);
    expect(a.pieces.blue).toEqual([20, BASE, BASE, BASE]); // não voltaram pra base
    expect(a.turn.phase).not.toBe('over');
    // na vez do azul, quem controla é o verde
    expect(isPlayable(a, 'blue')).toBe(true);
    expect(controllerOf(a, 'blue')).toBe('green');
    expect(nextColor(a, 'red')).toBe('blue');
    // pula direto pra vez do azul
    const b = structuredClone(a);
    b.turn = { ...b.turn, color: 'blue', phase: 'roll', dice: null, legal: [], sixStreak: 0, lastMoved: null };
    expect(currentPlayer(b)!.color).toBe('green');
    const c = roll(b, 3);
    expect(c.turn.legal).toEqual([0]); // peça do azul
    const d = move(c, 0);
    expect(d.pieces.blue[0]).toBe(23);
    // colocação: azul (removido) por último dentro da dupla e a dupla toda pelo score
    const pl = computePlacements(d);
    expect(pl.indexOf('blue')).toBeGreaterThan(pl.indexOf('green'));
  });

  it('se a dupla inteira sai, a outra vence na hora', () => {
    const g = game({ mode: 'team' });
    const a = removePlayer(removePlayer(g, 'green'), 'blue');
    expect(a.turn.phase).toBe('over');
    expect(a.placements!.slice(0, 2).sort()).toEqual(['red', 'yellow']);
  });

  it('2v2 Poderes: mega bomba pega o parceiro (vira "lost", não captura)', () => {
    let g = game({ mode: 'teamPowers' });
    g = structuredClone(g);
    g.powers!.cells = [{ abs: 5, power: 'megaBomb' }];
    g = withPieces(g, {
      green: [2, BASE, BASE, BASE],
      blue: [(6 - 26 + 52) % 52, BASE, BASE, BASE], // abs 6, raio 1
      red: [(7 - 13 + 52) % 52, BASE, BASE, BASE], // abs 7, raio 2
    });
    const a = move(roll(g, 3), 0);
    expect(a.pieces.blue[0]).toBe(BASE);
    expect(a.pieces.red[0]).toBe(BASE);
    const ev = fresh(g, a);
    expect(ev.some((e) => e.type === 'lost' && e.color === 'blue')).toBe(true);
    expect(ev.some((e) => e.type === 'capture' && e.victim === 'red')).toBe(true);
    expect(a.players.find((p) => p.color === 'green')!.stats.captures).toBe(1);
  });
});
