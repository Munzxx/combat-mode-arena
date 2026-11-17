import { defineConfig } from 'vitest/config';

// base './' keeps asset paths relative, so the same build works on GitHub Pages
// (project sub-path) and later inside the Capacitor iOS app (file-based origin).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
