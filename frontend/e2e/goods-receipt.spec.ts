import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_SUPPLIER,
  authenticate,
  createPurchaseOrder,
  deleteUnreceivedPurchaseOrders,
  getDisplaySettings,
  getPurchaseOrder,
  login,
  newApiContext,
  newRunId,
  requireEnv,
  saveDisplaySettings,
  type DisplaySetting,
  type PurchaseOrder,
  type Tokens,
} from './functional-helpers';

/**
 * 画面機能確認: 入庫処置画面(/inventory/purchase、PC向け)。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-GR-* に対応する。
 *
 * 表示設定(ModelDisplaySetting)はシステム全体で共有される設定のため、開始時に退避して終了時に復元する。
 * 同じ理由で、このファイルのテストは1ワーカーで順番に実行する。
 */
test.describe.configure({ mode: 'default' });

const PATH = '/inventory/purchase';
const PREFIX = 'E2E-GR-';
// 一覧は入荷予定日の昇順で並ぶため、十分に古い日付にして1ページ目の先頭に来るようにする
const EXPECTED_ARRIVAL = '2000-01-01T00:00:00+09:00';
const ORDER_COUNT = 30; // 1ページ(25件)を超える件数

const DEFAULT_HEADERS = ['発注番号', '仕入先', '品目', '品名', '発注数量', '入庫済数量', '残数量', '入荷予定日', 'ステータス', '操作'];

// 「ページ項目表示設定」画面(入庫処理)で保存した場合と同じく goods_receipt に保存する
const CUSTOM_SETTINGS: DisplaySetting[] = [
  { model_field_name: 'order_number', display_order: 1, is_search_field: true, search_order: 1 },
  { model_field_name: 'product_name', display_order: 2, display_name: '品名カスタム' },
  { model_field_name: 'quantity', display_order: 3 },
  { model_field_name: 'received_quantity', display_order: 4 },
  { model_field_name: 'status', display_order: 5 },
  { model_field_name: 'delivery_date', display_order: 6 },
  { model_field_name: 'delivered_quantity', display_order: 7 },
  { model_field_name: 'location', display_order: 8, is_list_display: false },
];
const CUSTOM_HEADERS = ['発注番号', '品名カスタム', '発注数量', '入庫済数量', 'ステータス', '納品日', '納品数', '操作'];

let adminTokens: Tokens;
let generalTokens: Tokens;
let api: APIRequestContext;
let originalSettings: Record<string, DisplaySetting[]>;
let orders: PurchaseOrder[];

const headers = (page: Page) => page.locator('.goods-receipt table thead th');
const rows = (page: Page) => page.locator('.goods-receipt table tbody tr');
const modal = (page: Page) => page.locator('.modal-content');

async function setSettings(settings: DisplaySetting[]) {
  await saveDisplaySettings(api, 'purchase_order', []);
  await saveDisplaySettings(api, 'goods_receipt', settings);
}

async function openPage(page: Page, tokens: Tokens = adminTokens) {
  await authenticate(page, tokens);
  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: '入庫処置' })).toBeVisible();
  await expect(rows(page).first()).not.toHaveText('検索中...');
}

/** 発注番号で検索し、該当行を返す(発注番号が検索項目に設定されていること)。 */
async function searchOrder(page: Page, orderNumber: string, status = 'pending') {
  await page.locator('select[name="status"]').selectOption(status);
  await page.getByPlaceholder('発注番号で検索...').fill(orderNumber);
  await page.getByRole('button', { name: '検索', exact: true }).click();
  const row = rows(page).filter({ hasText: orderNumber });
  await expect(row).toHaveCount(1);
  return row;
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  generalTokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);

  originalSettings = {
    purchase_order: await getDisplaySettings(api, 'purchase_order'),
    goods_receipt: await getDisplaySettings(api, 'goods_receipt'),
  };

  // 前回の実行が途中で終わった場合に残る未入庫のテストデータを片付けてから作成する
  await deleteUnreceivedPurchaseOrders(api, PREFIX);
  const runId = newRunId();
  orders = [];
  for (let i = 1; i <= ORDER_COUNT; i++) {
    const no = String(i).padStart(2, '0');
    orders.push(
      await createPurchaseOrder(api, {
        order_number: `${PREFIX}${runId}-${no}`,
        product_name: `E2E入庫テスト品 ${no}`,
        expected_arrival: EXPECTED_ARRIVAL,
      }),
    );
  }
});

