import { expect, type Page } from '@playwright/test';

/**
 * 画面上の可視ボタンが「画面幅内に収まっている(横方向にはみ出していない)」ことを検証する。
 * 検証対象はあくまでレスポンシブ表示(レイアウト崩れ)であり、業務ロジックによる
 * 活性/非活性(例: 未選択時は無効化される操作ボタン)は対象外とする。
 * 縦方向のスクロールは通常のUXとして許容し、横方向のはみ出し(レスポンシブ崩れで
 * ボタンが画面外に押し出される典型的な不具合)のみを対象とする。
 * ボタン数が0件のページ(閲覧専用画面等)はエラーとしない。
 */
export async function expectAllVisibleButtonsOperable(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error('viewport size is not available');
  }

  const buttons = page.locator('button:visible');
  const count = await buttons.count();

  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const box = await button.boundingBox();
    if (!box) continue;

    // ハンバーガーメニュー閉時のサイドメニューのように、CSSのtransform等で意図的に
    // 画面外に配置されている要素はPlaywright上は`:visible`判定されるが、ユーザーには
    // 見えておらず操作もできない。完全に画面外(左右どちらにもはみ出て重なりが無い)の
    // ボタンは、レスポンシブ崩れの検証対象から除外する。
    const isCompletelyOffscreen = box.x + box.width <= 0 || box.x >= viewport.width;
    if (isCompletelyOffscreen) continue;

    expect(box.x, `ボタン[${i}]が画面左端からはみ出しています`).toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      `ボタン[${i}]が画面幅(${viewport.width}px)の右端からはみ出しています`,
    ).toBeLessThanOrEqual(viewport.width + 1);
  }
}

/** レイアウト(Header/MobileHeader)が描画されており、ログイン画面へリダイレクトされていないことを確認する。 */
export async function expectAuthenticatedLayoutRendered(page: Page) {
  await expect(page.locator('header')).toBeVisible();
  await expect(page).not.toHaveURL(/\/(mobile\/)?login$/);
}
