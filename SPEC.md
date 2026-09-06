# Ludo — Especificação

> Documento de referência do que foi combinado. Itens marcados **[padrão]** são decisões
> que eu tomei por falta de definição; podem ser alterados a qualquer momento.

---

## 0. Ponto de partida

- Existe um **jogo de referência** (app de Ludo que o grupo já joga). A meta é: *"é o Ludo que a gente já joga, só que é nosso e tem mais recursos"*.
- Preservar da referência: leitura rápida do tabuleiro, cores fortes, peças grandes, poderes visíveis, partida fácil de começar, poucos controles.
- Melhorar: clareza das regras (determinísticas, sem discussão na mesa), feedback, persistência, histórico, ranking, dado físico, consistência visual, offline.
- Capturas da referência analisadas → `referencia/NOTAS.md`. **Direção do usuário: o estilo dela é datado; queremos um "Ludo 2"**. Herdamos mecânica e hábitos, não o visual.
- **Direção visual aprovada** com base no mock `mocks/fundo.html` (peças 3D, casas de poder padronizadas, avatar+nome nas bases, dado branco com arestas coloridas, fundo creme).

---

## 1. Plataforma

| Item | Decisão |
|---|---|
| Tipo | Web app (PWA) instalável pelo Chrome do Android ("Adicionar à tela inicial") |
| Tela alvo | Celular 6,7", **somente retrato**. Deve funcionar em telas menores: encolhe a interface antes de encolher o tabuleiro |
| Conectividade | **Estritamente offline** após instalado. Nenhuma chamada de rede, CDN, fonte externa. Tudo precacheado pelo service worker |
| Stack | **Svelte 5 + Vite + TypeScript**. Dado 3D com **Three.js** + física **cannon-es**. PWA via `vite-plugin-pwa` |
| Persistência | `localStorage` (jogadores, histórico, partida em andamento, ajustes) + **exportar/importar backup JSON** |
| Deploy | **GitHub Pages** via GitHub Actions (push na `main` → build → `https://luizhegner.github.io/ludo-game/`) |
| Nome / ícone | **"Ludo"**, ícone com as 4 cores (192, 512 e maskable) |
| Idioma | Somente português (BR) |
| Cores | Tabuleiro clássico brasileiro (Estrela): **vermelho, verde, amarelo, azul**, cruz branca no meio. Cores vivas e saturadas — a orientação do jogo é pela cor |
| Fundo | **Creme claro** (`#f6f1e7`) em todo o app, inclusive na tela de partida, com sombra suave atrás do tabuleiro. Sem textura de madeira |

---

## 2. Tabuleiro e peças

- Tabuleiro clássico 15×15, 4 cores, 52 casas no anel + 5 casas de reta final por cor + centro.
- Posição das cores (fixa, igual à referência): **verde (sup. esq.) · vermelho (sup. dir.) · azul (inf. dir.) · amarelo (inf. esq.)**. Sentido horário: verde → vermelho → azul → amarelo.
- Cada jogador **escolhe a cor** ao montar a partida e pode **trocar de cor** no menu ⋮ → Jogadores durante o jogo (troca só de dono; as peças ficam onde estão) **[padrão]**.
- 4 peões por cor, com aspecto **3D (sombra/brilho)**, estilo Ludo King, na cor do jogador.
- **Casas seguras (8):** a casa de saída de cada cor (casa colorida com **estrela branca**) + as 4 estrelas (casa branca com **estrela na cor da base vizinha**). Ninguém é comido nelas.
- **Empilhar** peças da mesma cor: permitido, **sem efeito** (não forma barreira).
- Tabuleiro fixo (não gira).
- **Dentro de cada base:** avatar, nome, **% de progresso** e contadores pequenos de **capturas ⚔ / mortes 💀**. A base de quem joga ganha um **brilho pulsante** e o **dado descansa nela**. Sem faixa no topo.

---

## 3. Regras base (todos os modos)

