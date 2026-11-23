import { test, expect, type APIRequestContext } from '@playwright/test';
import { authenticate, login, newApiContext, newRunId, requireEnv, type Tokens } from './functional-helpers';

/**
 * 画面機能確認: ページ項目表示設定(順立て・ピッキング)で、ピッキング画面の列・項目を変更できること。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-PKC-* に対応する。
 *
 * PC画面(/production/material-allocation)の FE-PKC-01 は functional-hd、
 * モバイル画面(/mobile/picking)の FE-PKC-02 は functional-smartphone で実行する。
 * 製品 E2E-PM-PROD・部品 E2E-PM-MAT(在庫あり)・用途 E2E-CAR は script/e2e_goods_receipt_data.py が投入する。
 * 表示設定はシステム全体で共有されるため、テストごとに退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

const PURPOSE = 'E2E-CAR';
const SETTINGS_URL = '/api/base/model-display-settings/';

let adminTokens: Tokens;
let api: APIRequestContext;
let planName: string;
const createdPlanIds: string[] = [];

const onlyOn = (project: 'functional-smartphone' | 'functional-hd') =>
  test.skip(test.info().project.name !== project, `${project} でのみ実行する`);

const setting = (name: string, order: number, extra: Record<string, unknown> = {}) => ({
  model_field_name: name, display_name: name, display_order: order, search_order: order,
  is_list_display: true, is_search_field: false, is_list_filter: false, ...extra,
});

const saveSettings = async (dataType: string, data: unknown) => {
  const response = await api.post(`${SETTINGS_URL}bulk-save/?data_type=${dataType}`, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
};

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  // 以前の実行で削除されずに残った計画があれば片付ける
  const left = await (await api.get('/api/production/plans/?plan_name=E2E-PKC-')).json();
  for (const p of (left.results ?? left) as { id: string }[]) await api.delete(`/api/production/plans/${p.id}/`);
  // 用途 E2E-CAR の計画を作り、部品を引き当てる(ピッキング画面に未ピッキングとして出る)
  planName = `E2E-PKC-${newRunId()}`;
  const created = await api.post('/api/production/plans/', {
    data: {
      plan_name: planName,
      product_code: 'E2E-PM-PROD',
      purpose: PURPOSE,
      planned_quantity: 5,
      planned_start_datetime: '2099-01-01T09:00:00+09:00',
      planned_end_datetime: '2099-01-02T09:00:00+09:00',
    },
  });
  expect(created.ok(), `計画を作成できること(マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行): ${await created.text()}`).toBeTruthy();
  const plan = await created.json();
  createdPlanIds.push(plan.id);
  const allocated = await api.post('/api/production/plans/bulk-allocate-materials/', { data: { plan_ids: [plan.id] } });
  expect(allocated.ok(), await allocated.text()).toBeTruthy();
});

test.afterAll(async () => {
  if (api) for (const id of createdPlanIds) await api.delete(`/api/production/plans/${id}/`);
  await api?.dispose();
});

test('FE-PKC-01 ページ項目表示設定(ピッキング・PC)で、列の非表示・表示名・並び順がPCのピッキング画面に反映されること', async ({ page }) => {
  onlyOn('functional-hd');
  const original = await (await api.get(`${SETTINGS_URL}?data_type=picking_pc`)).json();
  try {
    await authenticate(page, adminTokens);
    await page.goto('/production/material-allocation');
    const headers = page.locator('.goods-receipt-table thead th');
    // 設定が無い場合は既定の列(用途を含む)で表示される
    await expect(headers.filter({ hasText: /^用途$/ })).toHaveCount(1);
    await expect(headers.filter({ hasText: /^状態$/ })).toHaveCount(1);

    // 用途を先頭・表示名変更、部品の表示名変更、状態を非表示にする
    await saveSettings('picking_pc', [
      setting('purpose', 1, { display_name: '用途ZZ' }),
      setting('material', 2, { display_name: '部品ZZ' }),
      setting('allocated_quantity', 3),
      setting('status', 4, { is_list_display: false }),
    ]);
    await page.reload();
    await expect(headers.nth(0)).toHaveText('用途ZZ');
    await expect(headers.nth(1)).toHaveText('部品ZZ');
    await expect(headers.filter({ hasText: /^状態$/ })).toHaveCount(0);
  } finally {
    await saveSettings('picking_pc', original);
  }
});

test('FE-PKC-02 ページ項目表示設定(ピッキング・モバイル)で、明細の項目の非表示・表示名が反映されること', async ({ page }) => {
  onlyOn('functional-smartphone');
  const original = await (await api.get(`${SETTINGS_URL}?data_type=picking_mobile`)).json();
  try {
    await authenticate(page, adminTokens);
    await page.goto('/mobile/picking');
    const card = page.locator('.card').filter({ hasText: planName });
    // 設定が無い場合は既定の項目(用途・倉庫を含む)で表示される
    await expect(card.getByText(`用途: ${PURPOSE}`).first()).toBeVisible();
    await expect(card.getByText(/倉庫:/).first()).toBeVisible();

    // 用途の表示名を変更し、倉庫を非表示にする
    await saveSettings('picking_mobile', [
      setting('material_code', 1),
      setting('purpose', 2, { display_name: '用途ZZ' }),
      setting('warehouse', 3, { is_list_display: false }),
      setting('allocated_quantity', 4),
    ]);
    await page.reload();
    await expect(card.getByText(`用途ZZ: ${PURPOSE}`).first()).toBeVisible();
    await expect(card.getByText(/倉庫:/)).toHaveCount(0);
  } finally {
    await saveSettings('picking_mobile', original);
  }
});
