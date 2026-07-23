# テスト仕様書: ベース機能 (base)

## 1. 対象範囲

`base`はDjangoプロジェクトの設定パッケージ（`ROOT_URLCONF = "base.urls"`、`DJANGO_SETTINGS_MODULE=base.settings`、
`wsgi.py`/`asgi.py`/`celery.py`）であると同時に、`INSTALLED_APPS`に`"base.apps.BaseConfig"`として登録された
**実体を持つDjangoアプリ**でもある。本書は後者、すなわち`base`アプリ自身が提供するモデル・API
（DRF `APIView`/`ModelViewSet`、`base/api.py`）を対象とする。

- 対象: アプリ情報 (`AppInfoView`)、ヘルスチェック (`HealthCheckView`)、動的フィールド定義取得
  (`ModelFieldsView`)、CSV列マッピング (`CsvColumnMapping`/`CsvColumnMappingViewSet`、CSVテンプレート生成・
  CSVインポートパイプライン・`AsyncTask`によるタスク進捗ポーリング)、モデル項目表示設定
  (`ModelDisplaySetting`/`ModelDisplaySettingViewSet`)、QRコードアクション
  (`QrCodeAction`/`QrCodeActionViewSet`、正規表現ディスパッチ)、基本設定 (`BaseSetting`、API未実装のモデルのみ)。
- **[00_overview.md](./00_overview.md)の記載内容の訂正**: 総則では`base`を「ダッシュボード、共通設定、
  ナビゲーション等」「実装形態: Django View」としているが、実際のコードにダッシュボード・ナビゲーション・
  HTMLテンプレートを描画する`views.py`は存在せず、`base/views.py`/`base/middleware.py`/`base/forms.py`は
  そもそも存在しない。実体はDRFのみで構成される小規模なAPIアプリであり、本書はその実装済み範囲のみを対象とする。
- **範囲外**:
  - プロジェクト設定・URLルーティング自体（`settings.py`、`urls.py`のうち各アプリへの`include()`部分）は
    機能テストの対象外。
  - `users.middleware.PasswordExpirationMiddleware`は`base`の`MIDDLEWARE`設定から参照されるが、実体は
    `users`アプリに定義されており、既に[04_users.md](./04_users.md)（USR-PWEXP-*）でテスト済みのため対象外。
  - CSVインポートの実処理（`base/tasks.py`の`import_csv_task`、Celery経由）はCeleryワーカー・Redisブローカーの
    実行を前提とするため、本書のAPIテストでは`import_csv_task.delay`/`AsyncResult`をモックし、エンドポイントの
    リクエスト〜バリデーション〜`AsyncTask`作成までの範囲のみを検証する。Celeryタスク本体の処理内容
    （CSV行ごとのモデル反映処理）は対象外。
  - `QrCodeActionViewSet.execute_action`が呼び出す`action_mark_as_received`/`action_update_inventory`は
    「仮実装」であり実際の在庫・入庫データを変更しないため、ディスパッチ（正規表現マッチ・アクション呼び出し）の
    検証に留める。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh base`
- テストクラスは`rest_framework.test.APITestCase`（モデル単体テストのみ`django.test.TestCase`）を使用し、
  `reverse("base_api:<name>")`でURL解決する。
- `base`の各ViewSet（`CsvColumnMappingViewSet`、`QrCodeActionViewSet`、`ModelDisplaySettingViewSet`）は
  `master`/`quality`/`machine`とは異なり**`CustomSuccessMessageMixin`を使用していない**。標準のDRF
  `ModelViewSet`の応答形式（listは`{"status": ..., "data": ...}`ではなくプレーンな配列、`destroy()`は
  204 No Content）である点に注意。
- 各ViewSetの既定`permission_classes`は`[IsAdminUser]`（`is_staff=True`のユーザーのみ）だが、
  `CsvColumnMappingViewSet`の`csv_template`/`import_csv`/`get_task_status`/`cancel_task`、
  `QrCodeActionViewSet`の`execute_action`は`get_permissions()`/`@action(permission_classes=...)`により
  `IsAuthenticated`（一般ユーザーでも可）へ降格されている。`AppInfoView`/`HealthCheckView`は`AllowAny`。
- Celery連携（`import_csv_task.delay`/`AsyncResult(...).revoke(...)`）は`unittest.mock.patch`でモックする
  （テスト実行環境では`redis`コンテナが起動されないため、モックしない場合接続エラーになる）。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル | 参照 | テスト上の要注意点 |
|---|---|---|
| `BaseSetting` | `models.py:48-72` | `name`は`unique=True`。シリアライザ・ViewSet・URLが一切存在せず、Django管理画面からのみ操作可能。モデル単体でのみテスト可能。 |
| `CsvColumnMapping` | `models.py:75-115` | `(data_type, csv_header)`、`(data_type, model_field_name)`に`unique_together`。シリアライザの`Meta.validators = []`（bulk-save用にUniqueTogetherValidatorを無効化する目的）が標準CRUDにも適用されてしまっていた（既知の懸念事項1参照、修正済み）。 |
| `ModelDisplaySetting` | `models.py:118-165` | `(data_type, model_field_name)`に`unique_together`。`CsvColumnMapping`と同様の`validators = []`問題があった（修正済み）。 |
| `QrCodeAction` | `models.py:168-228` | `name`は`unique=True`。`ACTION_TYPE_CHOICES`は現在`"regex"`のみだが、クラスdocstringには削除済みの`"script"`タイプの説明が残ったまま（既知の懸念事項3）。 |
| `AsyncTask` | `models.py:231-261` | `task_id`は`unique=True`。シリアライザ・ViewSet・URLは存在せず、`CsvColumnMappingViewSet`の内部処理からのみ生成・参照される。モデル単体でのみテスト可能。 |

## 4. 既存自動テストの状況

`base`には`tests.py`も`tests/`パッケージも一切**存在しなかった**（他の6アプリは全て`tests/`パッケージを
持つ中、`base`のみテストがゼロの状態だった）。本書はこのギャップを埋めることを主目的とする。

## 5. テストケース一覧

### 5.1 アプリ情報・ヘルスチェック（`base/tests/test_app_info_health.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-INFO-01 | 正常系 | `GET base/info/` | - | 未認証で呼び出し | 200、`{"version": ...}` | `AllowAny` |
| BASE-INFO-02 | 正常系 | `GET base/health/` | - | 未認証で呼び出し | 200、`{"status": "ok"}` | `AllowAny` |

