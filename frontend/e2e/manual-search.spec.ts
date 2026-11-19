import { test, expect } from '@playwright/test';
import { authenticate, login, requireEnv } from './functional-helpers';

/**
 * 画面機能確認: 使い方ガイド(/usage)の検索。
 * テストケースは docs/09_test_specifications/11_frontend_e2e_functional.md の FE-MAN-* に対応する。
 */
test.describe.configure({ mode: 'default' });

const sections = (page: import('@playwright/test').Page) => page.locator('section[id]');

test.beforeEach(async ({ page }) => {
  const baseURL = test.info().project.use.baseURL!;
  const tokens = await login(baseURL, requireEnv('E2E_GENERAL_USER_ID'), requireEnv('E2E_GENERAL_USER_PASSWORD'));
  await authenticate(page, tokens);
  await page.goto('/usage');
  await expect(page.locator('#manual-search')).toBeVisible();
});

test('FE-MAN-01 使い方ガイド検索: キーワードで画面が絞り込まれ、一致箇所が強調表示されること', async ({ page }) => {
  const total = await sections(page).count();
  await page.locator('#manual-search').fill('パスワード');
  await expect(page.getByRole('status')).toContainText('件の画面・機能が見つかりました');
  const hits = await sections(page).count();
  expect(hits).toBeGreaterThan(0);
  expect(hits).toBeLessThan(total);
  await expect(page.locator('mark').first()).toBeVisible();
});

test('FE-MAN-02 使い方ガイド検索: 意味の近い言葉・ひらがな・全角でも同じ画面が見つかること', async ({ page }) => {
  const count = async (q: string) => {
    await page.locator('#manual-search').fill(q);
    await expect(page.getByRole('status')).not.toHaveText('');
    return sections(page).count();
  };
  const base = await count('出庫');
  expect(base).toBeGreaterThan(0);
  expect(await count('出荷')).toBeGreaterThanOrEqual(base);
  expect(await count('ぴっきんぐ')).toBe(await count('ピッキング'));
  expect(await count('ｑｒ')).toBe(await count('QR'));
});

test('FE-MAN-03 使い方ガイド検索: 該当なしの案内が表示され、クリアで全件に戻ること', async ({ page }) => {
  const total = await sections(page).count();
  await page.locator('#manual-search').fill('存在しない言葉zzzz');
  await expect(page.getByRole('status')).toContainText('該当する説明がありません');
  await expect(sections(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'クリア' }).click();
  await expect(sections(page)).toHaveCount(total);
});

test('FE-MAN-04 業務の流れ図: 項目クリックで該当画面へ移動し、検索中は図が隠れること', async ({ page }) => {
  const flow = page.getByRole('region', { name: '業務の流れ図' });
  await expect(flow).toBeVisible();
  await page.locator('#manual-search').fill('パスワード');
  await expect(flow).toBeHidden();
  await page.getByRole('button', { name: 'クリア' }).click();
  await expect(flow).toBeVisible();
  await flow.getByRole('link', { name: /^入庫/ }).click();
  await expect(page).toHaveURL(/\/inventory\/purchase$/);
});
