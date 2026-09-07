import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Vue Router handles the home and 404 views. Nginx preserves real HTTP 404s.
  appType: 'spa',
  base: '/',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
