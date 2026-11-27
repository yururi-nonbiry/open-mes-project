import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。スマホの棚番移動で、移動先に別の倉庫の棚番QRを読んだ場合(在庫APIの応答を差し替える)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
});

test('FE-MLT-01 移動先に別の倉庫の棚番QRを読むと、その倉庫の棚へ移動すること', async ({ page }) => {
  let movePayload: Record<string, unknown> | null = null;
  await page.route('**/api/inventory/inventories/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/by-location/')) {
      await route.fulfill({ json: [{ id: 'inv-1', part_number: 'E2E-MLT', part_name: 'E2E棚移動品', warehouse: 'W1', location: 'A-01', purpose: null, quantity: 5, reserved: 0 }] });
      return;
    }
    if (url.includes('/move/')) {
      movePayload = route.request().postDataJSON();
      await route.fulfill({ json: { message: '在庫の棚移動が完了しました。' } });
      return;
    }
    await route.continue();
  });
  await authenticate(page, tokens);
  await page.goto('/mobile/location-transfer');
  await page.locator('#warehouse_input').fill('W1');
  await page.locator('#source_location_input').fill('A-01');
  await page.getByRole('button', { name: '次へ' }).click();

  await page.locator('#transferQuantity').fill('2');
  // バーコードリーダー(キーボード入力)で別倉庫の棚番QRを読む
  await page.locator('#targetLocation').fill('{"warehouse":"W2","shelf":"B-01"}');
  await expect(page.locator('#targetLocation')).toHaveValue('B-01');
  await expect(page.getByText('移動先の倉庫:')).toContainText('W2');
  await page.getByRole('button', { name: '移動実行' }).click();
  await expect(page.getByText('在庫の棚移動が完了しました。')).toBeVisible();
  expect(movePayload).toMatchObject({ target_warehouse: 'W2', target_location: 'B-01', quantity_to_move: 2 });
});
