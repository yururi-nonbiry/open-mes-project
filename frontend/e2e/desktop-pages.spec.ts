import { test } from '@playwright/test';
import { expectAllVisibleButtonsOperable, expectAuthenticatedLayoutRendered } from './helpers';

/**
 * ログイン後のデスクトップ画面について、レスポンシブ表示確認(HD/FullHD)を行う。
 * frontend/src/App.tsx の MobileRedirector はデスクトップUAの場合のみこれらの
 * パスに留まるため、本ファイルは hd/fullhd プロジェクトでのみ実行する
 * (playwright.config.ts の projects[].testMatch を参照)。
 *
 * 認証状態は auth.setup.ts で作成した storageState を使用する(要 E2E_USER_ID / E2E_USER_PASSWORD)。
 * 対象ユーザーはスタッフ/スーパーユーザー権限を持つ想定(StaffRoute配下のページも含むため)。
 *
 * データに依存する動的なボタン(一覧の行内操作等)は対象外とし、初期表示時点で画面上に
 * 存在する静的なボタン(ヘッダー・フィルタ・登録ボタン等)のみを検証する。
 */
const pages: { name: string; path: string }[] = [
  { name: 'トップ', path: '/' },
  { name: '在庫照会', path: '/inventory/inquiry' },
  { name: '入出庫履歴', path: '/inventory/stock-movement-history' },
  { name: '出荷予定', path: '/inventory/shipment' },
  { name: '入庫', path: '/inventory/purchase' },
  { name: '出庫', path: '/inventory/issue' },
  { name: '生産計画', path: '/production/plan' },
  { name: '使用部品', path: '/production/parts-used' },
  { name: '資材引当', path: '/production/material-allocation' },
  { name: '作業進捗', path: '/production/work-progress' },
  { name: '工程内検査', path: '/quality/process-inspection' },
  { name: '受入検査', path: '/quality/acceptance-inspection' },
  { name: '品質マスタ作成', path: '/quality/master-creation' },
  { name: '検査開始', path: '/machine/start-inspection' },
  { name: '検査履歴', path: '/machine/inspection-history' },
  { name: '設備マスタ作成', path: '/machine/master-creation' },
  { name: 'データ取込', path: '/data/import' },
  { name: 'ユーザー設定', path: '/user/settings' },
  { name: 'ユーザー管理', path: '/user/management' },
  { name: 'ユーザー新規作成', path: '/user/management/create' },
  { name: 'システム設定', path: '/system/settings' },
  { name: 'CSVマッピング設定', path: '/system/csv-mappings' },
  { name: 'モデル表示設定', path: '/system/model-display-settings' },
  { name: 'ページ表示設定', path: '/system/page-display-settings' },
  { name: 'QRコードアクション設定', path: '/system/qr-code-actions' },
  { name: '棚QRコード作成', path: '/system/shelf-qr-code' },
  { name: '倉庫レイアウト作成', path: '/master/warehouse-layout' },
];

for (const { name, path } of pages) {
  test(`${name} (${path}): 全ボタンが可視かつ操作可能であること`, async ({ page }) => {
    await page.goto(path);
    await expectAuthenticatedLayoutRendered(page);
    await expectAllVisibleButtonsOperable(page);
  });
}
