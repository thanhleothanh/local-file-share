import { defineConfig } from 'vite'
// import mkcert from 'vite-plugin-mkcert'
import { fileURLToPath, URL } from 'node:url'

// Note: mkcert disabled for Docker compatibility (ADR-0033)
// In development, use HTTPS via mkcert if needed
// const plugins = process.env.NODE_ENV === 'production' ? [] : [mkcert()];

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
    // Proxy WebSocket requests to the Express server in development
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  }
})
