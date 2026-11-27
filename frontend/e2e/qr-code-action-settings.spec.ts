import { test, expect, type APIRequestContext } from '@playwright/test';
import { authenticate, login, newApiContext, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。管理者でQRコードアクションを作成する。
const baseURL = 'http://localhost:5173';
const PREFIX = 'E2E-QR-';
let tokens: Tokens;
let api: APIRequestContext;

async function cleanup() {
  const list = await (await api.get('/api/base/qr-code-actions/')).json() as { id: string; name: string }[];
  for (const action of list.filter((a) => a.name.startsWith(PREFIX))) {
    await api.delete(`/api/base/qr-code-actions/${action.id}/`);
  }
}

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, tokens);
  await cleanup();
});

test.afterAll(async () => {
  if (!api) return;
  await cleanup();
  await api.dispose();
});

test('FE-QR-01 テンプレートを選び名前を入力して、同じテンプレートからQRコードアクションを3件以上作成できること', async ({ page }) => {
  await authenticate(page, tokens);
  await page.goto('/system/qr-code-actions');
  for (const suffix of ['A', 'B', 'C']) {
    await page.getByRole('button', { name: /新規/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select[name="template"]').selectOption({ index: 0 });
    await dialog.locator('input[name="name"]').fill(`${PREFIX}${suffix}`);
    await dialog.getByRole('button', { name: /保存/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`${PREFIX}${suffix}`, { exact: true })).toBeVisible();
  }
  const list = await (await api.get('/api/base/qr-code-actions/')).json() as { name: string; action_name: string }[];
  const created = list.filter((a) => a.name.startsWith(PREFIX));
  expect(created.map((a) => a.name).sort()).toEqual([`${PREFIX}A`, `${PREFIX}B`, `${PREFIX}C`]);
  expect(created.every((a) => a.action_name === 'update_search')).toBeTruthy();
});
