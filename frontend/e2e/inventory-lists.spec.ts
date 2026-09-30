import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_ITEM_CODE,
  authenticate,
  createPurchaseOrder,
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
 * 画面機能確認: 在庫照会(/inventory/inquiry)・入出庫履歴(/inventory/stock-movement-history)の一覧表示。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-INV-* / FE-SMH-* に対応する。
 *
 * 入庫処置画面と同じく表示設定(ModelDisplaySetting)で列を決める画面のため、表示設定の有無・
 * ログインユーザーの権限によらず明細の項目が表示されることを確認する。
 * 表示設定はシステム全体で共有されるため、開始時に退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

const INVENTORY_DEFAULT_HEADERS = ['品番', '倉庫', '場所', '在庫数', '引当在庫', '利用可能数', '最終更新日時', '操作'];
const HISTORY_DEFAULT_HEADERS = ['移動日時', '品番', '倉庫', '移動タイプ', '数量', '記録者', '備考', '参照ドキュメント'];

let adminTokens: Tokens;
let generalTokens: Tokens;
let api: APIRequestContext;
let originalSettings: Record<string, DisplaySetting[]>;

const inventoryHeaders = (page: Page) => page.locator('.inventory-inquiry table thead th');
const inventoryRows = (page: Page) => page.locator('.inventory-inquiry table tbody tr');
const historyHeaders = (page: Page) => page.locator('#schedule-table thead th');
const historyRows = (page: Page) => page.locator('#schedule-table tbody tr');

async function openInventory(page: Page, tokens: Tokens) {
  await authenticate(page, tokens);
  await page.goto('/inventory/inquiry');
  await expect(page.getByRole('heading', { name: '在庫照会' })).toBeVisible();
  await expect(inventoryRows(page).first()).toBeVisible();
}

async function openHistory(page: Page, tokens: Tokens) {
  await authenticate(page, tokens);
  await page.goto('/inventory/stock-movement-history');
  await expect(page.getByRole('heading', { name: '入出庫履歴', exact: true })).toBeVisible();
  await expect(historyRows(page).first()).not.toHaveText('読み込み中...');
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  generalTokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);

  originalSettings = {
    inventory: await getDisplaySettings(api, 'inventory'),
    stock_movement: await getDisplaySettings(api, 'stock_movement'),
  };

  // 在庫と入出庫履歴が必ず1件以上ある状態にするため、E2E専用品番を1件入庫しておく
  const order = await createPurchaseOrder(api, {
    order_number: `E2E-GI-${newRunId()}-01`,
    product_name: 'E2E一覧表示テスト品',
    expected_arrival: '2000-03-01T00:00:00+09:00',
  });
  const receipt = await api.post('/api/inventory/purchase-orders/process-receipt/', {
    data: { purchase_order_id: order.id, received_quantity: 10 },
  });
  expect(receipt.ok()).toBeTruthy();
});

test.afterAll(async () => {
  if (!api) return;
  if (originalSettings) {
    await saveDisplaySettings(api, 'inventory', originalSettings.inventory);
    await saveDisplaySettings(api, 'stock_movement', originalSettings.stock_movement);
  }
  await api.dispose();
});

test('FE-INV-01 在庫照会: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること', async ({ page }) => {
  await saveDisplaySettings(api, 'inventory', []);
  await openInventory(page, adminTokens);

  await expect(inventoryHeaders(page)).toHaveText(INVENTORY_DEFAULT_HEADERS);
  for (const row of await inventoryRows(page).all()) {
    await expect(row.locator('td')).toHaveCount(INVENTORY_DEFAULT_HEADERS.length);
    await expect(row.locator('td').first()).not.toBeEmpty();
  }
});

test('FE-INV-02 在庫照会: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること', async ({ page }) => {
  await saveDisplaySettings(api, 'inventory', [
    { model_field_name: 'part_number', display_order: 1, is_search_field: true },
    { model_field_name: 'warehouse', display_order: 2 },
    { model_field_name: 'quantity', display_order: 3 },
  ]);
  await openInventory(page, generalTokens);

  await expect(inventoryHeaders(page)).toHaveText(['品番', '倉庫', '在庫数量', '操作']);
  for (const row of await inventoryRows(page).all()) {
    await expect(row.locator('td')).toHaveCount(4);
    await expect(row.locator('td').first()).not.toBeEmpty();
  }
});

test('FE-SMH-01 入出庫履歴: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること', async ({ page }) => {
  await saveDisplaySettings(api, 'stock_movement', []);
  await openHistory(page, adminTokens);

  await expect(historyHeaders(page)).toHaveText(HISTORY_DEFAULT_HEADERS);
  for (const row of await historyRows(page).all()) {
    await expect(row.locator('td')).toHaveCount(HISTORY_DEFAULT_HEADERS.length);
    await expect(row.locator('td').first()).not.toBeEmpty();
  }
  await expect(historyRows(page).filter({ hasText: E2E_ITEM_CODE }).first()).toContainText('入庫');
});

test('FE-SMH-02 入出庫履歴: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること', async ({ page }) => {
  await saveDisplaySettings(api, 'stock_movement', [
    { model_field_name: 'movement_date', display_order: 1 },
    { model_field_name: 'part_number', display_order: 2 },
    { model_field_name: 'warehouse', display_order: 3 },
    { model_field_name: 'quantity', display_order: 4 },
  ]);
  await openHistory(page, generalTokens);

  await expect(historyHeaders(page)).toHaveText(['移動日時', '品番', '倉庫', '数量']);
  for (const row of await historyRows(page).all()) {
    await expect(row.locator('td')).toHaveCount(4);
    await expect(row.locator('td').nth(1)).not.toBeEmpty();
  }
});
