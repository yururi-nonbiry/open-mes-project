# フロントエンドE2E（レスポンシブ表示確認）

本書は、[Playwright](https://playwright.dev/) による自動テストで検証している、フロントエンドの
レスポンシブ表示確認について説明する。バックエンドのテスト（[02_running_tests.md](./02_running_tests.md)）
とは別の実行系統であり、対象・実行方法・レポートの保存先が異なる。

## 1. 目的・テスト観点

[全体方針](../../README.md#主要機能) に記載のレスポンシブ規約
（「スマートフォン向け画面はPC向け画面の縮小表示ではなく、別途専用の画面として作成する」）が
実際に機能していることを、以下の観点で自動検証する。

- **スマホモード／HD／FullHD** の各表示モードで、画面上の全ボタンが画面幅内に収まっており、
  横方向にはみ出していないこと（レスポンシブ崩れの検出）。

検証対象はあくまでレスポンシブ表示（レイアウト崩れ）であり、業務ロジックによるボタンの活性/非活性
（例: 未選択時は無効化される操作ボタン）や、閉じたスライドメニューのように意図的に画面外へ配置されて
いる要素は対象外とする（詳細は`frontend/e2e/helpers.ts`の`expectAllVisibleButtonsOperable`を参照）。

具体的なブレークポイントのpx値は本書では扱わない。`frontend/playwright.config.ts` の
`projects` 定義を単一の情報源とし、モード名との対応（スマホ = `devices['iPhone 13']`、
HD = 1280×720、FullHD = 1920×1080）もそちらを参照すること。

スマホモードは `devices['iPhone 13']` のビューポート/User-Agentを使用する（レンダリングエンジンは
Chromiumに固定）。`frontend/src/App.tsx` の `MobileRedirector` はUser-Agentで振り分けを行うため、
実機に近い形で `/mobile/*` への振り分けを検証できる。

## 2. 対象範囲

| 種別 | テストファイル | 対象プロジェクト |
|---|---|---|
| ログイン画面（未認証） | `frontend/e2e/login.spec.ts` | login-smartphone / login-hd / login-fullhd |
| ログイン後のデスクトップ画面（27画面） | `frontend/e2e/desktop-pages.spec.ts` | hd / fullhd |
| ログイン後のモバイル専用画面（4画面） | `frontend/e2e/mobile-pages.spec.ts` | smartphone |

デスクトップ画面は、`frontend/src/App.tsx`のルーティング定義にある保護ルートをほぼ全て網羅している
（動的パラメータを持つ`/user/management/edit/:id`、および`desktop-pages.spec.ts`未追加の
`/production/bom-master`・`/production/parts-supply-simulation`は対象外）。モバイル専用画面を持たないページ
（在庫照会・生産計画等）は、スマホUAでアクセスすると`MobileRedirector`により`/mobile`（モバイルトップ）
へ強制的にリダイレクトされる仕様のため、smartphoneプロジェクトでの検証対象に含めていない
（レスポンシブ規約の帰結であり、不具合ではない）。

一覧・詳細画面内の動的なボタン（データの行ごとの操作ボタン等）は対象外とし、初期表示時点で画面上に
存在する静的なボタン（ヘッダー・フィルタ・登録ボタン等）のみを検証する。特定データを前提とした
シナリオ（例: レコード編集時のみ表示されるボタン）への対象拡大は今後の課題。

## 3. 事前準備: テストユーザーの作成

ログイン後の画面を検証するため、`docker compose exec`でテスト用ユーザーを作成しておく（初回のみ）。
`/user/management`等スタッフ限定ページも検証対象に含むため、スタッフ権限を付与する。

```bash
docker compose exec -T backend python3 manage.py shell -c "
from users.models import CustomUser
u, _ = CustomUser.objects.get_or_create(custom_id='e2e_test', defaults={'username': 'e2e_test'})
u.set_password('<任意の強いパスワード>')
u.is_staff = True
u.is_superuser = True
u.is_active = True
u.save()
"
```

作成したIDとパスワードは、後述の環境変数 `E2E_USER_ID` / `E2E_USER_PASSWORD` に設定する。
本番相当のユーザーではなくテスト専用アカウントであるため、既存のアカウント管理方針とは分離して扱う。

## 4. 実行方法

Playwrightはブラウザバイナリを直接起動するため、`frontend`コンテナ（`node:22-alpine`）内では
実行できない。**ホスト側にNode.jsをインストールした上で実行する**（このテストに限り、
[前提条件](../06_installation_guide/01_prerequisites.md)の「Dockerで完結する」原則の例外となる）。

ログイン後の画面を検証するため、`db`・`redis`・`backend`はDocker Composeで起動しておく必要がある
（`docker compose up -d db redis backend`）。フロントエンドはPlaywrightが`npm run dev`を自動起動する
ため、`frontend`コンテナを別途起動する必要はない。

```bash
cd frontend
npm install
npx playwright install chromium   # 初回のみ: ブラウザ本体を取得(WebKit/Firefoxは未使用のため不要)

export E2E_USER_ID='e2e_test'
export E2E_USER_PASSWORD='<3.で設定したパスワード>'
npm run test:e2e
```

`npm run test:e2e` は内部で `npm run dev`（Viteの開発サーバー）を自動起動してテストを実行する
（`playwright.config.ts` の `webServer` 設定）。`auth-setup`プロジェクトが最初にUIからログインして
認証状態（`frontend/e2e/.auth/user.json`、`.gitignore`対象）を作成し、`hd`/`fullhd`/`smartphone`の
各プロジェクトがそれを使い回す（`login-*`プロジェクトのみ未認証のまま実行される）。

テストが1件でも失敗すると `npm run test:e2e` は非ゼロの終了コードを返す。

## 5. レポートの保存先

実行結果は、backend側のテストと同じ方針（[02_running_tests.md](./02_running_tests.md)参照）で、
Markdownレポートを固定パスに同一ファイル名で上書き保存する。

```
docs/09_test_specifications/reports/frontend_responsive.md
```

過去の実行結果の履歴は `git log -p` でこのファイルの変更履歴を辿ればよく、実行のたびに新規ファイルを
追加することはしない。レポートは通常のファイルなので、`git add`/`git commit` でコミットできる。

失敗時のスクリーンショットは `frontend/test-results/` 配下に出力されるが、こちらはリポジトリの肥大化を
避けるため `.gitignore` 対象としている（参考資料として手元で確認する用途）。

## 6. 内部の仕組み

- `frontend/playwright.config.ts`: ビューポート/User-Agentのプロジェクト定義（スマホ/HD/FullHD）と、
  未認証(`login-*`)・認証セットアップ(`auth-setup`)・認証済み(`smartphone`/`hd`/`fullhd`)のプロジェクト構成。
- `frontend/e2e/auth.setup.ts`: `E2E_USER_ID`/`E2E_USER_PASSWORD`でUIからログインし、認証状態を
  `frontend/e2e/.auth/user.json`に保存するセットアッププロジェクト。
- `frontend/e2e/helpers.ts`: 全ページ共通の検証ロジック（ボタンの横方向はみ出しチェック等）。
- `frontend/e2e/login.spec.ts` / `desktop-pages.spec.ts` / `mobile-pages.spec.ts`: テスト本体。
- `frontend/e2e/run-and-report.mjs`: `npx playwright test --reporter=json` を実行し、標準出力のJSONを
  Markdownレポートに変換して固定パスへ上書き保存するラッパースクリプト
  （backendの `script/generate_test_report.py` と同じ役割）。テストが失敗していてもレポートは必ず生成され、
  最終的な終了コードはPlaywrightの実行結果を引き継ぐ。

## 7. 関連する既存バグの修正について

本テストの整備過程で、開発用Docker Compose構成（`compose.yml`）に既存のバグが見つかり、あわせて修正した。
`frontend/vite.config.ts`のAPIプロキシ先が`http://localhost:8000`となっており、`frontend`コンテナ自身の
loopbackを指すため`backend`コンテナに到達できず、開発環境（`docker compose up`）でログインを含む
全API呼び出しが失敗する状態だった。プロキシ先をDocker Composeのサービス名`http://backend:8000`に修正し、
あわせて`ALLOWED_HOSTS`（`.env.example`・`.env`）に`backend`を追加している
（Djangoの`ALLOWED_HOSTS`検証は、プロキシが送信するHostヘッダーを見るため）。