### 5.2 モデルフィールド定義取得（`ModelFieldsView`、`base/tests/test_model_fields.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-MODELFIELDS-01 | 正常系 | `GET base/model-fields/?data_type=item` | 管理者 | 取得 | 200、`master.Item`のフィールド一覧 | |
| BASE-MODELFIELDS-02 | 異常系 | `GET base/model-fields/` | 管理者 | `data_type`未指定 | 400 | |
| BASE-MODELFIELDS-03 | 異常系 | `GET base/model-fields/?data_type=customer` | 管理者 | 取得 | 400（`Invalid data_type`） | 既知の不具合：`customer`は`models.DATA_TYPE_CHOICES`上は正式な選択肢だが、`api.py`内のローカルマッピングに含まれていない |
| BASE-MODELFIELDS-04 | 異常系 | `GET base/model-fields/` | 未認証 | 呼び出し | 401 | |
| BASE-MODELFIELDS-05 | 異常系 | `GET base/model-fields/` | 一般ユーザー | 呼び出し | 403 | `IsAdminUser` |

### 5.3 CSV列マッピング CRUD（`CsvColumnMappingViewSet`、`base/tests/test_csv_column_mapping.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-CSVMAP-01 | 正常系 | `GET csv-mappings/` | 管理者 | 一覧取得 | 200、プレーンな配列（`CustomSuccessMessageMixin`不使用） | |
| BASE-CSVMAP-02 | 正常系 | `POST csv-mappings/` | 管理者 | 有効なデータで作成 | 201 | |
| BASE-CSVMAP-03 | 異常系 | `POST csv-mappings/` | `(data_type, csv_header)`重複、管理者 | 作成 | 400 | 【修正済み】以前は未処理の`IntegrityError`（500）だった |
| BASE-CSVMAP-04 | 正常系 | `PATCH csv-mappings/{id}/` | 管理者 | `order`を更新 | 200 | |
| BASE-CSVMAP-05 | 正常系 | `DELETE csv-mappings/{id}/` | 管理者 | 削除 | 204 | 標準DRF形式（`master`/`quality`の200とは異なる） |
| BASE-CSVMAP-06 | 異常系 | `GET csv-mappings/` | 未認証 | 呼び出し | 401 | |
| BASE-CSVMAP-07 | 異常系 | `GET csv-mappings/` | 一般ユーザー | 呼び出し | 403 | |

