import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { authenticate, login, newApiContext, newRunId, requireEnv, type Tokens } from './functional-helpers';

/**
 * 画面機能確認: 作業進捗の完了登録(/production/work-progress)での完成品の入庫倉庫・棚番。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-WP-* に対応する。
 *
 * 製品 E2E-PM-PROD と倉庫 E2E-WH は script/e2e_goods_receipt_data.py が投入する。
 * 製品のデフォルト入庫倉庫・棚番を一時的に変更するため、開始時に退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

const PRODUCT = 'E2E-PM-PROD';
const WAREHOUSE = 'E2E-WH';

type Item = { id: string | number; code: string; default_warehouse: string | null; default_location: string | null };
type Plan = { id: string; plan_name: string; status: string; finished_goods_warehouse: string; finished_goods_location: string };

let adminTokens: Tokens;
let api: APIRequestContext;
let product: Item;
let runId: string;
let seq = 0;

const modal = (page: Page) => page.locator('.modal-content');

async function setProductDefaults(defaultWarehouse: string | null, defaultLocation: string | null) {
  const response = await api.patch(`/api/master/items/${product.id}/`, {
    data: { default_warehouse: defaultWarehouse, default_location: defaultLocation },
  });
  expect(response.ok(), `製品 ${PRODUCT} のデフォルト入庫倉庫・棚番を更新できること`).toBeTruthy();
}

async function createPlan(): Promise<Plan> {
  const response = await api.post('/api/production/plans/', {
    data: {
      plan_name: `E2E-WP-${runId}-${++seq}`,
      product_code: PRODUCT,
      planned_quantity: 5,
      planned_start_datetime: '2099-01-01T09:00:00+09:00',
      planned_end_datetime: '2099-01-02T09:00:00+09:00',
    },
  });
  expect(response.ok(), `計画を作成できること(マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行): ${await response.text()}`).toBeTruthy();
  return response.json();
}

const getPlan = async (id: string) => (await (await api.get(`/api/production/plans/${id}/`)).json()) as Plan;

/** 作業進捗画面で計画名で絞り込み、その計画の「進捗・完了登録」モーダルを開く。 */
async function openProgressModal(page: Page, plan: Plan, includeCompleted = false) {
  await authenticate(page, adminTokens);
  await page.goto('/production/work-progress');
  if (includeCompleted) {
    await page.locator('.receipt-status-tabs').getByRole('button', { name: '完了', exact: true }).click();
  }
  await page.locator('#searchPlanName').fill(plan.plan_name);
  const row = page.locator('.goods-receipt-table tbody tr').filter({ hasText: plan.plan_name });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: '進捗・完了登録' }).click();
  await expect(modal(page).getByText('作業進捗・完了の登録')).toBeVisible();
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  const body = await (await api.get('/api/master/items/')).json();
  const items: Item[] = Array.isArray(body) ? body : body.data;
  const found = items.find((i) => i.code === PRODUCT);
  expect(found, `製品 ${PRODUCT} が存在すること(script/e2e_goods_receipt_data.py を実行)`).toBeTruthy();
  product = found!;
  runId = newRunId();
});

test.afterAll(async () => {
  if (!api) return;
  if (product) await setProductDefaults(product.default_warehouse, product.default_location);
  await api.dispose();
});

test('FE-WP-01 完了登録で入庫倉庫・棚番の初期値が品番マスタのデフォルトになり、変更した棚番で完成品が入庫されること', async ({ page }) => {
  await setProductDefaults(WAREHOUSE, 'E2E-FG-01');
  const plan = await createPlan();
  await openProgressModal(page, plan);

  await modal(page).getByRole('button', { name: '完了', exact: true }).click();
  const warehouse = page.locator('#modalFinishedGoodsWarehouse');
  const location = page.locator('#modalFinishedGoodsLocation');
  await expect(warehouse).toHaveValue(WAREHOUSE);
  await expect(location).toHaveValue('E2E-FG-01');
  await expect(warehouse).toBeEditable();

  await location.fill('E2E-FG-02');
  await modal(page).getByRole('button', { name: '進捗を保存する' }).click();
  await expect(modal(page)).toHaveCount(0);

  const saved = await getPlan(plan.id);
  expect(saved.status).toBe('COMPLETED');
  expect(saved.finished_goods_warehouse).toBe(WAREHOUSE);
  expect(saved.finished_goods_location).toBe('E2E-FG-02');
});

test('FE-WP-02 入庫倉庫が空の場合はエラーが表示され、完了登録されないこと', async ({ page }) => {
  await setProductDefaults(WAREHOUSE, null);
  const plan = await createPlan();
  await openProgressModal(page, plan);

  await modal(page).getByRole('button', { name: '完了', exact: true }).click();
  await page.locator('#modalFinishedGoodsWarehouse').fill('');
  await modal(page).getByRole('button', { name: '進捗を保存する' }).click();
  await expect(modal(page).getByText('入庫倉庫を入力してください。')).toBeVisible();
  expect((await getPlan(plan.id)).status).toBe('PENDING');
});

test('FE-WP-03 完了済みの計画では、入庫倉庫・棚番が計上先の値で表示され変更できないこと', async ({ page }) => {
  await setProductDefaults(WAREHOUSE, 'E2E-FG-01');
  const plan = await createPlan();
  const done = await api.post(`/api/production/plans/${plan.id}/update-progress/`, {
    data: { status: 'COMPLETED', good_quantity: 5, actual_quantity: 5, defective_quantity: 0, location: 'E2E-FG-03' },
  });
  expect(done.ok(), await done.text()).toBeTruthy();
  // 完了後に品番マスタを変えても、表示されるのは計上した倉庫・棚番
  await setProductDefaults(null, null);

  await openProgressModal(page, plan, true);
  const warehouse = page.locator('#modalFinishedGoodsWarehouse');
  await expect(warehouse).toHaveValue(WAREHOUSE);
  await expect(page.locator('#modalFinishedGoodsLocation')).toHaveValue('E2E-FG-03');
  await expect(warehouse).not.toBeEditable();
  await expect(modal(page).getByText('変更不可').first()).toBeVisible();
});
