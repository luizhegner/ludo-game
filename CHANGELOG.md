# Changelog

Histórico de versões do jogo. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/),
versionamento [semântico](https://semver.org/lang/pt-BR/).

## [0.2.0] — 2026-09-08

### Adicionado

- **Pacote de ícones do jogo original** — Ajustes → Aparência → "Ícones do jogo
  original", independente do tema (mesma ideia do switch de sons). Com ele ligado, as
  casas de poder e as listas usam a arte recortada de `src/assets/art/og/powers/`;
  o que não tiver arquivo continua no emoji. O tema OG continua funcionando como
  atalho pros mesmos arquivos.
- **Arte OG de verdade**: os 8 ícones da folha do jogo original separados com a nova
  ferramenta `tools/og-folha.py` — foguete · escudo · fogo · gelo · mina · TNT ·
  mola · dado personalizável (PNGs 128×128, fundo transparente).
- `CHANGELOG.md` (este arquivo); o rodapé dos Ajustes passou a mostrar `Ludo v0.2.0`.

### Alterado

- **Comer = jogada extra, sempre.** A opção "jogada extra ao comer" saiu da Nova
  partida (e o campo `captureBonus` do motor). Nos modos com turnos, quem come uma
  peça adversária joga de novo — vale também pro pouso do dado personalizável e pro
  fogo; cair no parceiro (2v2) não conta. O Deathmatch continua sem jogada extra de
  nenhum tipo (não há "vez").

## [0.1.0] — 2026-09-08

Primeira versão completa do jogo offline (PWA, Svelte 5 + Vite, tudo em pt-BR).

### Adicionado

- **Motor de regras** puro e testado: tabuleiro 15×15 (anel de 52 + 5 de reta final
  por cor), casas seguras, três 6, bônus de chegada ao centro.
- **Modos**: Clássico · Rápido · 5 Minutos · 2v2 · Poderes · Deathmatch (tempo real,
  casas seguras com prazo, canhão) — com Elo e histórico em IndexedDB.
- **12 poderes** em casas sorteadas (escudo, gelo, mola, foguete, dado personalizável,
  ×2/×3, bomba, mega bomba, mina, fogo…), com sprites animados opcionais nas peças.
- **Interface**: abas, Nova partida em 3 passos, cadastro de jogadores (emoji ou
  foto), Ajustes (sons, vibração em 3 níveis, tema creme/aurora/OG, dado), menu de
  partida com regras e "segurar pra ver o poder".
- **Dado físico** em Three.js + cannon-es (modo "sorteio + animação" ou física real;
  o número nunca vem da física) e dado grande rolando pelo tabuleiro.
- **Pacote "sons do jogo original"** (switch próprio; `tools/og-sons.py` corta os
  samples da gravação) e infra de arte opcional (ícones/sprites com fallback).
- Docs do projeto: `AGENTS.md`, `SPEC.md`, `ARTE.md`, `SONS.md`, `referencia/`
  (notas + análise dos vídeos), `skills/` (25 workflows) e ferramentas de recorte.
