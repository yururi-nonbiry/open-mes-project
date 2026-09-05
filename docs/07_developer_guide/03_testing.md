# テスト方法

バックエンド（`backend/src/`）は、Django標準のテストフレームワーク（`unittest`ベース）でユニットテスト・APIテストを実装しています。各アプリの`tests/`ディレクトリ（例: `inventory/tests/`）にテストモジュールが分割されています。

## テストの種類

- **モデル/ロジックのユニットテスト**: 在庫引当のFIFOロジックや在庫数の増減計算など、モデルメソッドやサービス関数の振る舞いを検証します。
- **APIテスト**: DRFの`APITestCase`（`rest_framework.test`）を使い、`/api/<app>/...`エンドポイントへのリクエストとレスポンスを検証します。認証が必要なエンドポイントは`force_authenticate`等でユーザーを設定してテストします。
- **フロントエンド**: `frontend/`側では、`npm run lint`（ESLint）と`npm run type-check`（`tsc --noEmit`）による静的チェックに加え、Playwrightによるレスポンシブ表示確認のE2Eテスト（`frontend/e2e/`、`frontend/playwright.config.ts`）が整備されています。`npm run test:e2e`（内部で`e2e/run-and-report.mjs`を実行）でテストを実行でき、結果は`docs/09_test_specifications/reports/frontend_responsive.md`にレポートとして出力されます。詳細は[テスト仕様書 - フロントエンドE2Eテスト](../09_test_specifications/10_frontend_e2e.md)を参照してください。

## テストの実行

データベースはPostgreSQL（`.env`の`DATABASE_URL`）を使用するため、テスト実行時にはDBコンテナが起動している必要があります。Djangoが自動的にテスト用の一時データベースを作成・破棄します。

```bash
docker compose exec -it backend python3 manage.py test
```

アプリ単位で絞り込む場合:

```bash
docker compose exec -it backend python3 manage.py test inventory
```

## テストレポートの生成（推奨）

本プロジェクトでは、テスト結果をMarkdownレポートとして`docs/09_test_specifications/reports/`配下に保存する仕組み（`script/run_tests.sh` + `testutils.report_runner.JsonReportDiscoverRunner`）が用意されています。新しいテストを追加・実行する際は、こちらのスクリプト経由での実行が推奨されます。

```bash
script/run_tests.sh inventory
```

詳しい仕組みや、モジュール別のテスト仕様書との対応付けについては[テスト仕様書 - テストの実行方法とレポートの残し方](../09_test_specifications/02_running_tests.md)を参照してください。各モジュールのテストケース一覧・既知の懸念事項は`docs/09_test_specifications/0X_<モジュール名>.md`にまとめられています。

## リンター

Pythonコードは`ruff`でリントします。

```bash
docker compose exec -it backend ruff check .
```
