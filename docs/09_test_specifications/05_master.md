# テスト仕様書: マスタ管理 (master)

## 1. 対象範囲

`backend/src/master` アプリが提供するAPI（DRF `ModelViewSet`、`master/rest_views.py`）を対象とする。

- 対象: 品目 (`Item`)、サプライヤー (`Supplier`)、倉庫 (`Warehouse`)、倉庫ロケーション (`WarehouseLocation`)、
  顧客 (`Customer`)、ワークセンター (`WorkCenter`)、標準単価 (`UnitCost`) の各エンドポイントと、
  共通の応答整形・削除時のエラーハンドリングを行う `CustomSuccessMessageMixin`。
- **範囲外（他アプリの責務）**:
  - `master`の各モデルは`code`/`warehouse_number`/`supplier_number`等の業務キーを`to_field`とする文字列FKで
    `inventory`/`production`から広く参照されているが、その参照側の整合性・カスケード挙動は各アプリの範囲
    （[01_inventory.md](./01_inventory.md), [03_production.md](./03_production.md)参照）。
  - `master/urls.py`は空（`api_urls.py`に委譲済み）、`master/views.py`も空で対象外。
  - CSVインポート機能はフロントエンド（`frontend/src/pages/DataImport.tsx`）が本アプリの標準CRUD APIを
    1行ずつ呼び出す形で実装されており、バックエンド側に専用のインポートAPI・バルク処理ロジックは
    存在しないため、既存CRUDエンドポイントのテストでカバーされる。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh master`
- テストクラスは`rest_framework.test.APITestCase`を使用し、`reverse("master_api:<basename>-list"/"-detail")`で
  URL解決する。
- 全ViewSetの`permission_classes`は`[IsAuthenticated]`で統一されており、staff/superuser等の権限区分はない。
- `CustomSuccessMessageMixin`により、list/retrieve/create/updateのレスポンスは標準のDRF形式ではなく
  `{"status": "success", "data": ...}`（list時は`"data"`が配列）でラップされる。またページネーションは
  設定されておらず(`list()`が独自実装で`paginate_queryset`を呼ばない)、`"data"`は常に全件のプレーンな配列。
- `master/migrations/0007_ensure_test_stub_data.py`により、テストDBにも`Item("TEST-PROD-001")`,
  `Item("TEST-PART-001")`, `Warehouse("WH-001")`, `Warehouse("FG-MAIN")`が事前投入されるため、
  テストヘルパーで同じコードを使う場合は`get_or_create`等で衝突を避ける必要がある
  （本アプリのテストでは別コードを使うことで回避）。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル | 参照 | テスト上の要注意点 |
|---|---|---|
| `Item` | `models.py:6-39` | `code`/`name`ともに`unique=True`。`item_type`(product/material)、`provision_type`(paid/free/none, default="none")は`choices`。`default_warehouse`/`default_location`は実FKではない単なる文字列フィールド。`UnitCost`から`on_delete=PROTECT`で参照されるため削除時に`ProtectedError`が起こりうる。 |
| `Supplier` | `models.py:43-55` | `supplier_number`は`unique=True`（DB制約）。`name`/`email`はDB制約としてはユニークではなく、シリアライザの`validate_name`/`validate_email`でのみ重複防止（`inventory.PurchaseOrder`等から`supplier_number`をto_field参照）。 |
| `Warehouse` | `models.py:59-68` | `id`はUUIDv7主キー。`warehouse_number`は`unique=True`。`layout_cols`/`layout_rows`はレイアウト機能用でデフォルト20。`WarehouseLocation`から`on_delete=CASCADE`で参照されるため削除するとロケーションも道連れで消える（`ProtectedError`にはならない）。 |
| `WarehouseLocation` | `models.py:72-94` | `(warehouse, code)`に`UniqueConstraint`。`code`は`inventory.Inventory.location`の文字列と一致させる運用（DBレベルでの整合性保証はない）。 |
| `Customer` | `models.py:98-105` | `code`は`unique=True`。 |
| `WorkCenter` | `models.py:109-116` | `code`は`unique=True`。 |
| `UnitCost` | `models.py:120-140` | `item`は`Item`へ`to_field="code"`のFK、`on_delete=PROTECT`。`(item)`に`UniqueConstraint`（1品目1単価）。 |

## 4. 既存自動テストの状況

`master/tests.py`は空（コメントのみ）だった。7モデル全てのCRUD・バリデーション・削除時の
`ProtectedError`ハンドリングについて自動テストが**存在しなかった**。本書はこのギャップを埋めることを
主目的とする。

## 5. テストケース一覧

### 5.1 品目 CRUD（`ItemViewSet`、`master/tests/test_item.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-ITEM-01 | 正常系 | `GET items/` | Itemが存在 | 一覧取得 | 200、`item_type`/`provision_type`は表示名（`get_..._display`） | list専用の`ItemSerializer` |
| MST-ITEM-02 | 正常系 | `POST items/` | - | 有効なデータで作成 | 201、DBに反映 | |
| MST-ITEM-03 | 異常系 | `POST items/` | `code`重複 | 作成 | 400（`code`にUniqueValidatorエラー） | |
| MST-ITEM-04 | 異常系 | `POST items/` | `name`重複 | 作成 | 400（`name`にUniqueValidatorエラー） | |
| MST-ITEM-05 | 境界値 | `PATCH items/{id}/` | 既存Itemが存在 | `code`を変更しようとする | 200だが`code`は変化しない | 更新時`read_only`化（`get_fields`）、他アプリからのFK整合性保護のため |
| MST-ITEM-06 | 正常系 | `PATCH items/{id}/` | 既存Itemが存在 | `name`を更新 | 200、DBに反映 | |
| MST-ITEM-07 | 正常系 | `DELETE items/{id}/` | 参照されていないItem | 削除 | 200、DBから削除 | |
| MST-ITEM-08 | 異常系 | `DELETE items/{id}/` | `UnitCost`から参照されている | 削除 | 400、`{"status": "error", ...}`、DBに残存 | `ProtectedError`を`CustomSuccessMessageMixin.destroy`が捕捉 |
| MST-ITEM-09 | 異常系 | `GET items/` | 未認証 | 呼び出し | 401 | |

