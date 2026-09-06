# Notas sobre o jogo de referência

> Observações extraídas de 7 capturas de tela do app de Ludo que o grupo já joga
> (modo "Solo · Power"). As imagens não puderam ser salvas no repositório.
> **Direção do usuário: o estilo é datado; queremos um "Ludo 2", não uma cópia.**
> Estas notas servem pra capturar *mecânica e hábitos*, não o visual.

## Disposição das cores (importante: o grupo se orienta por cor)

```
┌────────┬────────┐
│ VERDE  │ VERMELHO│      sentido horário:
├────────┼────────┤      verde → vermelho → azul → amarelo
│ AMARELO│  AZUL  │
└────────┴────────┘
```
- Diferente do padrão "Ludo King" (vermelho TL, verde TR, amarelo BR, azul BL) que estava no SPEC/mock.
- Reta final de cada cor fica no braço adjacente à sua base (padrão).

## Casas especiais no tabuleiro

- **Saída de cada cor:** casa na cor da base com **estrela branca**.
- **Casa segura (8 após a saída):** casa branca com **estrela na cor da base mais próxima**
  (estrela verde perto da base verde, etc.). Leitura rápida: "estrela colorida = seguro".
- **Casas de poder:** ícone colorido sobre a casa branca. Visíveis o tempo todo. Contei ~11 ao mesmo tempo
  (bem mais que as 6 combinadas no SPEC — o tabuleiro fica carregado).

## Poderes vistos nas casas

| Ícone na referência | Provável equivalente no SPEC |
|---|---|
| 🛡️ escudo (casa azul-clara) | Escudo |
| 🧊 cubo de gelo translúcido | Congelar |
| **x2** roxo / **x3** roxo | Multiplicador ×2 / ×3 |
| 🔥 fogo | Fogo |
| 🧨 TNT (2 no tabuleiro) | Bomba |
| 🚀 foguete (2 no tabuleiro) | Foguete |
| 🪀 **mola / trampolim** (2 no tabuleiro) | **? — não está no SPEC** |
| 🎡 **roda rosa com pontos de dado** | **? — provavelmente dado personalizável ou dado duplo** |

## Fluxo de turno na referência

- Cada jogador tem um **card fora do tabuleiro, no canto da sua base** (avatar + ⚔ capturas + 💀 mortes).
- Na vez do jogador, o **avatar do card vira o botão de rolar** (ícone de dado + mãozinha apontando).
- Depois de rolar, um **dado 3D translúcido** aparece sobre o tabuleiro mostrando a face.
- Casa de destino/poder recebe um **brilho circular** de destaque.
- Dentro da base: **nome do jogador** ("Human") e **% de progresso** ("0%").
- Rodapé: voltar · rótulo do modo ("Solo / Power") · botão "correr" (pular/auto?) · engrenagem.
- Fundo muda de cor entre capturas (marrom / vinho) — parece efeito, não tema.

## Adicionar/remover jogador na partida

- Diálogo "Select a coin to Add/Remove player": grade 2×2 com o peão de cada cor;
  cores vazias mostram botão **Add +**; cores ocupadas presumivelmente mostram Remove.

## Seleção de jogadores (pré-partida)

- Checkboxes **2P / 3P / 4P** + grade 2×2 das cores (mesma disposição do tabuleiro),
  cada card com avatar e "Human"/"Nobody". Botão PLAY.

## Modos da referência

- Abas: **Normal** · **2v2 Team**
- Lista: **Classic · 5 Minutes · Quick · Deathmatch · Power**
- No SPEC temos: Clássico, Poderes, 2v2, 2v2 Poderes, Rápido.
  **Não temos:** "5 Minutes" (limite de tempo) e "Deathmatch".

## O que vale herdar (mecânica/hábito, não estilo)

