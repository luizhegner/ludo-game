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
    game       turno, movimento, capturas, chegada; jogadores entrando/saindo
    powers     modo Poderes: catálogo, sorteio das casas, efeitos por peça
    board      geometria do tabuleiro 15×15
  stores/      estado reativo (Svelte 5 runes) persistido em localStorage
    match      partida em andamento, animações, auto-move
    players    cadastro de jogadores (nome + avatar)
    history    partidas encerradas (fonte da verdade pra estatísticas/Elo)
    settings   ajustes
    setup      última configuração de partida
    nav        abas + pilha de telas (integra com o "voltar" do Android)
  lib/         utilidades puras: cores, modos, poderes (ícones/textos), avatares, estatísticas, linha do tempo, backup, sons
    art        arte opcional (ícones e sprites em src/assets/art/ — ver ARTE.md)
  ui/          componentes Svelte (páginas, tabuleiro, dado, sheets)
  assets/art/  ícones e efeitos animados opcionais (powers/, ui/, fx/) — sem arquivo, vale o emoji/desenho padrão
public/sounds/ samples opcionais (ver SONS.md) — sem arquivo, vale o som sintetizado
public/sounds/og/ pacote "sons do jogo original" (switch nos Ajustes; ver SONS.md)
src/assets/art/og/ recortes do jogo original, só no tema OG (ver ARTE.md §2b)
tools/         og-icones.py (recorta casas de poder dos prints) e og-sons.py (corta os sons da gravação)
```

Pra trocar ícones, efeitos e sons por arquivos de verdade: **`ARTE.md`** (especificações e lista do que procurar).

Chaves no localStorage: `ludo.match.v1`, `ludo.players.v1`, `ludo.settings.v1`, `ludo.lastSetup.v2`. O histórico fica no **IndexedDB** (banco `ludo`, store `games`); uma partida completa tem ~80 KB e o localStorage não daria conta.
