# システムアーキテクチャ概要

open-mes-project（生産ナビ）は、バックエンドとフロントエンドが分離された構成のWebアプリケーションです。

- **バックエンド**（`backend/`）: Python / Django 5.1 + Django REST Framework によるREST API サーバです。画面のHTMLは返さず、JSONを返すAPIとして動作します。
- **フロントエンド**（`frontend/`）: React 19 + TypeScript + Vite によるSPA（Single Page Application）です。バックエンドのREST APIをJWTで認証しながら呼び出し、画面を描画します。
- **非同期処理**: Celery ワーカーがバックエンドと同じコードベース（`backend/src`）を使って非同期タスクを実行し、Redisをブローカー兼結果バックエンドとして利用します。
- **データベース**: PostgreSQLを使用します。DjangoのORMを通じてモデルとテーブルのマッピングが行われます。

クライアント（ブラウザ）はReactアプリを読み込み、バックエンドのREST API（`/api/<app>/...`）にHTTP経由でアクセスします。認証は主にJWT（`djangorestframework-simplejwt`）で行われ、QRリーダーなどの外部デバイス向けには固定トークン認証（DRFの`TokenAuthentication`を拡張した独自の`ScopedTokenAuthentication`）も別途用意されています。ユーザーに`ApiTokenPolicy`（有効/無効フラグ、接続元IP許可リスト、アクセス可能なAPIスコープ）を設定することで、トークンごとにアクセス制御を行えます。

## Docker Compose 構成

`compose.yml`（開発用）では、以下のサービスが定義されています。

- **db**: PostgreSQL（`db/image`でビルド）。ヘルスチェック付き。
- **redis**: Celeryのブローカー/結果バックエンドとして使用するRedis。
- **backend**: Djangoアプリケーション本体。コンテナ起動時に `python manage.py migrate` を実行した後、Gunicornで `base.wsgi:application` を起動します（ヘルスチェックは `/api/base/health/`）。
- **worker**: `celery -A base worker` を実行するCeleryワーカー。backendと同じイメージ・ソースを使用します。
- **frontend**: Vite開発サーバー（本番相当の構成は `compose.prod.yml` / `compose.https.yml` を参照。Nginx経由でビルド済み静的ファイルを配信します）。

サービス間はDocker Composeのネットワークで連携し、DB接続は `.env` の `DATABASE_URL`（例: `postgres://django:django@db:5432/open_mes`）で設定されます。

本番相当の構成（`compose.prod.yml` や `compose.https.yml`、`reverse-proxy*`ディレクトリ）では、Nginxのリバースプロキシやcertbotによる証明書取得（Let's Encrypt）も組み合わせて使用されます。

なお、`start.bat`（Windows向けセットアップスクリプト）は現在のディレクトリ構成（`backend/src`、`backend/image`）に追随できておらず、旧パス（`open_mes\scr`等）を参照したままのため現状では動作しません。Dockerを使わないセットアップが必要な場合は[セットアップ手順](./06_installation_guide/02_setup.md)を参照してください。
