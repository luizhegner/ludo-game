# Referência visual — o "Ludo OG" (vídeo de gameplay)

Análise quadro a quadro do vídeo que o Luiz gravou do jogo original que serve de
base pro projeto (modo **Solo · Power**, 2 humanos: vermelho × amarelo). O vídeo
tem **4 min 18 s, 480×854 (retrato), 60 fps**. Ele **não está no repositório**
(46 MB; foi enviado em duas partes nas branches `ref-video-2` = part1 e
`ref-video` = part2 — juntar com `cat part1 part2 > gameplay.mp4`).

Este arquivo existe pra que **nenhum detalhe da análise se perca** entre as fases:
tudo o que a fase 8 (polimento) e o tema "OG" precisam está aqui, com o tempo
do vídeo de cada observação (mm:ss) pra conferir de novo se for preciso.

> Como "assistir" de novo: `tools/frames.sh gameplay.mp4 2` gera 1 quadro a
> cada 2 s + folhas de contato 4×4. Pra um trecho específico:
> `ffmpeg -ss 20.6 -t 1.6 -i gameplay.mp4 -vf "fps=10,tile=4x4" saida.png`.

---

## 1. Composição da tela (retrato)

| Faixa | Conteúdo |
|---|---|
| Topo (~15 % da altura) | Só o **avatar do jogador da vez**, num quadrado arredondado com **borda na cor dele** (vermelho em cima à direita, amarelo embaixo à esquerda — cada jogador tem o seu **canto**, do lado da base dele). Ao lado do avatar, dois contadores empilhados: **✕ capturas** e **☠ mortes**. Uma **mãozinha 👉** aparece ao lado do avatar quando é a vez daquele humano rolar. |
| Tabuleiro (~55 %) | Quadrado, ocupa toda a largura, com **moldura de madeira escura** (~2 % de espessura), cantos arredondados, sombra suave. |
| Abaixo do tabuleiro | Avatar/contadores do jogador de baixo (mesmo formato do topo). Espaço livre onde o dado para às vezes. |
| Rodapé | Botão **voltar** (verde, quadrado arredondado, `<`), rótulo central **"Solo / Power"** (modo, cinza discreto), botão **"acelerar"** (🏃, verde) e **⚙** (verde). |

**Fundo do app:** marrom-vinho muito escuro (`#2a1418` → `#3b1f1b`), com
**vinheta** (mais escuro nas bordas), e **bokeh dourado**: círculos grandes
desfocados (~8–12 % da largura, opacidade 5–10 %) e **fagulhas pequenas** de
4 pontas (✦) que flutuam devagar e piscam. Nada disso atrapalha a leitura — é
lento e pouco contrastado. No jogo o **tema pode oscilar** entre o vinho e um
marrom mais quente (0:08 vinho → 0:12 marrom): parece a luz do bokeh mudando.

**Placar do jogador fica DENTRO do tabuleiro:** cada base tem o nome
("Human") em branco/negrito na borda externa do quadrante e o **% de progresso**
na borda interna (perto do centro). O topo da tela não repete o nome.

## 2. Tabuleiro

- **Grade 15×15 clássica.** Anel de casas **branco/creme** (`#f2efe6`), separadas
  por **linhas finas cinza-claras** (não pretas). Retas finais pintadas na cor
  do jogador (a casa de saída também). **Centro** = 4 triângulos na cor de cada
  jogador, apontando pra dentro.
- **Quadrantes (bases):** cor **chapada e saturada** (`verde #2db84d`,
  `vermelho #ef3b36`, `amarelo #f7d51d`, `azul #1e88e5`), com um **quadrado
  interno arredondado, na mesma cor mais escura** (~12 % mais escuro, sem
  borda), e **4 círculos** mais escuros ainda marcando os lugares das peças.
  Nenhum fundo branco na base.
- **Estrelas** (casas seguras) desenhadas **na cor do jogador correspondente**
  (estrela verde na segura do verde etc.); a casa de saída de cada cor tem
  **estrela branca** sobre o fundo colorido. Estrelas ocupam ~60 % da casa.
