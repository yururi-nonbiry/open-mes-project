import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHostsFromEnv = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(',')
  : [];

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    // Dockerコンテナ外や他のマシンからアクセスできるようにホストを0.0.0.0に設定
    host: '0.0.0.0',
    // '*' は常に許可し、.envファイルから読み込んだホストも追加する
    allowedHosts: ['*', ...allowedHostsFromEnv],
    proxy: {
      // Djangoバックエンドへのリクエストをプロキシする設定
      // API, Admin, Static, Debug Toolbarのリクエストをバックエンドに転送する
      '^/(api|admin|static|__debug__)/.*': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});