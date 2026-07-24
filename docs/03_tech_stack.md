# 使用言語・フレームワーク・ライブラリ

## バックエンド（`backend/`）

主な実装言語はPython 3系です。主要な依存パッケージ（`backend/image/requirements.txt`）は以下の通りです。

- **Django 5.1.7**: Webアプリケーションフレームワーク。今回はテンプレートレンダリングではなくREST APIサーバーとして使用しています。
- **djangorestframework 3.15**: REST APIの実装に使用。
- **djangorestframework-simplejwt 5.3**: JWTによる認証（アクセストークン/リフレッシュトークン、ブラックリスト機能）。
- **django-filter**: APIのクエリパラメータによる絞り込み。
- **django-cors-headers**: フロントエンド（Vite開発サーバーや別オリジン）からのCORSリクエストを許可。
- **django-vite**: フロントエンドのビルド成果物（`frontend/dist`）をDjango側のテンプレートから参照するための連携。
- **django-debug-toolbar**: 開発時のデバッグツールバー。
- **whitenoise**: 本番環境での静的ファイル配信。
- **celery 5.4** / **redis 5.0**: 非同期タスクの実行（`worker`コンテナ）。
- **psycopg2-binary**: PostgreSQL用のPythonドライバ。
- **uuid6**: モデルの主キーにUUIDv7を採番するために使用（`Inventory`, `Warehouse`, `ProductionPlan`など多くのモデルで採用）。
- **gunicorn**: 本番環境のWSGIサーバー。
- **ruff**: リンター。

## フロントエンド（`frontend/`）

- **React 19** + **TypeScript** によるSPA。ビルドツールは**Vite 7**。
- **react-router-dom 7**: クライアントサイドルーティング。
- **react-bootstrap** / **bootstrap 5**: UIコンポーネントとスタイリング。
- **@zxing/browser** / **@zxing/library** / **html5-qrcode**: バーコード・QRコードの読み取り機能（現場でのスキャン作業を想定）。
- **qrcode.react**: QRコードの生成・表示。
- **@hello-pangea/dnd** / **sortablejs**: ドラッグ&ドロップ（倉庫レイアウト編集などで使用）。
- **react-dropzone**: ファイル（CSVインポート等）のドラッグ&ドロップアップロード。
- **ESLint** + **typescript-eslint**: Lintツール。

フロントエンドは開発時はViteの開発サーバー（`npm run dev`、ポート5173）で動作し、本番ビルド（`npm run build`）した静的ファイルはNginx（またはdjango-vite経由）で配信されます。Django側にHTMLテンプレートを描画する画面はほぼ存在せず、UIはReact側で完結しています。

## その他

- **データベース**: PostgreSQL。
- **キャッシュ/メッセージブローカー**: Redis（Celery用）。
- **言語**: システムの表示言語はデフォルトで日本語（`LANGUAGE_CODE = "ja"`）、タイムゾーンは `Asia/Tokyo` です。