### 5.4 CSVテンプレート生成（`csv-template` action）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-CSVTEMPLATE-01 | 正常系 | `GET csv-mappings/csv-template/?data_type=item` | 一般ユーザー、有効なマッピングが存在 | 取得 | 200、`text/csv; charset=utf-8-sig`、BOM付きCSV | `IsAdminUser`から`IsAuthenticated`へ降格 |
| BASE-CSVTEMPLATE-02 | 異常系 | 同上 | 一般ユーザー | `data_type`未指定 | 400 | |
| BASE-CSVTEMPLATE-03 | 異常系 | 同上 | 未認証 | 呼び出し | 401 | |

### 5.5 CSVインポート・非同期タスク（`import-csv`/`csv-import-status`/`csv-import-cancel`、Celeryはモック）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-IMPORTCSV-01 | 正常系 | `POST csv-mappings/import-csv/?data_type=item` | 一般ユーザー | CSVファイルをmultipartで送信（`import_csv_task.delay`をモック） | 202、`task_id`、`AsyncTask`がDBに作成される | `IsAdminUser`から`IsAuthenticated`へ降格 |
| BASE-IMPORTCSV-02 | 異常系 | 同上 | 一般ユーザー | `data_type`未指定 | 400 | |
| BASE-IMPORTCSV-03 | 異常系 | 同上 | 一般ユーザー | `csv_file`未添付 | 400 | |
| BASE-TASKSTATUS-01 | 正常系 | `GET csv-import-status/{task_id}/` | 一般ユーザー、`AsyncTask`が存在 | 取得 | 200、`status`/`progress`等 | |
| BASE-TASKSTATUS-02 | 異常系 | 同上 | 一般ユーザー | 存在しない`task_id` | 404 | |
| BASE-TASKSTATUS-03 | 正常系 | `POST csv-import-cancel/{task_id}/` | 一般ユーザー、`PENDING`状態の`AsyncTask`（`AsyncResult`をモック） | キャンセル | 200、`AsyncTask.status`が`REVOKED`に変わる | |
| BASE-TASKSTATUS-04 | 異常系 | 同上 | 一般ユーザー、`SUCCESS`状態の`AsyncTask` | キャンセル | 400（既に完了済み） | |

### 5.6 CSV列マッピング一括保存（`bulk-save` action）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-CSVBULK-01 | 正常系 | `POST csv-mappings/bulk-save/?data_type=item` | 管理者、既存マッピングが存在 | 新しいマッピング一覧で一括保存 | 200、既存分は削除され新しい内容に置き換わる | `csv_template`等とは異なりダウングレード対象外（`IsAdminUser`のまま） |
| BASE-CSVBULK-02 | 異常系 | 同上 | 一般ユーザー | 呼び出し | 403 | |

### 5.7 QRコードアクション CRUD・実行（`QrCodeActionViewSet`、`base/tests/test_qr_code_action.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-QRACTION-01 | 正常系 | `GET qr-code-actions/` | 管理者 | 一覧取得 | 200、プレーンな配列 | |
| BASE-QRACTION-02 | 正常系 | `POST qr-code-actions/` | 管理者 | 有効なデータで作成 | 201 | |
| BASE-QRACTION-03 | 異常系 | `POST qr-code-actions/` | `name`重複、管理者 | 作成 | 400 | |
| BASE-QRACTION-04 | 正常系 | `GET qr-code-actions/?is_active=false` | 有効・無効混在、管理者 | フィルタ取得 | 200、無効なもののみ | `filterset_fields = ["is_active"]` |
| BASE-QRACTION-05 | 正常系 | `DELETE qr-code-actions/{id}/` | 管理者 | 削除 | 204 | |
| BASE-QRACTION-06 | 異常系 | `GET qr-code-actions/` | 未認証 | 呼び出し | 401 | |
| BASE-QRACTION-07 | 異常系 | `GET qr-code-actions/` | 一般ユーザー | 呼び出し | 403 | |
| BASE-QREXEC-01 | 正常系 | `POST qr-code-actions/execute/` | 一般ユーザー、パターンに一致する有効なアクションが存在 | `qr_data`を送信 | 200、`{"status": "success", "action_name": ..., "result": ...}` | `IsAuthenticated`へ降格 |
| BASE-QREXEC-02 | 異常系 | 同上 | 一般ユーザー、一致するアクションなし | 送信 | 404 | |
| BASE-QREXEC-03 | 異常系 | 同上 | 一般ユーザー | `qr_data`未指定 | 400 | |
| BASE-QREXEC-04 | 異常系 | 同上 | 未認証 | 送信 | 401 | |

