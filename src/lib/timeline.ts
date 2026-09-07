/**
 * Transforma o log do motor em frases legíveis pra linha do tempo do histórico
 * ("19:44 João comeu Maria"). Eventos triviais (rolagem, passagem de vez,
 * movimento comum) são omitidos pra linha não ficar gigante.
 */
import type { Color, GameEvent, GameState } from '../engine/types';
import { describePowerEvent } from './powers';

export interface TimelineItem {
  t: number;
  text: string;
  /** Cor de quem protagonizou (pra pintar a bolinha). */
  color?: Color;
  /** Destaque visual. */
  kind: 'info' | 'capture' | 'finish' | 'done' | 'penalty' | 'over' | 'power';
}

export function timelineOf(game: GameState, nameOf: (c: Color) => string): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const e of game.log) {
    const item = describe(e, nameOf);
    if (item) out.push(item);
  }
  return out;
}

function describe(e: GameEvent, nameOf: (c: Color) => string): TimelineItem | null {
  const pw = describePowerEvent(e, nameOf);
  if (pw) {
    const kind: TimelineItem['kind'] = e.type === 'capture' ? 'capture' : e.type === 'boom' || e.type === 'lost' ? 'penalty' : 'power';
    return { t: e.t, text: pw.text, color: pw.color, kind };
  }
  switch (e.type) {
    case 'start':
      return { t: e.t, text: `Partida começou · ${nameOf(e.first)} joga primeiro`, color: e.first, kind: 'info' };
    case 'capture':
      return { t: e.t, text: `${nameOf(e.by)} comeu ${nameOf(e.victim)}`, color: e.by, kind: 'capture' };
    case 'finish':
      return { t: e.t, text: `${nameOf(e.color)} colocou uma peça no centro`, color: e.color, kind: 'finish' };
    case 'playerDone':
      return { t: e.t, text: `${nameOf(e.color)} terminou em ${e.place}º`, color: e.color, kind: 'done' };
    case 'threeSixes':
      return {
        t: e.t,
        text:
          e.piece === null
            ? `${nameOf(e.color)} tirou três 6 e perdeu a vez`
            : `${nameOf(e.color)} tirou três 6: a peça voltou pra base`,
        color: e.color,
        kind: 'penalty',
      };
    case 'move':
      // saída da base é um marco; movimento comum não
      if (e.from === -1) return { t: e.t, text: `${nameOf(e.color)} tirou uma peça da base`, color: e.color, kind: 'info' };
      return null;
    case 'gameOver': {
      if (e.reason === 'abandoned') return { t: e.t, text: 'Partida encerrada sem contar', kind: 'over' };
      const w = e.placements?.[0];
      const how = e.reason === 'ranked' ? ' (encerrada e ranqueada por progresso)' : '';
      return { t: e.t, text: w ? `Fim de jogo · ${nameOf(w)} venceu${how}` : `Fim de jogo${how}`, color: w, kind: 'over' };
    }
    default:
      return null;
  }
}

/** Contagem de rolagens por jogador (pra estatísticas do detalhe). */
export function rollsByColor(game: GameState): Partial<Record<Color, number>> {
  const out: Partial<Record<Color, number>> = {};
  for (const e of game.log) if (e.type === 'roll') out[e.color] = (out[e.color] ?? 0) + 1;
  return out;
}
