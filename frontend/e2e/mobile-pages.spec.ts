import { test } from '@playwright/test';
import { expectAllVisibleButtonsOperable, expectAuthenticatedLayoutRendered } from './helpers';

/**
 * ログイン後のモバイル専用画面について、レスポンシブ表示確認(スマホモード)を行う。
 * 本ファイルは smartphone プロジェクトでのみ実行する
 * (playwright.config.ts の projects[].testMatch を参照)。
 *
 * モバイル専用画面を持たないページ(在庫照会・生産計画等)は、スマホUAでアクセスすると
 * frontend/src/App.tsx の MobileRedirector により /mobile (モバイルトップ) へ強制的に
 * リダイレクトされる仕様のため、検証対象に含めていない
 * (レスポンシブ規約: PC向け画面の縮小表示ではなく専用画面を作る、という方針の帰結)。
 */
const pages: { name: string; path: string }[] = [
  { name: 'モバイルトップ', path: '/mobile' },
  { name: 'モバイル入庫', path: '/mobile/goods-receipt' },
  { name: 'モバイル出庫', path: '/mobile/goods-issue' },
  { name: 'モバイルロケーション移動', path: '/mobile/location-transfer' },
];

for (const { name, path } of pages) {
  test(`${name} (${path}): 全ボタンが可視かつ操作可能であること`, async ({ page }) => {
    await page.goto(path);
    await expectAuthenticatedLayoutRendered(page);
    await expectAllVisibleButtonsOperable(page);
  });
}