### 5.2 サプライヤー CRUD（`SupplierViewSet`、`master/tests/test_supplier.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-SUP-01 | 正常系 | `POST suppliers/` | - | 有効なデータで作成 | 201 | |
| MST-SUP-02 | 異常系 | `POST suppliers/` | `supplier_number`重複 | 作成 | 400（DB制約＋UniqueValidator） | |
| MST-SUP-03 | 異常系 | `POST suppliers/` | `name`重複 | 作成 | 400（`validate_name`によるアプリケーションレベルの重複チェック） | DB制約ではない |
| MST-SUP-04 | 異常系 | `POST suppliers/` | `email`重複 | 作成 | 400（`validate_email`） | |
| MST-SUP-05 | 境界値 | `POST suppliers/` | - | `email`を省略 | 201（`allow_blank`/`allow_null`） | |
| MST-SUP-06 | 境界値 | `PATCH suppliers/{id}/` | 既存Supplierが存在 | `supplier_number`を変更しようとする | 200だが変化しない | 更新時`read_only`化 |
| MST-SUP-07 | 正常系 | `PATCH suppliers/{id}/` | 既存Supplierが存在 | 自分自身の既存`email`と同じ値でPATCH | 200（自分自身は重複チェックから除外） | `validate_email`が`exclude(pk=self.instance.pk)`しているため |

