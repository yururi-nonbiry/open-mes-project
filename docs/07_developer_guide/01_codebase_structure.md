# コードベースの構成と各ディレクトリの役割

リポジトリは大きく **`backend/`**（Django REST APIサーバー）と **`frontend/`**（React SPA）に分かれています。

## `backend/`

- **`backend/src/`**: Djangoプロジェクト本体（Docker Composeでは`/open_mes`にマウントされます）。
    - **`base/`**: プロジェクト直下の設定アプリ。`settings.py`（Django設定）、`urls.py`（ルートURLconf）、`wsgi.py`、`celery.py`に加え、`BaseSetting`（システム設定）、`CsvColumnMapping`（CSVインポート列マッピング）、`ModelDisplaySetting`（管理画面表示設定）、`QrCodeAction`（QRコード読み取り時アクション定義）、`AsyncTask`（Celery連携の非同期タスク状態管理）などのモデルを持ちます。他の全アプリから参照される共通基盤です。
    - **`master/`**: マスタデータ管理アプリ。品目（`Item`）、サプライヤー（`Supplier`）、倉庫（`Warehouse`）、倉庫ロケーション（`WarehouseLocation`）、顧客（`Customer`）、ワークセンター（`WorkCenter`）、標準単価（`UnitCost`）を管理します。
    - **`inventory/`**: 在庫管理アプリ。在庫（`Inventory`）、入出庫履歴（`StockMovement`）、入庫予定（`PurchaseOrder`）、入庫実績（`Receipt`）、出庫予定（`SalesOrder`）を扱い、複数ロケーションからのFIFO順引当・出庫処理などの業務ロジックを`rest_views.py`に実装しています。
    - **`production/`**: 生産管理アプリ。生産計画（`ProductionPlan`）、使用部品（`PartsUsed`）、材料引当（`MaterialAllocation`）、作業進捗（`WorkProgress`）を管理します。業務ロジックは`services/`サブディレクトリにモジュール分割されています。
    - **`quality/`**: 品質管理アプリ。検査項目マスター（`InspectionItem`）、測定・判定詳細（`MeasurementDetail`）、検査実績（`InspectionResult`）、検査実績詳細（`InspectionResultDetail`）を管理します。
    - **`machine/`**: 設備管理アプリ。設備マスター（`Machine`）を管理します。
    - **`users/`**: ユーザー管理アプリ。`AbstractBaseUser`を継承したカスタムユーザーモデル（`CustomUser`、ログインIDは`custom_id`）と、パスワード有効期限チェック用ミドルウェア（`PasswordExpirationMiddleware`）を持ちます。
    - 各アプリは概ね次のファイル構成に従います: `models.py`（モデル定義）、`serializers.py`（DRFシリアライザ）、`rest_views.py`（APIビュー。`users`のみ`rest.py`）、`api_urls.py`（`/api/<app>/`配下のルーティング）、`admin.py`（Django管理サイト設定）、`migrations/`、`tests/`（テストコード）。
    - **`testutils/`**: テスト共通ユーティリティ。`report_runner.py`にDjangoの`DiscoverRunner`を拡張したカスタムテストランナー`JsonReportDiscoverRunner`があり、テスト結果をJSON化してMarkdownレポート生成に利用します（詳細は[テスト方法](./03_testing.md)を参照）。
- **`backend/image/`**: バックエンドのDockerイメージ関連ファイル（`Dockerfile`、`requirements.txt`）。

## `frontend/`

React 19 + TypeScript + Vite製のSPAです。

- **`frontend/src/pages/`**: 画面コンポーネント。`inventory/`, `production/`, `quality/`, `machine/`, `master/`, `import/`（CSVインポート系画面）, `mobile/`（QRスキャン等モバイル向け画面）のようにモジュール単位でディレクトリが分かれています。
- **`frontend/src/services/`**: バックエンドAPIを呼び出すサービス層（例: `inventoryService.ts`, `productionService.ts`, `qualityService.ts`, `machineService.ts`, `warehouseLocationService.ts`）。
- **`frontend/src/components/`**: 再利用可能なUIコンポーネント（`common/`, `mobile/`, `quality/`など）。
- **`frontend/src/layouts/`**, **`context/`**, **`hooks/`**, **`config/`**, **`types/`**, **`utils/`**: それぞれレイアウト、React Context（認証状態等）、カスタムフック、設定値、TypeScript型定義、汎用ユーティリティです。
- **`frontend/src/App.tsx`**（または相当のルートコンポーネント）で`react-router-dom`によるルーティングを定義しています。

## その他のディレクトリ

- **`db/image/`**: PostgreSQL用のDockerイメージ定義。
- **`reverse-proxy/`**, **`reverse-proxy_prod/`**, **`reverse-proxy_https/`**: Nginxリバースプロキシの設定（それぞれ開発用・本番HTTP用・本番HTTPS用）。`frontend`と`backend`へのリクエストを振り分けます。
- **`certbot/`**: HTTPS構成（`compose.https.yml`）でLet's Encrypt証明書を取得・更新するためのコンテナ定義。
- **`script/`**: 開発補助スクリプト。テスト実行とレポート生成を行う`run_tests.sh`/`generate_test_report.py`（[テスト方法](./03_testing.md)参照）、テストデータ投入用の`create_comprehensive_test_data.py`等。
- **`compose.yml`** / **`compose.prod.yml`** / **`compose.https.yml`**: 環境別のDocker Compose定義。
- **`docs/`**: 本ドキュメント一式。
- **`README.md`**: リポジトリのセットアップ手順や運用コマンドの概要。
- **`LICENSE`**: MIT License。
- **`.env.example`**: `.env`ファイルの雛形。

開発者はまず`backend/src/base/settings.py`（`INSTALLED_APPS`、DB/認証/Celery設定）と`backend/src/base/urls.py`（APIルートの一覧）を読むと全体構成を把握しやすく、フロントエンドは`frontend/src/pages/`配下から画面と対応するAPI呼び出し（`services/`）を追うとよいでしょう。
