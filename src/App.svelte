<script lang="ts">
  import Home from './ui/Home.svelte';
  import NewGame from './ui/NewGame.svelte';
  import GameScreen from './ui/GameScreen.svelte';
  import PlayersPage from './ui/PlayersPage.svelte';
  import PlayerDetail from './ui/PlayerDetail.svelte';
  import RankingPage from './ui/RankingPage.svelte';
  import HistoryPage from './ui/HistoryPage.svelte';
  import MatchDetail from './ui/MatchDetail.svelte';
  import SettingsPage from './ui/SettingsPage.svelte';
  import TabBar from './ui/TabBar.svelte';
  import Backdrop from './ui/Backdrop.svelte';
  import { match } from './stores/match.svelte';
  import { nav } from './stores/nav.svelte';
  import { settings } from './stores/settings.svelte';

  // tema no <html>, pra o CSS global (fundo do body, cards translúcidos) reagir
  $effect(() => {
    document.documentElement.dataset.theme = settings.theme;
  });

  // se o app abriu no meio de uma partida, vai direto pra ela
  if (match.active && nav.route.page !== 'game') nav.go({ page: 'game' });

  const route = $derived(nav.route);

  // saiu da tela de partida (menu, gesto "voltar"…) com a partida já encerrada: limpa.
  // A partida em andamento fica salva pra "Continuar".
  $effect(() => {
    if (route.page !== 'game' && match.state && match.state.turn.phase === 'over') match.clear();
  });

  /** Sai da tela de partida (menu → "Sair e salvar", ou "Início" no fim). */
  function exitGame() {
    nav.switchTab('home');
  }
</script>

<Backdrop />

<div class="shell" class:with-tabs={!nav.fullscreen}>
  {#if route.page === 'home'}
    <Home />
  {:else if route.page === 'new'}
    <NewGame onStart={() => nav.replace({ page: 'game' })} onBack={() => nav.back()} />
  {:else if route.page === 'game'}
    {#if match.state}
      <GameScreen onExit={exitGame} />
    {:else}
      <Home />
    {/if}
  {:else if route.page === 'players'}
    <PlayersPage />
  {:else if route.page === 'player'}
    <PlayerDetail id={route.id} />
  {:else if route.page === 'ranking'}
    <RankingPage />
  {:else if route.page === 'history'}
    <HistoryPage />
  {:else if route.page === 'match'}
    <MatchDetail id={route.id} />
  {:else if route.page === 'settings'}
    <SettingsPage />
  {/if}
</div>

{#if !nav.fullscreen}
  <TabBar />
{/if}

<style>
  .shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }
  /* espaço pra barra de abas fixa */
  .shell.with-tabs {
    padding-bottom: calc(var(--safe-bottom) + 76px);
  }
</style>
