<script lang="ts">
  import Home from './ui/Home.svelte';
  import NewGame from './ui/NewGame.svelte';
  import GameScreen from './ui/GameScreen.svelte';
  import { match } from './stores/match.svelte';

  type Route = 'home' | 'new' | 'game';
  let route: Route = $state('home');

  // se o app abriu no meio de uma partida, vai direto pra ela
  if (match.state && match.state.turn.phase !== 'over') route = 'game';

  function exitGame() {
    if (match.state && match.state.turn.phase === 'over') match.clear();
    route = 'home';
  }
</script>

{#if route === 'home'}
  <Home onContinue={() => (route = 'game')} onNew={() => (route = 'new')} />
{:else if route === 'new'}
  <NewGame onStart={() => (route = 'game')} onBack={() => (route = 'home')} />
{:else if match.state}
  <GameScreen onExit={exitGame} />
{/if}
