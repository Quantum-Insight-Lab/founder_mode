import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    poolOptions: { threads: { singleThread: true } }, // DB tests share one DB; avoid TRUNCATE races
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
