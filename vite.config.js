import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works at a domain root (Cloudflare Pages)
  // or under a sub-path such as username.github.io/netscope/ (GitHub Pages).
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
