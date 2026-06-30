import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const CLOUD_FUNCTION_URL = process.env.VITE_CLOUDRUN_URL || 'http://localhost:80'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: CLOUD_FUNCTION_URL,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
