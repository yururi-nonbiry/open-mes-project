import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ログイン後の画面(desktop-pages.spec.ts / mobile-pages.spec.ts)で使い回す認証状態を作成する。
 * 認証情報は環境変数(E2E_USER_ID / E2E_USER_PASSWORD)で渡す。テストユーザーの作成手順は
 * docs/09_test_specifications/10_frontend_e2e.md を参照。
 */
const authFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth', 'user.json');

setup('ログイン状態を作成', async ({ page }) => {
  const userId = process.env.E2E_USER_ID;
  const password = process.env.E2E_USER_PASSWORD;
  if (!userId || !password) {
    throw new Error(
      'E2E_USER_ID / E2E_USER_PASSWORD 環境変数が未設定です。' +
        'docs/09_test_specifications/10_frontend_e2e.md の手順でテストユーザーを作成し、環境変数を設定してください。',
    );
  }

  await page.goto('/login');
  await page.locator('#custom_id').fill(userId);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL(/^http:\/\/localhost:5173\/(mobile)?$/);

  await page.context().storageState({ path: authFile });
});
