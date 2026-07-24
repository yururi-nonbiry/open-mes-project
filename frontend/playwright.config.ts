import { defineConfig, devices } from '@playwright/test';

/**
 * レスポンシブ表示確認(スマホ/HD/FullHD)で使用するビューポート定義。
 * ドキュメント側(docs/09_test_specifications/)ではモード名のみを参照し、
 * 実際のpx値はここを単一の情報源として管理する。
 *
 * スマホモードは devices['iPhone 13'] を使用する。ビューポートに加えてUser-Agentも
 * モバイル向けの値になり、frontend/src/App.tsx の MobileRedirector が行う
 * User-Agent判定(/mobile配下への振り分け)を実際の挙動どおりに再現できるため。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'smartphone',
      // devices['iPhone 13'] は既定でWebKitを使うが、Chromiumのみのインストールで完結させるため上書きする。
      // 目的はUser-Agent/ビューポート/タッチ操作の再現であり、レンダリングエンジンの互換性検証ではないため
      // ブラウザ種別の違いは許容する。
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'hd',
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'fullhd',
      use: { viewport: { width: 1920, height: 1080 } },
    },
  ],
});
