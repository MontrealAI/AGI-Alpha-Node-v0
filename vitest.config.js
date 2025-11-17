import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // Forked pool keeps native modules like better-sqlite3 stable during ESM transforms
    pool: 'forks',
    deps: {
      optimizer: {
        ssr: {
          exclude: ['better-sqlite3']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['better-sqlite3']
  },
  server: {
    deps: {
      // Ensure native bindings bypass the Vite transform pipeline
      external: ['better-sqlite3']
    }
  },
  ssr: {
    external: ['better-sqlite3']
  }
});