### 5.8 モデル項目表示設定 CRUD・verbose_name解決（`ModelDisplaySettingViewSet`、`base/tests/test_model_display_setting.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| BASE-MDS-01 | 正常系 | `GET model-display-settings/` | 管理者 | 一覧取得 | 200、プレーンな配列 | |
| BASE-MDS-02 | 正常系 | `POST model-display-settings/` | 管理者 | `data_type="item"`, `model_field_name="name"` | 201、`verbose_name`が実モデルのフィールドから解決される | `get_verbose_name()` |
| BASE-MDS-03 | 異常系 | `POST model-display-settings/` | `(data_type, model_field_name)`重複、管理者 | 作成 | 400 | 【修正済み】以前は未処理の`IntegrityError`（500）だった |
| BASE-MDS-04 | 境界値 | `POST model-display-settings/` | 管理者 | `data_type="goods_receipt"`, `model_field_name="remaining_quantity"` | 201、`verbose_name`が「残数量」（ハードコードされたフォールバック） | 実モデルフィールドに存在しないプロパティ用の特殊分岐 |
| BASE-MDS-05 | 境界値 | `POST model-display-settings/` | 管理者 | `data_type="inventory"`, `model_field_name="available_quantity"` | 201、`verbose_name`が「利用可能数」 | 同上 |
| BASE-MDS-06 | 正常系 | `DELETE model-display-settings/{id}/` | 管理者 | 削除 | 204 | |
| BASE-MDS-07 | 異常系 | `GET model-display-settings/` | 未認証 | 呼び出し | 401 | |
| BASE-MDS-08 | 異常系 | `GET model-display-settings/` | 一般ユーザー | 呼び出し | 403 | |
| BASE-MDSBULK-01 | 正常系 | `POST model-display-settings/bulk-save/?data_type=item` | 管理者、既存設定が存在 | 一括保存 | 200、既存分は削除され新しい内容に置き換わる | |
| BASE-MDSBULK-02 | 異常系 | 同上 | 一般ユーザー | 呼び出し | 403 | |

### 5.9 API未実装モデルの単体テスト（`base/tests/test_models.py`）

| ケースID | 分類 | 対象 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| BASE-SETTING-01 | 正常系 | `BaseSetting.__str__` | 作成 | `name`を返す | API未実装のためモデル単体でのみ検証可能 |
| BASE-SETTING-02 | 異常系 | `BaseSetting` | `name`重複で作成 | `IntegrityError` | |
| BASE-ASYNCTASK-01 | 正常系 | `AsyncTask.__str__` | 作成 | `task_name`/`task_id`を含む文字列 | |
| BASE-ASYNCTASK-02 | 異常系 | `AsyncTask` | `task_id`重複で作成 | `IntegrityError` | |

## 6. シリアライザの read_only_fields 確認

| ケースID | 分類 | 対象 | 内容 |
|---|---|---|---|
| - | 正常系 | `CsvColumnMappingSerializer` | `read_only_fields = ["data_type_display"]`（`get_data_type_display`のCharField、`data_type`自体は書き込み可能）。 |
| - | 正常系 | `QrCodeActionSerializer` | `read_only_fields = ["id"]`のみ。他のフィールドは全て更新時も書き込み可能（`master`各モデルの`code`系フィールドのような更新時read_only化はない）。 |
| - | 正常系 | `ModelDisplaySettingSerializer` | 明示的な`read_only_fields`はなし。`verbose_name`は`SerializerMethodField`のため常にAPI応答専用（書き込み不可）。 |

## 7. 既知の懸念事項

コードレビューおよび自動テスト作成の過程で判明した実装上の懸念点。

