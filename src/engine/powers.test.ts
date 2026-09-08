import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_RULES, legalMoves, legalPicks, move, pick, removePlayer, roll } from './game';
import {
  BASE,
  FINISH,
  HOME_START,
  POWERS,
  RING,
  type Color,
  type GameEvent,
  type GameState,
  type Power,
  type PowerCell,
  type Rules,
} from './types';
import { SAFE_ABS, toAbsolute } from './board';
import {
  MINE_CELLS,
  POWER_INFO,
  SPRING_MAX_STRETCH,
  TOTAL_CELLS,
  enabledPowers,
  peekEffects,
  pendingOf,
  placePowers,
} from './powers';

const P = (color: Color) => ({ color, playerId: color, name: color, avatar: '🙂' });
const ALL: Color[] = ['green', 'red', 'blue', 'yellow'];

function game(colors: Color[] = ALL, rules: Partial<Rules> = {}, first: Color = 'green', seed = 1) {
  return createGame({
    rules: { ...DEFAULT_RULES, mode: 'powers', ...rules },
    players: colors.map(P),
    seed,
    first,
    now: 0,
  });
}

/**
 * Cenário controlado: peças onde eu quiser e SÓ as casas de poder que eu
 * listar (em posição relativa ao verde = absoluta). Sem repovoar por acaso:
 * completa com casas neutras bem longe quando `pad` é true.
 */
function scene(
  s: GameState,
  pieces: Partial<Record<Color, number[]>>,
  cells: PowerCell[] = [],
  opts: { pad?: boolean; turn?: Color } = {},
): GameState {
  const c = structuredClone(s);
  for (const k of Object.keys(pieces) as Color[]) c.pieces[k] = [...pieces[k]!];
  c.powers = { cells: structuredClone(cells), effects: {}, pending: {} };
  if (opts.pad !== false) {
    // enche até 10 com escudos em casas altas do anel absoluto que ninguém alcança nos testes
    const used = new Set(cells.map((x) => x.abs));
    for (let a = 51; c.powers.cells.length < TOTAL_CELLS && a > 30; a--) {
      if (SAFE_ABS.has(a) || used.has(a)) continue;
      c.powers.cells.push({ abs: a, power: 'shield' });
    }
  }
  if (opts.turn) c.turn = { ...c.turn, color: opts.turn, phase: 'roll', dice: null, legal: [], sixStreak: 0, lastMoved: null };
  return c;
}

/** Rola `value` e move `piece` (dado forçado). */
function play(s: GameState, value: number, piece: number): GameState {
  const r = roll(s, value, 0);
  expect(r.turn.phase).toBe('move');
  return move(r, piece, 0);
}

function events(s: GameState, type: GameEvent['type']): GameEvent[] {
  return s.log.filter((e) => e.type === type);
}

function cellsOf(s: GameState, power: Power): PowerCell[] {
  return s.powers!.cells.filter((c) => c.power === power);
}

const abs = (c: Color, rel: number) => toAbsolute(c, rel);

/**
 * Acha uma semente em que o foguete pisado em `at` (verde, saindo de 0) pousa
 * numa casa não-segura do anel, e devolve o destino.
 */
function rocketSeed(at = 2): { seed: number; to: number } {
  for (let seed = 1; seed < 500; seed++) {
    let s = game(['green', 'red'], {}, 'green', seed);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: at, power: 'rocket' }], { pad: false });
    s = play(s, at, 0);
    const to = (events(s, 'fly')[0] as { to: number }).to;
    if (to < HOME_START && !SAFE_ABS.has(to)) return { seed, to };
  }
  throw new Error('sem semente');
}

// ---------------------------------------------------------------------------

