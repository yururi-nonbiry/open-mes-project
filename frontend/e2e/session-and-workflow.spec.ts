import { test, expect, type APIRequestContext } from '@playwright/test';
import { authenticate, login, newApiContext, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。セッション確認の一時的な失敗と、業務フローの表示設定の共有。
const baseURL = 'http://localhost:5173';
let adminTokens: Tokens;
let generalTokens: Tokens;
let api: APIRequestContext;
let original: Record<string, string>;

test.beforeAll(async () => {
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  generalTokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  original = await (await api.get('/api/base/workflow-visibility/')).json();
});

test.afterAll(async () => {
  if (!api) return;
  if (original) await api.put('/api/base/workflow-visibility/', { data: original });
  await api.dispose();
});

test('FE-SESS-01 セッション確認がサーバーエラーで失敗しても、ログアウトせずトークンを残すこと', async ({ page }) => {
  await page.route('**/api/users/session/', (route) => route.fulfill({ status: 503, json: { error: 'maintenance' } }));
  await authenticate(page, generalTokens);
  await page.goto('/inventory/inquiry');
  await expect(page.getByRole('heading', { name: '在庫照会' })).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).not.toBeNull();
  await expect(page).not.toHaveURL(/login/);
});

test('FE-WFVIS-01 管理者が非表示にした業務フローは、別のユーザー・端末のトップ画面でも非表示になること', async ({ page }) => {
  const visible = { 'receipt-flow': 'visible', 'production-plan-flow': 'visible', 'production-issue-flow': 'visible' };
  expect((await api.put('/api/base/workflow-visibility/', { data: { ...visible, 'receipt-flow': 'hidden' } })).ok()).toBeTruthy();
  await authenticate(page, generalTokens);
  await page.goto('/');
  await expect(page.locator('.workflow-track-block').first()).toBeVisible();
  await expect(page.locator('.track-receipt-flow')).toHaveCount(0);
  await expect(page.locator('.track-production-plan-flow')).toHaveCount(1);
});
