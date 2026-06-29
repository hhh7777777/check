import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 云函数 HTTP 触发器地址（部署后替换为实际地址）
// 本地开发时使用代理，生产环境直接请求云函数
const CLOUD_FUNCTION_URL = process.env.VITE_CLOUDRUN_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: CLOUD_FUNCTION_URL,
        changeOrigin: true
      }
    }
  }
})
