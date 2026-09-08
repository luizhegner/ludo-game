# Arte do Ludo — ícones, efeitos animados e sons

Guia pra trocar os emojis e os sons sintetizados por arquivos de verdade.
**Tudo é opcional e independente**: colocou o arquivo com o nome certo na pasta
certa, o jogo passa a usar; não colocou, continua o padrão (emoji / desenho /
som sintetizado). Não precisa mexer em código nem avisar nada — a detecção é
feita na build.

Resumo das pastas:

| O quê | Pasta | Formato |
|---|---|---|
| Ícones dos poderes | `src/assets/art/powers/` | SVG (ideal) ou PNG/WebP 256×256 |
| Ícones da interface | `src/assets/art/ui/` | SVG (ideal) ou PNG/WebP 256×256 |
| Efeitos animados no peão | `src/assets/art/fx/` | Sprite sheet PNG/WebP (tira horizontal) |
| Sons | `public/sounds/` | MP3 (ou OGG) — ver `SONS.md` |

---

## 1. Regras gerais dos ícones (pra nada sair esticado, distorcido ou de tamanho errado)

O jogo **nunca redimensiona livremente**: cada ícone é desenhado dentro de uma
**caixa quadrada** com `object-fit: contain` (ou `preserveAspectRatio="xMidYMid meet"`
dentro do tabuleiro). Ou seja: se o arquivo não for quadrado, ele é encaixado
inteiro na caixa e sobra margem transparente — nunca é esticado. Mesmo assim,
pra ficar bonito e uniforme entre os ícones:

1. **Tela (canvas) quadrada, 1:1.** SVG com `viewBox="0 0 64 64"` (ou 24/48/256, tanto
   faz — só precisa ser quadrado). PNG/WebP: **256×256 px**.
2. **Desenho ocupando ~80–85% da tela**, centrado, com **margem transparente de
   ~8% em cada lado**. Todos os ícones do mesmo conjunto com a **mesma margem**
   (senão um parece maior que o outro).
3. **Fundo transparente.** Nada de quadrado branco atrás. No tabuleiro, a casa
   já tem o fundo da família (lilás/azul/laranja/vermelho) — o ícone fica por cima.
4. **Legível a 14–16 px.** No tabuleiro do celular a casa tem ~22 px e o ícone
   ~16 px. Formas grandes, poucos detalhes, contorno definido. Se depende de
   texto pequeno ou linhas finas, não vai ler.
5. **Estilo consistente** entre todos (mesma espessura de traço, mesma paleta
   "flat/cartoon"). Melhor um pacote inteiro do mesmo autor do que misturar.
6. **SVG**: sem `width`/`height` fixos (só `viewBox`), sem fontes externas (texto
   convertido em curvas), sem `<script>`, sem imagens embutidas, sem filtros
   pesados. Ideal < 10 KB cada.
7. **PNG/WebP**: 256×256, fundo transparente (canal alfa), < 30 KB cada. Se vier
   maior (512, 1024), pode — só pesa mais; nunca abaixo de 128.
8. **Nome do arquivo** exatamente como na tabela (minúsculo). Se existir o mesmo
   nome em mais de um formato, a prioridade é **svg > webp > png**.

Onde eles aparecem e o tamanho em cada lugar:

| Lugar | Caixa |
|---|---|
| Casa de poder no tabuleiro | 0,7 célula (~16 px no celular) |
| Lista de poderes (Nova partida, ⋮ → Regras) | 24 px |
| Aviso "segurou o dedo" (área de status) | 32 px |
| Abas da barra inferior | 24 px |

---

## 2. Ícones dos poderes — `src/assets/art/powers/`

Os 11 poderes. Nomes de arquivo (a família dita a cor do fundo da casa, já feita
pelo jogo — o ícone **não** precisa trazer o fundo):

| Arquivo | Poder | Padrão atual | Família / fundo | Sugestão de leitura |
|---|---|---|---|---|
| `shield.svg` | Escudo | 🛡️ | defesa · azul | escudo |
| `freeze.svg` | Congelar | ❄️ | defesa · azul | floco de neve / cristal de gelo |
| `spring.svg` | Mola | 🪀 | impulso · laranja | mola espiral |
| `rocket.svg` | Foguete | 🚀 | impulso · laranja | foguete |
| `magic-dice.svg` | Dado personalizável | 🎯 | dados · lilás | dado com estrela / varinha |
| `x2.svg` | ×2 | "×2" | dados · lilás | "×2" grande e grosso |
| `x3.svg` | ×3 | "×3" | dados · lilás | "×3" grande e grosso |
| `bomb.svg` | Bomba | 💣 | explosivos · vermelho | bomba de pavio |
| `mega-bomb.svg` | Mega bomba | 💥 | explosivos · vermelho | explosão / bomba maior |
| `mine.svg` | Mina | 💀 | explosivos · vermelho | mina naval / caveira |
| `fire.svg` | Fogo | 🔥 | explosivos · vermelho | chama |