describe('casas de poder — sorteio', () => {
  it('modo clássico não tem casas', () => {
    const s = createGame({ rules: DEFAULT_RULES, players: ALL.map(P), seed: 1 });
    expect(s.powers).toBeUndefined();
  });

  it('modo poderes começa com 10 casas: 8 visíveis + 2 minas escondidas', () => {
    const s = game();
    expect(s.powers!.cells).toHaveLength(TOTAL_CELLS);
    const mines = cellsOf(s, 'mine');
    expect(mines).toHaveLength(MINE_CELLS);
    expect(mines.every((m) => m.hidden)).toBe(true);
    expect(s.powers!.cells.filter((c) => c.power !== 'mine')).toHaveLength(8);
  });

  it('nunca em casa segura, nunca repetida, sempre no anel', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = game(ALL, {}, 'green', seed);
      const seen = new Set<number>();
      for (const c of s.powers!.cells) {
        expect(SAFE_ABS.has(c.abs)).toBe(false);
        expect(seen.has(c.abs)).toBe(false);
        expect(c.abs).toBeGreaterThanOrEqual(0);
        expect(c.abs).toBeLessThan(RING);
        seen.add(c.abs);
      }
    }
  });

  it('respeita a raridade: nunca mais fichas de um poder do que o peso dele', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = game(ALL, {}, 'green', seed);
      for (const p of POWERS) {
        const n = cellsOf(s, p).length;
        const cap = p === 'mine' ? MINE_CELLS : POWER_INFO[p].weight;
        expect(n).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('posições mudam conforme a semente', () => {
    const a = game(ALL, {}, 'green', 1).powers!.cells.map((c) => c.abs).join();
    const b = game(ALL, {}, 'green', 2).powers!.cells.map((c) => c.abs).join();
    expect(a).not.toBe(b);
  });

  it('não cai em casa ocupada no momento do sorteio', () => {
    let s = game();
    s = scene(s, { green: [3, 5, 7, 9], red: [1, 2, 3, 4] }, [], { pad: false });
    const occupied = new Set([3, 5, 7, 9, ...[1, 2, 3, 4].map((r) => abs('red', r))]);
    for (let i = 0; i < 50; i++) {
      s.powers!.cells = [];
      s.rng = i;
      placePowers(s);
      for (const c of s.powers!.cells) expect(occupied.has(c.abs)).toBe(false);
    }
  });

  it('minas visíveis: aparecem desde o sorteio e na reposição', () => {
    let s = game(ALL, { visibleMines: true });
    const mines = cellsOf(s, 'mine');
    expect(mines).toHaveLength(MINE_CELLS);
    expect(mines.every((m) => !m.hidden)).toBe(true);
    // reposição: 5 casas sem mina → ao pisar numa sobra 4 → repovoa com 2 minas visíveis
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'shield' }, { abs: 40, power: 'bomb' }, { abs: 41, power: 'bomb' }, { abs: 42, power: 'spring' }, { abs: 43, power: 'spring' }], { pad: false });
    s = play(s, 3, 0);
    const after = cellsOf(s, 'mine');
    expect(after).toHaveLength(MINE_CELLS);
    expect(after.every((m) => !m.hidden)).toBe(true);
    const rep = events(s, 'repopulate')[0] as { rings: number[] };
    expect(rep.rings).toHaveLength(TOTAL_CELLS - 4); // as minas contam como casas visíveis novas
    // e continua explodindo igual
    const m = after[0];
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'mine' }], { turn: 'green' });
    void m;
    s = play(s, 3, 0);
    expect(s.pieces.green[0]).toBe(BASE);
  });

  it('poderes desligados nunca são sorteados; minas desligadas = 10 visíveis', () => {
    const off: Power[] = ['shield', 'rocket', 'spring', 'mine'];
    for (let seed = 1; seed <= 50; seed++) {
      const s = game(ALL, { disabledPowers: off }, 'green', seed);
      for (const c of s.powers!.cells) expect(off.includes(c.power)).toBe(false);
      expect(s.powers!.cells).toHaveLength(TOTAL_CELLS);
    }
    expect(enabledPowers({ mode: 'powers', captureBonus: false, disabledPowers: off })).toHaveLength(POWERS.length - 4);
  });

  it('com poucos poderes ligados coloca o que dá, sem travar', () => {
    const s = game(ALL, { disabledPowers: POWERS.filter((p) => p !== 'bomb') });
    expect(s.powers!.cells.every((c) => c.power === 'bomb')).toBe(true);
    expect(s.powers!.cells).toHaveLength(POWER_INFO.bomb.weight);
  });

  it('repovoa pra 10 quando sobram 4, com 2 minas novas escondidas', () => {
    let s = game();
    // 5 casas: pisar em uma deixa 4 → repovoa
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'shield' }, { abs: 40, power: 'bomb' }, { abs: 41, power: 'bomb' }, { abs: 42, power: 'mine', hidden: true }, { abs: 43, power: 'spring' }], { pad: false });
    s = play(s, 3, 0);
    expect(s.powers!.cells).toHaveLength(TOTAL_CELLS);
    expect(cellsOf(s, 'mine')).toHaveLength(MINE_CELLS);
    const rep = events(s, 'repopulate')[0] as { rings: number[] };
    expect(rep.rings).toHaveLength(TOTAL_CELLS - 4 - 1); // 5 visíveis novas + 1 mina nova
    expect(s.powers!.cells.some((c) => c.abs === 3)).toBe(false);
  });

  it('não repovoa enquanto sobram mais de 4', () => {
    let s = game();
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'shield' }]);
    expect(s.powers!.cells).toHaveLength(TOTAL_CELLS);
    s = play(s, 3, 0);
    expect(s.powers!.cells).toHaveLength(TOTAL_CELLS - 1);
    expect(events(s, 'repopulate')).toHaveLength(0);
  });

  it('casa de poder não é segura: adversário come lá normalmente', () => {
    let s = game(['green', 'red']);
    // vermelho está na casa absoluta 3 (relativa 3-13 → 42), verde cai nela com poder
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(3 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 3, power: 'shield' }]);
    s = play(s, 3, 0);
    expect(s.pieces.red[0]).toBe(BASE);
    expect(events(s, 'capture')).toHaveLength(1);
    // e ainda pegou o poder
    expect(peekEffects(s, 'green', 0).shield).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('🛡️ escudo', () => {
  it('pisar dá escudo à peça e consome a casa', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 4, power: 'shield' }]);
    s = play(s, 4, 0);
    expect(peekEffects(s, 'green', 0).shield).toBe(true);
    expect(s.powers!.cells.some((c) => c.abs === 4)).toBe(false);
    expect(events(s, 'power')[0]).toMatchObject({ type: 'power', color: 'green', piece: 0, power: 'shield', ring: 4 });
    expect(s.players[0].stats.powers).toBe(1);
  });

  it('absorve 1 ataque: escudo some e o atacante volta pra onde estava', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [4, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, BASE, BASE, BASE] }, [], { turn: 'red' });
    s.powers!.effects.green = [{ shield: true }, {}, {}, {}];
    const redFrom = s.pieces.red[0];
    s = play(s, 2, 0); // vermelho cai na casa absoluta 4
    expect(s.pieces.green[0]).toBe(4);
    expect(peekEffects(s, 'green', 0).shield).toBe(false);
    expect(s.pieces.red[0]).toBe(redFrom);
    expect(events(s, 'capture')).toHaveLength(0);
    expect(events(s, 'shieldBlock')[0]).toMatchObject({ attacker: 'red', defender: 'green', ring: 4, back: redFrom });
    // vez passou (não comeu, não foi 6)
    expect(s.turn.color).toBe('green');
  });

  it('segundo ataque, sem escudo, come normalmente', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [4, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, (2 - 13 + RING) % RING, BASE, BASE] }, [], { turn: 'red' });
    s.powers!.effects.green = [{ shield: true }, {}, {}, {}];
    s = play(s, 2, 0);
    expect(s.pieces.green[0]).toBe(4);
    s = scene(s, s.pieces, [], { turn: 'red' });
    s.powers!.effects.green = [{ shield: false }, {}, {}, {}];
    s = play(s, 2, 1);
    expect(s.pieces.green[0]).toBe(BASE);
  });

  it('escudo continua ao andar; some ao chegar ao centro', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [10, BASE, BASE, BASE] });
    s.powers!.effects.green = [{ shield: true }, {}, {}, {}];
    s = play(s, 3, 0);
    expect(peekEffects(s, 'green', 0).shield).toBe(true);
    s = scene(s, { green: [FINISH - 2, BASE, BASE, BASE] }, [], { turn: 'green' });
    s.powers!.effects.green = [{ shield: true }, {}, {}, {}];
    s = play(s, 2, 0);
    expect(s.pieces.green[0]).toBe(FINISH);
    expect(peekEffects(s, 'green', 0).shield).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------

