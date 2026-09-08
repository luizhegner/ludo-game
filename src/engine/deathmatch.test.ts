import { describe, it, expect } from 'vitest';
import { createGame, DEFAULT_RULES, endGame, isTimeUp, playerOf, removePlayer, pausePlayer, resumePlayer, roll, timeUp, elapsedMs } from './game';
import {
  DM_SAFE_MS,
  DM_TARGET,
  dmCanAct,
  dmDestination,
  dmIsProtected,
  dmLegalMoves,
  dmMove,
  dmPlacements,
  dmPlayer,
  dmRoll,
  dmSafeStatus,
} from './deathmatch';
import { STAR_ABS, START_OFFSET, toAbsolute } from './board';
import { BASE, RING, type Color, type GameState } from './types';

const P = (color: Color) => ({ color, playerId: color, name: color, avatar: '' });
const ALL: Color[] = ['green', 'red', 'blue', 'yellow'];

function game(colors: Color[] = ALL, now = 0, durationMs?: number): GameState {
  return createGame({ rules: { ...DEFAULT_RULES, mode: 'deathmatch', durationMs }, players: colors.map(P), seed: 1, first: 'green', now });
}
function withPieces(s: GameState, pieces: Partial<Record<Color, number[]>>): GameState {
  const c = structuredClone(s);
  for (const k of Object.keys(pieces) as Color[]) c.pieces[k] = [...pieces[k]!];
  return c;
}
/** Posição relativa de `color` que cai na casa absoluta `abs`. */
function relOf(color: Color, abs: number): number {
  return (abs - START_OFFSET[color] + RING) % RING;
}
function fresh(before: GameState, after: GameState) {
  return after.log.slice(before.log.length).map((e) => e.type);
}

describe('Deathmatch — criação e ciclo por jogador', () => {
  it('cria com dm: todo mundo em fase roll, sem turno global relevante, cronômetro parado', () => {
    const s = game();
    expect(s.dm).toBeTruthy();
    expect(s.dm!.target).toBe(DM_TARGET);
    for (const c of ALL) expect(dmPlayer(s, c)).toEqual({ phase: 'roll', dice: null, legal: [] });
    expect(s.clock).toEqual({ elapsedMs: 0, runningSince: null });
    expect(s.rules.captureBonus).toBe(false);
    expect(ALL.every((c) => dmCanAct(s, c))).toBe(true);
  });

  it('roll/move clássicos são recusados; dmRoll é independente por cor', () => {
    const s = game();
    expect(() => roll(s, 6)).toThrow(/dmRoll/);
    // dois jogadores rolam "ao mesmo tempo" (em sequência, sem esperar o outro)
    const a = dmRoll(s, 'green', 6, 100);
    const b = dmRoll(a, 'blue', 3, 101);
    expect(dmPlayer(b, 'green')).toEqual({ phase: 'move', dice: 6, legal: [0, 1, 2, 3] });
    expect(dmPlayer(b, 'blue')).toEqual({ phase: 'roll', dice: null, legal: [] }); // 3 com tudo na base: sem jogada
    expect(fresh(a, b)).toEqual(['roll', 'noMoves']);
    // verde não pode rolar de novo antes de mover
    expect(() => dmRoll(b, 'green', 2)).toThrow(/não é hora de rolar/);
    // o cronômetro começou no primeiro lançamento
    expect(b.clock!.runningSince).toBe(101);
  });

  it('6 tira da base e NÃO dá jogada extra; sem regra dos três 6', () => {
    let s = game();
    s = dmRoll(s, 'green', 6, 0);
    s = dmMove(s, 'green', 0, 0);
    expect(s.pieces.green[0]).toBe(0);
    expect(dmPlayer(s, 'green')!.phase).toBe('roll'); // volta a rolar (como sempre), sem "extra"
    s = dmRoll(s, 'green', 6, 0);
    s = dmMove(s, 'green', 0, 0);
    s = dmRoll(s, 'green', 6, 0);
    s = dmMove(s, 'green', 0, 0);
    expect(s.pieces.green[0]).toBe(12);
    expect(fresh(game(), s).filter((t) => t === 'threeSixes')).toEqual([]);
    expect(playerOf(s, 'green')!.stats.sixes).toBe(3);
  });

  it('6 com peça fora pode andar 6 em vez de sair da base (legal inclui as duas)', () => {
    const s = withPieces(game(), { green: [5, BASE, BASE, BASE] });
    expect(dmLegalMoves(s, 'green', 6)).toEqual([0, 1, 2, 3]);
    expect(dmLegalMoves(s, 'green', 4)).toEqual([0]);
  });

  it('peças dão a volta no anel: nunca entram na reta final', () => {
    const s = withPieces(game(), { green: [50, BASE, BASE, BASE] });
    expect(dmDestination(50, 3)).toBe(1);
    const a = dmMove(dmRoll(s, 'green', 3, 0), 'green', 0, 0);
    expect(a.pieces.green[0]).toBe(1);
    expect(a.log.some((e) => e.type === 'finish')).toBe(false);
  });
});

