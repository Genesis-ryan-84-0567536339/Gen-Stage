import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
