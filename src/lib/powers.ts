/**
 * Apresentação dos poderes: ícone, cor de família, frases pros avisos e pra
 * linha do tempo. As regras ficam no motor (`src/engine/powers.ts`).
 */
import type { Color, GameEvent, Power } from '../engine/types';
import { POWER_INFO, POWER_ORDER, type PowerFamily } from '../engine/powers';

export { POWER_INFO, POWER_ORDER };

export const POWER_ICON: Record<Power, string> = {
  shield: '🛡️',
  freeze: '❄️',
  spring: '🪀',
  magicDice: '🎯',
  x2: '✖️2',
  x3: '✖️3',
  rocket: '🚀',
  bomb: '💣',
  megaBomb: '💥',
  mine: '💀',
  fire: '🔥',
};

/** Fundo suave por família (SPEC §5): lilás dados · azul defesa · laranja impulso · vermelho explosivos. */
export const FAMILY_BG: Record<PowerFamily, string> = {
  dice: '#e9d8ff',
  defense: '#d2e8ff',
  boost: '#ffe1bf',
  blast: '#ffcfcf',
};
export const FAMILY_BORDER: Record<PowerFamily, string> = {
  dice: '#9b6ddb',
  defense: '#4a90d9',
  boost: '#e08a2e',
  blast: '#d9483f',
};
export const FAMILY_NAME: Record<PowerFamily, string> = {
  dice: 'Dados',
  defense: 'Defesa e gelo',
  boost: 'Impulso',
  blast: 'Explosivos e fogo',
};

export function powerName(p: Power): string {
  return POWER_INFO[p].name;
}
export function powerBlurb(p: Power): string {
  return POWER_INFO[p].blurb;
}
export function powerFamily(p: Power): PowerFamily {
  return POWER_INFO[p].family;
}
export function powerBg(p: Power): string {
  return FAMILY_BG[POWER_INFO[p].family];
}
export function powerBorder(p: Power): string {
  return FAMILY_BORDER[POWER_INFO[p].family];
}

/** Ícone + nome, pra listas. */
export function powerLabel(p: Power): string {
  return `${POWER_ICON[p]} ${POWER_INFO[p].name}`;
}

const CAUSE_NAME: Record<'fire' | 'bomb' | 'megaBomb' | 'mine', string> = {
  fire: 'fogo',
  bomb: 'bomba',
  megaBomb: 'mega bomba',
  mine: 'mina',
};

/**
 * Frase curta pra um evento de poder (toast na partida e linha do tempo).
 * Devolve null pros eventos que não merecem aviso.
 */
export function describePowerEvent(e: GameEvent, nameOf: (c: Color) => string): { text: string; color?: Color } | null {
  switch (e.type) {
    case 'power':
      return { text: `${POWER_ICON[e.power]} ${nameOf(e.color)} pegou ${POWER_INFO[e.power].name.toLowerCase()}`, color: e.color };
    case 'fly':
      return {
        text:
          e.power === 'rocket'
            ? `${POWER_ICON[e.power]} ${nameOf(e.color)} voou ${e.n} casas`
            : `${POWER_ICON[e.power]} ${nameOf(e.color)} pulou ${e.n} ${e.n === 1 ? 'casa' : 'casas'}, até a casa segura`,
        color: e.color,
      };
    case 'burn':
      return null; // as vítimas vêm como 'capture' com how:'fire'
    case 'shieldBlock':
      return { text: `🛡️ Escudo de ${nameOf(e.defender)} segurou ${nameOf(e.attacker)}, que voltou`, color: e.defender };
    case 'shieldBreak':
      return { text: `🛡️ Escudo de ${nameOf(e.color)} absorveu ${CAUSE_NAME[e.cause]}`, color: e.color };
    case 'boom':
      return {
        text:
          e.power === 'mine'
            ? `💀 ${nameOf(e.by)} pisou numa mina!`
            : e.power === 'megaBomb'
              ? `💥 Mega bomba! Tudo num raio de 2 casas voltou`
              : `💣 Bomba! A peça de ${nameOf(e.by)} voltou pra base`,
        color: e.by,
      };
    case 'lost':
      return e.cause === 'megaBomb' ? { text: `💥 ${nameOf(e.color)} perdeu uma peça na explosão`, color: e.color } : null;
    case 'pick':
      return { text: `🎯 ${nameOf(e.color)} escolheu ${e.value}`, color: e.color };
    case 'multLost': {
      const why =
        e.reason === 'overshoot'
          ? 'não cabia até o centro'
          : e.reason === 'replaced'
            ? 'trocado por outro'
            : e.reason === 'frozen'
              ? 'peça congelada'
              : e.reason === 'finished'
                ? 'peça chegou ao centro'
                : 'peça voltou pra base';
      return { text: `✖️${e.factor} de ${nameOf(e.color)} perdido (${why})`, color: e.color };
    }
    case 'fireOut':
      return e.reason === 'expired' ? { text: `🔥 Fogo de ${nameOf(e.color)} apagou`, color: e.color } : null;
    case 'mineRevealed':
      return { text: `💀 ${nameOf(e.by)} passou por cima de uma mina — agora todos veem`, color: e.by };
    case 'mineDetonated':
      return { text: `🔥 O fogo de ${nameOf(e.by)} detonou uma mina`, color: e.by };
    case 'repopulate':
      return { text: `✨ Novas casas de poder no tabuleiro` };
    case 'capture':
      if (!e.how) return null;
      return {
        text:
          e.how === 'fire'
            ? `🔥 ${nameOf(e.by)} queimou ${nameOf(e.victim)}`
            : `${POWER_ICON[e.how]} ${nameOf(e.victim)} foi pego pela ${CAUSE_NAME[e.how]} de ${nameOf(e.by)}`,
        color: e.by,
      };
    default:
      return null;
  }
}
