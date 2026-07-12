import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react() as PluginOption],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    // The only chunk over the default 500 kB is elkjs (~1.4 MB) — a single
    // pre-bundled, internally-monolithic third-party file that can't be split
    // and is now lazy-loaded (see useAutoLayout), so it never blocks first
    // paint. Raise the limit above it; anything genuinely large and eager
    // (>1.5 MB) still warns.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split the heavy editor-only libraries into their own chunks. They
        // load together with the (already route-split) EditorPage, but as
        // separate files they download in parallel and — since these deps
        // rarely change — stay cached across app deploys. Also drops every
        // chunk under the 500 kB warning threshold.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow')) return 'vendor-reactflow';
          if (/[\\/](yjs|y-protocols|y-websocket|lib0)[\\/]/.test(id)) return 'vendor-yjs';
          if (id.includes('html-to-image')) return 'vendor-export';
          // elkjs is NOT manual-chunked on purpose: useAutoLayout imports it
          // dynamically, so rolldown gives it its own on-demand chunk that
          // only downloads when the user first runs auto-layout.
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Yjs collaboration WebSocket — same-origin so the auth cookie is sent.
      '/yjs': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