describe('💣 bomba', () => {
  it('só a peça que pisou volta pra base; adversário na mesma casa é comido antes', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, 1, BASE, BASE], red: [(5 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 5, power: 'bomb' }]);
    s = play(s, 5, 0);
    expect(s.pieces.green[0]).toBe(BASE);
    expect(s.pieces.green[1]).toBe(1);
    expect(s.pieces.red[0]).toBe(BASE);
    expect(events(s, 'boom')[0]).toMatchObject({ by: 'green', power: 'bomb', ring: 5 });
    expect(events(s, 'lost')[0]).toMatchObject({ color: 'green', piece: 0, cause: 'bomb' });
    expect(s.players[0].stats.deaths).toBe(1);
    expect(s.players[1].stats.captures).toBe(0);
  });

  it('escudo absorve a bomba: a peça fica', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 5, power: 'bomb' }]);
    s.powers!.effects.green = [{ shield: true }, {}, {}, {}];
    s = play(s, 5, 0);
    expect(s.pieces.green[0]).toBe(5);
    expect(peekEffects(s, 'green', 0).shield).toBe(false);
    expect(events(s, 'shieldBreak')[0]).toMatchObject({ color: 'green', piece: 0, cause: 'bomb' });
  });

  it('bomba tirada com 6 ainda dá jogada extra', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 6, power: 'bomb' }]);
    s = play(s, 6, 0);
    expect(s.pieces.green[0]).toBe(BASE);
    expect(s.turn.color).toBe('green');
    expect(s.turn.phase).toBe('roll');
  });
});

// ---------------------------------------------------------------------------

