import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.*', 'spec/**/*.test.*'],
    environment: 'node',
    globals: true,
    clearMocks: false,
    exclude: [
      '**/node_modules/**',
      'subgraph/**/node_modules/**',
      'dashboard/**/*.test.{js,jsx,ts,tsx}'
    ],
    // Forked pool keeps native modules like better-sqlite3 stable during ESM transforms
    pool: 'forks',
    maxWorkers: 2,
    deps: {
      optimizer: {
        ssr: {
          exclude: ['better-sqlite3', 'cborg', '@ethereumjs/vm']
        }
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/network/**', 'src/telemetry/**', 'src/alpha/**/*.js'],
      exclude: ['src/alpha/cli.js', 'src/alpha/web/**'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 60,
        statements: 85
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
