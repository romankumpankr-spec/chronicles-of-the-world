import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client/tv',
  server: { port: 5173 },
  build: { outDir: '../../dist/tv', emptyOutDir: true },
});