describe('❄️ congelar', () => {
  it('peça congelada não pode ser movida na próxima vez e descongela depois', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, 10, BASE, BASE] }, [{ abs: 3, power: 'freeze' }]);
    s = play(s, 3, 0);
    expect(peekEffects(s, 'green', 0).frozen).toBe(2);
    expect(s.turn.color).toBe('red');
    // vez do vermelho: nada
    s = roll(s, 2, 0);
    expect(s.turn.color).toBe('green');
    // próxima vez do verde: peça 0 não entra nas jogadas
    expect(legalMoves(s, 'green', 4)).toEqual([1]);
    s = play(s, 4, 1);
    s = roll(s, 2, 0); // vermelho
    // vez seguinte do verde: descongelou
    expect(s.turn.color).toBe('green');
    expect(legalMoves(s, 'green', 4)).toEqual([0, 1]);
  });

  it('congelar apaga o fogo e perde o multiplicador pendente da peça', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'freeze' }]);
    s.powers!.effects.green = [{ fire: 2 }, {}, {}, {}];
    s.powers!.pending.green = { piece: 0, factor: 2, armed: false };
    s = play(s, 3, 0);
    expect(peekEffects(s, 'green', 0).fire).toBe(0);
    expect(peekEffects(s, 'green', 0).frozen).toBe(2);
    expect(pendingOf(s, 'green')).toBeUndefined();
    expect(events(s, 'multLost')[0]).toMatchObject({ reason: 'frozen', factor: 2 });
  });

  it('peça congelada pode ser comida normalmente (e descongela ao voltar)', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [4, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, BASE, BASE, BASE] }, [], { turn: 'red' });
    s.powers!.effects.green = [{ frozen: 2 }, {}, {}, {}];
    s = play(s, 2, 0);
    expect(s.pieces.green[0]).toBe(BASE);
    expect(peekEffects(s, 'green', 0).frozen).toBeFalsy();
  });

  it('todas congeladas com 6: só peças da base saem; sem nada, passa a vez', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [5, BASE, BASE, BASE] });
    s.powers!.effects.green = [{ frozen: 2 }, {}, {}, {}];
    expect(legalMoves(s, 'green', 6)).toEqual([1, 2, 3]);
    expect(legalMoves(s, 'green', 3)).toEqual([]);
    s = roll(s, 3, 0);
    expect(events(s, 'noMoves')).toHaveLength(1);
    expect(s.turn.color).toBe('red');
  });
});

// ---------------------------------------------------------------------------

