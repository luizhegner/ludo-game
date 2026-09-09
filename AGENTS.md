# AGENTS.md — guia pra agentes de IA (e humanos) neste repositório

> ## ⚠️ LÊ ESTE ARQUIVO PRIMEIRO
> Se você é um agente de IA começando a mexer neste repo, este é o ponto de entrada.
> **Antes de escrever qualquer código**, leia as introduções da tabela abaixo na ordem
> — são ~5 minutos e evitam re-inventar regra que já foi combinada. Depois, siga o
> workflow da skill certa (seção 2).

## 1. Leia antes de codar — as introduções, na ordem

| # | Arquivo | O que é | Leia (só a introdução) |
|---|---------|---------|------------------------|
| 1 | [`README.md`](README.md) | Visão geral, estrutura de pastas, comandos | tudo (2 min) |
| 2 | [`SPEC.md`](SPEC.md) | **As regras combinadas do jogo — fonte da verdade** | §0 "Ponto de partida" + o índice de seções; depois, a seção do que você vai mexer |
| 3 | [`referencia/NOTAS.md`](referencia/NOTAS.md) | O app de referência que inspirou o jogo (mecânica e hábitos) | "O que vale herdar" e "O que NÃO herdar" (o visual dela é datado — não copiar) |
| 4 | [`referencia/VIDEOS.md`](referencia/VIDEOS.md) | Análise dos 2 vídeos do app original (2P e 4P) | "O que os vídeos mostram que o NOTAS não tinha" + "Decisões sugeridas" |
| 5 | [`ARTE.md`](ARTE.md) | Como o jogo detecta e usa arte (ícones, sprites) | §1 "Regras gerais dos ícones" |
| 6 | [`SONS.md`](SONS.md) | Sons: 23 sintetizados + samples opcionais | a tabela de nomes/arquivos |

Regras de ouro:

- **Não re-invente regra que está no `SPEC.md`.** Se faltar algo, marque como
  **[padrão]** na própria spec e avise o dono — é como todo o resto foi decidido.
- Item **[padrão]** no SPEC = decisão tomada por falta de definição; pode mudar, mas
  avise e atualize a spec na mesma mudança.
- O visual-alvo está no mock [`mocks/fundo.html`](mocks/fundo.html) (fundo creme, peças 3D,
  placa de poder por família). O estilo do app de referência **não** é o alvo.

## 2. Skills — workflows prontos pra agent (`skills/`)

25 skills de engenharia em [`skills/<nome>/SKILL.md`](skills/) (origem:
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), MIT — ver
[`skills/LICENSE.md`](skills/LICENSE.md)).

> **Regra: se a tarefa casa com uma skill, USE a skill** — siga o workflow dela
> (passos e critérios de saída). Não implemente direto "porque é rapidinho".

| Se você vai… | Use a skill |
|---|---|
| Começar uma sessão / decidir qual workflow se aplica | [`using-agent-skills`](skills/using-agent-skills/SKILL.md) (meta-skill) |
| Definir recurso novo ou mudança grande | `spec-driven-development` → **atualizar o `SPEC.md` junto com o código** |
| Quebrar o trabalho em tarefas | `planning-and-task-breakdown` |
| Implementar (o tempo todo) | `incremental-implementation` + `test-driven-development` |
| Mexer em UI/componentes/tabuleiro | `frontend-ui-engineering` |
| Algo quebrou / comportamento inesperado | `debugging-and-error-recovery` |
| Testar algo no navegador | `browser-testing-with-devtools` |
| Revisar antes de commit/PR | `code-review-and-quality` |
| Código ficou torto/complexo | `code-simplification` |
| Commit, branch, PR | `git-workflow-and-versioning` |
| Performance (PWA de celular) | `performance-optimization` |
| Documentar uma decisão | `documentation-and-adrs` |
| Preparar deploy | `shipping-and-launch` |
| Não achou no quadro acima | leia `skills/using-agent-skills/SKILL.md` — tem o mapa completo |

## 3. Comandos

```sh
npm ci --legacy-peer-deps
npm run dev        # dev server (http://localhost:5173)
npm test           # vitest — motor + UI (jsdom). TUDO verde antes de commit
npm run check      # svelte-check — 0 erros antes de commit
npm run build      # build PWA (dist/ + service worker)
```

Sem `npm test` verde + `npm run check` limpo, a mudança não está pronta.

## 4. Invariantes (não quebrar)

- **Motor de regras** (`src/engine/`): TypeScript **puro, sem DOM, sem Svelte**.
  Toda mudança de regra vem com **teste novo** no `*.test.ts` ao lado. O motor nunca
  decide visual — a camada de apresentação entrega número pra ele, nada mais.
- **UI** (`src/ui/`, `src/stores/`): Svelte 5 com **runes** (`$state`, `$derived`,
  `$effect`); estado reativo em stores `*.svelte.ts` persistidos em localStorage.
- **PWA estritamente offline**: nenhuma chamada de rede, CDN ou fonte externa depois
  do install; tudo precacheado (`vite-plugin-pwa`).
- **Idioma**: somente **português (BR)** na UI, nos docs e nos commits.
- **Tabuleiro**: 15×15, cores **fixas** — verde (sup. esq.) · vermelho (sup. dir.) ·
  azul (inf. dir.) · amarelo (inf. esq.); anel de 52 casas + 5 de reta final por cor.
  Geometria em `src/engine/board.ts` — não espalhar coordenadas pela UI.
- **Persistência**: chaves `ludo.*.v1/v2` (localStorage) + IndexedDB `ludo`/`games`.
  Partida salva em versão antiga do app **precisa continuar abrindo** (ver
  `sanitize`/versões nos stores).
- **Arte e sons são opcionais**: sem arquivo em `src/assets/art/` e `public/sounds/`,
  vale o fallback (emoji/desenho/síntese). Convenções de nome e formato em
  `ARTE.md` e `SONS.md`.
- **Dado físico** (`src/lib/die/`, Three.js + cannon-es): é **camada de
  apresentação**. O número é sorteado no instante do toque, antes do deslize, e o
  3D só anima até pousar na face sorteada (`forceValue` em `roll()`); nenhum
  resultado vem da física (não existe modo "física real").

## 5. Mapa rápido do projeto

```
src/engine/   motor de regras (puro, testado) — game, powers, deathmatch, board
src/stores/   estado reativo (Svelte 5 runes) persistido
src/lib/      utilidades puras (cores, modos, powers, avatares, elo, sons, die)
src/ui/       componentes Svelte (páginas, tabuleiro, dado, sheets)
src/assets/   arte opcional (ver ARTE.md) · public/sounds/ sons (ver SONS.md)
SPEC.md       regras combinadas · ARTE.md/SONS.md convenções de mídia
referencia/   o jogo de origem (NOTAS.md + VIDEOS.md) · mocks/ fundo aprovado
tools/        geradores do pacote OG (ícones/sons recortados do original)
```

Detalhes da estrutura: [`README.md`](README.md). Fases de construção e estado:
`SPEC.md` §12.
