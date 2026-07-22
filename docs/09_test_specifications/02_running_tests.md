# テストの実行方法とレポートの残し方

本書では、[01_inventory.md](./01_inventory.md) 等の各モジュールのテスト仕様書に基づいて実装した自動テスト
(`backend/src/<app>/tests/`)を繰り返し実行し、結果をMarkdownレポートとして
[reports/](./reports/) 配下にgit管理下で保存する手順を説明する。

## 1. 全体像

```
script/run_tests.sh <対象> ...
   ├── 1. .env が無ければ .env.example からコピー
   ├── 2. docker compose で db コンテナを起動しヘルスチェックを待機
   ├── 3. backend コンテナで manage.py test を実行
   │       (testutils.report_runner.JsonReportDiscoverRunner で結果をJSON化)
   └── 4. script/generate_test_report.py がJSONをMarkdownレポートに変換し、
          docs/09_test_specifications/reports/ に保存
```

テストの追加・修正のたびに手動で `manage.py test` を叩いて目視確認するのではなく、この一連の流れを
スクリプト化することで、同じ手順を何度でも再現可能にし、実行結果をレポートとして残せるようにしている。

## 2. 事前準備

- Docker / Docker Compose が利用できること。
- リポジトリルートに `.env` が無い場合は初回実行時に `.env.example` から自動生成される
  (`SECRET_KEY` はテスト用の適当な値のままで動作する。本番環境の `.env` とは別物であり、
  `.gitignore` によりコミットされない)。

## 3. 実行方法

```bash
# デフォルト(inventory アプリ全体)を実行
script/run_tests.sh

# アプリ名を明示
script/run_tests.sh inventory

# 特定のテストモジュール/クラス/メソッドのみ実行(Djangoのテストラベル形式)
script/run_tests.sh inventory.tests.test_allocate
script/run_tests.sh inventory.tests.test_allocate.AllocateTests.test_so_alloc_01_success_creates_sales_order

# 複数アプリをまとめて実行(他モジュールのテストを今後追加した場合)
script/run_tests.sh inventory production
```

実行が終わると、以下のようなパスにレポートが生成される。

```
docs/09_test_specifications/reports/inventory_20260722_112308.md
```

ファイル名は `<第1引数を _ 区切りにしたもの>_<実行日時 YYYYmmdd_HHMMSS>.md` となる。過去の実行結果は
上書きされず、実行するたびに新しいファイルが追加されていく。レポートは通常のファイルなので、
`git add`/`git commit` で他のドキュメントと同様にコミットできる。

テストが1件でも失敗すると `script/run_tests.sh` は非ゼロの終了コードを返す(CI等での失敗検知に利用可能)。
レポート自体はテストが失敗していても必ず生成される。

## 4. レポートの内容

生成されるMarkdownレポートには以下が含まれる。

- 実行日時・実行コマンド・実行時間・総合結果(OK/NG)
- サマリー表(総数/成功/失敗/エラー/スキップ)
- 失敗・エラーになったテストの一覧(テストID・結果・docstring概要)
- 各失敗・エラーの詳細なトレースバック

テストメソッドにdocstringを書いておくと、レポートの「概要」列に1行目が表示される。新しいテストケースを
追加する際は、対応するテスト仕様書のケースID(例: `INV-MOVE-01`)をdocstringやコメントに含めておくと、
レポートとテスト仕様書を突き合わせやすくなる。

## 5. 内部の仕組み

- `backend/src/testutils/report_runner.py`: Djangoの`DiscoverRunner`を拡張したカスタムテストランナー
  `JsonReportDiscoverRunner`。`unittest.TestResult`を直接フックして各テストの結果(成功/失敗/エラー/スキップ、
  docstring、トレースバック)を構造化データとして収集し、環境変数 `TEST_REPORT_JSON` で指定したパスに
  JSONで書き出す。
  - Djangoの標準出力(`manage.py test -v 2`のテキスト)は、`LOGGING`設定のconsoleハンドラの出力と
    同じ標準エラー出力を共有しており、テストケース数が増えると出力が混ざり合ってテキストパースが
    不安定になる。そのため、テキスト出力をパースするのではなく、`unittest.TestResult`のAPIを直接
    使って構造化データを得る方式にしている。
- `script/generate_test_report.py`: 上記JSONを読み込み、Markdownレポートを組み立てる単体のPythonスクリプト。
  `script/run_tests.sh`以外からも直接呼び出せる。
- `script/run_tests.sh`: db起動・ヘルスチェック待機・コンテナ内でのテスト実行・レポート生成を一気通貫で行う
  シェルスクリプト。内部的には以下の生のコマンドを実行している。

  ```bash
  docker compose up -d db
  docker compose run --rm -e TEST_REPORT_JSON=/open_mes/.test_report.json \
    backend python manage.py test inventory \
    --testrunner=testutils.report_runner.JsonReportDiscoverRunner --verbosity 2
  ```

  一時的なJSON(`backend/src/.test_report.json`)はレポート生成後に削除され、`.gitignore`にも
  登録済みのためコミットされない。

## 6. 新しいモジュールのテストを追加する場合

1. [00_overview.md](./00_overview.md) の方針に従い、対象モジュールのテスト仕様書
   (`0X_<モジュール名>.md`)を作成する。
2. `backend/src/<app>/tests/` をパッケージ化し(既存の単一`tests.py`がある場合は削除して置き換える)、
   機能area単位でテストモジュールを分割する(inventoryアプリの例を参照)。
3. `script/run_tests.sh <app>` で実行し、レポートを確認する。
4. レポートに現れた失敗が仕様通りの想定挙動(異常系テスト等)か、実装上の不具合かを判断し、
   不具合であればテスト仕様書の「既知の懸念事項」節に追記する。
