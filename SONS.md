# Sons do Ludo

O jogo já toca **23 sons sintetizados** via WebAudio (não precisa de arquivo nenhum).
Se você quiser trocar por samples de verdade, basta colocar o arquivo em
`public/sounds/<arquivo>.mp3` (ou `.ogg`) com o nome exato da tabela — o jogo
detecta sozinho e usa o sample no lugar do sintetizado. Não precisa mexer em código.

(Ícones e efeitos animados: ver `ARTE.md`.)

## Pacote "Sons do jogo original" (`public/sounds/og/`)

Switch em **Ajustes → Jogo → Sons do jogo original** (independente do tema — o
tema é só visual). Com o switch ligado, cada som que existir em
`public/sounds/og/<arquivo>.mp3` é usado; o que faltar cai no pacote padrão
(`public/sounds/<arquivo>` → sintetizado). Mesmos nomes da tabela abaixo.

Gerar a partir de uma gravação de tela (áudio de mídia, sem microfone):

```sh
pip install imageio-ffmpeg            # ou tenha o ffmpeg no PATH
python3 tools/og-sons.py detectar gravacao.mp4 > eventos.txt   # lista os trechos com som (início, fim, duração)
# preencha a última coluna de eventos.txt com o nome do som (ou escreva um cortes.txt: "inicio fim nome")
python3 tools/og-sons.py cortar gravacao.mp4 cortes.txt public/sounds/og
```

O corte tira o silêncio do começo, aplica **um ganho único** pra sessão inteira
(pico mais alto → −1 dBFS, preservando o balanço original entre os sons: passo
baixinho, captura alta) e exporta mp3 mono 44,1 kHz 96 kbps. Gravação limpa
(volume de mídia no máximo, uma ação por vez, ~1 s de pausa entre elas) é o que
dá certo — o script não separa sons sobrepostos.

Regras práticas:

- Formato: **mp3** (Chrome Android) ou **ogg**; se existirem os dois, o mp3 tem prioridade.
- Mono, 44,1 kHz, normalizado em torno de −6 dBFS. Sem silêncio no começo (o som tem que ser imediato ao toque).
- Arquivos curtos: tudo junto deve ficar bem abaixo de 1 MB (é precacheado pelo service worker pra funcionar offline).
- Respeita o toggle **Ajustes → Sons**.

| Arquivo | Quando toca | Como deve soar | Duração |
|---|---|---|---|
| `dice-roll` | Ao tocar no dado, enquanto o cubo gira | Dado chacoalhando/rolando na mesa: cliques secos e rápidos de plástico ou madeira | 0,6–0,8 s |
| `dice-land` | Quando o dado para e mostra a face | "Toc" grave e seco de um cubo pousando na mesa | 0,1–0,2 s |
| `piece-step` | A cada casa que a peça anda (a cada 150 ms) | "Tic" curtíssimo de madeira/plástico, discreto (vai repetir até 6 vezes seguidas) | 0,04–0,08 s |
| `piece-out` | Peça saindo da base pra casa de saída | "Plop" ascendente, satisfatório, tipo rolha | 0,15–0,25 s |
| `capture` | Uma peça come outra (no pouso) | Impacto + descida dramática ("pow" com cauda grave); pode ter um leve "aah" cartunesco | 0,3–0,5 s |
| `six` | Dado parou num 6 | Arpejo curto pra cima, alegre, sino/xilofone | 0,3–0,4 s |
| `three-sixes` | Três 6 seguidos (peça volta pra base, perde a vez) | "Womp womp" descendente de trombone, cômico | 0,6–0,8 s |
| `no-moves` | Sem jogada possível com o número tirado | Dois toques neutros pra baixo, sem drama ("hm-hm") | 0,3 s |
| `finish` | Uma peça chegou no centro | Sininho brilhante com cauda, tipo "achievement" | 0,5–0,8 s |
| `player-done` | Jogador colocou as 4 peças no centro | Fanfarra curta, 4 notas subindo + acorde final | 1,0–1,2 s |
| `victory` | Fim da partida (tela do pódio) | Fanfarra completa de vitória, festiva, pode ter aplausos | 1,5–2,5 s |
| `turn` | Passou a vez pro próximo jogador | "Blip" discreto de duas notas, só pra chamar atenção | 0,15 s |
| `tap` | Toque em botão / seleção de peça | Clique suave de interface | 0,03–0,05 s |
| `power` | Peça pisou numa casa de poder | "Brilho" curto de duas notas, tipo item coletado | 0,3–0,4 s |
| `fly` | Foguete decolando (tremor + subida) | Chiado de ignição crescendo, depois o "whoosh" da decolagem | 1,0–1,2 s |
| `landing` | Foguete pousando | Baque seco + dois quiques menores, cômico | 0,4–0,5 s |
| `spring` | Pulo de mola | "Boing" de mola comprimindo e soltando | 0,5–0,6 s |
| `shield` | Escudo absorveu um ataque/explosão | "Clang" metálico curto | 0,2–0,3 s |
| `boom` | Bomba, mega bomba ou mina explodiu | Estouro grave com cauda | 0,4–0,6 s |
| `mine` | Mina revelada (alguém passou por cima) | "Tic-tic" de relógio + zumbido de alerta | 0,4–0,5 s |
| `magic-dice` | Dado personalizável: hora de escolher o número | Duas notas pra cima, em tom de pergunta | 0,3 s |
| `multiplier` | Dado multiplicado (×2/×3) parou | Dois "pings" rápidos subindo | 0,25 s |
| `repopulate` | Novas casas de poder apareceram | Arpejo suave de "surgimento" | 0,4–0,5 s |

Onde baixar (todos com licença livre, confira cada um): [freesound.org](https://freesound.org),
[kenney.nl/assets](https://kenney.nl/assets?q=audio) (pacotes "Interface Sounds", "Casino Audio" e
"Impact Sounds" cobrem quase tudo), [mixkit.co/free-sound-effects](https://mixkit.co/free-sound-effects/).

Conversão rápida com ffmpeg (mono, 44,1 kHz, mp3 96 kbps):

```sh
ffmpeg -i entrada.wav -ac 1 -ar 44100 -b:a 96k public/sounds/dice-roll.mp3
```
