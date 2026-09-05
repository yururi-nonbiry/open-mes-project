# open-mes-project (生産ナビ)

Django (Backend / REST API) と React + TypeScript (Frontend) を組み合わせた、製造実行システム (MES) のWebアプリケーションです。
生産管理・在庫管理・品質管理・設備管理・マスタ管理・ユーザー管理といった、中小規模工場の製造現場DX化に必要な機能をオールインワンで提供します。オープンソースで公開されており、自社ニーズに合わせて自由に改変・拡張できます。

## 詳細ドキュメント

より詳細な技術ドキュメントやガイドラインは、[こちら (`docs/README.md`)](./docs/README.md) を参照してください。アーキテクチャ、データベース構成、API構造、クラス構造、開発フロー、テスト仕様書などが `docs` ディレクトリに格納されています。

---

## 技術スタック

### バックエンド (`backend/`)
- **Django 5.1 / Django REST Framework**: REST APIサーバー（画面のHTMLは返さない）
- **djangorestframework-simplejwt**: JWT認証
- **Celery / Redis**: 非同期タスク処理（`worker`コンテナ）
- **PostgreSQL (psycopg2-binary)**: データベース
- **gunicorn / whitenoise**: 本番環境でのアプリケーションサーバー・静的ファイル配信

### フロントエンド (`frontend/`)
- **React 19 + TypeScript**: SPA
- **Vite 7**: ビルドツール・開発サーバー
- **react-router-dom / react-bootstrap**: ルーティング・UIコンポーネント
- **@zxing/browser, html5-qrcode, qrcode.react**: バーコード・QRコードの読み取り/生成

### インフラ・開発環境
- **Docker / Docker Compose**: コンテナ化環境（開発用・本番用・HTTPS用の構成を用意）
- **Nginx / certbot**: 本番環境でのリバースプロキシ・Let's Encrypt証明書取得

詳細な依存パッケージの一覧は [使用言語・フレームワーク・ライブラリ](./docs/03_tech_stack.md) を参照してください。

---

## 主要機能

### 1. 生産管理・在庫管理
- 作業指示・製造オーダーの発行と進捗管理
- 原材料・部品・製品の入庫、保管、出庫、FIFO順での在庫引当

### 2. 品質管理・設備管理
- 検査記録の管理・分析、不良率や品質傾向の可視化
- 工作機械・生産設備のマスタ情報管理

### 3. マスタ管理・ユーザー管理
- 品目、サプライヤー、倉庫・ロケーション、顧客、ワークセンター等の基本データ管理
- JWTによるログイン認証、権限ロール、パスワード有効期限管理

### 4. デザイン・UI
- **メッセージ表示**: 通知・確認・エラーメッセージなどはモーダルウインドウで表示する。
- **レスポンシブ対応**: スマートフォン向け画面はPC向け画面の縮小表示ではなく、別途専用の画面として作成する。

各機能の詳細は [主要機能とモジュール](./docs/02_features_modules.md) を参照してください。

---

## ディレクトリ構造

```text
.
├── backend/                # Django (REST API) バックエンド
│   ├── image/               # Dockerイメージ定義・requirements.txt
│   └── src/                 # アプリケーション本体（各業務モジュール）
├── frontend/                # React + TypeScript (Vite) フロントエンド
│   └── src/                 # 画面・コンポーネント（pages/配下が機能モジュール単位）
├── db/                      # PostgreSQL 用 Dockerイメージ定義
├── reverse-proxy*/          # Nginx リバースプロキシ設定（開発/本番/HTTPS）
├── certbot/                 # Let's Encrypt 証明書取得用コンテナ定義
├── script/                  # テストデータ作成・テスト実行等の運用スクリプト
├── docs/                    # 詳細な技術ドキュメント・テスト仕様書
├── compose.yml              # 開発用 Docker Compose
├── compose.prod.yml         # 本番用 Docker Compose（HTTP）
├── compose.https.yml        # 本番用 Docker Compose（HTTPS/certbot）
└── start.bat                # Windows上でDockerを使わず起動するスクリプト
```

---

