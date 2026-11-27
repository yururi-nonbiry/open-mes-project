import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。在庫照会の棚移動モーダル(在庫一覧と移動APIの応答を差し替える)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

const row = (id: string, location: string) => ({
  id, part_number: 'E2E-MV-ITEM', part_name: 'E2E移動品', warehouse: 'E2E-WH', location, purpose: null,
  quantity: 10, reserved: 0, available_quantity: 10, last_updated: '2099-01-01T00:00:00+09:00', is_active: true, is_allocatable: true,
});

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
});

test('FE-INVMV-01 移動の完了後、閉じるまでの間は再送信できず、手で閉じて別の在庫で開き直しても前回の予約で閉じないこと', async ({ page }) => {
  let moveCount = 0;
  await page.route('**/api/inventory/inventories/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/move/')) {
      moveCount += 1;
      await route.fulfill({ json: { message: '在庫の棚移動が完了しました。' } });
      return;
    }
    if (route.request().method() === 'GET' && new URL(url).pathname.endsWith('/api/inventory/inventories/')) {
      await route.fulfill({ json: { count: 2, next: null, previous: null, results: [row('inv-1', 'A-01'), row('inv-2', 'A-02')] } });
      return;
    }
    await route.continue();
  });
  await authenticate(page, tokens);
  await page.goto('/inventory/inquiry');

  const moveButtons = page.getByRole('button', { name: '棚移動', exact: true });
  await moveButtons.first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="target_location"]').fill('B-01');
  await dialog.getByRole('button', { name: '棚移動を実行する' }).click();
  await expect(dialog.getByText('在庫の棚移動が完了しました。')).toBeVisible();
  // 閉じるまでの間は送信ボタンが無効のまま
  await expect(dialog.getByRole('button', { name: '棚移動を実行する' })).toBeDisabled();
  expect(moveCount).toBe(1);

  // 自動で閉じる前に手で閉じ、別の在庫で開き直す → 前回の予約(1.2秒)が過ぎても閉じない
  await dialog.getByRole('button', { name: 'Close' }).click();
  await moveButtons.nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: '棚移動を実行する' })).toBeEnabled();
});
