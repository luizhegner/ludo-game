import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  computePlacements,
  createGame,
  DEFAULT_RULES,
  endGame,
  legalMoves,
  move,
  nextColor,
  pausePlayer,
  removePlayer,
  resumePlayer,
  roll,
  substitutePlayer,
} from './game';
import { BASE, FINISH, HOME_START, type Color, type GameState, type Rules } from './types';
import { isSafe, RING_CELLS, SAFE_ABS, STAR_ABS, START_OFFSET, toAbsolute } from './board';

const P = (color: Color) => ({ color, playerId: color, name: color, avatar: '🙂' });

function game(colors: Color[] = ['green', 'red', 'blue', 'yellow'], rules: Partial<Rules> = {}, first: Color = 'green') {
  return createGame({ rules: { ...DEFAULT_RULES, ...rules }, players: colors.map(P), seed: 1, first, now: 0 });
}

/** Helper de teste: coloca peças onde quiser. */
function withPieces(s: GameState, pieces: Partial<Record<Color, number[]>>): GameState {
  const c = structuredClone(s);
  for (const k of Object.keys(pieces) as Color[]) c.pieces[k] = [...pieces[k]!];
  return c;
}

describe('tabuleiro', () => {
  it('anel tem 52 casas únicas', () => {
    const keys = new Set(RING_CELLS.map((c) => `${c.row},${c.col}`));
    expect(keys.size).toBe(52);
  });

  it('casas de saída ficam nas células esperadas', () => {
    expect(RING_CELLS[START_OFFSET.green]).toEqual({ row: 6, col: 1 });
    expect(RING_CELLS[START_OFFSET.red]).toEqual({ row: 1, col: 8 });
    expect(RING_CELLS[START_OFFSET.blue]).toEqual({ row: 8, col: 13 });
    expect(RING_CELLS[START_OFFSET.yellow]).toEqual({ row: 13, col: 6 });
  });

  it('8 casas seguras: saídas + estrelas', () => {
    expect(SAFE_ABS.size).toBe(8);
    for (const c of ['green', 'red', 'blue', 'yellow'] as Color[]) {
      expect(SAFE_ABS.has(START_OFFSET[c])).toBe(true);
      expect(SAFE_ABS.has(STAR_ABS[c])).toBe(true);
    }
  });

  it('posição relativa converte pra absoluta com deslocamento da cor', () => {
    expect(toAbsolute('green', 0)).toBe(0);
    expect(toAbsolute('red', 0)).toBe(13);
    expect(toAbsolute('yellow', 20)).toBe((39 + 20) % 52);
    expect(isSafe('red', 0)).toBe(true);
    expect(isSafe('red', 8)).toBe(true);
    expect(isSafe('red', 1)).toBe(false);
  });
});

describe('criação', () => {
  it('exige 2+ jogadores com cores distintas', () => {
    expect(() => createGame({ rules: DEFAULT_RULES, players: [P('green')] })).toThrow();
    expect(() => createGame({ rules: DEFAULT_RULES, players: [P('green'), P('green')] })).toThrow();
  });

  it('ordena jogadores em sentido horário independente da entrada', () => {
    const s = createGame({ rules: DEFAULT_RULES, players: [P('yellow'), P('green'), P('blue')], seed: 1 });
    expect(s.players.map((p) => p.color)).toEqual(['green', 'blue', 'yellow']);
  });

  it('sorteia quem começa de forma determinística pela semente', () => {
    const a = createGame({ rules: DEFAULT_RULES, players: [P('green'), P('red')], seed: 42 });
    const b = createGame({ rules: DEFAULT_RULES, players: [P('green'), P('red')], seed: 42 });
    expect(a.turn.color).toBe(b.turn.color);
    expect(a.log[0]).toMatchObject({ type: 'start', first: a.turn.color });
  });
});

