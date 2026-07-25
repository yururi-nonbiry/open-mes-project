import { test, expect } from '@playwright/test';
import { expectAllVisibleButtonsOperable } from './helpers';

/**
 * レスポンシブ表示確認: スマホ/HD/FullHDの各モードで、ログイン画面(未認証)の
 * 全ボタンが可視かつ操作可能であることを検証する。
 * ログイン後の画面については desktop-pages.spec.ts / mobile-pages.spec.ts を参照。
 */
test('ログイン画面: 表示されている全ボタンが可視かつ操作可能であること', async ({ page }) => {
  await page.goto('/login');

  // frontend/src/App.tsx の MobileRedirector により、スマホ(User-Agent判定)では
  // /mobile/login へ、それ以外(HD/FullHD)では /login のままとなる。
  await expect(page).toHaveURL(/\/(mobile\/)?login$/);

  await expectAllVisibleButtonsOperable(page);
});