describe('🔥 fogo', () => {
  it('fica aceso até queimar alguém: no caminho e no pouso, e apaga ao queimar', () => {
    let s = game(['green', 'red']);
    const R = (a: number) => (a - 13 + RING) % RING;
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [R(2), R(3), R(5), R(20)] }, [{ abs: 1, power: 'fire' }]);
    s = play(s, 1, 0);
    expect(peekEffects(s, 'green', 0).fire).toBe(1);
    // vez do vermelho: move a peça que está longe (20 → 21); o fogo do verde não cai com o tempo
    s = play(s, 1, 3);
    expect(s.turn.color).toBe('green');
    expect(peekEffects(s, 'green', 0).fire).toBe(1);
    s = play(s, 4, 0); // 1 → 5, passa por 2, 3, 4 e para em 5
    expect(s.pieces.red[0]).toBe(BASE);
    expect(s.pieces.red[1]).toBe(BASE);
    expect(s.pieces.red[2]).toBe(BASE);
    expect(s.pieces.red[3]).toBe(R(21));
    const caps = events(s, 'capture') as { how?: string }[];
    expect(caps).toHaveLength(3);
    expect(caps.every((c) => c.how === 'fire')).toBe(true);
    expect(events(s, 'burn')[0]).toMatchObject({ color: 'green', piece: 0, from: 1, to: 5 });
    expect(peekEffects(s, 'green', 0).fire).toBe(0);
    expect(events(s, 'fireOut').at(-1)).toMatchObject({ color: 'green', piece: 0, reason: 'burned' });
    expect(s.players[0].stats.captures).toBe(3);
    expect(s.players[1].stats.deaths).toBe(3);
  });

  it('andar sem queimar ninguém mantém o fogo aceso (várias jogadas)', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(30 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 1, power: 'fire' }]);
    s = play(s, 1, 0);
    expect(peekEffects(s, 'green', 0).fire).toBe(1);
    // três rodadas andando pelo vazio: continua em chamas
    for (let i = 0; i < 3; i++) {
      s = play(s, 1, 0); // vermelho anda
      expect(s.turn.color).toBe('green');
      s = play(s, 2, 0); // verde anda sem tocar ninguém
      expect(peekEffects(s, 'green', 0).fire).toBe(1);
    }
    expect(events(s, 'fireOut')).toHaveLength(0);
    // toda jogada em chamas registra 'burn' (pra animação), mesmo sem vítima
    expect(events(s, 'burn').length).toBe(3);
  });

  it('casa segura protege do fogo (só no caminho; pouso em segura também não come)', () => {
    let s = game(['green', 'red']);
    // vermelho na estrela do verde (abs 8) e em 9
    s = scene(s, { green: [6, BASE, BASE, BASE], red: [(8 - 13 + RING) % RING, (9 - 13 + RING) % RING, BASE, BASE] });
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    s = play(s, 4, 0); // 6 → 10, passa por 7, 8, 9
    expect(s.pieces.red[0]).toBe((8 - 13 + RING) % RING);
    expect(s.pieces.red[1]).toBe(BASE);
  });

  it('escudo no caminho é destruído e a peça fica', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, BASE, BASE, BASE] });
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    s.powers!.effects.red = [{ shield: true }, {}, {}, {}];
    s = play(s, 4, 0);
    expect(s.pieces.red[0]).toBe((2 - 13 + RING) % RING);
    expect(peekEffects(s, 'red', 0).shield).toBe(false);
    expect(events(s, 'shieldBreak')[0]).toMatchObject({ color: 'red', cause: 'fire' });
  });

  it('parar em cima de escudo: escudo quebra e a peça com fogo volta; quem queimou no caminho continua queimado', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, (4 - 13 + RING) % RING, BASE, BASE] });
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    s.powers!.effects.red = [{}, { shield: true }, {}, {}];
    s = play(s, 4, 0);
    expect(s.pieces.red[0]).toBe(BASE);
    expect(s.pieces.green[0]).toBe(0);
    expect(peekEffects(s, 'red', 1).shield).toBe(false);
    expect(peekEffects(s, 'green', 0).fire).toBe(0);
  });

  it('fogo não expira com o tempo; apaga ao entrar na reta final; apaga ao ser comida', () => {
    // não expira
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, 10, BASE, BASE] }, [{ abs: 1, power: 'fire' }]);
    s = play(s, 1, 0);
    s = roll(s, 1, 0); // vermelho sem jogada
    expect(peekEffects(s, 'green', 0).fire).toBe(1);
    s = play(s, 2, 1); // verde move outra peça
    s = roll(s, 1, 0); // vermelho
    expect(peekEffects(s, 'green', 0).fire).toBe(1);
    expect(events(s, 'fireOut')).toHaveLength(0);

    // reta final
    s = game(['green', 'red']);
    s = scene(s, { green: [HOME_START - 2, BASE, BASE, BASE] });
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    s = play(s, 3, 0);
    expect(s.pieces.green[0]).toBe(HOME_START + 1);
    expect(peekEffects(s, 'green', 0).fire).toBe(0);
    expect(events(s, 'fireOut').at(-1)).toMatchObject({ reason: 'stretch' });

    // comida
    s = game(['green', 'red']);
    s = scene(s, { green: [4, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, BASE, BASE, BASE] }, [], { turn: 'red' });
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    s = play(s, 2, 0);
    expect(s.pieces.green[0]).toBe(BASE);
    expect(peekEffects(s, 'green', 0).fire).toBeFalsy();
  });

  it('fogo não age durante voo de foguete (e continua aceso depois do voo)', () => {
    let s = game(['green', 'red']);
    // foguete em 1; vermelho em 3 (no caminho do voo)
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(3 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 1, power: 'rocket' }]);
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    // o passo 0→1 é de dado (queima 0 casas intermediárias), depois voa por cima de 3
    s = play(s, 1, 0);
    expect((events(s, 'fly')[0] as { to: number }).to).toBeGreaterThan(3);
    expect(s.pieces.red[0]).toBe((3 - 13 + RING) % RING);
    expect(peekEffects(s, 'green', 0).fire).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('🪀 mola', () => {
  it('pula até a próxima casa segura (estrela ou saída), e lá ninguém come ninguém', () => {
    // verde em 0; mola em 2 → próxima segura no caminho do verde é a estrela em 8
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(8 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 2, power: 'spring' }]);
    s = play(s, 2, 0);
    const fly = events(s, 'fly')[0] as { n: number; power: string; from: number; to: number };
    expect(fly).toMatchObject({ power: 'spring', from: 2, to: 8, n: 6 });
    expect(s.pieces.green[0]).toBe(8);
    // adversário na estrela continua lá
    expect(s.pieces.red[0]).toBe((8 - 13 + RING) % RING);
    expect(events(s, 'capture')).toHaveLength(0);
  });

  it('a saída colorida dos outros também conta como casa segura', () => {
    // verde em 9; mola em 10 → próxima segura é a saída do vermelho (abs 13 = rel 13)
    let s = game(['green', 'red']);
    s = scene(s, { green: [9, BASE, BASE, BASE] }, [{ abs: 10, power: 'spring' }]);
    s = play(s, 1, 0);
    expect(s.pieces.green[0]).toBe(13);
  });

  it('encadeia: se a casa segura tiver outro poder, ativa (nunca tem — poderes não nascem em seguras)', () => {
    // garantia de invariância: casas de poder nunca são sorteadas em casas seguras
    const s = game(['green', 'red']);
    for (const c of s.powers!.cells) expect(SAFE_ABS.has(c.abs)).toBe(false);
  });

  it('sem casa segura antes da reta final: entra na reta e para no máximo possível', () => {
    let s = game(['green', 'red']);
    // última segura do verde é a estrela do amarelo (abs 47 = rel 47); depois só reta final (HOME_START = 51)
    s = scene(s, { green: [47, BASE, BASE, BASE] }, [{ abs: 48, power: 'spring' }]);
    s = play(s, 1, 0);
    const fly = events(s, 'fly')[0] as { to: number; n: number };
    expect(fly.to).toBe(Math.min(48 + SPRING_MAX_STRETCH, FINISH));
    expect(fly.to).toBeGreaterThanOrEqual(HOME_START);
    expect(s.pieces.green[0]).toBe(fly.to);
  });

  it('para no centro se exceder', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [HOME_START - 3, BASE, BASE, BASE] }, [{ abs: HOME_START - 1, power: 'spring' }]);
    s = play(s, 2, 0);
    const fly = events(s, 'fly')[0] as { to: number; n: number };
    expect(fly.to).toBe(Math.min(HOME_START - 1 + SPRING_MAX_STRETCH, FINISH));
  });
});