Notas:
- `x2`/`x3`: se não encontrar, deixe sem — o texto "×2/×3" do jogo já funciona bem.
- Bomba e mega bomba precisam ser **claramente diferentes** (a mega é a que
  pega todo mundo em volta).
- A mina precisa parecer **azar**, não poder bom.

## 2b. Pacote OG — recortes do jogo original (`src/assets/art/og/`)

Só valem com o tema **OG** ligado (Ajustes → Aparência). Com o tema OG a ordem
é `og/powers/` → `powers/` → emoji; nos outros temas a pasta `og/` é ignorada.
Uso pessoal, entre amigos — não é arte pra distribuir.

| Pasta | O quê | Formato |
|---|---|---|
| `og/powers/<poder>.png` | casa de poder inteira, recortada do print (já com o fundo da casa) | PNG 128×128, cantos arredondados transparentes |
| `og/fx/<efeito>@N.png` | sprite sheets (mesma spec da seção 4) | PNG/WebP |

Diferença pro ícone "próprio": o recorte OG é desenhado **ocupando a casa
toda** (`preserveAspectRatio: slice` + recorte arredondado), porque ele já traz
o fundo colorido da casa original. Nomes: os mesmos da tabela da seção 2
(`shield`, `freeze`, `spring`, `rocket`, `magic-dice`, `x2`, `x3`, `bomb`,
`mega-bomb`, `mine`, `fire`).

### Como gerar a partir dos prints (automático)

```sh
pip install pillow
python3 tools/og-icones.py listar  print.png          # acha o tabuleiro e gera print.contato.png com as 52 casas numeradas
python3 tools/og-icones.py recortar print.png 2=x2 14=freeze 22=spring   # índice da casa = nome do poder
python3 tools/og-icones.py recortar print.png --caixa 340,95,80,80=dado-6  # qualquer região (x,y,largura,altura)
```

O script acha o tabuleiro pela cor dos 4 quadrantes (funciona com qualquer
resolução; em vídeo reescalado sem proporção usa escalas separadas). Prints em
**PNG** e na resolução nativa dão recortes nítidos (~70 px por casa no S21 →
128 px final sem borrar).

---

## 3. Ícones da interface — `src/assets/art/ui/`

| Arquivo | Onde | Padrão atual |
|---|---|---|
| `tab-home.svg` | aba Jogar | 🎲 |
| `tab-players.svg` | aba Jogadores | 👥 |
| `tab-ranking.svg` | aba Ranking | 🏆 |
| `tab-history.svg` | aba Histórico | 📜 |
| `tab-settings.svg` | aba Ajustes | ⚙️ |

Regras extras pras abas: ícone **monocromático** ou de poucas cores — a aba
inativa é mostrada em cinza (o jogo aplica `grayscale`) e a ativa colorida,
então um ícone de uma cor só (ex.: cinza-escuro `#1f2430`) funciona melhor
que um colorido. Traço médio (2 px num viewBox de 24).

---

## 4. Efeitos animados no peão — `src/assets/art/fx/` (sprite sheets)

É aqui que entra "o peão pegando fogo", o escudo vivo, etc. O jogo **não usa
vídeo** (MP4/WebM transparente não funciona bem dentro do SVG do tabuleiro,
não faz loop perfeito, não sincroniza e pesa). O formato é **sprite sheet**:
uma imagem só com todos os quadros lado a lado, e o jogo troca de quadro no
ritmo certo. Se você animar no After Effects / Blender / Procreate etc., é só
**exportar a sequência de PNGs e colar em tira** (comando no fim desta seção).

### Especificação da tira

- **Uma linha horizontal** de quadros, todos **quadrados e do mesmo tamanho**.
  O jogo descobre o número de quadros sozinho: `largura ÷ altura`.
  Ex.: 8 quadros de 128×128 → imagem de **1024×128**.
- **Quadro de 128×128 px** (mínimo 96, máximo 256). Não precisa mais que isso:
  no celular o efeito é exibido em ~25 px.
- **Fundo transparente** (PNG-24 com alfa ou WebP lossless com alfa). Sem
  fundo preto/branco pra "recortar depois" — não tem chroma key.