| Regra | Decisão |
|---|---|
| Sair da base | Somente com **6** |
| Tirou 6 | Joga de novo. **Três 6 seguidos:** a última peça movida no turno volta pra base e perde a vez |
| Comer | Cair em casa não-segura com peça adversária manda ela pra base. **[padrão]** Se houver mais de uma adversária empilhada ali, todas voltam |
| Bônus de captura | **Padrão: nenhum**. Opção por partida: "jogada extra ao comer" |
| Chegar no centro | **Número exato**. Se passar, a peça não pode ser movida (move outra ou perde a vez) |
| Bônus ao chegar no centro | **[padrão]** Nenhum |
| Sem jogada possível | Mostra "sem jogadas" por ~1 s e **passa sozinho** |
| Só uma jogada possível | **Auto-move configurável** (Ajustes). Padrão **[padrão]**: ligado |
| Ordem de turnos | Sentido horário pelas cores; **quem começa é sorteado** |
| Fim da partida | Continua **até sobrar um**. Colocações = ordem de chegada |
| Encerrar antes | Menu ⋮ → "Encerrar partida": quem não terminou é ranqueado por progresso (peças no centro, depois distância percorrida) **[padrão]** |
| Regras visíveis | Menu ⋮ → "Regras" mostra as regras ativas da partida (modo, poderes ligados, bônus) |

---

## 4. Modos (exclusivos — escolhe UM por partida; cada um tem Elo próprio)

| Modo | Jogadores | O que muda |
|---|---|---|
| **Clássico** | 2–4 | Regras base |
| **Poderes** | 2–4 | Regras base + casas de poder (seção 5) |
| **2v2** | exatamente 4 | Duplas de cores opostas: **verde+azul** × **vermelho+amarelo** |
| **2v2 Poderes** | exatamente 4 | 2v2 + casas de poder |
| **Rápido** | 2–4 | Vence quem colocar **o primeiro peão no centro** (número exato). Demais colocações pela ordem do 1º peão de cada um |
| **5 Minutos** | 2–4 | Cronômetro de **5:00**. **Todas as peças começam fora**, empilhadas na saída. Acabou o tempo: colocação por **peças no centro**, desempate por **progresso total** |
| **Deathmatch** | 2–4 | **Tempo real**, sem turnos. Vence quem chegar a **8 capturas**; ou, aos **5:00**, quem tiver mais capturas (empate: menos mortes). Detalhes abaixo |

### 2v2
- Time vence quando as **8 peças** dos dois estão no centro.
- Parceiro que já terminou as 4 dele **continua jogando com as peças do parceiro** na vez dele.
- Cair na casa do parceiro **come normalmente** (azar).
- Jogador removido no meio: **o parceiro assume as peças dele**.

### Deathmatch (tempo real)
- **Todos jogam ao mesmo tempo**: cada jogador rola o seu dado quando quiser; sem turnos, sem espera além da própria animação (rolar + mover).
- **Cada jogador tem o seu dado 3D**, na cor dele, que **rola pelo tabuleiro inteiro** e pode trombar nos outros dados.
- **6** serve só pra sair da base; **não dá jogada extra** e não existe regra dos três 6.
- Peças começam **na base**. Peça comida **volta pra base** e precisa de 6 pra sair.
- **Reta final bloqueada** (🚫 na 1ª casa): ninguém chega ao centro; as peças ficam circulando pelo anel. O centro mostra **"Alvo ⚔ 8"** e o placar.
- **Casas seguras:** saída e estrelas são seguras pra todos, **exceto** que o **canhão** de cada base **abate automaticamente** qualquer adversário que parar na **estrela da sua cor** (animação: canhão gira, atira, estouro na estrela; a peça volta pra base e conta como captura do dono do canhão).
- **Conflitos:** as jogadas são processadas em **fila**, na ordem em que cada dado parou. Enquanto uma peça está **em movimento** ela não pode ser comida (só ao parar).
- Sem casas de poder. Sem % de progresso.
- Colocação final: **capturas** (desc.), desempate por **menos mortes** [padrão: depois progresso].

---

## 5. Modo Poderes

