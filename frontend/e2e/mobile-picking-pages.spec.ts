import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。スマホのピッキング画面で、引当の一覧を全ページ取得し、
// 計画内の部品ごとに異なる出庫先ラインをまとめて表示することを確認する(一覧APIの応答を差し替える)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

const allocation = (id: string, materialCode: string, line: string) => ({
  id,
  production_plan: 'plan-e2e-1',
  production_plan_name: 'E2E-複数ライン計画',
  product_code: 'E2E-PROD',
  product_name: 'E2E製品',
  material_code: materialCode,
  material_name: `${materialCode} の名前`,
  warehouse: 'E2E-WH',
  purpose: null,
  line,
  allocated_quantity: 1,
  status: 'ALLOCATED',
  allocation_type: 'NORMAL',
});

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
});

test('FE-MPK-01 引当が複数ページにまたがっても全件表示し、計画内の複数のラインをまとめて表示すること', async ({ page }) => {
  await page.route('**/api/production/material-allocations/**', async (route) => {
    const url = new URL(route.request().url());
    const second = url.searchParams.get('page') === '2';
    await route.fulfill({
      json: {
        count: 2,
        next: second ? null : `${url.origin}${url.pathname}?page=2&page_size=500`,
        previous: null,
        results: [second ? allocation('a2', 'E2E-MAT-P2', 'E2E-L2') : allocation('a1', 'E2E-MAT-P1', 'E2E-L1')],
      },
    });
  });
  await authenticate(page, tokens);
  await page.goto('/mobile/picking');

  await expect(page.getByText('E2E-MAT-P1', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E-MAT-P2', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E-複数ライン計画 / ライン: E2E-L1、E2E-L2')).toBeVisible();
});
