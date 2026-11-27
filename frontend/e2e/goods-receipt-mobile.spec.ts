import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_ITEM_CODE,
  authenticate,
  createPurchaseOrder,
  deleteUnreceivedPurchaseOrders,
  getItemDefaultLocation,
  getPurchaseOrder,
  isRegisterDefaultLocationConfirmEnabled,
  login,
  newApiContext,
  newRunId,
  requireEnv,
  setItemDefaultLocation,
  type PurchaseOrder,
  type Tokens,
} from './functional-helpers';

/**
 * 画面機能確認: モバイル入庫処理画面(/mobile/goods-receipt、スマホ向け)。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-GRM-* に対応する。
 */
test.describe.configure({ mode: 'default' });

const PATH = '/mobile/goods-receipt';
const PREFIX = 'E2E-GM-';
const EXPECTED_ARRIVAL = '2000-02-01T00:00:00+09:00';
// デフォルト入庫棚番の登録確認(FE-GRM-06〜08)専用の品番。他のテストの入庫で未登録確認が出ないよう、E2E_ITEM_CODE は登録済みにしておく
const DEFAULT_LOCATION_ITEM = 'E2E-GR-DEF-MB';

let tokens: Tokens;
let api: APIRequestContext;
let orders: PurchaseOrder[];

const items = (page: Page) => page.locator('.list-group-item');
const form = (page: Page) => page.locator('.mobile-receipt-modal-content');
const searchBox = (page: Page) => page.getByPlaceholder('発注番号などで検索...');

async function openPage(page: Page) {
  await authenticate(page, tokens);
  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: '入庫処理' })).toBeVisible();
  // 入荷予定日(開始)の既定値は「今日」。テスト用の入庫予定は過去日付のため、開始日を空にする
  await page.locator('#receipt-date-from').fill('');
}

async function searchOrder(page: Page, orderNumber: string) {
  await searchBox(page).fill(orderNumber);
  const item = items(page).filter({ hasText: orderNumber });
  await expect(item).toHaveCount(1);
  await expect(items(page)).toHaveCount(1);
  return item;
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  tokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, tokens);

  await setItemDefaultLocation(api, E2E_ITEM_CODE, 'E2E-LOC');

  await deleteUnreceivedPurchaseOrders(api, PREFIX);
  const runId = newRunId();
  orders = [];
  for (let i = 1; i <= 3; i++) {
    const no = String(i).padStart(2, '0');
    orders.push(
      await createPurchaseOrder(api, {
        order_number: `${PREFIX}${runId}-${no}`,
        product_name: `E2Eモバイル入庫品 ${no}`,
        expected_arrival: EXPECTED_ARRIVAL,
      }),
    );
  }
});

test.afterAll(async () => {
  if (!api) return;
  await deleteUnreceivedPurchaseOrders(api, PREFIX);
  await api.dispose();
});

test('FE-GRM-01 未入庫の入庫予定が一覧に表示され、各項目(品名・発注番号・残数量・予定日)が表示されること', async ({ page }) => {
  await openPage(page);

  // 初期表示: 1件以上表示され、先頭の明細に品名と発注番号が入っていること
  await expect(items(page).first()).toBeVisible();
  await expect(items(page).first().locator('h5')).not.toBeEmpty();
  await expect(items(page).first()).toContainText(/発注番号: \S+/);

  const item = await searchOrder(page, orders[0].order_number);
  await expect(item.locator('h5')).toHaveText('E2Eモバイル入庫品 01');
  await expect(item).toContainText(`発注番号: ${orders[0].order_number}`);
  await expect(item).toContainText('残数量: 10 / 10');
  await expect(item).toContainText('予定日: 2000/2/1');
  await expect(item.getByRole('button', { name: '入庫処理' })).toBeEnabled();
});

test('FE-GRM-02 検索結果が0件の場合、メッセージが表示されること', async ({ page }) => {
  await openPage(page);
  await searchBox(page).fill('E2E-NOT-EXIST-ZZZ');
  await expect(page.getByText('該当する未入庫の予定がありません。')).toBeVisible();
  await expect(items(page)).toHaveCount(0);
});

test('FE-GRM-03 入庫数量が残数量を超える場合、入庫処理が実行されないこと', async ({ page }) => {
  await openPage(page);
  const order = orders[1];
  let receiptRequests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/process-receipt/')) receiptRequests++;
  });

  const item = await searchOrder(page, order.order_number);
  await item.getByRole('button', { name: '入庫処理' }).click();
  const quantity = page.locator('#received_quantity');
  await quantity.fill('11');
  await form(page).getByRole('button', { name: '入庫実行' }).click();

  expect(await quantity.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true);
  await expect(form(page)).toBeVisible();
  await expect(form(page).locator('.alert-success')).toHaveCount(0);
  expect(receiptRequests).toBe(0);
  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(0);
});

test('FE-GRM-04 入庫フォームに初期値が表示され、入庫実行で全量入庫できること', async ({ page }) => {
  await openPage(page);
  const order = orders[2];

  const item = await searchOrder(page, order.order_number);
  await item.getByRole('button', { name: '入庫処理' }).click();

  await expect(form(page)).toContainText(`発注番号: ${order.order_number}`);
  await expect(form(page)).toContainText('品名: E2Eモバイル入庫品 03');
  await expect(form(page)).toContainText('残数量: 10');
  await expect(page.locator('#received_quantity')).toHaveValue('10');
  await expect(page.locator('#warehouse')).toHaveValue('E2E-WH');
  await expect(page.locator('#location')).toHaveValue('E2E-LOC');

  await form(page).getByRole('button', { name: '入庫実行' }).click();
  await expect(form(page).locator('.alert-success')).toHaveText(
    `発注 ${order.order_number} の入庫処理が正常に完了しました。`,
  );
  await expect(form(page)).toBeHidden();
  // 入庫済みになった予定は未入庫の一覧から消える
  await expect(page.getByText('該当する未入庫の予定がありません。')).toBeVisible();

  const saved = await getPurchaseOrder(api, order.id);
  expect(saved.received_quantity).toBe(10);
  expect(saved.status).toBe('fully_received');
});

