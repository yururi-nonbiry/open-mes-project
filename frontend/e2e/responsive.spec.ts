import { test, expect } from '@playwright/test';

/**
 * レスポンシブ表示確認: スマホ/HD/FullHDの各モードで、画面上の全ボタンが
 * 可視かつ操作可能(視界内・有効)であることを検証する代表シナリオ。
 *
 * 対象ページはログイン画面のみ。他ページへの検証範囲拡大は今後の課題として
 * docs/09_test_specifications/10_frontend_e2e.md に記載している。
 */
test('ログイン画面: 表示されている全ボタンが可視かつ操作可能であること', async ({ page }) => {
  await page.goto('/login');

  // frontend/src/App.tsx の MobileRedirector により、スマホ(User-Agent判定)では
  // /mobile/login へ、それ以外(HD/FullHD)では /login のままとなる。
  await expect(page).toHaveURL(/\/(mobile\/)?login$/);

  const buttons = page.locator('button:visible');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    await expect(button).toBeEnabled();
    await expect(button).toBeInViewport();
  }
});
