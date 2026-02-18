import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['cytoscape', 'cytoscape-fcose'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['all', 'malina.tail5985a4.ts.net'],
  },
  test: {
    root: '.',
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/graph/**'],
      exclude: ['src/graph/serializer.js'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
