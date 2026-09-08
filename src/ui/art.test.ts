import { it, expect } from 'vitest';
import { powerIconUrl, uiIconUrl, isOgPowerIcon, FX_DECLARED, OG_FX_DECLARED, OG_POWER_KEYS, normalizeKey } from '../lib/art.svelte';
import { settings } from '../stores/settings.svelte';

it('sem arquivos de arte, tudo cai no padrão (emoji / desenho) — inclusive no tema OG', () => {
  expect(powerIconUrl('rocket')).toBeNull();
  expect(powerIconUrl('bomb')).toBeNull();
  expect(uiIconUrl('tab-home')).toBeNull();
  expect(Object.keys(FX_DECLARED)).toEqual([]);
  expect(Object.keys(OG_FX_DECLARED)).toEqual([]);
  expect(OG_POWER_KEYS).toEqual([]);
  settings.theme = 'og';
  expect(powerIconUrl('rocket')).toBeNull();
  expect(isOgPowerIcon('rocket')).toBe(false);
  settings.theme = 'cream';
  // nomes de arquivo tolerantes: mega-bomb, megaBomb, Mega_Bomb → a mesma chave
  expect(normalizeKey('mega-bomb')).toBe(normalizeKey('megaBomb'));
  expect(normalizeKey('Mega_Bomb')).toBe('megabomb');
});

import { mount, unmount, flushSync } from 'svelte';
import Board from './Board.svelte';
import Pawn from './Pawn.svelte';
import { createGame } from '../engine/game';

it('tabuleiro desenha as casas de poder com <text> quando não há arte; peão usa o desenho padrão sem sprite', () => {
  const g = createGame({
    rules: { mode: 'powers', captureBonus: false },
    players: [
      { color: 'green', playerId: 'a', name: 'A', avatar: '' },
      { color: 'red', playerId: 'b', name: 'B', avatar: '' },
    ],
    seed: 3,
  });
  const s = structuredClone(g);
  s.powers!.cells = [
    { abs: 5, power: 'rocket' },
    { abs: 9, power: 'bomb' },
  ];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = mount(Board, { target: host, props: { state: s } });
  flushSync();
  const powers = host.querySelectorAll('g.power');
  expect(powers.length).toBe(2);
  expect(host.querySelectorAll('g.power image').length).toBe(0);
  expect(host.querySelectorAll('g.power text').length).toBe(2);
  unmount(app);

  // peão: em jsdom a imagem nunca carrega, então fxSprite('fire') é null → desenho padrão
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  const pawn = mount(Pawn, { target: svg, props: { color: 'green', x: 1, y: 1, fire: true, shield: true } });
  flushSync();
  expect(svg.querySelector('.flame')).toBeTruthy();
  expect(svg.querySelector('.shield')).toBeTruthy();
  unmount(pawn);
});

import Sprite from './Sprite.svelte';

it('sprite: tira de N quadros vira <image> N× mais larga, recortada num quadrado', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  const app = mount(Sprite, { target: svg, props: { sprite: { url: 'x.png', frames: 8, fps: 16 }, x: 2, y: 3, size: 1.1 } });
  flushSync();
  const img = svg.querySelector('image')!;
  expect(Number(img.getAttribute('width'))).toBeCloseTo(8.8, 5);
  expect(Number(img.getAttribute('height'))).toBeCloseTo(1.1, 5);
  expect(img.getAttribute('style')).toContain('--frames: 8');
  expect(img.getAttribute('style')).toContain('--dur: 0.5s');
  const rect = svg.querySelector('clipPath rect')!;
  expect(Number(rect.getAttribute('width'))).toBeCloseTo(1.1, 5);
  unmount(app);
});