test.afterAll(async () => {
  if (!api) return;
  if (originalSettings) {
    await saveDisplaySettings(api, 'purchase_order', originalSettings.purchase_order);
    await saveDisplaySettings(api, 'goods_receipt', originalSettings.goods_receipt);
  }
  await deleteUnreceivedPurchaseOrders(api, PREFIX);
  await api.dispose();
});

test('FE-GR-01 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること', async ({ page }) => {
  await setSettings([]);
  await openPage(page);

  await expect(headers(page)).toHaveText(DEFAULT_HEADERS);
  await expect(rows(page)).toHaveCount(25);
  await expect(rows(page).first().locator('td')).toHaveText([
    orders[0].order_number,
    E2E_SUPPLIER,
    'E2E品目',
    'E2E入庫テスト品 01',
    '10',
    '0',
    '10',
    '2000/01/01 00:00',
    '未入庫',
    '入庫納品',
  ]);
  // 全ての明細行で、見出しと同じ数のセルが描画されていること
  for (const row of await rows(page).all()) {
    await expect(row.locator('td')).toHaveCount(DEFAULT_HEADERS.length);
  }
});

test('FE-GR-02 表示設定がある場合、設定した列・順序・カスタム表示名で表示されること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);

  await expect(headers(page)).toHaveText(CUSTOM_HEADERS);
  await expect(rows(page).first().locator('td')).toHaveText([
    orders[0].order_number,
    'E2E入庫テスト品 01',
    '10',
    '0',
    '未入庫',
    'N/A',
    'N/A',
    '入庫納品',
  ]);
});

test('FE-GR-03 一覧表示対象の設定が無く検索項目のみ設定されている場合、既定の列で表示されること', async ({ page }) => {
  await setSettings([{ model_field_name: 'order_number', is_list_display: false, is_search_field: true }]);
  await openPage(page);

  await expect(page.getByPlaceholder('発注番号で検索...')).toBeVisible();
  await expect(headers(page)).toHaveText(DEFAULT_HEADERS);
  await expect(rows(page).first().locator('td')).toHaveCount(DEFAULT_HEADERS.length);
  await expect(rows(page).first().locator('td').first()).toHaveText(orders[0].order_number);
});

test('FE-GR-04 一般ユーザー(表示設定を取得できない)でも既定の列で項目が表示されること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  const settingsResponse = page.waitForResponse((r) => r.url().includes('/api/base/model-display-settings/'));
  await openPage(page, generalTokens);

  expect((await settingsResponse).status()).toBe(403);
  await expect(headers(page)).toHaveText(DEFAULT_HEADERS);
  await expect(rows(page).first().locator('td')).toHaveCount(DEFAULT_HEADERS.length);
  await expect(rows(page).first().locator('td').first()).toHaveText(orders[0].order_number);
});

test('FE-GR-05 検索項目で絞り込みができ、該当なしの場合はメッセージが表示されること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);

  const row = await searchOrder(page, orders[4].order_number);
  await expect(rows(page)).toHaveCount(1);
  await expect(row.locator('td').nth(1)).toHaveText('E2E入庫テスト品 05');

  await page.getByPlaceholder('発注番号で検索...').fill('E2E-NOT-EXIST-ZZZ');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(rows(page)).toHaveText(['該当する入庫予定がありません。']);
});