- **Quantidade de quadros:** 8 a 16 pros loops (fogo, escudo, gelo); até 24 pra
  explosão. Menos quadros = arquivo menor e loop mais leve.
- **FPS no nome do arquivo**: `fire@12.png` = 12 quadros por segundo. Sem `@`,
  assume 12. Faixa útil: 8–24.
- **Loop perfeito** nos efeitos contínuos: o último quadro tem que emendar no
  primeiro sem "pulo". (Explosão não é loop — toca uma vez.)
- **Peso**: < 150 KB por tira (é precacheada pra funcionar offline).
- **Sem margem de segurança enorme**: o desenho deve ocupar o quadro. Onde o
  desenho "encosta" no peão está descrito abaixo pra cada efeito.

### Efeitos e como cada um é posicionado

O peão tem **~0,9 célula de altura** e fica com os pés no centro da casa
(a "base" do peão está em y = +0,34 e a cabeça em y = −0,46, em células).

| Arquivo | Efeito | Tamanho do quadro na tela | Posição | Como desenhar |
|---|---|---|---|---|
| `fire@12.png` | **Peão em chamas** (poder 🔥, fica aceso até queimar alguém) | 1,1 célula | centrado no peão, um pouco acima (o fogo sobe) | Chamas **saindo de baixo pra cima**, com a **base das chamas na metade inferior do quadro** e a parte de cima do quadro livre pra fagulhas. É desenhado **por cima** do peão, então deixe o **meio semi-transparente** (a gente precisa ver a cor do peão através do fogo). Loop 8–12 quadros. |
| `shield@12.png` | **Escudo** ativo | 1,2 célula | centrado no peão | Bolha/anel azulado (`#4a90d9`) **transparente no meio**, brilho girando ou pulsando na borda. É desenhado **atrás** do peão. Loop suave, 8–16 quadros. |
| `freeze@8.png` | **Congelado** (não pode mover) | 1,1 célula | centrado no peão | Bloco de gelo / cristais cobrindo o peão, **semi-transparente** (~60%), brilhinhos piscando devagar. Por cima do peão. Loop lento. |
| `boom@16.png` | **Explosão** (bomba, mega bomba, mina) — *ainda não ligado; deixo pronto pra próxima leva* | 1,6 célula (bomba) / 3 células (mega) | centrada na casa | Explosão clássica: flash → bola de fogo → fumaça sumindo. **Toca uma vez**, 12–24 quadros, último quadro transparente. |
| `pickup@16.png` | **Pegou poder** (brilho ao pisar na casa) — *idem, próxima leva* | 1,4 célula | centrado na casa | Faíscas/estrelinhas saindo do centro e sumindo. Toca uma vez, 8–12 quadros, último quadro transparente. |

Os três primeiros (fogo, escudo, gelo) **já funcionam**: é colocar o arquivo.

### Como gerar a tira a partir de uma sequência de PNGs

Com ImageMagick (`frame_000.png … frame_011.png`, todos 128×128):

```sh
convert frame_*.png +append src/assets/art/fx/fire@12.png
```

Com ffmpeg a partir de um vídeo com alfa (ProRes 4444 / WebM VP9 com alfa),
12 fps, 128 px:

```sh
ffmpeg -i fogo.mov -vf "fps=12,scale=128:128:force_original_aspect_ratio=decrease,pad=128:128:-1:-1:color=0x00000000,tile=12x1" -frames:v 1 src/assets/art/fx/fire@12.png
```

(`tile=12x1` = 12 quadros numa linha; ajuste pro número de quadros do loop.)

### Se você for animar

- Trabalhe em **1:1**, 256×256 ou 512×512, e exporte reduzido pra 128.
- Fundo transparente desde o começo (nada de fundo verde).
- Pense no loop: 1 segundo a 12 fps = 12 quadros é um bom tamanho.
- MP4 **não** tem transparência. Se precisar de vídeo intermediário, use
  **MOV ProRes 4444** ou **WebM VP9 com alfa**, e converta com o comando acima.
  Mas o ideal é exportar direto a sequência de PNGs.

---

## 5. Sons — `public/sounds/` (lista pra procurar)

Regras e nomes completos estão em `SONS.md`. Formato: **MP3, mono, 44,1 kHz**,
normalizado ~−6 dBFS, **sem silêncio no início** (o som tem que ser imediato),
todos juntos < 1 MB. Se existir o arquivo, o jogo usa; se não, sintetiza.

Prioridade de busca (o que mais melhora a sensação do jogo):

**Alta — toca o tempo todo:**

