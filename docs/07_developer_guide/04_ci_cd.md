# CI/CD パイプライン

継続的インテグレーション/デプロイ (CI/CD) の仕組みは、プロジェクトに自動化と一貫性をもたらします。2026年7月時点、open-mes-projectには`.github/workflows`等によるCI設定は導入されておらず、テストやビルドの実行は開発者が手動（または[テスト方法](./03_testing.md)で紹介した`script/run_tests.sh`）で行っています。将来的には以下のようなCI/CDの構築が考えられます。

## CI（継続的インテグレーション）候補

GitHub Actionsを例にすると、`push`や`pull_request`トリガーで以下を実行できます:

1.  バックエンド: Python実行環境をセットアップし、依存関係をインストール（`pip install -r backend/image/requirements.txt`）。
2.  データベースサービス（PostgreSQL）とRedisをActionsのservicesとして起動。
3.  バックエンドのテストスイートを実行（`python manage.py test`、または既存の`testutils.report_runner.JsonReportDiscoverRunner`を利用）。
4.  `ruff check .`によるリント。
5.  フロントエンド: Node.js環境をセットアップし、`npm ci`、`npm run lint`、`npm run type-check`、`npm run build`を実行。

このプロセスにより、マージ前にコードが正常に動作するかを自動検証できます。

## CD（継続的デプロイ/デリバリ）候補

安定版をリリースする際にデプロイを自動化する場合、例えば以下のような流れが考えられます。

1.  上記CIと同様にビルド・テストを実施。
2.  `docker compose -f compose.prod.yml build`（または`compose.https.yml`）でDockerイメージをビルドし、コンテナレジストリにプッシュ。
3.  本番サーバにデプロイスクリプトを走らせ、新イメージをpullしてコンテナを更新する。

現状は開発者が`docker compose -f compose.prod.yml up -d --build`のような形で手動デプロイすることを想定した構成になっています。

## バージョニング

リリースにはSemantic Versioning（例: `v1.0.0`）の採用が考えられます。`backend/src/base/settings.py`には`VERSION`変数（本ドキュメント作成時点では`"0.0.0"`）が定義されており、今後リリース管理に利用できます。