// ---------------------------------------------------------------------------

describe('🎯 dado personalizável', () => {
  it('pisar abre a fase pick; escolher anda na hora; 6 dá extra', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(7 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 1, power: 'magicDice' }]);
    s = play(s, 1, 0);
    expect(s.turn.phase).toBe('pick');
    expect(s.turn.pick).toBe(0);
    expect(s.turn.color).toBe('green');
    expect(legalPicks(s)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => roll(s, 3, 0)).toThrow();
    expect(() => move(s, 0, 0)).toThrow();
    s = pick(s, 6, 0);
    expect(s.pieces.green[0]).toBe(7);
    expect(s.pieces.red[0]).toBe(BASE); // comeu no pouso
    expect(events(s, 'pick')[0]).toMatchObject({ color: 'green', piece: 0, value: 6 });
    expect(s.turn.phase).toBe('roll');
    expect(s.turn.color).toBe('green');
    expect(s.turn.sixStreak).toBe(1);
  });

  it('escolher número menor que 6 passa a vez', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 1, power: 'magicDice' }]);
    s = play(s, 1, 0);
    s = pick(s, 3, 0);
    expect(s.pieces.green[0]).toBe(4);
    expect(s.turn.color).toBe('red');
  });

  it('escolha 6 conta pros três 6', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 6, power: 'magicDice' }]);
    s = { ...s, turn: { ...s.turn, sixStreak: 1 } };
    s = play(s, 6, 0); // segundo 6
    expect(s.turn.phase).toBe('pick');
    s = pick(s, 6, 0); // terceiro 6 → penalidade
    expect(events(s, 'threeSixes')).toHaveLength(1);
    expect(s.pieces.green[0]).toBe(BASE);
    expect(s.turn.color).toBe('red');
  });

  it('só oferece valores que cabem até o centro', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [HOME_START - 2, BASE, BASE, BASE] }, [{ abs: HOME_START - 1, power: 'magicDice' }]);
    s = play(s, 1, 0);
    expect(s.turn.phase).toBe('pick');
    expect(legalPicks(s)).toEqual([1, 2, 3, 4, 5, 6]);
    s = scene(s, { green: [FINISH - 3, BASE, BASE, BASE] }, [], { pad: true });
    s = { ...s, turn: { ...s.turn, phase: 'pick', pick: 0 } };
    expect(legalPicks(s)).toEqual([1, 2, 3]);
  });

  it('encadeia: cair em outro poder depois da escolha', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 1, power: 'magicDice' }, { abs: 4, power: 'shield' }]);
    s = play(s, 1, 0);
    s = pick(s, 3, 0);
    expect(peekEffects(s, 'green', 0).shield).toBe(true);
  });

  it('jogada extra de 6 é preservada através da escolha', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 6, power: 'magicDice' }]);
    s = play(s, 6, 0);
    expect(s.turn.phase).toBe('pick');
    s = pick(s, 2, 0);
    expect(s.turn.color).toBe('green');
    expect(s.turn.phase).toBe('roll');
  });
});

// ---------------------------------------------------------------------------