### Casas de poder
- **10 casas** de poder no anel (**8 visíveis + 2 minas escondidas**), em **posições aleatórias** a cada partida. **[padrão]** Nunca em casa segura/saída, nunca na reta final, nunca em casa ocupada no momento do sorteio.
- **Visíveis:** cada casa mostra o **ícone do poder** (dá pra desviar de propósito). **Segurar o dedo** na casa mostra o que o poder faz.
- Casa de poder **não é segura**.
- Ao pisar, o poder é **consumido imediatamente** e a casa fica vazia. Minas explodidas também contam como consumidas. Quando sobrarem **4** (visíveis + escondidas), repovoa pra **10** em lugares novos (com 2 minas novas escondidas).
- **Fundo da placa** em tom suave por família (ajuda a ler pela cor): **lilás** = dados (×2, ×3, personalizável) · **azul** = defesa/gelo (escudo, congelar) · **laranja** = impulso (foguete, mola) · **vermelho** = explosivos/fogo (bomba, mega bomba, mina revelada, fogo).
- **Encadeia:** se um poder (foguete, mola, dado personalizável…) levar a peça a outra casa de poder, ativa de novo.
- Cada poder pode ser **ligado/desligado** na configuração da partida.
- Efeitos "na próxima vez" (×2, ×3) ficam **ligados à peça que pegou**. Só **um pendente por jogador**: pegar outro substitui o anterior, mesmo que em outra peça **[padrão]**. Se a peça for comida, congelada ou chegar ao centro antes da vez, o pendente é **perdido** **[padrão]**.
- **Raridade [padrão]** (sorteio das 8 visíveis): escudo 3 · dado personalizável 3 · foguete 3 · mola 3 · fogo 3 · ×2 3 · ×3 2 · congelar 2 · bomba 2 · **mega bomba 1**. Minas são sempre 2, fora do sorteio.

### Os poderes

| Poder | Efeito |
|---|---|
| 🛡️ **Escudo** | A peça fica protegida até **absorver 1 ataque**. Quando um adversário cai nela: o escudo some e **o atacante volta pra onde estava** (movimento anulado). |
| ❄️ **Congelar** (azar) | A peça que pisou fica **1 rodada sem poder ser movida**. Apaga o fogo, se tiver. |
| 🪀 **Mola** | A peça pula **4 a 9 casas (aleatório)** pra frente. Se pousar em adversário em casa não-segura, **come**. Mesmas regras de reta final do foguete. |
| 🎯 **Dado personalizável** | Na hora: o jogador **escolhe um número de 1 a 6** e **essa peça** anda imediatamente. Escolher 6 dá jogada extra normal (e conta pros 3 seis). |
| ✖️2 / ✖️3 **Multiplicador** | Na **próxima vez** do jogador, rola 1 dado e **essa mesma peça** anda o valor **× 2 (ou × 3)**. Um 6 multiplicado é só **12 ou 18 casas**: **não dá jogada extra** e não conta pros três 6. Se a peça não puder andar o valor multiplicado (passaria do centro), o multiplicador é **perdido** e o dado vale como jogada normal (qualquer peça, 6 dá extra) **[padrão]**. |
| 🚀 **Foguete** | A peça voa **6 a 20 casas (aleatório)** pra frente. Se pousar em adversário em casa não-segura, **come**. Voa por cima (não interage com o caminho). Entra na reta final normalmente; se exceder o centro, para no **máximo possível**. |
| 💣 **Bomba** (azar) | **Só a peça que pisou** volta pra base. |
| 💥 **Mega bomba** (azar) | **Todas as peças num raio de 2 casas** (inclusive as suas e do parceiro), mais a que pisou, voltam pra base. **Casa segura NÃO protege.** **Escudo absorve** (some, peça fica). |
| 💀 **Mina** (azar, escondida) | Parece casa normal. Quem **parar** nela volta pra base e a mina some. Quem **passar por cima** sem parar **revela** a mina pra todos (fica visível até alguém pisar). **Escudo absorve** (some, peça fica). Peça com **fogo** que passa por cima **detona** a mina (some sem vítima). Sempre 2 no tabuleiro, ligadas por padrão. |
| 🔥 **Fogo** | A peça fica em chamas por **2 rodadas** do jogador. Enquanto anda, **toda peça adversária que ela passar por cima ou parar em cima volta pra base**, exceto: peças em **casa segura** (ilesas) e peças com **escudo** (o escudo é destruído, a peça fica). Apaga antes se: cair em ❄️ congelar, entrar na reta final, ou ser comida. **[padrão]** Só age em movimento de dado (não durante voo de foguete). |

**[padrão]** Peça com fogo pode ser comida normalmente. Peça congelada pode ser comida normalmente.

---

## 6. Dado 3D

- **Cubo real em WebGL** (Three.js + cannon-es): **branco clássico, pontos pretos, arestas na cor do jogador da vez** (como no mock), sombra projetada sobre o tabuleiro, leve animação de repouso.
- **Descansa dentro da base** da cor de quem joga.
- **Lançamento por arrasto:** toca, arrasta e solta — direção e velocidade do gesto viram impulso + rotação. O dado **rola por cima do tabuleiro inteiro**, bate nas bordas invisíveis, para, mostra a face; depois de ~1 s volta pra base do próximo jogador.
- **Toque simples** também lança (impulso aleatório).
- Se parar de quina, recebe um empurrãozinho automático.
- **Resultado — configurável em Ajustes:**
  - **Física real:** a face que ficou pra cima é o resultado.
  - **Sorteio + animação** (padrão): o número é sorteado antes e a simulação termina na face certa.
