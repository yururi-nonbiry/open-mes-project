import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHostsFromEnv = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(',')
  : [];

const backendTarget = process.env.VITE_BACKEND_URL || 'http://backend:8000';

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
      // API, Static, Debug Toolbarのリクエストをバックエンドに転送する
      '^/(api|static|__debug__)/.*': {
        // Docker Compose上ではfrontendとbackendが別コンテナのため、'localhost'ではなく
        // サービス名'backend'で名前解決する必要がある。
        target: backendTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // バックエンド未起動時にNodeプロセスがクラッシュしたり赤字スタックトレースが溢れるのを防ぐ
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'バックエンド未接続（オフライン開発モード）',
                code: 'BACKEND_OFFLINE',
                message: err.message
              }));
            }
          });
        }
      },
    },
  },
});
