import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  css: {
    // Provide an inline PostCSS config so Vite never searches for / loads
    // the project's postcss.config.mjs during test runs. That file must stay
    // in its Next.js-required string-plugin shape, which Vite's own loader
    // cannot execute (function-valued plugins only, no strings) — so tests
    // use this empty inline config instead of the shared one.
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: ['**/__tests__/**', '**/node_modules/**', 'server/**'],
  },
});
