import { defineConfig, devices } from '@playwright/test';

/**
 * レスポンシブ表示確認(スマホ/HD/FullHD)で使用するビューポート定義。
 * ドキュメント側(docs/09_test_specifications/)ではモード名のみを参照し、
 * 実際のpx値はここを単一の情報源として管理する。
 *
 * スマホモードは devices['iPhone 13'] のビューポート/User-Agentを使用する。
 * User-Agentがモバイル向けの値になることで、frontend/src/App.tsx の MobileRedirector が
 * 行うUser-Agent判定(/mobile配下への振り分け)を実機に近い形で再現できる。
 * レンダリングエンジンはWebKitの追加インストールを避けるためChromiumに固定している。
 */
const smartphoneViewport = { ...devices['iPhone 13'], browserName: 'chromium' as const };
const hdViewport = { viewport: { width: 1280, height: 720 } };
const fullhdViewport = { viewport: { width: 1920, height: 1080 } };

const AUTH_STATE_FILE = 'e2e/.auth/user.json';

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
    // ログイン画面(未認証)の検証。
    { name: 'login-smartphone', testMatch: '**/login.spec.ts', use: smartphoneViewport },
    { name: 'login-hd', testMatch: '**/login.spec.ts', use: hdViewport },
    { name: 'login-fullhd', testMatch: '**/login.spec.ts', use: fullhdViewport },

    // ログイン後の画面検証で使い回す認証状態(storageState)を作成する。
    { name: 'auth-setup', testMatch: '**/auth.setup.ts', use: hdViewport },

    // ログイン後の画面の検証。デスクトップ画面はhd/fullhdのみ、モバイル専用画面はsmartphoneのみが対象
    // (frontend/e2e/desktop-pages.spec.ts, frontend/e2e/mobile-pages.spec.ts のコメントを参照)。
    {
      name: 'smartphone',
      testMatch: '**/mobile-pages.spec.ts',
      dependencies: ['auth-setup'],
      use: { ...smartphoneViewport, storageState: AUTH_STATE_FILE },
    },
    {
      name: 'hd',
      testMatch: '**/desktop-pages.spec.ts',
      dependencies: ['auth-setup'],
      use: { ...hdViewport, storageState: AUTH_STATE_FILE },
    },
    {
      name: 'fullhd',
      testMatch: '**/desktop-pages.spec.ts',
      dependencies: ['auth-setup'],
      use: { ...fullhdViewport, storageState: AUTH_STATE_FILE },
    },
  ],
});
