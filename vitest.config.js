import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.*', 'spec/**/*.test.*'],
    environment: 'node',
    globals: true,
    exclude: [
      '**/node_modules/**',
      'subgraph/**/node_modules/**',
      'dashboard/**/*.test.{js,jsx,ts,tsx}'
    ],
    // Forked pool keeps native modules like better-sqlite3 stable during ESM transforms
    pool: 'forks',
    deps: {
      optimizer: {
        ssr: {
          exclude: ['better-sqlite3', 'cborg', '@ethereumjs/vm']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['better-sqlite3', 'cborg', '@ethereumjs/vm']
  },
  server: {
    deps: {
      // Ensure native bindings bypass the Vite transform pipeline
      external: ['better-sqlite3', 'cborg', '@ethereumjs/vm']
    }
  },
  ssr: {
    external: ['better-sqlite3', 'cborg', '@ethereumjs/vm']
  }
});