- Dado personalizável: seletor 1–6 (sem lançamento). Multiplicador: o dado para e o número **cresce pra "×2 = 8"** antes de mover.
- **Deathmatch:** um dado por jogador, todos na cena ao mesmo tempo, com colisão entre eles.
- **Implementação:** o jogo nasce com um dado simples (fase 1) e o dado físico entra na **fase 7**, quando tudo já funciona.

---

## 7. Jogadores

- Cadastro: **nome**, **avatar (emoji OU foto** da galeria/câmera, redimensionada pra ~128 px e salva local).
- Editar nome/avatar, excluir jogador (histórico dele permanece nas partidas **[padrão]**).
- **Detalhes do jogador:** Elo em cada modo + gráfico de evolução · partidas, vitórias, % vitória, colocação média · peças comidas / perdidas · 6 tirados · poderes coletados · maior sequência de vitórias · últimas partidas.

### Dentro da partida (menu ⋮ → Jogadores)
- **Adicionar:** escolhe jogador (ou cria) numa **cor livre**; começa da base.
- **Remover:** peças somem; **não conta a partida** pra ele. Em 2v2, o parceiro assume as peças.
- **Substituir:** fulano sai (não conta pra ele), ciclano assume as peças e conta pra ele.
- **Trocar cor:** o jogador passa a controlar outra cor livre (ou troca com outro jogador, se ambos concordarem) **[padrão]**.
- **Pausar:** pula a vez até despausar. Se a partida acabar com ele pausado, é ranqueado por progresso após os que terminaram **[padrão]**.

---

## 8. Ranking (Elo)

- **Elo separado por modo** (Clássico, Poderes, 2v2, 2v2 Poderes, Rápido, 5 Minutos, Deathmatch). Início **1000**, **K = 32**.
- Individual: cada jogador é comparado par a par com cada outro conforme a colocação final.
- 2v2: **média do Elo da dupla** vs média da outra; os dois da dupla ganham/perdem o mesmo.
- Jogador adicionado no meio conta normal. Removido/substituído (o que saiu) **não conta**.
- **Página Ranking:** seletor de **modo** + filtro de **período** (semana / mês / ano / tudo). Lista por Elo, com partidas, vitórias e Δ Elo no período.
- Elo é **recalculado a partir do histórico** (fonte da verdade = partidas), então o backup JSON é sempre consistente.

---

## 9. Páginas / navegação

Barra inferior fixa com 5 abas: **Jogar · Jogadores · Ranking · Histórico · Ajustes**. Cada página é limpa, uma coisa por tela.

| Página | Conteúdo |
|---|---|
| **Jogar** | "Continuar partida" (se houver), "Nova partida" (grande), **top 3** do ranking (modo mais jogado **[padrão]**), **últimas 3 partidas**. Não é painel de estatísticas |
| **Nova partida** | 3 passos: (1) modo — cards grandes, uma frase explicando cada · (2) cores × jogadores — grade 2×2 na **mesma disposição do tabuleiro**; toca na cor, escolhe/cria jogador; em 2v2 mostra as duplas · (3) regras — só as relevantes ao modo → Iniciar. **Vem pré-preenchida com a última partida** (começar rápido) |
| **Partida** | Tabuleiro quadrado na largura · dado na base de quem joga · abaixo: status curto ("Toque numa peça", "Sem jogadas", "🚀 Foguete! 14 casas") e botão ⋮ (Jogadores, Regras, Encerrar, Sair e salvar). Nos modos com tempo, **cronômetro** discreto acima do tabuleiro. Nada além disso na tela |
| **Fim da partida** | Pódio (avatar, cor, Δ Elo), duração, estatísticas resumidas (comidas, poderes, seis) sem despejar tudo; "Revanche" e "Início". Comemoração curta, sem travar |
| **Jogadores** | Lista com avatar, nome, Elo do modo mais jogado; + criar; toque abre detalhes; editar/excluir |
| **Ranking** | Seletor de modo, filtro de período, tabela |
| **Histórico** | Lista (data, modo, vencedor, participantes). Ao abrir: resumo + estatísticas por jogador + **linha do tempo com horário** ("19:44 João comeu Maria", "19:45 Ana pegou 🚀 e voou 14 casas") |
| **Ajustes** | Sons, vibração, auto-move, modo do dado (física real / sorteio), Exportar backup, Importar backup, apagar tudo, versão |