- Disposição das cores (a confirmar com o usuário).
- Estrela colorida = casa segura; estrela branca em casa colorida = saída.
- Nome dentro da base; progresso % é útil e discreto.
- Contadores de capturas/perdas por jogador visíveis (talvez dentro da base, pequenos).
- Rolar o dado a partir do canto do jogador da vez (já está no SPEC, com arrasto).
- Diálogo simples de adicionar/remover por cor.

## O que NÃO herdar

- Banner de anúncio, fundo marrom, botões verdes "glossy", texturas de vidro, partículas constantes.
- ~11 casas de poder simultâneas (poluição).
- Ícones de poder em estilos misturados (emoji, 3D, texto).

---

# Segunda leva de prints (modos em ação + telas de Rules)

## Poderes confirmados pelas telas "Rules → Power"

| Nome na referência | Texto da regra | Equivalente no SPEC |
|---|---|---|
| **Rocket** | "launches your pawn forward" (voa por cima, contorna a esquina) | Foguete |
| **Shield** | "protects pawn from any killing attacks" | Escudo |
| **Magical dice** | "lets you pick your favorite number once" | Dado personalizável ✔ (confirmado) |
| **TNT** | "avoid being blown up by TNT" | Bomba |
| **Spring board** | "bounces your pawn forward" (pulo curto) | Mola |
| **Multiplier x2/x3** | "increases your dice roll by 2/3 times" (dado ⚀ x2 = ⚃) | ×2 / ×3 |
| **Ice** | "freezes your pawn for next turn" | Congelar |
| **Fire** | "burns all pawns in its way" (caveiras nas casas do caminho) | Fogo |
| **Landmine** | "blasts when a pawn steps on it" | **? não está no SPEC** — não aparece no tabuleiro dos prints → provavelmente **escondida** |

- Não existe na referência: **dado duplo** (rola 2 e soma) nem **mega bomba** — são adições nossas.
  Suspeita: o "dado duplo" lembrado no início era o próprio **×2** (o ícone é literalmente "dado x2").
- Cada casa de poder tem **fundo com tom suave da família do poder**: lilás (x2/x3/dado mágico),
  azul-claro (gelo/escudo), rosado (foguete), etc. Ajuda a reconhecer pela cor.

## Deathmatch (Rules + partida)

- **"All the players play at the same time"** — é **tempo real**: nos prints, o card de rolar aparece
  ativo pro vermelho E pro amarelo simultaneamente.
- **"Match concludes on kill goal or time limit"** — alvo **⚔ 8 kills** (mostrado no centro do tabuleiro:
  "Target ⚔ 8") ou **5:00** de relógio (cronômetro no topo).
- **"Cannon guards your colored stars"** — um **canhão fica dentro da base** de cada jogador;
  o desenho mostra o canhão atirando num peão que está na estrela colorida.
- **"Home path is blocked"** — a 1ª casa da reta final de cada cor tem um **🚫**; ninguém chega ao centro.
  O jogo é só de capturas.
- Peças **começam na base** (print mostra 4 na base). Sem % de progresso nas bases. Sem casas de poder.

## Quick (partida)

- **Reta final também bloqueada (🚫)** — igual ao Deathmatch. Logo, vence-se **completando a volta**
  com um peão (bate com "chegar na sua base = dar uma volta completa" dito pelo usuário).
- Base mostra **% de progresso**. Sem cronômetro, sem poderes.

## 5 Minutes (partida)

- Cronômetro **04:58** no topo.
- **Todas as 4 peças de cada cor começam FORA, empilhadas na casa de saída.**
- Base mostra um **contador "0"** (não é %) — pontuação? kills? peças no centro? (a confirmar).
- Reta final **aberta** (sem 🚫). Sem poderes.

## Outros detalhes de UI

- O card do jogador (fora do tabuleiro) vira o **botão de dado** quando é a vez dele; nos modos
  em tempo real fica ativo pra todos.
- Cronômetro em cápsula escura, centralizado acima do tabuleiro.
- "Target ⚔ 8" ocupa o **centro do tabuleiro** no Deathmatch (o centro não é usado nesse modo).
