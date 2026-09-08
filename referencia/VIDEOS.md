# Vídeos de referência — análise

> As gravações chegaram divididas em branches (`ref-video*` e `ref-vid-2-part*`) e foram
> remontadas por concatenação das partes. Os arquivos completos ficam na working tree
> (não versionados — as partes já estão nos branches de origem):
>
> - `refs-video-1-19556.mp4` — 4 min 18 s, 480×854 (59,94 fps) — parte 1+2
> - `refs-video-2-inshot.mp4` — 4 min 34 s, 384×854 (30 fps) — partes 1–4

## Vídeo 1 — partida Solo 2 jogadores (modo "Solo · Power")

2 jogadores, ambos rotulados "Human" (o de cima é o bot): **vermelho (sup. dir.) × amarelo (inf. esq.)**.
As bases verde (sup. esq.) e azul (inf. dir.) ficam **desenhadas mas vazias** — em 2P o app usa
diagonais. O vermelho venceu (~2:50 da gravação).

- **0:00** — tabuleiro inicial: 4 peças por base, todas as bases com "0%".
- **0:08** — primeiro lançamento do amarelo (jogador): o dado **3D na cor do jogador** aparece
  sobre o tabuleiro mostrando a face; a peça dourada sai pra casa de saída; base sobe pra "1%".
- **0:20** — vez do vermelho: dado **vermelho** gigante rolando perto da base dele.
- **0:26** — primeiro dano: o amarelo já tem "1 💀"; uma peça vermelha no anel ganhou **escudo**
  (bolha azul sobre o peão). Base do vermelho em 18%.
- **0:38** — **emoji de reação** (balão com cara) sobre o peão que acabou de ser comido.
- **até o fim** — o % de cada base sobe; o do vencedor chega a **100%** com **confete** e o avatar
  dele ganha **óculos de sol** (inclusive no botão do dado). Não há tela de fim: a partida só
  escurece e o rodapé desativa.

### Elementos de UI confirmados

- Card de jogador **fora do tabuleiro, no canto da própria base**: avatar + `✕ n` (peças no centro)
  + `💀 n` (mortes). Na vez dele, **o avatar vira o botão de rolar** (ícone de dado + mãozinha 👉
  animada). Card ativo ganha moldura na cor + brilho.
- Após rolar, o **dado fica no card** mostrando a última face (na cor do jogador).
- Rodapé: `◀` · rótulo do modo ("Solo / Power") · botão verde de "correr" (auto) · ⚙️.
- Fundo **muda de cor** durante a partida (marrom → vinho → dourado…) — é efeito, não tema.
- Bases vazias aparecem com os 4 alvéolos apagados (sem "vazio").

### Casas de poder vistas no tabuleiro (Solo · Power)

| Ícone | Contagem | Equivalente no SPEC |
|---|---|---|
| TNT (caixa vermelha) | 2 | Bomba |
| 🚀 foguete (fundo rosa) | 2 | Foguete |
| 🛡️ escudo (fundo azul-claro) | 1–2 | Escudo |
| 🔥 fogo (fundo rosa) | 1 | Fogo |
| **x2 / x3** (texto roxo) | 1 cada | ×2 / ×3 |
| **flor rosa** (casa lilás) | 1–2 | Dado personalizável |
| **morto-louro/colarinho sobre moedas** (fundo creme) | 2 | **? não está no SPEC** — ver abaixo |
| estrelas brancas (saídas) + estrelas coloridas (seguras) | 4+4 | Saída / seguras ✔ |

- **Novo, não catalogado:** o ícone de **chapéu de formatura sobre pilha de moedas** (2 casas,
  fundo creme). Provável leitura: "formatura"/bônus — talvez teleporte a peça pra perto da reta
  final, ou manda peça adversária de volta. **A confirmar** (não deu pra ver o efeito nos 2 vídeos).
- ~10–11 casas de poder simultâneas, confirmando a nota do NOTAS.md ("bem mais que as 6 do SPEC").

## Vídeo 2 — partida Solo 4 jogadores + telas de pré-jogo