describe('sair da base e turnos', () => {
  it('sem 6 nenhuma peça sai; a vez passa sozinha', () => {
    const s = roll(game(), 3);
    expect(s.turn.color).toBe('red');
    expect(s.turn.phase).toBe('roll');
    expect(s.log.some((e) => e.type === 'noMoves')).toBe(true);
  });

  it('com 6 pode sair e joga de novo', () => {
    let s = roll(game(), 6);
    expect(s.turn.phase).toBe('move');
    expect(s.turn.legal).toEqual([0, 1, 2, 3]);
    s = move(s, 0);
    expect(s.pieces.green[0]).toBe(0);
    expect(s.turn.color).toBe('green');
    expect(s.turn.phase).toBe('roll');
    expect(s.turn.sixStreak).toBe(1);
  });

  it('6 sem jogada possível ainda dá outra rolagem', () => {
    // todas as peças no centro menos uma a 3 casas do fim: 6 não serve pra nada
    let s = withPieces(game(), { green: [FINISH, FINISH, FINISH, FINISH - 3] });
    s = roll(s, 6);
    expect(s.turn.color).toBe('green');
    expect(s.turn.phase).toBe('roll');
  });

  it('não mutou o estado anterior', () => {
    const s0 = game();
    const s1 = roll(s0, 6);
    expect(s0.turn.phase).toBe('roll');
    expect(s0.turn.dice).toBeNull();
    expect(s1.turn.dice).toBe(6);
  });

  it('a ordem é horária e pula quem não está na partida', () => {
    const s = game(['green', 'blue']);
    expect(nextColor(s, 'green')).toBe('blue');
    expect(nextColor(s, 'blue')).toBe('green');
  });

  it('movimento ilegal é rejeitado', () => {
    const s = roll(game(), 4);
    expect(() => move(s, 0)).toThrow();
  });
});

describe('três 6 seguidos', () => {
  it('no terceiro 6 a última peça movida volta pra base e perde a vez', () => {
    let s = game();
    s = roll(s, 6);
    s = move(s, 0); // peça 0 sai → 0
    s = roll(s, 6);
    s = move(s, 0); // peça 0 → 6
    expect(s.pieces.green[0]).toBe(6);
    s = roll(s, 6); // terceiro 6
    expect(s.pieces.green[0]).toBe(BASE);
    expect(s.turn.color).toBe('red');
    expect(s.log.at(-2)).toMatchObject({ type: 'threeSixes', color: 'green', piece: 0 });
  });

  it('a sequência zera quando sai um número diferente de 6', () => {
    let s = game();
    s = roll(s, 6);
    s = move(s, 0);
    s = roll(s, 2);
    s = move(s, 0); // vez passa
    expect(s.turn.color).toBe('red');
    expect(s.turn.sixStreak).toBe(0);
  });
});

describe('captura', () => {
  it('cair em adversário em casa comum manda ele pra base', () => {
    // vermelho está na casa absoluta 20 → relativa ao vermelho = 7
    let s = withPieces(game(), { green: [15, BASE, BASE, BASE], red: [7, BASE, BASE, BASE] });
    s = roll(s, 5); // verde 15 → 20 (absoluta 20)
    s = move(s, 0);
    expect(s.pieces.red[0]).toBe(BASE);
    expect(s.players[0].stats.captures).toBe(1);
    expect(s.players[1].stats.deaths).toBe(1);
    expect(s.log.some((e) => e.type === 'capture')).toBe(true);
    // sem bônus, a vez passa
    expect(s.turn.color).toBe('red');
  });

  it('não come em casa segura (estrela e saída)', () => {
    // estrela do verde é a absoluta 8; vermelho lá = relativa (8-13+52)%52 = 47
    let s = withPieces(game(), { green: [3, BASE, BASE, BASE], red: [47, BASE, BASE, BASE] });
    s = roll(s, 5);
    s = move(s, 0);
    expect(s.pieces.red[0]).toBe(47);
    // saída do vermelho (abs 13) com verde chegando: relativa do verde = 13
    s = withPieces(game(), { green: [10, BASE, BASE, BASE], red: [0, BASE, BASE, BASE] });
    s = roll(s, 3);
    s = move(s, 0);
    expect(s.pieces.red[0]).toBe(0);
  });

  it('come todas as adversárias empilhadas na casa', () => {
    let s = withPieces(game(), { green: [15, BASE, BASE, BASE], red: [7, 7, BASE, BASE] });
    s = roll(s, 5);
    s = move(s, 0);
    expect(s.pieces.red).toEqual([BASE, BASE, BASE, BASE]);
    expect(s.players[0].stats.captures).toBe(2);
  });

  it('não come a própria cor', () => {
    let s = withPieces(game(), { green: [15, 20, BASE, BASE] });
    s = roll(s, 5);
    s = move(s, 0);
    expect(s.pieces.green).toEqual([20, 20, BASE, BASE]);
  });

  it('com bônus de captura ligado, joga de novo', () => {
    let s = withPieces(game(undefined, { captureBonus: true }), { green: [15, BASE, BASE, BASE], red: [7, BASE, BASE, BASE] });
    s = roll(s, 5);
    s = move(s, 0);
    expect(s.turn.color).toBe('green');
    expect(s.turn.phase).toBe('roll');
  });

  it('não captura na reta final (posições relativas iguais não colidem)', () => {
    let s = withPieces(game(), { green: [HOME_START, BASE, BASE, BASE], red: [HOME_START + 2, BASE, BASE, BASE] });
    s = roll(s, 2);
    s = move(s, 0);
    expect(s.pieces.red[0]).toBe(HOME_START + 2);
  });
});