test('FE-GRM-05 一部入庫の入庫予定は、一覧に表示され残数量を追加で入庫できること', async ({ page }) => {
  const order = orders[0];
  const first = await api.post('/api/inventory/purchase-orders/process-receipt/', {
    data: { purchase_order_id: order.id, received_quantity: 4 },
  });
  expect(first.ok()).toBeTruthy();
  await openPage(page);

  const item = await searchOrder(page, order.order_number);
  await expect(item).toContainText('残数量: 6 / 10');
  await item.getByRole('button', { name: '入庫処理' }).click();
  await expect(page.locator('#received_quantity')).toHaveValue('6');
  await form(page).getByRole('button', { name: '入庫実行' }).click();
  await expect(form(page).locator('.alert-success')).toBeVisible();

  const saved = await getPurchaseOrder(api, order.id);
  expect(saved.received_quantity).toBe(10);
  expect(saved.status).toBe('fully_received');
});

// ---- デフォルト入庫棚番の登録確認(FE-GRM-06〜08) ----
const confirmDialog = (page: Page) => page.getByRole('dialog').filter({ hasText: 'デフォルト入庫棚番の登録' });

/** 品番のデフォルト入庫棚番を指定値にして、その品番の入庫予定を作成し、入庫フォームを開く。 */
async function openReceiptFormFor(page: Page, defaultLocation: string) {
  test.skip(!(await isRegisterDefaultLocationConfirmEnabled(api)), '機能設定「デフォルト入庫棚番の登録確認」がOFFのため');
  await setItemDefaultLocation(api, DEFAULT_LOCATION_ITEM, defaultLocation);
  const order = await createPurchaseOrder(api, {
    order_number: `${PREFIX}${newRunId()}-D${Math.floor(Math.random() * 90 + 10)}`,
    product_name: 'E2Eデフォルト棚番確認品',
    expected_arrival: EXPECTED_ARRIVAL,
    part_number: DEFAULT_LOCATION_ITEM,
  });
  await openPage(page);
  const item = await searchOrder(page, order.order_number);
  await item.getByRole('button', { name: '入庫処理' }).click();
  await expect(form(page)).toContainText(`発注番号: ${order.order_number}`);
  return order;
}

test('FE-GRM-06 デフォルト入庫棚番が未登録の品番を入庫すると確認モーダルが表示され、「登録して入庫」で登録されること', async ({ page }) => {
  const order = await openReceiptFormFor(page, '');
  await form(page).getByRole('button', { name: '入庫実行' }).click();

  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`品番「${DEFAULT_LOCATION_ITEM}」のデフォルト入庫棚番が未登録です。`);
  await expect(dialog).toContainText('「E2E-LOC」をデフォルト入庫棚番として登録しますか？');
  // 確認が済むまで入庫は実行されない
  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(0);

  await dialog.getByRole('button', { name: '登録して入庫' }).click();
  await expect(dialog).toBeHidden();
  await expect(form(page).locator('.alert-success')).toContainText('デフォルト入庫棚番に「E2E-LOC」を登録しました。');

  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(10);
  expect(await getItemDefaultLocation(api, DEFAULT_LOCATION_ITEM)).toBe('E2E-LOC');
});

test('FE-GRM-07 確認モーダルで「登録しないで入庫」を選ぶと、入庫のみ実行されデフォルト入庫棚番は登録されないこと', async ({ page }) => {
  const order = await openReceiptFormFor(page, '');
  await form(page).getByRole('button', { name: '入庫実行' }).click();

  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '登録しないで入庫' }).click();
  await expect(dialog).toBeHidden();
  await expect(form(page).locator('.alert-success')).toContainText('の入庫処理が正常に完了しました。');
  await expect(form(page).locator('.alert-success')).not.toContainText('デフォルト入庫棚番に');

  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(10);
  expect(await getItemDefaultLocation(api, DEFAULT_LOCATION_ITEM)).toBe('');
});

test('FE-GRM-09 確認モーダルで「入庫をやめる」を選ぶと、入庫は実行されないこと', async ({ page }) => {
  const order = await openReceiptFormFor(page, '');
  await form(page).getByRole('button', { name: '入庫実行' }).click();

  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '入庫をやめる' }).click();
  await expect(dialog).toBeHidden();
  await expect(form(page).locator('.alert-success')).toHaveCount(0);

  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(0);
  expect(await getItemDefaultLocation(api, DEFAULT_LOCATION_ITEM)).toBe('');
});

test('FE-GRM-08 デフォルト入庫棚番が登録済みの品番を入庫する場合、確認モーダルが表示されないこと', async ({ page }) => {
  const order = await openReceiptFormFor(page, 'E2E-REGISTERED');
  await form(page).getByRole('button', { name: '入庫実行' }).click();

  await expect(form(page).locator('.alert-success')).toContainText('の入庫処理が正常に完了しました。');
  await expect(confirmDialog(page)).toHaveCount(0);

  expect((await getPurchaseOrder(api, order.id)).received_quantity).toBe(10);
  // 登録済みの棚番は上書きされない
  expect(await getItemDefaultLocation(api, DEFAULT_LOCATION_ITEM)).toBe('E2E-REGISTERED');
});
