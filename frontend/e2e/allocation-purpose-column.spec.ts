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

// このテストが作った計画。同一品番の計画は他のテスト(統合)の合計数量に影響するため、終了時に削除する
const createdPlanIds: string[] = [];

const deletePlans = async (ids: string[]) => {
  for (const id of ids) await api.delete(`/api/production/plans/${id}/`);
};

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
  createdPlanIds.push((await response.json()).id);
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
  // 以前の実行で削除されずに残った計画があれば片付ける
  const left = await (await api.get('/api/production/plans/?plan_name=E2E-PAL-')).json();
  await deletePlans((left.results ?? left).map((p: { id: string }) => p.id));
});

test.afterAll(async () => {
  if (api) await deletePlans(createdPlanIds);
  await api?.dispose();
});

test('FE-PAL-01 用途を指定した計画の引当画面に、用途の列と用途コードが表示されること', async ({ page }) => {
  const name = `E2E-PAL-${newRunId()}`;
  await createPlan(name, 'E2E-CAR');
  await openAllocateModal(page, name);
  await expect(page.locator('.modal-content').getByRole('columnheader', { name: '用途' })).toBeVisible();
  await expect(page.locator('.modal-content tbody tr').filter({ hasText: 'E2E-PM-MAT' }).getByText('E2E-CAR')).toBeVisible();
});

test('FE-PAL-02 用途を指定しない計画の引当画面では、用途の列に「汎用」と表示されること', async ({ page }) => {
  const name = `E2E-PAL-${newRunId()}`;
  await createPlan(name, null);
  await openAllocateModal(page, name);
  await expect(page.locator('.modal-content tbody tr').filter({ hasText: 'E2E-PM-MAT' }).getByText('汎用')).toBeVisible();
});

test('FE-PAL-03 ページ項目表示設定(部品引当)で、列の非表示・表示名・並び順が引当画面に反映されること', async ({ page }) => {
  const url = '/api/base/model-display-settings/';
  const original = await (await api.get(`${url}?data_type=production_allocation`)).json();
  const setting = (name: string, order: number, extra: Record<string, unknown> = {}) => ({
    model_field_name: name, display_name: name, display_order: order, search_order: order,
    is_list_display: true, is_search_field: false, is_list_filter: false, ...extra,
  });
  try {
    // 単位を非表示、部品コードの表示名を変更し、用途を先頭にする
    const saved = await api.post(`${url}bulk-save/?data_type=production_allocation`, {
      data: [
        setting('purpose', 1, { display_name: '用途ZZ' }),
        setting('part_code', 2, { display_name: '部品ZZ' }),
        setting('part_name', 3, { display_name: '部品名' }),
        setting('unit', 4, { display_name: '単位', is_list_display: false }),
      ],
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const name = `E2E-PAL-${newRunId()}`;
    await createPlan(name, 'E2E-CAR');
    await openAllocateModal(page, name);
    const headers = page.locator('.modal-content thead th');
    await expect(headers.nth(1)).toHaveText('用途ZZ');
    await expect(headers.nth(2)).toHaveText('部品ZZ');
    await expect(page.locator('.modal-content thead').getByText('単位', { exact: true })).toHaveCount(0);
  } finally {
    await api.post(`${url}bulk-save/?data_type=production_allocation`, { data: original });
  }
});

test('FE-PAL-04 ページ項目表示設定(生産計画一覧)で、一覧の列の追加・非表示・表示名・並び順が反映されること', async ({ page }) => {
  const url = '/api/base/model-display-settings/';
  const original = await (await api.get(`${url}?data_type=production_plan`)).json();
  const setting = (name: string, order: number, extra: Record<string, unknown> = {}) => ({
    model_field_name: name, display_name: name, display_order: order, search_order: order,
    is_list_display: true, is_search_field: false, is_list_filter: false, ...extra,
  });
  try {
    const name = `E2E-PAL-${newRunId()}`;
    await createPlan(name, 'E2E-CAR');
    await authenticate(page, adminTokens);
    await page.goto('/production/plan');
    await page.locator('#plan-filter-name').fill(name);
    await page.locator('#plan-filter-name').press('Enter');
    const headers = page.locator('.goods-receipt-table thead th');
    // 設定が無い場合は既定の列(用途を含む)で表示される
    await expect(headers.filter({ hasText: /^用途$/ })).toHaveCount(1);

    // 用途を先頭・表示名変更、状態を非表示にする
    const saved = await api.post(`${url}bulk-save/?data_type=production_plan`, {
      data: [
        setting('purpose', 1, { display_name: '用途ZZ' }),
        setting('plan_name', 2, { display_name: '計画ZZ' }),
        setting('product_code', 3),
        setting('status', 4, { is_list_display: false }),
      ],
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    await page.reload();
    await page.locator('#plan-filter-name').fill(name);
    await page.locator('#plan-filter-name').press('Enter');
    await expect(headers.nth(1)).toHaveText('用途ZZ');
    await expect(headers.nth(2)).toHaveText('計画ZZ');
    await expect(headers.filter({ hasText: /^状態$/ })).toHaveCount(0);
    await expect(page.locator('.goods-receipt-table tbody tr').first().locator('td').nth(1)).toHaveText('E2E-CAR');
  } finally {
    await api.post(`${url}bulk-save/?data_type=production_plan`, { data: original });
  }
});