4P: **vermelho = Human (inf. esq.)** × **Computer** azul (sup. esq.), amarelo (sup. dir.) e verde
(inf. dir.). Um **Computer verde venceu** — o humano terminou com 98%, o verde com 99% (fim apertado).

- **0:00–0:02** — tela de power-ups: punho + "Power — *Use Powerups To Win Over Opponents*"
  (loja de power-ups compráveis — recurso do app, não do modo).
- **0:03** — tela **SELECT PLAYERS**: checkboxes 2P / 3P / 4P.
- **0:04** — tela **SELECT COLOR**: grade 2×2 na disposição do tabuleiro (verde TL, vermelho TR,
  amarelo BL, azul BR); o jogador escolhe **a própria cor** (peão com check). Botão PLAY.
- **durante a partida** — o **tabuleiro gira**: a cor escolhida vai pra **inf. esq.** (no vídeo 2 o
  humano é vermelho e o board aparece rotacionado 180° em relação ao vídeo 1). O humano **sempre
  fica embaixo**, com card e dado na área confortável de toque.
- Botão de **power-up** no rodapé: pegadinha/patinha verde com **badge de contagem** (aparece e
  some conforme o estoque).
- Bots decidem sozinhos: o dado deles aparece no card, gira e a peça anda; vários bots podem estar
  "pensando" em sequência rápida.

### Diferenças do 4P em relação ao 2P

- Cards nos **quatro cantos** (2 em cima, 2 embaixo), cada um com `✕ n / 💀 n` dos dois lados do
  avatar.
- Os dados de cima ficam **próximos das bases de cima** (a UI não os vira — em 4P ninguém senta do
  outro lado, todos jogam do mesmo aparelho).

## O que os vídeos confirmam do NOTAS.md

- Disposição base verde TL · vermelho TR · amarelo BL · azul BR ✔
- Card no canto da base vira botão de rolar, com mãozinha ✔
- Dado 3D translúcido na cor do jogador, face visível, fica no card ✔
- % dentro da base, nome dentro da base ✔
- ~11 casas de poder, visíveis o tempo todo, fundo por família ✔
- Fundo com cor variável (efeito) ✔
- Rola o dado a partir do canto do jogador da vez ✔

## O que os vídeos mostram que o NOTAS.md não tinha

1. **Girar o tabuleiro pra deixar o humano embaixo** (2P: diagonais; 4P: rotaciona a cor escolhida
   pro canto inf. esq.).
2. **Emoji de reação** no peão recém-comido (balão com a cara).
3. **Fim de jogo sem tela**: confete + 100% + óculos de sol no avatar; a partida continua
   exibida, rodapé desativado.
4. **Casa de "morto-louro/colarinho sobre moedas"** (×2 no tabuleiro) — poder não catalogado.
5. **Loja de power-ups** (badge no rodapé + tela de compra) — recurso do app, fora do escopo do
   nosso SPEC (monetização).
6. **Tela SELECT PLAYERS (2P/3P/4P) + SELECT COLOR** — fluxo pré-jogo em 1 tela (o nosso usa 3
   passos; o deles é mais curto, mas o nosso já vem pré-preenchido e permite criar jogador na hora).
7. Bots são rotulados "Computer" com avatar de robô; o humano é "Human" com avatar de cara.
   Em 2P o bot também aparece como "Human".

## Decisões de projeto sugeridas (pra discutir, nada implementado)

- **Humano sempre embaixo:** hoje o tabuleiro é fixo (verde TL · vermelho TR · azul BR · amarelo
  BL) e o jogador escolhe a cor — quem escolher verde fica no canto de cima, com base e dado
  "de cabeça pra baixo". A referência resolve girando o tabuleiro. Se quisermos herdar, o mais
  barato é **rotacionar a visão** (mesma geometria do motor, apenas remapear os cantos na UI).
- **Fim de jogo:** nosso GameOver já é melhor que o deles (pódio, Elo, revanche). Daria pra
  sumir o que falta do deles: **confete** e o **óculos de sol** no avatar do vencedor.
- **Emoji de reação** na captura (balão por ~1 s): barato, divertido, encaixa nos toasts que já
  existem.
- **Chapéu-de-formatura:** catalogar no SPEC quando o grupo identificar o efeito (ou descartar —
  não parece essencial).