- **Casas de poder:** o ícone ocupa **~80 % da casa**, com um leve fundo
  quadrado mais claro na família (rosa-claro pro fogo, azul-claro pro gelo,
  lilás-claro pro ×2/×3). Ícones vistos: 🛡 escudo, ×2 e ×3 (texto roxo
  grosso), 🔥 fogo, bomba **"TNT"** (caixa vermelha com letras), **baú** dourado
  (é a **mola**), **cubo de gelo azul** (congelar), **foguete** (ícone vermelho
  com estrelas, "🚀✦"), **dado com estrela** (dado personalizável), 🎯.
- **Setas de entrada** nas casas antes da reta final, brancas, discretas.
- **Pulso do quadrante:** quando é a vez de um jogador, o quadrante dele
  recebe um **clarão radial branco suave** que **pulsa** (aparece/some em ~1 s)
  no meio da base. Casas percorridas também "acendem" com um brilho branco
  rápido enquanto a peça anda.

## 3. Peças (peões)

- Formato **"gota"/pino**: cabeça esférica pequena em cima de um corpo
  bojudo, bem **brilhante** (reflexo especular forte no alto-esquerda, quase
  branco), cor saturada com sombra interna na base, **sombra elíptica escura**
  no chão. Altura ≈ **0,9 célula**; na base ficam nos 4 círculos.
- Peças da mesma cor na mesma casa **ficam lado a lado, menores**.
- **Peça selecionável:** ganha um **anel pontilhado preto** grosso girando
  ao redor (0:14, 1:37), e um leve pulo. Só as peças que podem andar ganham o
  anel.
- **Movimento:** casa a casa, ~**6 casas/s** (0,16 s por casa), com um pulinho;
  deixa um **rastro "fantasma"** — círculos semi-transparentes na cor da peça
  nas 3–4 casas anteriores que somem em ~0,5 s (0:20, 2:03).
- **Peça comida:** vira um círculo pontilhado, **voa** pra base em arco
  (~0,5 s), com o avatar do dono mostrando uma **carinha chorando** 😭 e o do
  captor uma **gargalhando** 😂 (0:21).
- **Chegada ao centro:** **confete** colorido explodindo do centro do
  tabuleiro (~1,5 s), peça encolhe e some no triângulo (4:15).

## 4. Dado

- **Dado 3D físico**, na cor do jogador da vez (vermelho brilhante ou dourado),
  pontos brancos/pretos, cantos arredondados. Ao tocar, ele é **arremessado
  sobre o tabuleiro**, rola, quica nas bordas e **para onde cair** (~1 s). Depois
  volta a ficar **parado no "slot" do jogador** (no quadrado do avatar) mostrando
  a face. Parado sobre o tabuleiro, ele **flutua meio transparente** por cima
  das casas até a jogada ser feita (0:44).
- Enquanto é a vez do outro humano, o avatar do jogador da vez **é substituído
  pelo dado** (0:10: a caixa do avatar vira o dado dourado).
- Dado **personalizável (🎯)**: abre um **painel roxo com moldura dourada** no
  topo, 6 dados brancos em grade 3×2 (0:54); ao tocar, fecha e a peça anda.

## 5. Efeitos dos poderes (como aparecem)

| Poder | Visual no vídeo | Tempo |
|---|---|---|
| 🔥 Fogo | Peão **envolto em chamas** laranja/amarelo, animadas, mais altas que a peça; a peça fica **inteira** visível através do fogo. Quando anda, as chamas acompanham. | 0:14–0:22, 2:33 |
| 🛡 Escudo | **Bolha azul translúcida** ao redor do peão, com reflexo (o peão vermelho na reta verde, 0:24–0:40). Ao absorver um golpe, a bolha **estoura** e a peça fica. | 0:24–0:44 |
| ❄ Congelar | Peão dentro de um **cubo de gelo azul-claro** translúcido; aviso "Your pawns will freeze here" quando o destino é uma casa de gelo. | 0:48–0:52, 1:10 |
| 💣 Bomba/TNT | Explosão redonda **preta com contorno e clarão** (estilo cartoon, com fumaça curta), peças no raio somem e voltam pra base. | 3:24, 2:30 |
| 🚀 Foguete | Peça **decola** e pousa longe em arco alto, com rastro. | 1:25 |
| 📦 Mola (baú) | A peça **pula até a próxima estrela** (casa segura) — ver §7. | 1:25–1:40 |
| ×2 / ×3 | Balãozinho roxo "×3" acima da peça marcada até ela andar. | 1:52–2:00 |
| Pegou poder | O **avatar do jogador troca pelo ícone do poder** por ~1 s, com brilho. | 0:08, 0:26 |