- **Retomar partida:** salva a cada jogada; fechou o app, volta de onde parou. Sem "desfazer".
- Sons sintetizados via WebAudio (dado rolando/parando, peça, captura, poder, vitória). Vibração só em eventos importantes. Ambos com toggle.

---

## 10. Diretrizes visuais e de UX

**Direção (aprovada em `mocks/fundo.html`):** tabuleiro extremamente colorido e vivo, peças 3D e poderes chamativos, cercado por interface minimalista sobre fundo creme. Olhando a tela deve-se entender na hora: **quem joga → qual foi o dado → quais peças podem andar → o que aconteceu**.

- **Hierarquia no tabuleiro:** 1) peças · 2) peças que podem mover / destino · 3) poderes · 4) decoração. Nada compete com os peões.
- **Ícones dos poderes:** uma linguagem só — ícones vetoriais próprios dentro de uma **placa arredondada com borda escura e fundo em tom suave da família** (seção 5), mesmo tamanho pra todos, sem misturar emoji/flat/3D. Estados: disponível · consumida · recém-ativada.
- **Estados das peças** (efeitos pequenos, a peça continua visível): selecionável (halo + pulso leve) · escudo (aura) · fogo (chaminha) · congelada (gelo).
- **Feedback:** peça anda casa a casa (~120 ms/casa) · captura curta com a peça voltando pra base · poder: destaque na peça + ícone por um instante + mensagem curta · vitória: comemoração curta.
- **Tempos de referência:** peça 100–180 ms/casa · poder 300–700 ms · transições 150–250 ms. Sem animações que bloqueiem o jogador, sem partículas constantes.
- **Botões:** áreas de toque grandes (≥ 44 px), poucos ao mesmo tempo, sem texto pequeno.
- **Acessibilidade de cor:** cada jogador tem sempre cor + posição fixa + avatar + nome visíveis.
- **Sem poluição:** tudo que não serve pra decisão atual fica no menu ⋮.

---

## 11. Arquitetura

```
Svelte (UI, animações, controles)
        ↓
Estado da partida (imutável, serializável → localStorage)
        ↓
Motor de regras (TypeScript puro, sem DOM, testado com vitest)
  ├── tabuleiro/geometria
  ├── movimento e captura
  ├── turnos (6, três 6, pausa, 2v2)
  ├── poderes (um módulo por poder)
  ├── modos (rápido, 2v2)
  └── fim de partida / colocações
        ↓
Persistência (localStorage + backup JSON) · Ranking (Elo derivado do histórico)
```

Three.js/cannon-es são **camada de apresentação** do dado: entregam um número ao motor, nada mais.

---

## 12. Fases de construção

| Fase | Entrega |
|---|---|
| **1. Núcleo** | Motor de regras + tabuleiro + peças + dado simples. Partida completa no Clássico, com testes do motor |
| **2. Interface** | Abas, Jogar, Nova partida (3 passos), Jogadores (cadastro/avatar), Ajustes básicos |
| **3. Poderes** | Um por vez, testado isolado: escudo → bomba → congelar → fogo → foguete → mola → personalizável → ×2/×3 → mina → mega bomba |
| **4. Modos** | Rápido, 5 Minutos, 2v2, 2v2 Poderes; adicionar/remover/substituir/trocar cor/pausar na partida. **Deathmatch por último** (motor em tempo real é o mais complexo) |
| **5. Persistência** | Retomar partida, histórico com linha do tempo, backup JSON |
| **6. Elo** | Cálculo, ranking por modo, filtros, detalhes do jogador com gráfico |
| **7. Dado físico** | Three.js + cannon-es, arrasto, colisões, face final, modo física real × sorteio |
| **8. Polimento** | Sons, vibração, animações, responsividade, PWA/offline, ícone, GitHub Pages |

---

## 13. Fora de escopo (por enquanto)

- Bots / CPU · Multiplayer online · Tema escuro · Inglês · Desfazer jogada · Limite de tempo por turno (fora dos modos com cronômetro) · Tabuleiro de 6 jogadores · Dado duplo (descartado: era o ×2)