| Arquivo | O que procurar | Duração |
|---|---|---|
| `dice-roll.mp3` | dado chacoalhando/rolando na mesa (plástico ou madeira), cliques secos | 0,6–0,8 s |
| `dice-land.mp3` | "toc" seco e grave de um cubo pousando | 0,1–0,2 s |
| `piece-step.mp3` | "tic" curtíssimo de peça de madeira/plástico batendo na mesa (repete até 6× seguidas — tem que ser discreto) | 0,04–0,08 s |
| `piece-out.mp3` | "plop" ascendente, tipo rolha | 0,15–0,25 s |
| `capture.mp3` | impacto + descida dramática, "pow" cartunesco com cauda grave | 0,3–0,5 s |
| `six.mp3` | arpejo curto pra cima, alegre (sino/xilofone) | 0,3–0,4 s |
| `tap.mp3` | clique suave de interface | 0,03–0,05 s |
| `turn.mp3` | "blip" discreto de duas notas (só pra chamar atenção) | 0,15 s |

**Média — momentos marcantes:**

| Arquivo | O que procurar | Duração |
|---|---|---|
| `finish.mp3` | sininho brilhante com cauda, tipo "achievement" | 0,5–0,8 s |
| `player-done.mp3` | fanfarra curta, 4 notas subindo + acorde | 1,0–1,2 s |
| `victory.mp3` | fanfarra completa de vitória, festiva, pode ter aplausos | 1,5–2,5 s |
| `three-sixes.mp3` | "womp womp" descendente de trombone, cômico | 0,6–0,8 s |
| `no-moves.mp3` | dois toques neutros pra baixo, sem drama | 0,3 s |

**Poderes:**

| Arquivo | O que procurar | Duração |
|---|---|---|
| `power.mp3` | "brilho" de item coletado, duas notas | 0,3–0,4 s |
| `fly.mp3` | ignição de foguete: chiado crescendo + whoosh de decolagem | 1,0–1,2 s |
| `landing.mp3` | baque seco + dois quiques menores, cômico | 0,4–0,5 s |
| `spring.mp3` | "boing" de mola | 0,5–0,6 s |
| `shield.mp3` | "clang" metálico curto | 0,2–0,3 s |
| `boom.mp3` | estouro grave com cauda | 0,4–0,6 s |
| `mine.mp3` | "tic-tic" de relógio + zumbido de alerta | 0,4–0,5 s |
| `magic-dice.mp3` | duas notas pra cima, em tom de pergunta | 0,3 s |
| `multiplier.mp3` | dois "pings" rápidos subindo | 0,25 s |
| `repopulate.mp3` | arpejo suave de "surgimento" | 0,4–0,5 s |

Conversão (qualquer entrada → mp3 mono 44,1 kHz 96 kbps, cortando silêncio inicial):

```sh
ffmpeg -i entrada.wav -af "silenceremove=start_periods=1:start_threshold=-50dB" -ac 1 -ar 44100 -b:a 96k public/sounds/dice-roll.mp3
```

---

## 6. Licenças e fontes

Anote a licença de cada arquivo que usar (CC0 é o ideal; CC-BY exige crédito —
a gente coloca em Ajustes → "Créditos"). Fontes boas:

- Ícones: [game-icons.net](https://game-icons.net) (CC-BY 3.0, milhares de ícones
  de jogo, SVG, estilo consistente — **melhor opção pros poderes**),
  [kenney.nl/assets](https://kenney.nl/assets) (CC0, pacotes "Game Icons",
  "Board Game Icons"), [svgrepo.com](https://www.svgrepo.com) (filtre por licença),
  [tabler-icons.io](https://tabler-icons.io) (MIT, ótimo pras abas).
- Sprites animados: [kenney.nl](https://kenney.nl/assets?q=particle) ("Particle
  Pack", "Smoke Particles"), [opengameart.org](https://opengameart.org) (busque
  "fire sprite sheet", "shield effect", "explosion sheet"; confira a licença
  de cada um), [itch.io](https://itch.io/game-assets/free/tag-sprites) (muitos
  packs de efeitos CC0/free).
- Sons: [freesound.org](https://freesound.org) (filtre por CC0),
  [kenney.nl](https://kenney.nl/assets?q=audio) ("Interface Sounds", "Casino
  Audio", "Impact Sounds"), [mixkit.co](https://mixkit.co/free-sound-effects/),
  [pixabay.com/sound-effects](https://pixabay.com/sound-effects/).

Dica: baixe, jogue na pasta certa com o nome certo, e rode o jogo — o que
estiver certo aparece na hora (em dev o Vite recarrega sozinho). Se algo
parecer pequeno/grande demais, quase sempre é a **margem** dentro do arquivo
(item 1.2), não o tamanho da caixa.
