import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  resolve: { conditions: ['browser'] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
  },
});
