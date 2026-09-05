# データベース構成

PostgreSQLが本システムのリレーショナルデータベースとして使用されています。DjangoのORM（Object-Relational Mapping）を通じてモデルとテーブルのマッピングが行われ、各機能モジュール（`base`, `users`, `production`, `inventory`, `machine`, `quality`, `master`）に対応するテーブル群が自動生成・管理されます。

接続情報は `django-environ` の `env.db()` によって、環境変数 `DATABASE_URL` から一括で読み込まれます（`backend/src/base/settings.py`）。開発用の `.env.example` では以下のように設定されています。

```env
DATABASE_URL=postgres://django:django@db:5432/open_mes
```

これは「エンジン: PostgreSQL、ユーザー: `django`、パスワード: `django`、ホスト: `db`（Docker Composeのサービス名）、DB名: `open_mes`」を表しています。ポートは省略時PostgreSQLのデフォルト`5432`です。

DBコンテナ自体の初期化用には、Docker Compose側で以下の環境変数も使用されます。

```env
POSTGRES_USER=django
POSTGRES_PASSWORD=django
POSTGRES_DB=open_mes
```

初回セットアップ時には、データベースにテーブルを作成するためマイグレーションを実行する必要があります。`backend`コンテナの起動コマンド自体に `python manage.py migrate` が組み込まれているため、`docker compose up` するだけで自動的にマイグレーションが適用されます（詳細は[セットアップ手順](./06_installation_guide/02_setup.md)を参照）。

各アプリケーションのモデル定義に基づき、たとえば以下のようなテーブルがデータベース上に構築されます（詳細は[クラス構造](./08_class_structure.md)を参照）。

- `master`: 品目（Item）、サプライヤー（Supplier）、倉庫（Warehouse）、倉庫ロケーション（WarehouseLocation）、顧客（Customer）、ワークセンター（WorkCenter）、標準単価（UnitCost）、使用部品構成（BillOfMaterial）
- `inventory`: 在庫（Inventory）、入出庫履歴（StockMovement）、入庫予定（PurchaseOrder）、入庫実績（Receipt）、出庫予定（SalesOrder）
- `production`: 生産計画（ProductionPlan）、使用部品（PartsUsed）、材料引当（MaterialAllocation）、作業進捗（WorkProgress）
- `quality`: 検査項目マスター（InspectionItem）、測定・判定詳細（MeasurementDetail）、検査実績（InspectionResult）、検査実績詳細（InspectionResultDetail）
- `machine`: 設備マスター（Machine）
- `users`: カスタムユーザー（CustomUser、`custom_id`でログイン、`account_type`で通常ユーザー/システム連携用アカウントを区別）、APIトークンポリシー（ApiTokenPolicy、トークンの有効/無効・接続元IP許可リスト・アクセス可能なAPIスコープを管理）
- `base`: 基本設定（BaseSetting）、CSV列マッピング（CsvColumnMapping）、モデル項目表示設定（ModelDisplaySetting）、QRコードアクション（QrCodeAction）、非同期タスク（AsyncTask、Celeryと連携）

それらは外部キーで相互参照され、モジュール間のデータ連携を実現します。データベースの初期スキーマ構築後、`createsuperuser`コマンドで管理者ユーザーを作成することで基本的なデータが投入されます。その後は、ユーザーがReactフロントエンドから入力する各種情報（生産計画、在庫登録、検査結果入力など）がREST API経由でリアルタイムにデータベースへ保存され、必要に応じて参照・更新されます。

PostgreSQLに加えて、Celeryのブローカー/結果バックエンドとしてRedisも利用されますが、業務データの永続化には使用されません（一時的なタスク状態管理用途）。

## 環境設定 (.env)

プロジェクトルートに配置する `.env` ファイルで、データベース接続情報やDjangoのセキュリティキー、デバッグ設定などを管理します。リポジトリには雛形として `.env.example` が用意されており、これをコピーして使用します（詳細は[セットアップ手順](./06_installation_guide/02_setup.md)を参照）。

```env
# Django/Backend Service Settings
SECRET_KEY='django-insecure-change-me'   # 本番環境では必ず変更してください
DEBUG=False                              # 開発時はTrue、本番はFalse

ALLOWED_HOSTS=your-domain.com,localhost,127.0.0.1,frontend
CSRF_TRUSTED_ORIGINS=https://your-domain.com,http://localhost:8000
CORS_ALLOWED_ORIGINS=https://your-domain.com,http://localhost

# Database Settings
DATABASE_URL=postgres://django:django@db:5432/open_mes
POSTGRES_USER=django
POSTGRES_PASSWORD=django
POSTGRES_DB=open_mes

# Certbot / HTTPS Settings（compose.https.yml 使用時）
DOMAIN=your-domain.com
EMAIL=your-email@example.com
CERTBOT_USE_STAGING=true
```

`SECRET_KEY`（Djangoの`SECRET_KEY`）は、以下のコマンドでランダムな文字列を生成し、`.env`にコピーできます。

```bash
docker compose exec -it backend python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```