describe('reta final e chegada', () => {
  it('precisa de número exato pra chegar ao centro', () => {
    const s = withPieces(game(), { green: [FINISH - 2, BASE, BASE, BASE] });
    expect(legalMoves(s, 'green', 2)).toEqual([0]);
    expect(legalMoves(s, 'green', 3)).toEqual([]);
    expect(legalMoves(s, 'green', 1)).toEqual([0]);
  });

  it('peça no centro não move mais', () => {
    const s = withPieces(game(), { green: [FINISH, 10, BASE, BASE] });
    expect(legalMoves(s, 'green', 4)).toEqual([1]);
  });

  it('jogador que coloca as 4 no centro é marcado como terminado e sai da rotação', () => {
    let s = withPieces(game(), { green: [FINISH, FINISH, FINISH, FINISH - 1] });
    s = roll(s, 1);
    s = move(s, 3);
    expect(s.finished).toEqual(['green']);
    expect(s.turn.color).toBe('red');
    // ...e não volta a receber a vez
    s = roll(s, 2);
    expect(s.turn.color).toBe('blue');
    s = roll(s, 2);
    expect(s.turn.color).toBe('yellow');
    s = roll(s, 2);
    expect(s.turn.color).toBe('red');
  });

  it('colocar uma peça no centro dá jogada extra', () => {
    let s = withPieces(game(), { green: [FINISH - 3, 10, BASE, BASE] });
    s = roll(s, 3);
    s = move(s, 0);
    expect(s.pieces.green[0]).toBe(FINISH);
    expect(s.turn.color).toBe('green');
    expect(s.turn.phase).toBe('roll');
    expect(s.turn.sixStreak).toBe(0); // não foi 6: a contagem dos três 6 não mexe
    // e a jogada extra é normal: pode mover qualquer peça
    s = roll(s, 4);
    expect(s.turn.legal).toEqual([1]);
  });

  it('terminar as 4 peças não dá jogada extra (o jogador saiu da rotação)', () => {
    let s = withPieces(game(), { green: [FINISH, FINISH, FINISH, FINISH - 6] });
    s = roll(s, 6);
    s = move(s, 3);
    expect(s.finished).toEqual(['green']);
    expect(s.turn.color).toBe('red');
  });
});

describe('fim de partida', () => {
  it('com 2 jogadores acaba quando o primeiro termina', () => {
    let s = withPieces(game(['green', 'red']), { green: [FINISH, FINISH, FINISH, FINISH - 1] });
    s = roll(s, 1);
    s = move(s, 3);
    expect(s.turn.phase).toBe('over');
    expect(s.placements).toEqual(['green', 'red']);
    expect(s.endReason).toBe('finished');
  });

  it('com 4 jogadores continua até sobrar um; colocações na ordem de chegada', () => {
    let s = withPieces(game(), {
      green: [FINISH, FINISH, FINISH, FINISH - 1],
      red: [FINISH, FINISH, FINISH, FINISH - 1],
      blue: [FINISH, FINISH, FINISH, FINISH - 1],
      yellow: [0, BASE, BASE, BASE],
    });
    s = roll(s, 1); s = move(s, 3); // verde termina
    expect(s.turn.phase).not.toBe('over');
    s = roll(s, 1); s = move(s, 3); // vermelho termina
    expect(s.turn.phase).not.toBe('over');
    s = roll(s, 1); s = move(s, 3); // azul termina → sobrou só o amarelo
    expect(s.turn.phase).toBe('over');
    expect(s.placements).toEqual(['green', 'red', 'blue', 'yellow']);
  });

  it('encerrar ranqueando usa progresso (peças no centro primeiro, depois distância)', () => {
    let s = withPieces(game(), {
      green: [5, BASE, BASE, BASE],
      red: [FINISH, BASE, BASE, BASE],
      blue: [30, 30, BASE, BASE],
      yellow: [BASE, BASE, BASE, BASE],
    });
    s = endGame(s, true);
    expect(s.endReason).toBe('ranked');
    expect(s.placements).toEqual(['red', 'blue', 'green', 'yellow']);
  });

  it('encerrar sem contar não gera colocações', () => {
    const s = endGame(game(), false);
    expect(s.endReason).toBe('abandoned');
    expect(s.placements).toBeNull();
    expect(s.turn.phase).toBe('over');
  });

  it('não dá pra rolar depois de acabar', () => {
    const s = endGame(game(), false);
    expect(() => roll(s, 6)).toThrow();
  });
});

