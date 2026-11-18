import { test, expect, type APIRequestContext } from '@playwright/test';
import { authenticate, login, newApiContext, requireEnv, type Tokens } from './functional-helpers';

/**
 * 画面機能確認: 用語の呼び方設定(/system/feature-settings)。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-TERM-* に対応する。
 *
 * 用語設定はシステム全体で共有されるため、開始時に退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

const CUSTOM = { part: 'E2E材料', picking: 'E2E払出', issue: 'E2E発送' };

let adminTokens: Tokens;
let generalTokens: Tokens;
let api: APIRequestContext;
let originalTerms: Record<string, string>;

const putTerms = (terms: Record<string, string>) => api.put('/api/base/terminology/', { data: terms });

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  generalTokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  const response = await api.get('/api/base/terminology/');
  expect(response.ok()).toBeTruthy();
  originalTerms = await response.json();
});

test.afterAll(async () => {
  if (!api) return;
  if (originalTerms) await putTerms(originalTerms);
  await api.dispose();
});

test('FE-TERM-01 用語設定: 既定の呼び方では「出庫予定」などの標準の表記で表示されること', async ({ page }) => {
  expect((await putTerms({ part: '部品', picking: 'ピッキング', issue: '出庫' })).ok()).toBeTruthy();
  await authenticate(page, adminTokens);
  await page.goto('/system/order-deletion');
  await expect(page.getByRole('button', { name: '出庫予定', exact: true })).toBeVisible();
});

test('FE-TERM-02 用語設定: 管理者が画面で呼び方を保存すると、画面全体の表記が変わること', async ({ page }) => {
  expect((await putTerms({ part: '部品', picking: 'ピッキング', issue: '出庫' })).ok()).toBeTruthy();
  await authenticate(page, adminTokens);
  await page.goto('/system/feature-settings');
  await page.locator('#term-part').fill(CUSTOM.part);
  await page.locator('#term-picking').fill(CUSTOM.picking);
  await page.locator('#term-issue').fill(CUSTOM.issue);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '呼び方を保存' }).click();

  // 保存後はページを再読み込みせずに、別の画面へ移動しても新しい呼び方で表示される
  await page.goto('/system/order-deletion');
  await expect(page.getByRole('button', { name: `${CUSTOM.issue}予定`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '出庫予定', exact: true })).toHaveCount(0);
  const saved = await (await api.get('/api/base/terminology/')).json();
  expect(saved).toMatchObject(CUSTOM);
});

test('FE-TERM-03 用語設定: 一般ユーザーにも変更後の呼び方が反映されること', async ({ page }) => {
  expect((await putTerms(CUSTOM)).ok()).toBeTruthy();
  await authenticate(page, generalTokens);
  await page.goto('/inventory/issue');
  await expect(page.getByText(new RegExp(CUSTOM.issue)).first()).toBeVisible();
  await expect(page.getByText(/(?<!入)出庫/)).toHaveCount(0);
});

test('FE-TERM-04 用語設定: 空欄では保存できず、エラーが表示されて設定が変わらないこと', async ({ page }) => {
  expect((await putTerms({ part: '部品', picking: 'ピッキング', issue: '出庫' })).ok()).toBeTruthy();
  await authenticate(page, adminTokens);
  await page.goto('/system/feature-settings');
  await page.locator('#term-part').fill('   ');
  await page.getByRole('button', { name: '呼び方を保存' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '1〜10文字' })).toBeVisible();
  const current = await (await api.get('/api/base/terminology/')).json();
  expect(current).toMatchObject({ part: '部品', picking: 'ピッキング', issue: '出庫' });
});