Reações de avatar (emoji grande num balão branco, ~1 s): 😂 quem come,
😭 quem é comido, 😎 quem chega ao centro/vence.

## 6. Ritmo / tempos medidos

- Rolagem do dado: **~1,0 s** (arremesso + rolar + parar).
- Passo da peça: **~0,16 s por casa**.
- Rastro fantasma some em **~0,5 s**.
- Peça comida voltando: **~0,5 s** de voo.
- Confete: **~1,5 s**.
- Pulso do quadrante da vez: período **~1,2 s**.
- Tela de carregamento: preta com ícone "Power ✊" e a dica "Use Powerups To
  Win Over Opponents" (0:00–0:03).

## 7. Regras observadas que diferem da SPEC atual

1. **Fogo não apaga com o tempo** (confirmado pelo Luiz e pelo vídeo,
   0:14–0:22 e 2:33–2:41): a peça pega fogo ao **pisar** na casa 🔥 e continua
   queimando pelas jogadas seguintes dela. No vídeo a peça amarela pega fogo em
   0:14, anda em 0:16 (continua em chamas) e ainda está em chamas quando é
   comida em 0:21. Adotado (regra do Luiz): o fogo **só apaga** quando a peça
   em chamas **queima alguém** (captura ou quebra um escudo, de passagem ou ao
   pousar — evento `fireOut reason:'burned'`), **entra na reta final**, **é
   comida** ou **é congelada**. Não existe mais contagem de turnos/movimentos
   (`effects.fire` vale `1` enquanto acesa; `FIRE_TURNS` foi removido).
2. **Mola (baú) pula pra próxima estrela** — não é um número aleatório de
   casas como o foguete. A peça sai da casa do baú e **pousa na casa segura
   (estrela) seguinte no sentido do movimento**; se pousar em adversário em
   casa segura ele não é comido (é segura). Difere do foguete (voo aleatório
   de 6–20 casas). Adotado: mola = próxima estrela **ou saída colorida**
   (ambas são "casas seguras" do anel); se não houver estrela antes da entrada
   da reta final da peça, ela **entra na reta e para no máximo possível**.
3. **Dado fica no slot do jogador** (topo/baixo), não dentro da base — isso é
   estilo, entra com o dado 3D (fase 7).

Os demais comportamentos (escudo absorve, gelo trava 1 rodada, bomba em raio,
×2/×3 na próxima jogada, capturas voltam pra base, extra no 6) batem com a SPEC.

---

## 8. O que o tema "OG" do app reproduz (implementado na fase 4b)

Ver `src/app.css` (`html[data-theme='og']`), `src/ui/Backdrop.svelte`
(`.og` — vinheta + bokeh + fagulhas), `src/ui/Board.svelte` (derivado `og`
→ classe `.board.og`: moldura de madeira, bases chapadas com quadrado interno
+ 4 círculos, anel creme com grade fina, estrelas na cor, pulso radial
`og-pulse` no quadrante da vez, rastro fantasma `.ghost`, nome na borda externa
e % / ⚔☠ na borda interna do quadrante) e `src/ui/GameScreen.svelte`
(`.screen.og`: cabeçalho compacto `.who-og` com avatar emoldurado na cor da vez
+ ✕/☠ + 👉 quando é hora de rolar). A barra de abas escurece via
`--tabbar-bg`.

Ainda por reproduzir (pequeno, pode entrar com a arte da fase 8): anel de
seleção **tracejado** girando na peça movível (hoje usamos o alvo pulsante) e
o ícone do poder aparecendo no tile do avatar quando a peça pega um poder.

O que **não** entra no tema (fica pra fase 7/8): dado 3D físico rolando pelo
tabuleiro; reações de avatar 😂/😭/😎; confete; painel roxo do dado
personalizável; explosão cartoon (depende do sprite `fx/boom`).