### 5.3 倉庫 CRUD（`WarehouseViewSet`、`master/tests/test_warehouse.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-WH-01 | 正常系 | `POST warehouses/` | - | `layout_cols`/`layout_rows`を省略して作成 | 201、デフォルト値20/20が設定される | |
| MST-WH-02 | 異常系 | `POST warehouses/` | `warehouse_number`重複 | 作成 | 400 | |
| MST-WH-03 | 境界値 | `PATCH warehouses/{id}/` | 既存Warehouseが存在 | `warehouse_number`を変更しようとする | 200だが変化しない | 更新時`read_only`化 |
| MST-WH-04 | 正常系 | `PATCH warehouses/{id}/` | 既存Warehouseが存在 | `layout_cols`/`layout_rows`を更新 | 200、DBに反映 | 倉庫レイアウト機能用 |
| MST-WH-05 | 正常系 | `DELETE warehouses/{id}/` | 紐づく`WarehouseLocation`が存在 | 削除 | 200、`WarehouseLocation`も連鎖削除される | `on_delete=CASCADE`（`ProtectedError`にはならない） |

### 5.4 倉庫ロケーション CRUD（`WarehouseLocationViewSet`、`master/tests/test_warehouse_location.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-WHLOC-01 | 正常系 | `GET warehouse-locations/` | 複数倉庫にロケーションが存在 | 一覧取得 | 200、全件 | |
| MST-WHLOC-02 | 正常系 | `GET warehouse-locations/?warehouse=WH-A` | 複数倉庫にロケーションが存在 | 倉庫番号でフィルタ | 200、指定倉庫の分のみ | `get_queryset`によるカスタムフィルタ |
| MST-WHLOC-03 | 正常系 | `POST warehouse-locations/` | 対象倉庫が存在 | 有効なデータで作成 | 201、`warehouse`は`warehouse_number`のSlugRelatedFieldで解決 | |
| MST-WHLOC-04 | 異常系 | `POST warehouse-locations/` | 同一倉庫内に同じ`code`が既存 | 作成 | 400（`UniqueTogetherValidator`） | |
| MST-WHLOC-05 | 正常系 | `POST warehouse-locations/` | 別倉庫に同じ`code`が既存 | 作成 | 201（倉庫が異なれば同じ棚番でも許容） | |
| MST-WHLOC-06 | 異常系 | `POST warehouse-locations/` | - | 存在しない`warehouse_number`を指定 | 400（`SlugRelatedField`の解決失敗） | |
| MST-WHLOC-07 | 正常系 | `DELETE warehouse-locations/{id}/` | 既存ロケーションが存在 | 削除 | 200、DBから削除 | |

### 5.5 顧客 CRUD（`CustomerViewSet`、`master/tests/test_customer.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-CUST-01 | 正常系 | `POST customers/` | - | 有効なデータで作成 | 201 | |
| MST-CUST-02 | 異常系 | `POST customers/` | `code`重複 | 作成 | 400 | |
| MST-CUST-03 | 境界値 | `PATCH customers/{id}/` | 既存Customerが存在 | `code`を変更しようとする | 200だが変化しない | 更新時`read_only`化 |
| MST-CUST-04 | 正常系 | `DELETE customers/{id}/` | 既存Customerが存在 | 削除 | 200、DBから削除 | |

### 5.6 ワークセンター CRUD（`WorkCenterViewSet`、`master/tests/test_work_center.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-WC-01 | 正常系 | `POST work-centers/` | - | 有効なデータで作成 | 201 | |
| MST-WC-02 | 異常系 | `POST work-centers/` | `code`重複 | 作成 | 400 | |
| MST-WC-03 | 境界値 | `PATCH work-centers/{id}/` | 既存WorkCenterが存在 | `code`を変更しようとする | 200だが変化しない | 更新時`read_only`化 |
| MST-WC-04 | 正常系 | `DELETE work-centers/{id}/` | 既存WorkCenterが存在 | 削除 | 200、DBから削除 | |

