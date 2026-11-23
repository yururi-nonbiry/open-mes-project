import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { authenticate, login, newApiContext, newRunId, requireEnv, type Tokens } from './functional-helpers';

/**
 * 画面機能確認: 生産計画の統合(/production/plan と /system/feature-settings)。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-PM-* に対応する。
 *
 * 製品 E2E-PM-PROD・部品 E2E-PM-MAT(在庫あり)は script/e2e_goods_receipt_data.py が投入する。
 * 機能設定「生産計画の引当時の統合確認」はシステム全体で共有されるため、開始時に退避して終了時に復元する。
 */
test.describe.configure({ mode: 'default' });

const PRODUCT = 'E2E-PM-PROD';
const MATERIAL = 'E2E-PM-MAT';

let adminTokens: Tokens;
let api: APIRequestContext;
let originalFlag: boolean;
let runId: string;
let seq = 0;

type Plan = { id: string; plan_name: string; status: string };

async function setMergeFlag(enabled: boolean) {
  const response = await api.put('/api/base/feature-options/', { data: { merge_plans_on_allocation: enabled } });
  expect(response.ok()).toBeTruthy();
}

/** 納期の違う同一品番の計画を2件作る(Aの方が納期が早い)。計画名は検索用に実行ごとに一意にする。 */
async function createPlanPair(): Promise<{ prefix: string; a: Plan; b: Plan }> {
  const prefix = `E2E-PM-${runId}-${++seq}`;
  const create = async (suffix: string, quantity: number, end: string): Promise<Plan> => {
    const response = await api.post('/api/production/plans/', {
      data: {
        plan_name: `${prefix}-${suffix}`,
        product_code: PRODUCT,
        planned_quantity: quantity,
        planned_start_datetime: '2099-01-01T09:00:00+09:00',
        planned_end_datetime: end,
      },
    });
    expect(response.ok(), `計画を作成できること(マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行): ${await response.text()}`).toBeTruthy();
    return response.json();
  };
  const a = await create('A', 30, '2099-01-02T09:00:00+09:00');
  const b = await create('B', 50, '2099-01-06T09:00:00+09:00');
  return { prefix, a, b };
}

const getPlan = async (id: string) => (await (await api.get(`/api/production/plans/${id}/`)).json()) as Plan & { merged_into: string | null };

async function openPlans(page: Page, prefix: string) {
  await authenticate(page, adminTokens);
  await page.goto('/production/plan');
  await page.locator('#plan-filter-name').fill(prefix);
  await page.locator('#plan-filter-name').press('Enter');
  await expect(page.locator('.goods-receipt-table tbody tr')).toHaveCount(2);
  // 引当状況の取得を待つ(チェックボックスが選べるようになる)
  await expect(page.getByLabel(`${prefix}-Aをまとめ引当の対象にする`)).toBeEnabled();
}

async function selectBoth(page: Page, prefix: string) {
  await page.getByLabel(`${prefix}-Aをまとめ引当の対象にする`).check();
  await page.getByLabel(`${prefix}-Bをまとめ引当の対象にする`).check();
}

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!;
  adminTokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
  api = await newApiContext(baseURL, adminTokens);
  originalFlag = (await (await api.get('/api/base/feature-options/')).json()).merge_plans_on_allocation;
  runId = newRunId();
});

test.afterAll(async () => {
  if (!api) return;
  if (originalFlag !== undefined) await setMergeFlag(originalFlag);
  await api.dispose();
});

test('FE-PM-01 統合確認OFF: まとめ引当で確認モーダルは出ず、従来どおり計画ごとに引き当てられること', async ({ page }) => {
  await setMergeFlag(false);
  const { prefix, a, b } = await createPlanPair();
  await openPlans(page, prefix);
  await selectBoth(page, prefix);
  await page.getByRole('button', { name: /チェックした計画をまとめて引当/ }).click();
  // 確認はブラウザ標準のダイアログではなくモーダルで表示される
  await expect(page.getByText('まとめて引き当てますか？')).toBeVisible();
  await page.getByRole('button', { name: '引き当てる', exact: true }).click();
  await expect(page.getByText('同一品番の計画をまとめますか？')).toHaveCount(0);
  await expect(page.getByText('まとめ引当の結果')).toBeVisible();
  expect((await getPlan(a.id)).status).toBe('PENDING');
  expect((await getPlan(b.id)).merged_into).toBeNull();
});

test('FE-PM-02 統合確認ON: モーダルに同一品番のグループ(合計数量・各計画)が表示され、キャンセルすると何も変わらないこと', async ({ page }) => {
  await setMergeFlag(true);
  const { prefix, a } = await createPlanPair();
  await openPlans(page, prefix);
  await selectBoth(page, prefix);
  await page.getByRole('button', { name: /チェックした計画をまとめて引当/ }).click();
  const modal = page.locator('.modal-content');
  await expect(modal.getByText('同一品番の計画をまとめますか？')).toBeVisible();
  await expect(modal.getByText(PRODUCT)).toBeVisible();
  await expect(modal.getByText('合計 80 個')).toBeVisible();
  await expect(modal.getByText(`${prefix}-A: 30 個`)).toBeVisible();
  await expect(modal.getByText(`${prefix}-B: 50 個`)).toBeVisible();
  await modal.getByRole('button', { name: 'キャンセル' }).click();
  await expect(modal).toHaveCount(0);
  expect((await getPlan(a.id)).status).toBe('PENDING');
});

