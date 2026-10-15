import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under GitHub Pages' /elomental/ path and locally.
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
