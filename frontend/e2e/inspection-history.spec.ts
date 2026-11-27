import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。検査履歴のページ送り・絞り込み・合否の件数(一覧APIの応答を差し替える)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

const result = (n: number) => ({
  id: `r-${n}`, inspection_item: 'item-1', inspection_item_name: 'E2E検査', part_number: 'E2E-PART', lot_number: `LOT-${n}`,
  judgment: 'pass', judgment_display: '合格', inspected_at: '2099-01-01T00:00:00+09:00', details: [],
});

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
});

test('FE-QH-01 検査履歴は絞り込み全体の合否件数を表示し、ページ送りと絞り込みをサーバーへ送ること', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/api/quality/inspection-results/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNo = Number(url.searchParams.get('page') || '1');
    await route.fulfill({
      json: {
        data: [result(pageNo)], count: 30, total_pages: 2, current_page: pageNo, next: null, previous: null,
        summary: { total: 30, passed: 20, failed: 10 },
      },
    });
  });
  await authenticate(page, tokens);
  await page.goto('/machine/inspection-history');
  await expect(page.getByText('LOT-1', { exact: true })).toBeVisible();
  await expect(page.getByText('合計測定件数').locator('..')).toContainText('30');
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.getByText('LOT-2', { exact: true })).toBeVisible();

  await page.getByPlaceholder('ロット番号で絞り込み').fill('LOT-9');
  await expect.poll(() => requests[requests.length - 1].searchParams.get('lot_number')).toBe('LOT-9');
  expect(requests[requests.length - 1].searchParams.get('page')).toBe('1');
});
