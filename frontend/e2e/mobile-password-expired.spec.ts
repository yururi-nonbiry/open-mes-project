import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。スマホのUser-Agentで実行する(functional-smartphone)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
});

test('FE-MPW-01 スマホでパスワードの有効期限が切れている場合、設定画面に留まりリダイレクトを繰り返さないこと', async ({ page }) => {
  // セッション確認の応答だけを「パスワード期限切れ」に差し替える(実ユーザーのパスワード日時は変えない)
  await page.route('**/api/users/session/', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, isPasswordExpired: true } });
  });
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname); });

  await authenticate(page, tokens);
  await page.goto('/mobile');
  await expect(page).toHaveURL(/\/user\/settings$/);
  // 少し待っても設定画面のまま(モバイルトップとの往復が起きない)
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/user\/settings$/);
  // 設定画面に移った後に、モバイルトップへ戻されていない
  const settingsIndex = navigations.indexOf('/user/settings');
  expect(settingsIndex).toBeGreaterThanOrEqual(0);
  expect(navigations.slice(settingsIndex).filter((p) => p !== '/user/settings')).toEqual([]);
});