describe('jogadores durante a partida', () => {
  it('adicionar em cor livre começa da base e entra na rotação horária', () => {
    let s = game(['green', 'blue']);
    s = addPlayer(s, P('red'));
    expect(s.players.map((p) => p.color)).toEqual(['green', 'red', 'blue']);
    expect(s.pieces.red).toEqual([BASE, BASE, BASE, BASE]);
    expect(nextColor(s, 'green')).toBe('red');
    expect(() => addPlayer(s, P('red'))).toThrow();
  });

  it('remover tira as peças, passa a vez se era dele e ele fica em último', () => {
    let s = withPieces(game(), { green: [20, BASE, BASE, BASE] });
    s = removePlayer(s, 'green');
    expect(s.players[0].status).toBe('removed');
    expect(s.pieces.green).toEqual([BASE, BASE, BASE, BASE]);
    expect(s.turn.color).toBe('red');
    expect(computePlacements(s).at(-1)).toBe('green');
  });

  it('removidos ficam ordenados do último a sair pro primeiro', () => {
    let s = game();
    s = removePlayer(s, 'red', 10);
    s = removePlayer(s, 'blue', 20);
    const pl = computePlacements(s);
    expect(pl.slice(-2)).toEqual(['blue', 'red']);
  });

  it('remover até sobrar um encerra a partida', () => {
    let s = game(['green', 'red']);
    s = removePlayer(s, 'red');
    expect(s.turn.phase).toBe('over');
    expect(s.placements).toEqual(['green', 'red']);
  });

  it('pausar pula a vez até despausar', () => {
    let s = game();
    s = pausePlayer(s, 'red');
    s = roll(s, 2); // verde joga, sem jogada → passa
    expect(s.turn.color).toBe('blue');
    s = resumePlayer(s, 'red');
    s = roll(s, 2); s = roll(s, 2); // azul, amarelo
    expect(s.turn.color).toBe('green');
    s = roll(s, 2);
    expect(s.turn.color).toBe('red');
  });

  it('pausar o jogador da vez passa a vez na hora', () => {
    let s = game();
    s = pausePlayer(s, 'green');
    expect(s.turn.color).toBe('red');
  });

  it('substituir troca o dono das peças e registra quem saiu', () => {
    let s = withPieces(game(), { green: [20, BASE, BASE, BASE] });
    s = substitutePlayer(s, 'green', { playerId: 'zé', name: 'Zé', avatar: '🦊' });
    expect(s.players[0].playerId).toBe('zé');
    expect(s.pieces.green[0]).toBe(20);
    expect(s.substituted?.[0]).toMatchObject({ playerId: 'green', color: 'green' });
  });
});

describe('modo rápido', () => {
  it('primeira peça no centro termina o jogador', () => {
    let s = withPieces(game(undefined, { mode: 'quick' }), { green: [FINISH - 1, 10, BASE, BASE] });
    s = roll(s, 1);
    s = move(s, 0);
    expect(s.finished).toEqual(['green']);
    expect(s.turn.color).toBe('red');
  });
});

describe('RNG', () => {
  it('rolagens sem valor forçado são determinísticas pela semente e ficam em 1..6', () => {
    const a = roll(game());
    const b = roll(game());
    const va = (a.log.find((e) => e.type === 'roll') as { value: number }).value;
    const vb = (b.log.find((e) => e.type === 'roll') as { value: number }).value;
    expect(va).toBe(vb);
    expect(va).toBeGreaterThanOrEqual(1);
    expect(va).toBeLessThanOrEqual(6);
  });

  it('distribuição razoavelmente uniforme em 6000 rolagens', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let s = game();
    for (let i = 0; i < 6000; i++) {
      // força o estado de volta pra 'roll' e descarta o log pra não crescer
      s = { ...s, turn: { ...s.turn, phase: 'roll', dice: null, legal: [], sixStreak: 0 }, log: [] };
      s = roll(s);
      const last = s.log.find((e) => e.type === 'roll') as { value: number };
      counts[last.value - 1]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
});