describe('✖️ multiplicador ×2/×3', () => {
  it('na próxima vez, a peça anda dado × fator, sem extra por 6', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, 10, BASE, BASE] }, [{ abs: 2, power: 'x2' }]);
    s = play(s, 2, 0);
    expect(pendingOf(s, 'green')).toMatchObject({ piece: 0, factor: 2, armed: false });
    s = roll(s, 1, 0); // vermelho passa
    expect(pendingOf(s, 'green')!.armed).toBe(true);
    s = roll(s, 6, 0);
    expect(s.turn.phase).toBe('move');
    expect(s.turn.legal).toEqual([0]);
    expect(s.turn.mult).toBe(2);
    expect((events(s, 'roll').at(-1) as { mult?: number }).mult).toBe(2);
    s = move(s, 0, 0);
    expect(s.pieces.green[0]).toBe(2 + 12);
    expect(pendingOf(s, 'green')).toBeUndefined();
    expect(s.turn.color).toBe('red'); // 6 multiplicado não dá extra
    expect(s.turn.sixStreak).toBe(0);
  });

  it('×3 anda o triplo e come no pouso', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [(11 - 13 + RING) % RING, BASE, BASE, BASE] }, [{ abs: 2, power: 'x3' }]);
    s.powers!.effects.red = [{ frozen: 9 }, {}, {}, {}];
    s = play(s, 2, 0);
    s = roll(s, 1, 0); // vermelho: congelado, sem jogada
    expect(s.turn.color).toBe('green');
    s = play(s, 3, 0);
    expect(s.pieces.green[0]).toBe(11);
    expect(s.pieces.red[0]).toBe(BASE);
  });

  it('pegar outro multiplicador substitui o anterior (um por jogador)', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, 10, BASE, BASE] }, [{ abs: 6, power: 'x2' }, { abs: 12, power: 'x3' }]);
    s = play(s, 6, 0); // pega x2 com 6 → extra
    expect(pendingOf(s, 'green')).toMatchObject({ piece: 0, factor: 2 });
    s = play(s, 2, 1); // pega x3 com a peça 1
    expect(pendingOf(s, 'green')).toMatchObject({ piece: 1, factor: 3 });
    expect(events(s, 'multLost')[0]).toMatchObject({ reason: 'replaced', piece: 0, factor: 2 });
  });

  it('perdido se a peça for comida antes da vez', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [4, BASE, BASE, BASE], red: [(2 - 13 + RING) % RING, BASE, BASE, BASE] }, [], { turn: 'red' });
    s.powers!.pending.green = { piece: 0, factor: 2, armed: false };
    s = play(s, 2, 0);
    expect(pendingOf(s, 'green')).toBeUndefined();
    expect(events(s, 'multLost')[0]).toMatchObject({ reason: 'home' });
  });

  it('se a peça não puder andar o valor multiplicado, perde e o dado vale como jogada normal', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [FINISH - 5, 10, BASE, BASE] });
    s.powers!.pending.green = { piece: 0, factor: 3, armed: true };
    s = roll(s, 6, 0);
    expect(pendingOf(s, 'green')).toBeUndefined();
    expect(events(s, 'multLost')[0]).toMatchObject({ reason: 'overshoot' });
    expect(s.turn.mult).toBeUndefined();
    expect(s.turn.legal).toEqual([1, 2, 3]); // jogada normal: peça 1 e as da base (6)
    s = move(s, 1, 0);
    expect(s.turn.color).toBe('green'); // 6 normal dá extra
  });

  it('dado multiplicado que cai em mola usa o pulo próprio da mola (sem multiplicar)', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 4, power: 'spring' }]);
    s.powers!.pending.green = { piece: 0, factor: 2, armed: true };
    s = roll(s, 2, 0);
    s = move(s, 0, 0);
    const fly = events(s, 'fly')[0] as { n: number; to: number };
    // mola: da casa 4 até a estrela em 8 (não multiplica)
    expect(fly).toMatchObject({ to: 8, n: 4 });
    expect(s.pieces.green[0]).toBe(8);
  });

  it('peça chegando ao centro antes da vez perde o pendente', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [FINISH - 2, BASE, BASE, BASE] });
    s.powers!.pending.green = { piece: 0, factor: 2, armed: false };
    s = play(s, 2, 0);
    expect(pendingOf(s, 'green')).toBeUndefined();
    expect(events(s, 'multLost')[0]).toMatchObject({ reason: 'finished' });
  });
});

// ---------------------------------------------------------------------------

