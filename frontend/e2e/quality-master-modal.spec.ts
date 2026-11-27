import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv, type Tokens } from './functional-helpers';

// 画面機能確認(11_frontend_e2e_functional.md)。検査項目マスターの測定詳細の並べ替え(保存はしない)。
const baseURL = 'http://localhost:5173';
let tokens: Tokens;

test.beforeAll(async () => {
  tokens = await login(baseURL, requireEnv('E2E_USER_ID'), requireEnv('E2E_USER_PASSWORD'));
});

test('FE-QM-01 検査項目の測定詳細の行を、つまみ(☰)のドラッグ(キーボード操作)で並べ替えられること', async ({ page }) => {
  await authenticate(page, tokens);
  await page.goto('/quality/master-creation');
  await page.getByRole('button', { name: /新規検査項目登録/ }).click();
  const dialog = page.locator('body');
  const addRow = dialog.getByRole('button', { name: /詳細追加/ });
  await addRow.click();
  await addRow.click();
  const names = dialog.locator('tbody tr.formset-row input[name="name"]');
  await expect(names).toHaveCount(2);
  await names.nth(0).fill('E2E-A');
  await names.nth(1).fill('E2E-B');

  // @hello-pangea/dnd のキーボード操作: つまみにフォーカス → Space で持ち上げ → ↓ → Space で置く
  const handle = dialog.locator('tbody tr.formset-row .drag-handle').first();
  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(names.nth(0)).toHaveValue('E2E-B');
  await expect(names.nth(1)).toHaveValue('E2E-A');
});

test('FE-QM-02 共通モーダルはダイアログとして扱われ、Esc・背景のクリックで閉じ、モーダル内から背景へドラッグしても閉じないこと', async ({ page }) => {
  await authenticate(page, tokens);
  await page.goto('/quality/master-creation');
  const open = page.getByRole('button', { name: /新規検査項目登録/ });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await open.click();
  await expect(dialog).toBeVisible();
  // モーダル内で押して背景で離す(テキスト選択など)では閉じない
  const box = (await dialog.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  // 背景をクリックすると閉じる
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});