test('FE-PM-03 統合確認ON: 「まとめずに引き当てる」を選ぶと計画ごとに引き当てられ、統合されないこと', async ({ page }) => {
  await setMergeFlag(true);
  const { prefix, a, b } = await createPlanPair();
  await openPlans(page, prefix);
  await selectBoth(page, prefix);
  await page.getByRole('button', { name: /チェックした計画をまとめて引当/ }).click();
  await page.locator('.modal-content').getByRole('button', { name: 'まとめずに引き当てる' }).click();
  await expect(page.getByText('まとめ引当の結果')).toBeVisible();
  const resultItems = page.locator('.modal-content li');
  await expect(resultItems).toHaveCount(2);
  expect((await getPlan(a.id)).status).toBe('PENDING');
  expect((await getPlan(b.id)).merged_into).toBeNull();
});

test('FE-PM-04 統合確認ON: 「まとめて引き当てる」を選ぶと統合計画に引き当てられ、元の計画は統合済になること', async ({ page }) => {
  await setMergeFlag(true);
  const { prefix, a, b } = await createPlanPair();
  await openPlans(page, prefix);
  await selectBoth(page, prefix);
  await page.getByRole('button', { name: /チェックした計画をまとめて引当/ }).click();
  await page.locator('.modal-content').getByRole('button', { name: 'まとめて引き当てる' }).click();
  await expect(page.getByText('まとめ引当の結果')).toBeVisible();
  await expect(page.locator('.modal-content li')).toHaveCount(1);
  await expect(page.locator('.modal-content li')).toContainText('2件の計画を統合しました。');

  const planA = await getPlan(a.id);
  expect(planA.status).toBe('MERGED');
  expect(planA.merged_into).toBeTruthy();
  expect((await getPlan(b.id)).merged_into).toBe(planA.merged_into);

  // 統合計画は数量の合計(80)・部品の引当数も合計で、元の計画の操作ボタンは「詳細」だけになる
  const merged = await getPlan(planA.merged_into!);
  expect(merged).toMatchObject({ planned_quantity: 80 });
  const allocations = await (await api.get(`/api/production/material-allocations/?production_plan_id=${merged.id}`)).json();
  const list = allocations.results ?? allocations;
  expect(list.reduce((sum: number, x: { allocated_quantity: number }) => sum + x.allocated_quantity, 0)).toBe(80);

  await page.locator('.modal-content').getByRole('button', { name: '閉じる', exact: true }).click(); // 結果モーダル
  await page.getByRole('button', { name: '統合済' }).click(); // 状態タブ
  const row = page.locator('.goods-receipt-table tbody tr', { hasText: `${prefix}-A` });
  await expect(row).toContainText('統合先');
  await expect(row.getByRole('button', { name: /部品引当/ })).toHaveCount(0);
});

test('FE-PM-05 統合解除: 引当前の統合計画を一覧から解除すると、元の計画が未着手に戻ること', async ({ page }) => {
  await setMergeFlag(false);
  const { prefix, a, b } = await createPlanPair();
  const merge = await api.post('/api/production/plans/merge-plans/', { data: { plan_ids: [a.id, b.id] } });
  expect(merge.ok()).toBeTruthy();
  // 統合計画の名前を一意にして、一覧で探せるようにする
  const mergedId = (await merge.json()).data.id as string;
  expect((await api.patch(`/api/production/plans/${mergedId}/`, { data: { plan_name: `${prefix}-M` } })).ok()).toBeTruthy();
  await authenticate(page, adminTokens);
  await page.goto('/production/plan');
  await page.locator('#plan-filter-name').fill(`${prefix}-M`);
  await page.locator('#plan-filter-name').press('Enter');
  const row = page.locator('.goods-receipt-table tbody tr', { hasText: '統合元: 2件' });
  await expect(row).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: '統合解除' }).click();
  await expect.poll(async () => (await getPlan(a.id)).status).toBe('PENDING');
  expect((await getPlan(b.id)).merged_into).toBeNull();
});

test('FE-PM-06 統合完了: 統合計画の生産完了で、良品数が納期順に元の計画へ割り振られること', async () => {
  await setMergeFlag(true);
  const { a, b } = await createPlanPair();
  const merge = await api.post('/api/production/plans/merge-plans/', { data: { plan_ids: [a.id, b.id] } });
  const merged = (await merge.json()).data as Plan;
  const done = await api.post(`/api/production/plans/${merged.id}/update-progress/`, {
    data: { status: 'COMPLETED', good_quantity: 70, actual_quantity: 70, defective_quantity: 0 },
  });
  expect(done.ok(), await done.text()).toBeTruthy();
  expect((await getPlan(a.id)).status).toBe('COMPLETED');
  const qty = async (id: string) => {
    const response = await api.get(`/api/production/work-progress/?production_plan_id=${id}`);
    const body = await response.json();
    return (body.results ?? body)[0]?.quantity_completed;
  };
  expect(await qty(a.id)).toBe(30);
  expect(await qty(b.id)).toBe(40);
});

test('FE-PM-07 管理者設定: 有効機能設定のスイッチで統合確認のON/OFFを切り替えられ、APIに保存されること', async ({ page }) => {
  await setMergeFlag(false);
  await authenticate(page, adminTokens);
  await page.goto('/system/feature-settings');
  const toggle = page.locator('#merge-plans-on-allocation');
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await toggle.click(); // 保存結果を受けてから切り替わるため check() ではなく click() で操作する
  await expect(toggle).toBeChecked();
  await expect(page.getByText('生産計画の引当時の統合確認をONにしました。')).toBeVisible();
  expect((await (await api.get('/api/base/feature-options/')).json()).merge_plans_on_allocation).toBe(true);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('生産計画の引当時の統合確認をOFFにしました。')).toBeVisible();
  expect((await (await api.get('/api/base/feature-options/')).json()).merge_plans_on_allocation).toBe(false);
});
