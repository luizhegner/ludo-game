/**
 * Navegação do app: 5 abas + telas empilhadas (nova partida, partida, detalhes).
 *
 * A pilha de telas em memória é a fonte da verdade. O History API entra só
 * pra que o gesto/botão "voltar" do Android feche a tela de cima em vez de
 * fechar o app: cada `go` empurra uma entrada com a profundidade da pilha e o
 * `popstate` compara essa profundidade com a pilha atual:
 *   - menor que a pilha  → foi o gesto "voltar": desempilha até lá
 *   - igual ou maior     → eco de um `back()`/`switchTab()` nosso (a pilha já
 *                          foi ajustada na hora) ou "avançar": ignora
 * Sem contadores, então popstates atrasados ou perdidos não desalinham nada.
 */

export type Tab = 'home' | 'players' | 'ranking' | 'history' | 'settings';

export type Route =
  | { page: 'home' }
  | { page: 'new' }
  | { page: 'game' }
  | { page: 'players' }
  | { page: 'player'; id: string }
  | { page: 'ranking' }
  | { page: 'history' }
  | { page: 'match'; id: string }
  | { page: 'settings' };

const TAB_OF: Record<Route['page'], Tab> = {
  home: 'home',
  new: 'home',
  game: 'home',
  players: 'players',
  player: 'players',
  ranking: 'ranking',
  history: 'history',
  match: 'history',
  settings: 'settings',
};

/** Telas de tela cheia, sem a barra de abas. */
const FULLSCREEN: ReadonlySet<Route['page']> = new Set(['new', 'game']);

interface HState {
  ludo: true;
  depth: number;
}

class NavStore {
  private stack: Route[] = $state([{ page: 'home' }]);

  constructor() {
    if (typeof window === 'undefined') return;
    replaceState(1);
    window.addEventListener('popstate', (e) => this.onPop(e.state as HState | null));
  }

  get route(): Route {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  get tab(): Tab {
    return TAB_OF[this.route.page];
  }

  get fullscreen(): boolean {
    return FULLSCREEN.has(this.route.page);
  }

  /** Empilha uma tela (o "voltar" retorna pra atual). */
  go(route: Route): void {
    this.stack = [...this.stack, route];
    pushState(this.stack.length);
  }

  /** Troca a tela do topo sem empilhar (a partida substitui o assistente, por exemplo). */
  replace(route: Route): void {
    this.stack = [...this.stack.slice(0, -1), route];
    replaceState(this.stack.length);
  }

  /** Volta uma tela; se já estamos na primeira do app, vai pra `fallback`. */
  back(fallback: Route = { page: 'home' }): void {
    if (this.stack.length > 1) {
      this.stack = this.stack.slice(0, -1);
      historyGo(-1);
      return;
    }
    this.replace(fallback);
  }

  /** Abas são irmãs: trocar de aba zera a pilha. */
  switchTab(tab: Tab): void {
    if (this.stack.length === 1 && this.route.page === tab) return;
    const extra = this.stack.length - 1;
    this.stack = [{ page: tab }];
    if (extra > 0) historyGo(-extra);
    else replaceState(1);
  }

  private onPop(st: HState | null): void {
    const depth = st && st.ludo && typeof st.depth === 'number' ? st.depth : 1;
    if (depth < this.stack.length) this.stack = this.stack.slice(0, Math.max(1, depth));
  }
}

function pushState(depth: number): void {
  try {
    window.history.pushState({ ludo: true, depth } satisfies HState, '');
  } catch {
    /* ignora */
  }
}
function replaceState(depth: number): void {
  try {
    window.history.replaceState({ ludo: true, depth } satisfies HState, '');
  } catch {
    /* ignora */
  }
}
function historyGo(delta: number): void {
  try {
    if (typeof window !== 'undefined') window.history.go(delta);
  } catch {
    /* ignora */
  }
}

export const nav = new NavStore();
