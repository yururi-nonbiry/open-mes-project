# フロントエンドE2E（レスポンシブ表示確認）

本書は、[Playwright](https://playwright.dev/) による自動テストで検証している、フロントエンドの
レスポンシブ表示確認について説明する。バックエンドのテスト（[02_running_tests.md](./02_running_tests.md)）
とは別の実行系統であり、対象・実行方法・レポートの保存先が異なる。

## 1. 目的・テスト観点

[全体方針](../../README.md#主要機能) に記載のレスポンシブ規約
（「スマートフォン向け画面はPC向け画面の縮小表示ではなく、別途専用の画面として作成する」）が
実際に機能していることを、以下の観点で自動検証する。

- **スマホモード／HD／FullHD** の各表示モードで、画面上の全ボタンが可視かつ操作可能（有効・視界内）であること。

具体的なブレークポイントのpx値は本書では扱わない。`frontend/playwright.config.ts` の
`projects` 定義を単一の情報源とし、モード名との対応（スマホ = `devices['iPhone 13']`、
HD = 1280×720、FullHD = 1920×1080）もそちらを参照すること。

スマホモードは `devices['iPhone 13']` を使用しており、ビューポートに加えてUser-Agentもモバイル向けの
値になる。`frontend/src/App.tsx` の `MobileRedirector` はUser-Agentで振り分けを行うため、実機に近い形で
`/mobile/*` への振り分けを検証できる。

## 2. 現在の対象範囲

現時点では、代表シナリオとして**ログイン画面**（`/login` および `/mobile/login`）のみを対象としている
（`frontend/e2e/responsive.spec.ts`）。在庫・生産・品質・設備・マスタ・ユーザー管理などの各画面への
対象拡大は今後の課題であり、対応するテスト仕様書（[01_inventory.md](./01_inventory.md) 等）に
E2E観点を追記した上で、`frontend/e2e/` 配下にテストファイルを追加していく想定である。

## 3. 実行方法

Playwrightはブラウザバイナリを直接起動するため、`frontend`コンテナ（`node:22-alpine`）内では
実行できない。**ホスト側にNode.jsをインストールした上で実行する**（このテストに限り、
[前提条件](../06_installation_guide/01_prerequisites.md)の「Dockerで完結する」原則の例外となる）。

```bash
cd frontend
npm install
npx playwright install --with-deps chromium   # 初回のみ: ブラウザ本体を取得
npm run test:e2e
```

`npm run test:e2e` は内部で `npm run dev`（Viteの開発サーバー）を自動起動してテストを実行する
（`playwright.config.ts` の `webServer` 設定）。バックエンドが未起動でも、未ログイン状態のログイン画面の
表示確認自体は行えるため、`docker compose up`は必須ではない。

テストが1件でも失敗すると `npm run test:e2e` は非ゼロの終了コードを返す。

## 4. レポートの保存先

実行結果は、backend側のテストと同じ方針（[02_running_tests.md](./02_running_tests.md)参照）で、
Markdownレポートを固定パスに同一ファイル名で上書き保存する。

```
docs/09_test_specifications/reports/frontend_responsive.md
```

過去の実行結果の履歴は `git log -p` でこのファイルの変更履歴を辿ればよく、実行のたびに新規ファイルを
追加することはしない。レポートは通常のファイルなので、`git add`/`git commit` でコミットできる。

失敗時のスクリーンショットは `frontend/test-results/` 配下に出力されるが、こちらはリポジトリの肥大化を
避けるため `.gitignore` 対象としている（参考資料として手元で確認する用途）。

## 5. 内部の仕組み

- `frontend/playwright.config.ts`: ビューポート/User-Agentのプロジェクト定義（スマホ/HD/FullHD）。
- `frontend/e2e/*.spec.ts`: テスト本体。
- `frontend/e2e/run-and-report.mjs`: `npx playwright test --reporter=json` を実行し、標準出力のJSONを
  Markdownレポートに変換して固定パスへ上書き保存するラッパースクリプト
  （backendの `script/generate_test_report.py` と同じ役割）。テストが失敗していてもレポートは必ず生成され、
  最終的な終了コードはPlaywrightの実行結果を引き継ぐ。
