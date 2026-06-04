import { defineConfig } from 'vite';

const SERVER_PORT = 3000;
const VITE_PORT = 5173;

export default defineConfig({
  server: {
    port: VITE_PORT,
    strictPort: true,
    proxy: {
      '/ws': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
