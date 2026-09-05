# トラブルシューティングのヒント

セットアップや運用中によく発生し得る問題と対処法を以下にまとめます。

- **コンテナが起動しない/すぐ停止する**:
  `docker compose ps`で`backend`、`frontend`、`worker`、`db`、`redis`のいずれかのステータスが`exited`になっている場合、ログを確認します。`docker compose logs backend`（または該当サービス名）でログを確認し、エラー内容を特定してください。典型的な原因として`.env`の書き漏れ（`SECRET_KEY`未設定、`DATABASE_URL`のタイプミス）や、PostgreSQL/Redisへの接続失敗が挙げられます。この場合、`.env`を修正後にコンテナを再起動してください（`docker compose up -d --force-recreate`）。

- **マイグレーションエラー**:
  `backend`コンテナは起動時に自動で`manage.py migrate`を実行します。エラーが出る場合は`docker compose logs backend`を確認してください。`connection refused`等があればDB接続が確立できていません。`db`コンテナが`healthy`になっているか、`.env`の`DATABASE_URL`が正しいか確認しましょう。`relation already exists`のようなエラーは、マイグレーション履歴の不整合が考えられます。必要なら`--fake`オプションを検討してください。

- **管理者でログインできない**:
  `createsuperuser`で設定したパスワードが間違っている可能性があります。もう一度`docker compose exec backend python3 manage.py createsuperuser`を実行し、新しい管理者を作成してみてください。既存ユーザーのパスワードリセットには`manage.py changepassword <custom_id>`コマンドも使えます。なお、本システムにはパスワード有効期限（デフォルト180日、`PASSWORD_EXPIRATION_DAYS`設定）があり、期限切れの場合はログイン後にパスワード変更が求められます。

- **ページを開いた際にCSRFエラー (Origin checking failed)**:
  アクセス元のURLが信頼できるオリジンとして登録されていない場合に発生します。`.env` ファイルの `CSRF_TRUSTED_ORIGINS` と `CORS_ALLOWED_ORIGINS` に、ブラウザでアクセスしているURL（スキーマ`http://`または`https://`からポート番号まで）を正確に記述してください。
  例えば、`http://example.com:5173` でアクセスしている場合は、`CSRF_TRUSTED_ORIGINS="http://example.com:5173"` のように設定します。複数のオリジンを許可する場合はカンマで区切ります。

- **フロントエンドからAPIにアクセスできない/CORSエラー**:
  `CORS_ALLOWED_ORIGINS`にフロントエンドのオリジンが含まれているか確認してください。Vite開発サーバー（`frontend`コンテナ）経由でアクセスする場合は`/api`等のリクエストが自動的にバックエンドへプロキシされるため（`frontend/vite.config.ts`）、通常は`http://localhost:5173/`経由でアクセスすれば問題は起きません。

- **メール送信ができない**:
  パスワードリセット機能等でメールを送ろうとした場合、デフォルトではメールサーバ設定が行われていないため送信に失敗します。本番運用時にはメールサーバ（SMTP）の設定を追加してください。

- **Celeryタスクが実行されない**:
  `worker`コンテナが起動しているか（`docker compose ps`）、Redisに接続できているかを確認してください。`docker compose logs worker`でCeleryのログを確認できます。非同期タスクの状態は`base`アプリの`AsyncTask`モデル経由でも確認できます。

- **パフォーマンスが遅い**:
  開発環境のバックエンドはGunicornで動作しますが、開発向けの設定のためワーカー数などがチューニングされていません。本番では適切なワーカー数の設定や、大量データ投入時のインデックス確認（モデルの`Meta`で`indexes`を追加後にマイグレーションを適用）を検討してください。

- **Docker関連の問題**:
  Windows環境でDocker Desktopを使用している場合、WSL2の設定やリソース制限によってコンテナが不安定になることがあります。Docker Desktopの設定でメモリ/CPUの割当を増やす、WSLの更新を行う、あるいはUbuntu上で直接Dockerを動かすなどの対策を試してください。なお、`start.bat`（Windows向けのDockerを使わないローカルセットアップ）は現状動作しません（[セットアップ手順](./02_setup.md)を参照）。

以上の点以外にも問題が発生した場合は、GitHubリポジトリのIssuesで確認・質問することも可能です。
