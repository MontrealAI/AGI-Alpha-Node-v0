import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '.');

export default defineConfig({
  plugins: [react()],
  root: rootDir,
  base: './',
  server: {
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
