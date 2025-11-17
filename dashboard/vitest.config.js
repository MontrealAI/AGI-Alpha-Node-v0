import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, '.'),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: resolve(__dirname, 'vitest.setup.js'),
    css: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
