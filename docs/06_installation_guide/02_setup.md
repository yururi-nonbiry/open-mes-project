# セットアップ手順

以下では、Dockerを利用したセットアップ手順を中心に説明します。コマンドは基本的にLinuxシェル想定です。

## 1. コードの入手

GitHubのopen-mes-projectリポジトリからソースコードを取得します。

```bash
git clone https://github.com/mihatama/open-mes-project.git
cd open-mes-project
```

## 2. 環境変数ファイルの設定

リポジトリに含まれる `.env.example` をコピーして `.env` ファイルを作成します。

```bash
cp .env.example .env
```

`SECRET_KEY`、`DATABASE_URL`、`ALLOWED_HOSTS`、`CSRF_TRUSTED_ORIGINS`、`CORS_ALLOWED_ORIGINS` など、必要な項目を編集してください（各項目の意味は[データベース構成](../04_database.md)を参照）。`SECRET_KEY`は以下のコマンドで生成できます。

```bash
docker compose exec -it backend python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

`.env.example`では`DEBUG=False`が既定値です。開発中に詳細なエラー画面が必要な場合は`.env`で`DEBUG=True`に変更してください。本番環境では`DEBUG=False`のまま運用し、`ALLOWED_HOSTS`に適切なドメインやIPを設定してください。

## 3. Dockerコンテナの起動

プロジェクトディレクトリで、Docker Composeでサービスを起動します。

```bash
docker compose up -d
```

初回はDockerイメージのビルドが行われます。これにより以下のコンテナが起動します（詳細は[アーキテクチャ概要](../01_architecture.md)を参照）。

- `db`（PostgreSQL）
- `redis`（Celeryのブローカー）
- `backend`（Djangoアプリ。起動時に自動で `manage.py migrate` を実行してからGunicornを起動）
- `worker`（Celeryワーカー）
- `frontend`（React/Viteアプリ。開発サーバーはポート5173）

コンテナの状態は`docker compose ps`で確認できます。すべて`running`（`db`と`redis`は`healthy`）になっていればOKです。マイグレーションは`backend`コンテナの起動コマンドに含まれているため、個別に`makemigrations`/`migrate`を実行する必要はありません。

## 4. フロントエンドの依存関係インストール（初回のみ）

`frontend`コンテナの起動時にコンテナ内で自動的に依存パッケージがインストールされますが、うまく反映されない場合は以下で明示的にインストールできます。

```bash
docker compose run --rm frontend npm install
```

本番相当のビルド済み静的ファイル（`frontend/dist`）が必要な場合は、以下でビルドします（ホストにNode.jsは不要）。

```bash
docker compose run --rm frontend npm run build
```

## 5. 管理者ユーザーの作成

アプリケーションにログインし管理操作を行うため、スーパーユーザー（管理者）のアカウントを作成します。ログインIDは`custom_id`フィールドが使われます。

```bash
docker compose exec -it backend python3 manage.py createsuperuser
```

## 6. アプリケーションへのアクセス

開発環境では、ブラウザで `http://localhost:5173/` にアクセスするとReactフロントエンドが表示されます（Viteの開発サーバーが `/api`, `/admin`, `/static`, `/__debug__` 宛のリクエストをバックエンドにプロキシします）。ログイン画面が表示されたら、先ほど作成した管理者ユーザーの資格情報でログインしてください。

Django管理サイト（`/admin/`）には `http://localhost:5173/admin/` からアクセスできます。

**メモ:** ログが確認したい場合は`docker compose logs -f backend`や`docker compose logs -f frontend`を実行してください。

## 7. 本番/HTTPS環境での起動

本番相当の構成には、Nginxリバースプロキシを含む `compose.prod.yml`（HTTP、ポート80）や、Let's EncryptによるHTTPS対応を含む `compose.https.yml`（`certbot`コンテナ、`DOMAIN`/`EMAIL`/`CERTBOT_USE_STAGING`の`.env`設定が必要）を使用します。なお、`compose.prod.yml`は`.env`ではなく`.env.prod`を読み込む設定になっているため（`compose.https.yml`は`.env`を使用）、本番構成で起動する前に`.env.prod`を別途作成してください（`.env.prod`は`.gitignore`対象です）。

```bash
docker compose -f compose.prod.yml up -d
# または
docker compose -f compose.https.yml up -d
```

これらの構成では、ホスト側で事前にビルドしたフロントエンド静的ファイル（`frontend/dist`）を使用するため、起動前に手順4のビルドコマンドを実行しておく必要があります。

## 8. （参考）Windows上でのDockerを使わないセットアップ

`start.bat` は、Windows上でDockerを使わずPython仮想環境（`venv`）とSQLite（デフォルト）で開発・テスト環境を構築することを意図したスクリプトですが、現在のディレクトリ構成（`backend/src`、`backend/image`）に追随できておらず、旧パス（`open_mes\scr`等）を参照したままのため現状では動作しません。Dockerを使わないセットアップが必要な場合は、`backend/image/requirements.txt`を使ってご自身でPython仮想環境を構築してください。