1. **【修正済み・2026-07-23】`CsvColumnMappingSerializer`/`ModelDisplaySettingSerializer`の`Meta.validators = []`が標準CRUDにも適用され、重複データ登録時に未処理の500エラーになっていた**:
   両シリアライザとも「bulk-save時にUniqueTogetherValidatorを無効化するため」というコメント付きで
   `validators = []`が設定されていたが（`serializers.py:27`, `69`）、この設定はシリアライザクラス全体に
   適用されるため、`bulk_save`アクションだけでなく標準の`POST csv-mappings/`・`POST model-display-settings/`
   （通常のcreate/update）でも同時にUniqueTogetherValidatorが無効化されてしまっていた。その結果、
   重複データを通常のCRUD経由で登録しようとすると、DRFのバリデーションで400を返す代わりに
   `django.db.utils.IntegrityError`が未処理のまま500として露出することを自動テスト作成中に発見した
   （BASE-CSVMAP-03, BASE-MDS-03で実際に500になることを確認済み）。ユーザーへの確認の上、
   `base/api.py`に`IntegrityErrorAsBadRequestMixin`を追加し、`CsvColumnMappingViewSet`・
   `ModelDisplaySettingViewSet`の`create()`/`update()`で`IntegrityError`を捕捉して400のバリデーション
   エラーに変換するよう修正した（`master`/`quality`の`ProtectedError`ハンドリングと同様のパターン）。
   `bulk_save`アクション自体の挙動（`validators=[]`により重複チェックをスキップして`bulk_create`する）は
   変更していない。
2. **`base`アプリ自体には`@property`のORM誤用バグ・`__init__.py`欠落・migrations欠落のいずれも見つからなかった**:
   `production`/`master`で発見された`__init__.py`欠落、`machine`で発見された`migrations/`ディレクトリ自体の
   欠落のいずれも`base`には存在しない（`base`はプロジェクトのルート設定パッケージのため`migrations/`は
   最初から適切に存在する）。
3. **`QrCodeAction`モデルのdocstringが古い**:
   `models.py:168-178`のクラスdocstringは「正規表現で判定 (regex)」「スクリプトで判定 (script)」の
   2種類のアクションタイプを説明しているが、`ACTION_TYPE_CHOICES`（`models.py:180-182`）は
   マイグレーション`0014_remove_qrcodeaction_script_qrcodeaction_action_name_and_more.py`で`script`型と
   その関連フィールドが削除されて以降、`"regex"`のみとなっている。ドキュメントの整合性の問題であり、
   動作への影響はない。修正は行っていない。
4. **`api.py`内のローカル`DATA_TYPE_MODEL_MAPPING`が`models.py`の同名辞書と内容が食い違っている**:
   `models.py:28-45`のマッピングには`customer`/`work_center`/`unit_cost`が含まれるが`inventory`/
   `stock_movement`が欠けており、逆に`api.py:23-38`のローカル辞書には`inventory`/`stock_movement`が
   含まれるが`customer`/`work_center`/`unit_cost`が欠けている。この結果、`ModelFieldsView`
   （`api.py`の辞書を使用）は`data_type=customer`等で400になり（BASE-MODELFIELDS-03として実際に確認・
   記録した）、逆に`import_csv_task`（`models.py`の辞書を使用、`tasks.py:12`経由）は
   `data_type=inventory`/`stock_movement`のCSVインポートで`AttributeError`になりうる
   （`tasks.py:28`、`model_string.split(".")`を`None`に対して呼び出すため）。後者はCeleryタスク内部の
   処理であり本書のAPIテスト範囲外だが、影響として記録しておく。2つの辞書を統合する修正は
   本書のテスト作成の範囲を超えるため、今回は現状の挙動を確認・記録するに留めた。
5. **フロントエンドのCSVインポート呼び出しとバックエンドAPIの不一致（要フロントエンド側の確認）**:
   `frontend/src/services/importService.ts`は`POST /api/base/csv-import/`・
   `GET /api/base/async-tasks/{taskId}/`を呼んでいるように見えるが、`base/api_urls.py`にはそのような
   パスは存在せず、実際のエンドポイントは`POST /api/base/csv-mappings/import-csv/`・
   `GET /api/base/csv-import-status/{pk}/`である。また送信するmultipartのフィールド名も
   フロントエンドは`file`だがバックエンドは`request.FILES.get("csv_file")`を読む。バックエンドAPIの
   実装自体は正しく動作することを本書のテスト（BASE-IMPORTCSV-*）で確認済みだが、フロントエンドの
   CSVインポート画面が実際にこの経路を使っているかは別途確認が必要（本書はバックエンドAPIのみを
   対象とするため、フロントエンド側の修正要否はユーザー側の判断に委ねる）。
6. **`QrCodeActionViewSet.execute_action`が呼び出すアクション関数は仮実装**:
   `action_mark_as_received`/`action_update_inventory`（`api.py:275-282`）はいずれもQRデータをそのまま
   返すだけの仮実装であり、実際の在庫・入庫データへの反映は行われない。本書のテスト
   （BASE-QREXEC-01）はディスパッチ（正規表現マッチ・アクション呼び出し自体）の検証に留めている。