describe('💀 mina', () => {
  it('parar nela: peça volta pra base, mina some', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'mine', hidden: true }]);
    s = play(s, 3, 0);
    expect(s.pieces.green[0]).toBe(BASE);
    expect(s.powers!.cells.some((c) => c.abs === 3)).toBe(false);
    expect(events(s, 'boom')[0]).toMatchObject({ power: 'mine', ring: 3 });
    expect(events(s, 'lost')[0]).toMatchObject({ cause: 'mine' });
  });

  it('passar por cima revela (fica visível até alguém pisar)', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'mine', hidden: true }]);
    s = play(s, 5, 0);
    const mine = s.powers!.cells.find((c) => c.abs === 3)!;
    expect(mine.hidden).toBe(false);
    expect(events(s, 'mineRevealed')[0]).toMatchObject({ ring: 3, by: 'green' });
    // revelada, ainda explode
    s = scene(s, { green: [5, 0, BASE, BASE] }, [{ abs: 3, power: 'mine', hidden: false }], { turn: 'green' });
    s = play(s, 3, 1);
    expect(s.pieces.green[1]).toBe(BASE);
  });

  it('escudo absorve a mina', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'mine', hidden: true }]);
    s.powers!.effects.green = [{ shield: true }, {}, {}, {}];
    s = play(s, 3, 0);
    expect(s.pieces.green[0]).toBe(3);
    expect(peekEffects(s, 'green', 0).shield).toBe(false);
  });

  it('peça com fogo passando por cima detona a mina sem vítima', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 3, power: 'mine', hidden: true }]);
    s.powers!.effects.green = [{ fire: 1 }, {}, {}, {}];
    s = play(s, 5, 0);
    expect(s.powers!.cells.some((c) => c.abs === 3)).toBe(false);
    expect(events(s, 'mineDetonated')[0]).toMatchObject({ ring: 3 });
    expect(s.pieces.green[0]).toBe(5);
  });

  it('voo de foguete não revela minas no caminho', () => {
    const { seed, to } = rocketSeed();
    let s = game(['green', 'red'], {}, 'green', seed);
    s = scene(s, { green: [0, BASE, BASE, BASE] }, [{ abs: 2, power: 'rocket' }, { abs: to - 1, power: 'mine', hidden: true }], { pad: false });
    s = play(s, 2, 0);
    expect(s.powers!.cells.find((c) => c.abs === to - 1)!.hidden).toBe(true);
  });

  it('saída da base (BASE → 0) não revela nada', () => {
    let s = game(['green', 'red']);
    s = scene(s, { green: [BASE, BASE, BASE, BASE] }, [{ abs: 1, power: 'mine', hidden: true }]);
    s = play(s, 6, 0);
    expect(s.powers!.cells.find((c) => c.abs === 1)!.hidden).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('💥 mega bomba', () => {
  it('todas as peças num raio de 2 voltam pra base, inclusive as próprias; casa segura não protege', () => {
    let s = game(['green', 'red', 'blue']);
    // mega bomba em 20; verde em 21 (estrela do vermelho, segura) e 23 (fora do raio); vermelho em 22; azul em 19
    s = scene(
      s,
      {
        green: [17, 21, 23, BASE],
        red: [(22 - 13 + RING) % RING, BASE, BASE, BASE],
        blue: [(19 - 26 + RING) % RING, BASE, BASE, BASE],
      },
      [{ abs: 20, power: 'megaBomb' }],
    );
    s = play(s, 3, 0); // verde 17 → 20
    expect(s.pieces.green[0]).toBe(BASE);
    expect(s.pieces.green[1]).toBe(BASE); // estrela não protege
    expect(s.pieces.green[2]).toBe(23);
    expect(s.pieces.red[0]).toBe(BASE);
    expect(s.pieces.blue[0]).toBe(BASE);
    expect(events(s, 'boom')[0]).toMatchObject({ power: 'megaBomb', ring: 20 });
    expect(events(s, 'lost')).toHaveLength(2);
    const caps = events(s, 'capture') as { how?: string }[];
    expect(caps).toHaveLength(2);
    expect(caps.every((c) => c.how === 'megaBomb')).toBe(true);
    expect(s.players[0].stats.captures).toBe(2);
    expect(s.players[0].stats.deaths).toBe(2);
  });

  it('raio circular passa pelo fim do anel; escudo absorve', () => {
    let s = game(['green', 'red', 'yellow']);
    // amarelo pisa na mega bomba em 51 (relativa 12); raio: 49, 50, 51, 0, 1
    s = scene(
      s,
      { yellow: [10, BASE, BASE, BASE], red: [(1 - 13 + RING) % RING, (50 - 13 + RING) % RING, BASE, BASE], green: [0, BASE, BASE, BASE] },
      [{ abs: 51, power: 'megaBomb' }],
      { turn: 'yellow' },
    );
    s.powers!.effects.red = [{ shield: true }, {}, {}, {}];
    s = play(s, 2, 0); // amarelo 10 → 12 (abs 51)
    expect(s.pieces.yellow[0]).toBe(BASE);
    expect(s.pieces.red[0]).toBe((1 - 13 + RING) % RING); // escudo absorveu
    expect(peekEffects(s, 'red', 0).shield).toBe(false);
    expect(s.pieces.red[1]).toBe(BASE);
    expect(s.pieces.green[0]).toBe(BASE); // casa de saída não protege
  });
});

// ---------------------------------------------------------------------------

describe('integração', () => {
  it('jogador removido perde efeitos e pendentes', () => {
    let s = game(['green', 'red', 'blue']);
    s = scene(s, { green: [0, BASE, BASE, BASE], red: [3, BASE, BASE, BASE] });
    s.powers!.effects.red = [{ shield: true }, {}, {}, {}];
    s.powers!.pending.red = { piece: 0, factor: 2, armed: false };
    s = removePlayer(s, 'red', 0);
    expect(s.powers!.effects.red).toBeUndefined();
    expect(s.powers!.pending.red).toBeUndefined();
  });

  it('partida inteira com poderes termina sem erro e com placements', () => {
    for (let seed = 1; seed <= 15; seed++) {
      let s = game(ALL, {}, 'green', seed);
      let guard = 0;
      while (s.turn.phase !== 'over' && guard++ < 20000) {
        if (s.turn.phase === 'roll') s = roll(s, undefined, guard);
        else if (s.turn.phase === 'move') s = move(s, s.turn.legal[0], guard);
        else if (s.turn.phase === 'pick') {
          const picks = legalPicks(s);
          s = pick(s, picks[picks.length - 1], guard);
        }
        // invariantes
        const cells = s.powers!.cells;
        if (cells.length > TOTAL_CELLS || cells.some((c) => SAFE_ABS.has(c.abs))) throw new Error('casas inválidas');
        if (new Set(cells.map((c) => c.abs)).size !== cells.length) throw new Error('casa repetida');
        for (const p of s.players) for (const pos of s.pieces[p.color]) {
          if (pos < BASE || pos > FINISH) throw new Error('posição inválida');
        }
      }
      expect(s.turn.phase).toBe('over');
      expect(s.placements).toHaveLength(4);
      expect(s.log.some((e) => e.type === 'power')).toBe(true);
    }
  });
});