describe('Deathmatch — captura, casas seguras com prazo e canhão', () => {
  it('cair em adversário fora de casa segura come; a vítima volta pra base', () => {
    // verde em rel 2 (abs 2); vermelho parado em abs 5 → rel 44 do vermelho
    const s = withPieces(game(), { green: [2, BASE, BASE, BASE], red: [relOf('red', 5), BASE, BASE, BASE] });
    const a = dmMove(dmRoll(s, 'green', 3, 0), 'green', 0, 0);
    expect(a.pieces.red[0]).toBe(BASE);
    expect(playerOf(a, 'green')!.stats.captures).toBe(1);
    expect(playerOf(a, 'red')!.stats.deaths).toBe(1);
    expect(fresh(s, a)).toContain('capture');
  });

  it('casa segura protege por 15 s de jogo; depois a peça fica vulnerável até mover', () => {
    // vermelho vai parar na estrela do azul (abs 34) — segura, mas não é do vermelho (o canhão é do azul!)
    // usa a casa de saída do amarelo (abs 39) que é segura e não tem canhão
    const SAFE = 39;
    let s = withPieces(game(), { red: [relOf('red', SAFE) - 2, BASE, BASE, BASE], green: [relOf('green', SAFE) - 4, BASE, BASE, BASE] });
    s = dmMove(dmRoll(s, 'red', 2, 1000), 'red', 0, 1000); // relógio começa em t=1000
    expect(toAbsolute('red', s.pieces.red[0])).toBe(SAFE);
    expect(dmSafeStatus(s, 'red', 0, 1000)).toEqual({ remaining: DM_SAFE_MS });
    expect(dmIsProtected(s, 'red', 0, 1000 + DM_SAFE_MS - 1)).toBe(true);
    expect(dmIsProtected(s, 'red', 0, 1000 + DM_SAFE_MS)).toBe(false);

    // verde cai em cima dentro do prazo: ninguém come, os dois coexistem
    const early = dmMove(dmRoll(s, 'green', 4, 5000), 'green', 0, 5000);
    expect(early.pieces.red[0]).not.toBe(BASE);
    expect(fresh(s, early)).not.toContain('capture');

    // verde cai em cima depois do prazo: come
    const late = dmMove(dmRoll(s, 'green', 4, 1000 + DM_SAFE_MS + 10), 'green', 0, 1000 + DM_SAFE_MS + 10);
    expect(late.pieces.red[0]).toBe(BASE);
    expect(fresh(s, late)).toContain('capture');
  });

  it('a proteção reinicia quando a peça move pra outra casa segura, e some ao sair pra casa comum', () => {
    const SAFE = 39;
    let s = withPieces(game(), { red: [relOf('red', SAFE), BASE, BASE, BASE] });
    s = dmMove(dmRoll(s, 'red', 6, 0), 'red', 1, 0); // tira outra peça, relógio corre
    // a peça 0 está na segura mas nunca "parou" lá pelo motor → sem carimbo = vulnerável
    expect(dmSafeStatus(s, 'red', 0, 0)).toEqual({ remaining: 0 });
    s = dmMove(dmRoll(s, 'red', 8 - 8 + 1, 0), 'red', 0, 0); // anda 1: casa comum
    expect(dmSafeStatus(s, 'red', 0, 0)).toBeNull();
  });

  it('a pausa do relógio não consome o prazo (tempo de jogo, não de parede)', () => {
    const SAFE = 39;
    let s = withPieces(game(), { red: [relOf('red', SAFE) - 2, BASE, BASE, BASE] });
    s = dmMove(dmRoll(s, 'red', 2, 0), 'red', 0, 0);
    // pausa em t=1000 (1 s de jogo consumido), volta em t=100000
    s = { ...s, clock: { elapsedMs: 1000, runningSince: null } };
    expect(dmSafeStatus(s, 'red', 0, 50_000)!.remaining).toBe(DM_SAFE_MS - 1000);
    s = { ...s, clock: { elapsedMs: 1000, runningSince: 100_000 } };
    expect(dmSafeStatus(s, 'red', 0, 100_000 + 2000)!.remaining).toBe(DM_SAFE_MS - 3000);
    expect(elapsedMs(s, 102_000)).toBe(3000);
  });

  it('canhão: parar na estrela de outra cor presente abate na hora e conta captura pro dono', () => {
    const star = STAR_ABS.blue; // 34
    const s = withPieces(game(), { green: [relOf('green', star) - 3, BASE, BASE, BASE] });
    const a = dmMove(dmRoll(s, 'green', 3, 0), 'green', 0, 0);
    expect(a.pieces.green[0]).toBe(BASE);
    expect(playerOf(a, 'blue')!.stats.captures).toBe(1);
    expect(playerOf(a, 'green')!.stats.deaths).toBe(1);
    const ev = a.log.at(-1)!;
    expect(ev.type).toBe('cannon');
    if (ev.type === 'cannon') expect(ev).toMatchObject({ by: 'blue', victim: 'green', piece: 0, ring: star });
  });

  it('canhão não dispara na própria estrela nem na de cor ausente da partida', () => {
    const own = STAR_ABS.green; // 8
    let s = withPieces(game(['green', 'red']), { green: [own - 2, BASE, BASE, BASE] });
    s = dmMove(dmRoll(s, 'green', 2, 0), 'green', 0, 0);
    expect(s.pieces.green[0]).toBe(own);
    // estrela do azul (ausente): segura normal
    s = withPieces(game(['green', 'red']), { green: [relOf('green', STAR_ABS.blue) - 1, BASE, BASE, BASE] });
    s = dmMove(dmRoll(s, 'green', 1, 0), 'green', 0, 0);
    expect(s.pieces.green[0]).not.toBe(BASE);
    expect(s.log.some((e) => e.type === 'cannon')).toBe(false);
  });

  it('passar por cima não come (só o pouso conta)', () => {
    const s = withPieces(game(), { green: [2, BASE, BASE, BASE], red: [relOf('red', 4), BASE, BASE, BASE] });
    const a = dmMove(dmRoll(s, 'green', 5, 0), 'green', 0, 0);
    expect(a.pieces.red[0]).toBe(relOf('red', 4));
    expect(fresh(s, a)).not.toContain('capture');
  });
});