test('FE-GR-06 ページ送りで次ページ・前ページの明細が表示されること', async ({ page }) => {
  await setSettings([]);
  await openPage(page);

  const info = page.locator('.pagination-controls span');
  const prev = page.getByRole('button', { name: '前へ' });
  const next = page.getByRole('button', { name: '次へ' });

  await expect(info).toHaveText(/^ページ 1 \/ \d+ \(全 \d+ 件\)$/);
  await expect(prev).toBeDisabled();
  await expect(rows(page)).toHaveCount(25);
  await expect(rows(page).first().locator('td').first()).toHaveText(orders[0].order_number);

  await next.click();
  await expect(info).toHaveText(/^ページ 2 \/ /);
  await expect(prev).toBeEnabled();
  await expect(rows(page).first().locator('td').first()).toHaveText(orders[25].order_number);
  await expect(rows(page).first().locator('td')).toHaveCount(DEFAULT_HEADERS.length);

  await prev.click();
  await expect(info).toHaveText(/^ページ 1 \/ /);
  await expect(rows(page).first().locator('td').first()).toHaveText(orders[0].order_number);
});

test('FE-GR-07 入庫モーダルに発注内容と初期値が表示されること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);
  const order = orders[5];

  const row = await searchOrder(page, order.order_number);
  await row.getByRole('button', { name: '入庫', exact: true }).click();

  await expect(modal(page).getByRole('heading', { name: '入庫処理' })).toBeVisible();
  await expect(modal(page).locator('tbody tr').nth(0)).toContainText(order.order_number);
  await expect(modal(page).locator('tbody tr').nth(1)).toContainText('E2E入庫テスト品 06');
  await expect(modal(page).locator('tbody tr').nth(2)).toContainText('10');
  await expect(page.locator('#modal_received_quantity_input')).toHaveValue('10');
  await expect(page.locator('#modal_warehouse_input')).toHaveValue('E2E-WH');
  await expect(page.locator('#modal_location_input')).toHaveValue('E2E-LOC');

  await modal(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(modal(page)).toBeHidden();
});

test('FE-GR-08 入庫数量が0または残数量超過の場合、入庫処理が実行されないこと', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);
  const order = orders[6];
  let receiptRequests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/process-receipt/')) receiptRequests++;
  });

  const row = await searchOrder(page, order.order_number);
  await row.getByRole('button', { name: '入庫', exact: true }).click();
  const quantity = page.locator('#modal_received_quantity_input');

  await quantity.fill('11');
  await modal(page).getByRole('button', { name: '入庫実行' }).click();
  expect(await quantity.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true);

  await quantity.fill('0');
  await modal(page).getByRole('button', { name: '入庫実行' }).click();
  expect(await quantity.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);

  await expect(modal(page)).toBeVisible();
  await expect(modal(page).locator('.alert-success')).toHaveCount(0);
  expect(receiptRequests).toBe(0);
  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(0);
});

test('FE-GR-09 全量入庫すると完了メッセージが表示され、全量入庫済みとして一覧に反映されること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);
  const order = orders[7];

  const row = await searchOrder(page, order.order_number);
  await row.getByRole('button', { name: '入庫', exact: true }).click();
  await modal(page).getByRole('button', { name: '入庫実行' }).click();

  await expect(modal(page).locator('.alert-success')).toHaveText(
    `発注 ${order.order_number} の入庫処理が正常に完了しました。`,
  );
  await expect(modal(page)).toBeHidden();
  // 未入庫の一覧からは消える
  await expect(rows(page)).toHaveText(['該当する入庫予定がありません。']);

  const received = await searchOrder(page, order.order_number, 'fully_received');
  await expect(received.locator('td').nth(3)).toHaveText('10');
  await expect(received.locator('td').nth(4)).toHaveText('全量入庫済み');
  await expect(received.getByRole('button', { name: '入庫', exact: true })).toBeDisabled();

  const saved = await getPurchaseOrder(api, order.id);
  expect(saved.received_quantity).toBe(10);
  expect(saved.status).toBe('fully_received');
});

