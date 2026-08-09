import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cr/core': path.resolve(__dirname, '../../packages/game-core/src/index.ts'),
      '@cr/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1600, // phaser ships big
  },
  server: { port: 5173 },
});
