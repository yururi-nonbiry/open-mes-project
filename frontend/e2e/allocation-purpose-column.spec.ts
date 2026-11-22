import { test, expect, type APIRequestContext } from '@playwright/test';
import { authenticate, login, newApiContext, newRunId, requireEnv, type Tokens } from './functional-helpers';

/**
 * 画面機能確認: 生産計画の部品引当画面に「用途」列が表示されること。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-PAL-* に対応する。
 *
 * 製品 E2E-PM-PROD・部品 E2E-PM-MAT・用途 E2E-CAR は script/e2e_goods_receipt_data.py が投入する。
 */
test.describe.configure({ mode: 'default' });

let adminTokens: Tokens;
let api: APIRequestContext;

const createPlan = async (name: string, purpose: string | null) => {
  const response = await api.post('/api/production/plans/', {
    data: {
      plan_name: name,
      product_code: 'E2E-PM-PROD',
      purpose,
      planned_quantity: 5,
      planned_start_datetime: '2099-01-01T09:00:00+09:00',
      planned_end_datetime: '2099-01-02T09:00:00+09:00',
    },
  });
  expect(response.ok(), `計画を作成できること(マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行): ${await response.text()}`).toBeTruthy();
};

async function openAllocateModal(page: import('@playwright/test').Page, name: string) {
  await authenticate(page, adminTokens);
  await page.goto('/production/plan');
  await page.locator('#plan-filter-name').fill(name);
  await page.locator('#plan-filter-name').press('Enter');
  const rows = page.locator('.goods-receipt-table tbody tr');
  await expect(rows).toHaveCount(1);
  await rows.getByRole('button', { name: /部品引当/ }).click();
  await expect(page.getByText('E2E-PM-MAT').first()).toBeVisible();
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
});

test.afterAll(async () => {
  await api?.dispose();
});

test('FE-PAL-01 用途を指定した計画の引当画面に、用途の列と用途コードが表示されること', async ({ page }) => {
  const name = `E2E-PAL-${newRunId()}`;
  await createPlan(name, 'E2E-CAR');
  await openAllocateModal(page, name);
  await expect(page.getByRole('columnheader', { name: '用途' })).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: 'E2E-PM-MAT' }).getByText('E2E-CAR')).toBeVisible();
});

test('FE-PAL-02 用途を指定しない計画の引当画面では、用途の列に「汎用」と表示されること', async ({ page }) => {
  const name = `E2E-PAL-${newRunId()}`;
  await createPlan(name, null);
  await openAllocateModal(page, name);
  await expect(page.locator('tbody tr').filter({ hasText: 'E2E-PM-MAT' }).getByText('汎用')).toBeVisible();
});