### 5.7 標準単価 CRUD（`UnitCostViewSet`、`master/tests/test_unit_cost.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MST-UC-01 | 正常系 | `POST unit-costs/` | 対象Itemが存在 | 有効なデータで作成 | 201、`item`は`code`のSlugRelatedFieldで解決 | |
| MST-UC-02 | 異常系 | `POST unit-costs/` | 同一Itemに対する`UnitCost`が既存 | 作成 | 400（`UniqueValidator`、1品目1単価） | |
| MST-UC-03 | 異常系 | `POST unit-costs/` | - | 存在しない`item`コードを指定 | 400 | |
| MST-UC-04 | 正常系 | `PATCH unit-costs/{id}/` | 既存UnitCostが存在 | `cost`を更新 | 200、DBに反映 | |
| MST-UC-05 | 正常系 | `GET unit-costs/` | UnitCostが存在 | 一覧取得 | 200、`item`は品目コード文字列で表示 | |
| MST-UC-06 | 正常系 | `DELETE unit-costs/{id}/` | 既存UnitCostが存在 | 削除 | 200、DBから削除 | |

## 6. シリアライザの read_only_fields 確認

| ケースID | 分類 | 対象 | 内容 |
|---|---|---|---|
| MST-ITEM-05（兼） | 正常系 | `ItemCreateUpdateSerializer` | `get_fields`により、更新時のみ`code`が`read_only`になる（他アプリからのFK整合性保護） |
| MST-SUP-06（兼） | 正常系 | `SupplierCreateUpdateSerializer` | `get_fields`により、更新時のみ`supplier_number`が`read_only`になる |
| MST-WH-03（兼） | 正常系 | `WarehouseCreateUpdateSerializer` | `get_fields`により、更新時のみ`warehouse_number`が`read_only`になる |
| MST-CUST-03（兼） | 正常系 | `CustomerCreateUpdateSerializer` | `get_fields`により、更新時のみ`code`が`read_only`になる |
| MST-WC-03（兼） | 正常系 | `WorkCenterCreateUpdateSerializer` | `get_fields`により、更新時のみ`code`が`read_only`になる |

## 7. 既知の懸念事項

コードレビューおよび自動テスト作成の過程で判明した実装上の懸念点。

1. **【修正済み・2026-07-23】`master/__init__.py`が欠落していた**:
   `inventory`/`production`/`users`アプリには存在する`__init__.py`が`master`アプリのみ欠落していた
   （`ls backend/src/master/`で直接確認）。Django自体のアプリロードはPython 3の名前空間パッケージ機構で
   動作してしまうため気付きにくいが、[03_production.md 既知の懸念事項](./03_production.md#7-既知の懸念事項)
   と同様、Djangoのテストランナー(`DiscoverRunner.find_top_level()`)がトップレベルパッケージの判定を誤り、
   相対importを使うテストモジュールの検出が壊れる原因になる。`touch backend/src/master/__init__.py`で修正。
2. **`master`アプリ自体には`@property`のORM誤用バグは見つからなかった**:
   `inventory`/`production`で複数回発見された「モデルの`@property`（`part_code`等）を`.filter()`/`.values()`に
   誤って渡してしまい`FieldError`になる」という不具合パターンについて確認したが、`master/models.py`には
   `@property`が一切定義されておらず（該当プロパティは参照元の`inventory`/`production`側に存在する）、
   `master/rest_views.py`・`master/serializers.py`内のクエリはいずれも実カラムのみを参照しており、
   該当する不具合は見つからなかった。
3. **`Warehouse`/`Item`等の削除時、`inventory`/`production`側の参照整合性は本アプリのテスト範囲外**:
   `UnitCost`（`master`アプリ内）は`on_delete=PROTECT`のため削除時に適切に400へ変換されることを確認済み
   （MST-ITEM-08）が、`inventory.Inventory`/`production.ProductionPlan`等、他アプリから`to_field`でこれらの
   マスタを参照しているモデルの`on_delete`設定次第では、`master`単体のテストでは再現できない削除時エラーが
   実運用で発生しうる。クロスアプリの整合性検証は今後の課題（[03_production.md 既知の懸念事項2](./03_production.md#7-既知の懸念事項)
   と同様、対応要否はユーザー側の運用方針次第）。
