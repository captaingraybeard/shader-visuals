import { defineConfig } from 'vite';

export default defineConfig({
  base: '/shader-visuals/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    host: true,
  },
});
