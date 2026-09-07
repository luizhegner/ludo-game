# Ludo

Ludo offline pra jogar com os amigos no mesmo celular (PWA). Regras, decisões e fases em [`SPEC.md`](SPEC.md).

## Rodar

```sh
npm ci --legacy-peer-deps
npm run dev        # http://localhost:5173
npm test           # vitest (motor + UI em jsdom)
npm run check      # svelte-check
npm run build      # dist/ com service worker
```

Deploy automático no GitHub Pages a cada push na `main` (`.github/workflows/pages.yml`).

## Estrutura

```
src/
  engine/      motor de regras (TypeScript puro, sem DOM) + testes
  stores/      estado reativo (Svelte 5 runes) persistido em localStorage
    match      partida em andamento, animações, auto-move
    players    cadastro de jogadores (nome + avatar)
    history    partidas encerradas (fonte da verdade pra estatísticas/Elo)
    settings   ajustes
    setup      última configuração de partida
    nav        abas + pilha de telas (integra com o "voltar" do Android)
  lib/         utilidades puras: cores, modos, avatares, estatísticas, linha do tempo, backup, sons
  ui/          componentes Svelte (páginas, tabuleiro, dado, sheets)
```

Chaves no localStorage: `ludo.match.v1`, `ludo.players.v1`, `ludo.settings.v1`, `ludo.lastSetup.v2`. O histórico fica no **IndexedDB** (banco `ludo`, store `games`); uma partida completa tem ~80 KB e o localStorage não daria conta.