describe('Deathmatch — fim de partida', () => {
  it('vence quem chega a 8 capturas; colocação por capturas, desempate por menos mortes', () => {
    let s = game();
    playerOf(s, 'green')!.stats.captures = 7;
    playerOf(s, 'red')!.stats.captures = 5;
    playerOf(s, 'blue')!.stats.captures = 5;
    playerOf(s, 'blue')!.stats.deaths = 2;
    playerOf(s, 'red')!.stats.deaths = 4;
    s = withPieces(s, { green: [2, BASE, BASE, BASE], yellow: [relOf('yellow', 5), BASE, BASE, BASE] });
    const a = dmMove(dmRoll(s, 'green', 3, 0), 'green', 0, 0);
    expect(a.turn.phase).toBe('over');
    expect(a.endReason).toBe('finished');
    expect(a.placements).toEqual(['green', 'blue', 'red', 'yellow']);
    expect(dmCanAct(a, 'red')).toBe(false);
  });

  it('a captura do canhão também pode fechar a partida pro dono', () => {
    let s = game();
    playerOf(s, 'blue')!.stats.captures = 7;
    s = withPieces(s, { green: [relOf('green', STAR_ABS.blue) - 1, BASE, BASE, BASE] });
    const a = dmMove(dmRoll(s, 'green', 1, 0), 'green', 0, 0);
    expect(a.turn.phase).toBe('over');
    expect(a.placements![0]).toBe('blue');
  });

  it('acabou o tempo: timeUp fecha com reason time e ranking por capturas', () => {
    let s = game(ALL, 0, 60_000);
    s = dmMove(dmRoll(s, 'green', 6, 0), 'green', 0, 0);
    playerOf(s, 'red')!.stats.captures = 3;
    expect(isTimeUp(s, 59_999)).toBe(false);
    expect(timeUp(s, 59_999)).toBe(s);
    expect(isTimeUp(s, 60_000)).toBe(true);
    const over = timeUp(s, 60_000);
    expect(over.endReason).toBe('time');
    expect(over.placements![0]).toBe('red');
    expect(() => dmRoll(over, 'green', 1, 60_001)).toThrow();
  });

  it('rolar com o tempo esgotado é recusado', () => {
    let s = game(ALL, 0, 10_000);
    s = dmRoll(s, 'green', 2, 0);
    expect(() => dmRoll(s, 'red', 2, 10_000)).toThrow(/tempo esgotado/);
  });

  it('encerrar manualmente: ranqueado usa capturas; abandonado não tem colocação', () => {
    let s = game();
    playerOf(s, 'yellow')!.stats.captures = 2;
    const r = endGame(s, true, 5);
    expect(r.endReason).toBe('ranked');
    expect(r.placements![0]).toBe('yellow');
    const a = endGame(s, false, 5);
    expect(a.endReason).toBe('abandoned');
    expect(a.placements).toBeNull();
  });

  it('remover/pausar: quem sai perde o ciclo; sobrando um ativo, acaba; quem volta ganha ciclo', () => {
    let s = game(['green', 'red', 'blue']);
    s = removePlayer(s, 'blue', 1);
    expect(dmPlayer(s, 'blue')).toBeUndefined();
    expect(s.turn.phase).not.toBe('over');
    s = pausePlayer(s, 'red', 2);
    expect(s.turn.phase).toBe('over'); // só o verde ativo
    expect(s.placements![2]).toBe('blue'); // removido por último
    // resume devolve ciclo (numa partida ainda aberta)
    let t = game(['green', 'red', 'blue']);
    t = pausePlayer(t, 'red', 1);
    expect(dmCanAct(t, 'red')).toBe(false);
    t = resumePlayer(t, 'red', 2);
    expect(dmCanAct(t, 'red')).toBe(true);
    expect(dmPlayer(t, 'red')!.phase).toBe('roll');
  });

  it('dmPlacements coloca removidos por último, do mais recente pro mais antigo', () => {
    let s = game();
    s = removePlayer(s, 'green', 10);
    s = removePlayer(s, 'red', 20);
    expect(dmPlacements(s).slice(2)).toEqual(['red', 'green']);
  });
});
