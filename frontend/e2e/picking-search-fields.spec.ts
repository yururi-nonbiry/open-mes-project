import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { authenticate, login, newApiContext, newRunId, requireEnv, type Tokens } from './functional-helpers';

/**
 * 画面機能確認: ピッキング画面のキーワード検索の対象項目(/mobile/picking と /system/feature-settings)。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-PKS-* に対応する。
 *
 * ピッキング画面はスマホ専用(PCでは開けない)ため FE-PKS-01〜04 は functional-smartphone、管理者設定の FE-PKS-05 は
 * functional-hd で実行する(playwright.config.ts で両プロジェクトに登録し、各テストが対象外のプロジェクトではスキップする)。
 *
 * 製品 E2E-PM-PROD・部品 E2E-PM-MAT(在庫あり)・用途 E2E-CAR は script/e2e_goods_receipt_data.py が投入する。
 * 検索対象の設定はシステム全体で共有されるため、開始時に退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

const PRODUCT = 'E2E-PM-PROD';
const PURPOSE = 'E2E-CAR';

let adminTokens: Tokens;
let api: APIRequestContext;
let originalFields: string[];
let planName: string;

const onlyOn = (project: 'functional-smartphone' | 'functional-hd') =>
  test.skip(test.info().project.name !== project, `${project} でのみ実行する`);

const putFields = async (fields: string[]) => {
  const response = await api.put('/api/base/picking-search-fields/', { data: { fields } });
  expect(response.ok(), await response.text()).toBeTruthy();
};

/** 用途 E2E-CAR の生産計画を作り、部品を引き当てる(ピッキング画面に未ピッキングとして出る)。 */
async function createAllocatedPlan(name: string) {
  const created = await api.post('/api/production/plans/', {
    data: {
      plan_name: name,
      product_code: PRODUCT,
      purpose: PURPOSE,
      planned_quantity: 5,
      planned_start_datetime: '2099-01-01T09:00:00+09:00',
      planned_end_datetime: '2099-01-02T09:00:00+09:00',
    },
  });
  expect(created.ok(), `計画を作成できること(マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行): ${await created.text()}`).toBeTruthy();
  const plan = await created.json();
  const allocated = await api.post('/api/production/plans/bulk-allocate-materials/', { data: { plan_ids: [plan.id] } });
  expect(allocated.ok(), await allocated.text()).toBeTruthy();
}

async function openPicking(page: Page) {
  await authenticate(page, adminTokens);
  await page.goto('/mobile/picking');
  await expect(page.getByRole('heading', { name: '順立て・ピッキング' })).toBeVisible();
}

/** キーワードで絞り込み、このテストで作った計画のカードが表示されるかを返す。 */
async function search(page: Page, keyword: string) {
  await page.getByPlaceholder('キーワードで絞り込み').fill(keyword);
  return page.locator('.card').filter({ hasText: planName });
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  originalFields = (await (await api.get('/api/base/picking-search-fields/')).json()).fields;
  planName = `E2E-PK-${newRunId()}`;
  await createAllocatedPlan(planName);
});

test.afterAll(async () => {
  if (!api) return;
  if (originalFields) await putFields(originalFields);
  await api.dispose();
});

test('FE-PKS-01 既定の検索対象: 品番・計画名では見つかるが、使用用途では見つからないこと', async ({ page }) => {
  onlyOn('functional-smartphone');
  await putFields(['product_code', 'product_name', 'plan_name', 'line', 'material_code', 'material_name']);
  await openPicking(page);
  await expect(await search(page, planName)).toHaveCount(1);
  await expect(await search(page, PRODUCT)).toHaveCount(1);
  await expect(await search(page, PURPOSE)).toHaveCount(0);
});

test('FE-PKS-02 使用用途を検索対象にすると、使用用途のキーワードで見つかること', async ({ page }) => {
  onlyOn('functional-smartphone');
  await putFields(['product_code', 'plan_name', 'purpose']);
  await openPicking(page);
  await expect(await search(page, PURPOSE)).toHaveCount(1);
  await expect(await search(page, PURPOSE.toLowerCase())).toHaveCount(1); // 大文字小文字は区別しない
});

test('FE-PKS-03 検索対象から外した項目では見つからず、残した項目では見つかること', async ({ page }) => {
  onlyOn('functional-smartphone');
  await putFields(['plan_name']);
  await openPicking(page);
  await expect(await search(page, planName)).toHaveCount(1);
  await expect(await search(page, PRODUCT)).toHaveCount(0);
  await expect(await search(page, 'E2E-PM-MAT')).toHaveCount(0);
});

test('FE-PKS-04 検索対象を空にすると、キーワードでは絞り込めず(該当なし)、空欄なら表示されること', async ({ page }) => {
  onlyOn('functional-smartphone');
  await putFields([]);
  await openPicking(page);
  await expect(await search(page, planName)).toHaveCount(0);
  await expect(await search(page, '')).toHaveCount(1);
});

test('FE-PKS-05 管理者設定: 機能設定で「使用用途」にチェックして保存すると、APIに保存されること', async ({ page }) => {
  onlyOn('functional-hd');
  await putFields(['plan_name']);
  await authenticate(page, adminTokens);
  await page.goto('/system/feature-settings');
  const purpose = page.getByLabel('使用用途', { exact: true });
  await expect(purpose).toBeEnabled();
  await expect(purpose).not.toBeChecked();
  await purpose.check();
  await page.getByRole('button', { name: '検索対象を保存' }).click();
  await expect(page.getByText('検索対象を保存しました。')).toBeVisible();
  expect((await (await api.get('/api/base/picking-search-fields/')).json()).fields).toEqual(['plan_name', 'purpose']);

  await purpose.uncheck();
  await page.getByRole('button', { name: '検索対象を保存' }).click();
  await expect(page.getByText('検索対象を保存しました。')).toBeVisible();
  expect((await (await api.get('/api/base/picking-search-fields/')).json()).fields).toEqual(['plan_name']);
});
