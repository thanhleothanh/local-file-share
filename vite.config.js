import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [mkcert()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true
  }
})
