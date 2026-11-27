import { test, expect, type APIRequestContext } from '@playwright/test';
import { authenticate, login, newApiContext, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。データ投入画面から生産計画を登録する。
const baseURL = 'http://localhost:5173';
const PRODUCT = 'E2E-DI-PROD';
const PLAN_NAME = 'E2E-DI-用途ライン空欄';
let tokens: Tokens;
let api: APIRequestContext;

async function cleanup() {
  const plans = await (await api.get(`/api/production/plans/?plan_name=${encodeURIComponent(PLAN_NAME)}`)).json();
  for (const plan of plans.results ?? []) await api.delete(`/api/production/plans/${plan.id}/`);
}

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, tokens);
  const items = await (await api.get('/api/master/items/')).json();
  if (!(items.data ?? []).some((i: { code: string }) => i.code === PRODUCT)) {
    const created = await api.post('/api/master/items/', { data: { code: PRODUCT, name: 'E2Eデータ投入製品', item_type: 'product' } });
    expect(created.ok()).toBeTruthy();
  }
  await cleanup();
});

test.afterAll(async () => {
  if (!api) return;
  await cleanup();
  await api.dispose();
});

test('FE-DI-01 生産計画の登録で、任意の用途・ラインを空欄のまま登録できること', async ({ page }) => {
  await authenticate(page, tokens);
  await page.goto('/data/import?open=production-plan');
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="plan_name"]').fill(PLAN_NAME);
  await dialog.locator('[name="product_code"]').fill(PRODUCT);
  await dialog.locator('[name="planned_quantity"]').fill('5');
  await dialog.locator('[name="planned_start_datetime"]').fill('2099-01-01T08:00');
  await dialog.locator('[name="planned_end_datetime"]').fill('2099-01-01T17:00');
  await expect(dialog.locator('[name="purpose"]')).toHaveValue('');
  await expect(dialog.locator('[name="line"]')).toHaveValue('');
  await dialog.getByRole('button', { name: /を登録する/ }).click();
  await expect(dialog).toBeHidden();

  const plans = await (await api.get(`/api/production/plans/?plan_name=${encodeURIComponent(PLAN_NAME)}`)).json();
  expect(plans.results).toHaveLength(1);
  expect(plans.results[0].purpose).toBeNull();
  expect(plans.results[0].line).toBeNull();
});