## 前提条件・動作環境

**推奨OS**: Ubuntu 24.04 LTS（Server版/Desktop版）。Docker経由であればWindows/macOSでも動作可能です。

以下がインストールされていることを確認してください。

- **Docker**
- **Docker Compose**（`docker compose`プラグインまたはDocker Desktop同梱のCompose）

> 本プロジェクトはDocker Compose上での実行を前提としており、PostgreSQL・Redisを含めホスト側に個別のランタイムを直接インストールする必要はありません。

Windows上でDockerを使わずローカル実行する場合のみ、以下が必要です（後述の [Windows(start.bat)でのセットアップ](#windows上でdockerを使わないセットアップstartbat) を参照）。

- **Python 3.11 以上**（PATHに追加済み、pip利用可能）

より詳細な要件（ハードウェア要件等）は [開発・実行環境の前提条件](./docs/06_installation_guide/01_prerequisites.md) を参照してください。

---

## セットアップ手順

### 1. 環境変数の設定
```bash
cp .env.example .env
```
必要に応じて `.env` 内の値を編集してください（各項目の意味は [環境変数一覧](#環境変数一覧) を参照）。

### 2. Dockerコンテナの起動
```bash
docker compose up --build -d
```
初回はDockerイメージのビルドが行われ、`db` (PostgreSQL) / `redis` / `backend` (Django) / `worker` (Celery) / `frontend` (React/Vite) の各コンテナが起動します。マイグレーションは`backend`コンテナの起動コマンドに含まれているため、個別に実行する必要はありません。

### 3. 管理者ユーザーの作成
```bash
docker compose exec -it backend python3 manage.py createsuperuser
```
ログインIDは`custom_id`フィールドが使われます。

### 4. アプリケーションへのアクセス
- **Frontend**: [http://localhost:5173/](http://localhost:5173/)（Viteの開発サーバーが `/api`, `/admin` 等をバックエンドにプロキシします）
- **Django管理サイト**: [http://localhost:5173/admin/](http://localhost:5173/admin/)

詳細な手順（本番/HTTPS環境での起動を含む）は [セットアップ手順](./docs/06_installation_guide/02_setup.md) を参照してください。

---

## 環境変数一覧

`.env.example` をコピーして作成する `.env` で使用する主な変数です。

| 変数名 | 説明 | 必須/任意 | デフォルト値・例 |
| --- | --- | --- | --- |
| `SECRET_KEY` | Djangoのシークレットキー。本番環境では必ず推測不可能な値に変更する | 必須 | `django-insecure-change-me` |
| `DEBUG` | デバッグモード。本番環境では`False`にする | 必須 | `False` |
| `ALLOWED_HOSTS` | アクセスを許可するホスト名（カンマ区切り） | 必須 | `your-domain.com,localhost,127.0.0.1,frontend` |
| `CSRF_TRUSTED_ORIGINS` | CSRF検証で信頼するオリジン（カンマ区切り） | 必須 | `https://your-domain.com,http://localhost:8000` |
| `CORS_ALLOWED_ORIGINS` | CORSで許可するオリジン（カンマ区切り） | 必須 | `https://your-domain.com,http://localhost` |
| `DATABASE_URL` | Djangoが接続するDBのURL | 必須 | `postgres://django:django@db:5432/open_mes` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQLコンテナの初期設定 | 必須 | `django` / `django` / `open_mes` |
| `DOMAIN` | SSL証明書を取得するドメイン名（HTTPS構成のみ） | 任意 | `your-domain.com` |
| `EMAIL` | SSL証明書取得に使用するメールアドレス（HTTPS構成のみ） | 任意 | `your-email@example.com` |
| `CERTBOT_USE_STAGING` | Let's Encryptのテスト証明書を使用するか（HTTPS構成のみ） | 任意 | `true` |

> 機密性の高い変数（パスワード・シークレットキー等）は、本番用の実際の値を `.env.example` やドキュメントに記載しない。

`SECRET_KEY`は以下のコマンドで生成できます。
```bash
docker compose exec -it backend python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

## 運用のためのコマンド

### フロントエンドのビルド（本番環境用の静的ファイル生成）
```bash
docker compose run --rm frontend npm run build
```

### テストの実行
```bash
script/run_tests.sh              # バックエンド: デフォルト(inventoryアプリ)を実行
script/run_tests.sh inventory production   # バックエンド: 複数アプリをまとめて実行
cd frontend && npm run test:e2e  # フロントエンド: レスポンシブ表示確認(Playwright、要Node.js)
```

### コンテナの停止
```bash
docker compose down
```

### 本番環境の起動
```bash
docker compose -f compose.prod.yml up --build -d
# HTTPS対応（Let's Encrypt）の場合
docker compose -f compose.https.yml up --build -d
```

### テストデータの作成
開発・動作確認用に、API経由でテストデータ（生産計画・使用部品・発注データ等）を一括作成するスクリプトが用意されています。
```bash
pip install requests Faker
python script/create_comprehensive_test_data.py
```
事前に `script/config.ini` にAPIアクセストークンを設定する必要があります。取得方法・設定方法は [使用例](./docs/06_installation_guide/02_setup.md) や `script/create_comprehensive_test_data.py` 内のコメントを参照してください。

---

## 環境別設定（任意）

### 開発環境（`compose.yml`）
Viteの開発サーバー（ポート5173）でフロントエンドを配信し、コード変更がホットリロードされます。

### 本番環境（`compose.prod.yml` / `compose.https.yml`）
ホスト側でビルド済みのフロントエンド静的ファイル（`frontend/dist`）をNginx経由で配信します。起動前に以下でビルドしてください。
```bash
docker compose -f compose.yml run --rm frontend npm run build
```

### SSL証明書の切り替え（テスト→本番）
`.env` の `CERTBOT_USE_STAGING` を `true`（テスト用）から `false`（本番用）に変更しても、既存の証明書が残っている場合は新しい証明書は取得されません。切り替える場合は以下の手順で既存の証明書を削除する必要があります。

```bash
# 1. コンテナを停止
docker compose -f compose.https.yml down

# 2. 証明書の実体があるディレクトリを削除（注意: 全ての証明書が削除されます）
sudo rm -rf ./certbot/conf

# 3. .env を修正 (CERTBOT_USE_STAGING=false) し、コンテナを再起動
docker compose -f compose.https.yml up -d
```

### Windows上でDockerを使わないセットアップ（`start.bat`）
`start.bat` は、Windows上でPython仮想環境（`venv`）とSQLite（デフォルト）を使い、Dockerなしで開発・テスト環境を構築することを意図したバッチスクリプトですが、現在のディレクトリ構成（`backend/src`、`backend/image`）に追随できておらず、旧パス（`open_mes\scr`、リポジトリルート直下の`requirements.txt`等）を参照したままのため**現状では動作しません**。Dockerを使わないセットアップが必要な場合は、`backend/image/requirements.txt`を使ってご自身でPython仮想環境を構築してください。

---

## API 仕様書

詳細なAPI仕様（URLルーティング、認証方式、各モジュールのエンドポイント構成など）は以下のドキュメントを参照してください。

- [API構造と言語インタフェース](./docs/05_api.md)

---

## テスト仕様書

テスト方針・テストシナリオと実行コマンドの対応・レポートの残し方などの詳細は以下のドキュメントを参照してください。テストは全てスクリプト化されており、`script/run_tests.sh`（バックエンド）や `npm run test:e2e`（フロントエンドのレスポンシブ表示確認）で繰り返し検証できます（実行結果は `docs/09_test_specifications/reports/` にMarkdownレポートとして固定ファイル名で保存されます）。

- [総則（対象モジュール一覧・方針）](./docs/09_test_specifications/00_overview.md)
- [テストの実行方法とレポートの残し方（バックエンド）](./docs/09_test_specifications/02_running_tests.md)
- [フロントエンドE2E（レスポンシブ表示確認）](./docs/09_test_specifications/10_frontend_e2e.md)

---

## ライセンス

本プロジェクトのライセンスは [LICENSE](./LICENSE) を参照してください。
