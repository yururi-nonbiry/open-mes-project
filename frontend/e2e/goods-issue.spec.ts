import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_ITEM_CODE,
  E2E_WAREHOUSE,
  authenticate,
  getDisplaySettings,
  login,
  newApiContext,
  newRunId,
  requireEnv,
  saveDisplaySettings,
  type DisplaySetting,
  type Tokens,
} from './functional-helpers';

/**
 * 画面機能確認: 出庫処置(/inventory/issue)の一覧表示。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-GI-* に対応する。
 *
 * 出庫処置画面は、モデル項目表示設定(data_type=sales_order)で列と並び順を決める。
 * 表示設定はシステム全体で共有されるため、開始時に退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

// script/e2e_goods_receipt_data.py が投入する用途(車種)マスタ
const E2E_PURPOSE = 'E2E-CAR';
const DEFAULT_HEADERS = ['受注番号', '品目（品番）', '出庫倉庫', '用途', '出庫先ライン', '予定数量', '出庫済', '未出庫残', '出庫予定日', '出庫・操作'];

let adminTokens: Tokens;
let generalTokens: Tokens;
let api: APIRequestContext;
let originalSettings: DisplaySetting[];
let orderNumber: string;

const headers = (page: Page) => page.locator('.goods-receipt-table thead th');
const targetRow = (page: Page) => page.locator('.goods-receipt-table tbody tr').filter({ hasText: orderNumber });

async function openIssue(page: Page, tokens: Tokens) {
  await authenticate(page, tokens);
  await page.goto('/inventory/issue');
  await page.locator('#issue-search-input').fill(orderNumber);
  await expect(targetRow(page)).toHaveCount(1);
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  generalTokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  originalSettings = await getDisplaySettings(api, 'sales_order');

  orderNumber = `E2E-GX-${newRunId()}-01`;
  const response = await api.post('/api/inventory/sales-orders/', {
    data: {
      order_number: orderNumber,
      item: E2E_ITEM_CODE,
      quantity: 10,
      warehouse: E2E_WAREHOUSE,
      purpose: E2E_PURPOSE,
      expected_shipment: '2099-01-01T00:00:00+09:00',
    },
  });
  expect(response.ok(), '出庫予定を作成できること(用途マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行)').toBeTruthy();
});

test.afterAll(async () => {
  if (!api) return;
  if (originalSettings) await saveDisplaySettings(api, 'sales_order', originalSettings);
  const list = await api.get(`/api/inventory/sales-orders/?search_q=${encodeURIComponent(orderNumber)}`);
  if (list.ok()) {
    for (const order of (await list.json()).results ?? []) await api.delete(`/api/inventory/sales-orders/${order.id}/`);
  }
  await api.dispose();
});

test('FE-GI-01 出庫処置: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること', async ({ page }) => {
  await saveDisplaySettings(api, 'sales_order', []);
  await openIssue(page, adminTokens);

  await expect(headers(page)).toHaveText(DEFAULT_HEADERS);
  await expect(targetRow(page).locator('td')).toHaveCount(DEFAULT_HEADERS.length);
  await expect(targetRow(page).locator('td').nth(3)).toHaveText(E2E_PURPOSE);
});

test('FE-GI-02 出庫処置: 用途(車種)を先頭に設定すると、一般ユーザーの画面でも左端の列になること', async ({ page }) => {
  await saveDisplaySettings(api, 'sales_order', [
    { model_field_name: 'purpose', display_order: 1 },
    { model_field_name: 'order_number', display_order: 2 },
    { model_field_name: 'quantity', display_order: 3 },
    { model_field_name: 'remaining_quantity', display_order: 4 },
  ]);
  await openIssue(page, generalTokens);

  await expect(headers(page)).toHaveText(['用途', '受注番号', '予定数量', '未出庫残', '出庫・操作']);
  const cells = targetRow(page).locator('td');
  await expect(cells).toHaveCount(5);
  await expect(cells.nth(0)).toHaveText(E2E_PURPOSE);
  await expect(cells.nth(1)).toHaveText(orderNumber);
  await expect(cells.nth(2)).toHaveText('10');
  await expect(cells.nth(3)).toHaveText('10');
});

test('FE-GI-03 出庫処置: 表示列を絞っても出庫処理のモーダルが開くこと', async ({ page }) => {
  await saveDisplaySettings(api, 'sales_order', [{ model_field_name: 'purpose', display_order: 1 }]);
  await openIssue(page, adminTokens);

  await expect(headers(page)).toHaveText(['用途', '出庫・操作']);
  await targetRow(page).getByRole('button', { name: '出庫処理' }).click();
  await expect(page.getByText('出庫処理の登録')).toBeVisible();
  await expect(page.locator('#quantity_to_ship')).toHaveValue('10');
});
