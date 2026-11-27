import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。出庫予定一覧のページ送り・件数・内部受注の表示(一覧APIの応答を差し替える)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

const order = (n: number, internal = false) => ({
  id: `so-${n}`,
  order_number: internal ? `INT-${n}` : `E2E-SS-${String(n).padStart(3, '0')}`,
  item: 'E2E-GR-ITEM',
  quantity: 5,
  shipped_quantity: 0,
  warehouse: 'E2E-WH',
  status: 'pending',
  is_internal: internal,
  expected_shipment: '2099-01-01T00:00:00+09:00',
});

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
});

test('FE-SS-01 出庫予定一覧で総件数を表示し、2ページ目以降を表示でき、内部受注は既定で除外・表示時はバッジが付くこと', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/api/inventory/sales-orders/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNo = Number(url.searchParams.get('page') || '1');
    const internal = url.searchParams.get('exclude_internal') !== 'true';
    const results = pageNo === 1
      ? Array.from({ length: 25 }, (_, i) => order(i + 1))
      : [order(26), ...(internal ? [order(27, true)] : [])];
    await route.fulfill({
      json: {
        count: internal ? 27 : 26, total_pages: 2, current_page: pageNo, page_size: 25,
        next: pageNo === 1 ? `${url.origin}${url.pathname}?page=2` : null,
        previous: pageNo === 2 ? `${url.origin}${url.pathname}?page=1` : null,
        results,
      },
    });
  });
  await authenticate(page, tokens);
  await page.goto('/inventory/shipment');

  await expect(page.locator('.receipt-result-count')).toContainText('26');
  expect(requests[requests.length - 1].searchParams.get('exclude_internal')).toBe('true');
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.getByText('E2E-SS-026', { exact: true })).toBeVisible();

  await page.locator('#shipment-include-internal').check();
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'INT-27' }).locator('.badge')).toBeVisible();
});