test('FE-GR-10 一部入庫すると入庫済数量とステータス(一部入庫)が一覧に反映されること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);
  const order = orders[8];

  const row = await searchOrder(page, order.order_number);
  await row.getByRole('button', { name: '入庫', exact: true }).click();
  await page.locator('#modal_received_quantity_input').fill('4');
  await modal(page).getByRole('button', { name: '入庫実行' }).click();
  await expect(modal(page).locator('.alert-success')).toBeVisible();
  await expect(modal(page)).toBeHidden();

  const partial = await searchOrder(page, order.order_number, 'partially_received');
  await expect(partial.locator('td').nth(3)).toHaveText('4');
  await expect(partial.locator('td').nth(4)).toHaveText('一部入庫');

  const saved = await getPurchaseOrder(api, order.id);
  expect(saved.received_quantity).toBe(4);
  expect(saved.status).toBe('partially_received');
});

test('FE-GR-11 納品モーダルで納品日・納品数を保存でき、入庫済数量は変わらないこと', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  await openPage(page);
  const order = orders[9];

  const row = await searchOrder(page, order.order_number);
  await row.getByRole('button', { name: '納品', exact: true }).click();
  await expect(modal(page).getByRole('heading', { name: '納品情報の編集' })).toBeVisible();
  await page.locator('#modal_delivery_date_input').fill('2026-09-30');
  await page.locator('#modal_delivered_quantity_input').fill('7');
  await modal(page).getByRole('button', { name: '保存' }).click();

  await expect(modal(page).locator('.alert-success')).toHaveText(
    `発注 ${order.order_number} の納品情報を更新しました。`,
  );
  await expect(modal(page)).toBeHidden();

  const updated = rows(page).filter({ hasText: order.order_number });
  await expect(updated.locator('td').nth(3)).toHaveText('0');
  await expect(updated.locator('td').nth(4)).toHaveText('未入庫');
  await expect(updated.locator('td').nth(5)).toHaveText('2026-09-30');
  await expect(updated.locator('td').nth(6)).toHaveText('7');

  const saved = await getPurchaseOrder(api, order.id);
  expect(saved.delivery_date).toBe('2026-09-30');
  expect(saved.delivered_quantity).toBe(7);
  expect(saved.received_quantity).toBe(0);
  expect(saved.status).toBe('pending');
});

test('FE-GR-12 入庫予定の取得に失敗した場合、エラーメッセージが表示されること', async ({ page }) => {
  await setSettings([]);
  await page.route('**/api/inventory/purchase-orders/?**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"e2e"}' }),
  );
  await openPage(page);

  await expect(rows(page)).toHaveText(['データの取得中にエラーが発生しました。']);
  await expect(headers(page)).toHaveText(DEFAULT_HEADERS);
});

test('FE-GR-13 一部入庫の入庫予定は、残数量を追加で入庫できること', async ({ page }) => {
  await setSettings(CUSTOM_SETTINGS);
  const order = orders[10];
  const first = await api.post('/api/inventory/purchase-orders/process-receipt/', {
    data: { purchase_order_id: order.id, received_quantity: 4 },
  });
  expect(first.ok()).toBeTruthy();
  await openPage(page);

  const row = await searchOrder(page, order.order_number, 'partially_received');
  const receiveButton = row.getByRole('button', { name: '入庫', exact: true });
  await expect(receiveButton).toBeEnabled();
  await receiveButton.click();
  await expect(page.locator('#modal_received_quantity_input')).toHaveValue('6');
  await modal(page).getByRole('button', { name: '入庫実行' }).click();
  await expect(modal(page).locator('.alert-success')).toBeVisible();

  const saved = await getPurchaseOrder(api, order.id);
  expect(saved.received_quantity).toBe(10);
  expect(saved.status).toBe('fully_received');
});
