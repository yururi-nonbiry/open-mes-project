import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      '^/(api|static|__debug__)/.*': {
        target: process.env.VITE_BACKEND_URL || 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
});
