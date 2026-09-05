# テスト仕様書: 生産管理 (production)

## 1. 対象範囲

`backend/src/production` アプリが提供するAPI（DRF `ModelViewSet`）を対象とする。

- 対象: 生産計画 (`ProductionPlan`)、使用部品 (`PartsUsed`)、材料引当 (`MaterialAllocation`)、
  作業進捗 (`WorkProgress`) の各エンドポイントおよび付随するカスタムアクション（`production/rest_views.py`）と、
  それらが委譲するサービス層（`production/services/allocation.py`, `progress.py`, `queries.py`）。
  複数の生産計画を横断する部品供給シミュレーション (`PartsSupplySimulationView`, `GET parts-supply-simulation/`)
  および委譲先の`production/services/simulation.py`も対象に含む。
- **範囲外（他アプリの責務）**:
  - 在庫 (`inventory.Inventory`) 自体のCRUD・`move`/`adjust`/`allocate`/`issue` アクションは `inventory` アプリの範囲
    （[01_inventory.md](./01_inventory.md)参照）。本アプリのサービス層は `inventory.Inventory` を直接
    `select_for_update()` して `reserved`/`quantity` を更新するため、`inventory` 側のロック粒度・整合性への
    影響を本書 [7. 既知の懸念事項](#7-既知の懸念事項) に注記する。
  - 品目・倉庫等のマスタデータのCRUDは `master` アプリの範囲。
- 画面遷移用の非APIビュー（`production/views/`, `production/urls.py`）は対象外。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh production`
- テストクラスは `rest_framework.test.APITestCase` を使用し、`reverse("production_api:<url_name>")` でURL解決する。
- 認証: 全ViewSetが `permission_classes = [IsAuthenticated]`。2026-09-05以前は認証設定がコメントアウトされ
  実質`AllowAny`になっていたが、修正済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照）。テストでは
  `force_authenticate`を使用する。
- 関連モデル（`master.Item`, `master.Warehouse`, `inventory.Inventory`, `inventory.SalesOrder`）のテストデータ作成が前提となる。
- `settings.DEFAULT_FINISHED_GOODS_WAREHOUSE`（デフォルト `"FG-MAIN"`）を完成品入庫先として使用するため、
  テストではこの倉庫番号で `Warehouse`/`Inventory` を用意する。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル | 参照 | テスト上の要注意点 |
|---|---|---|
| `ProductionPlan` | `models.py:9-67` | `status` choices: `PENDING`/`IN_PROGRESS`/`COMPLETED`/`ON_HOLD`/`CANCELLED`。`product_code`はItem(`item_type="product"`)への疑似FK。`production_plan`(文字列)は`PartsUsed.production_plan`と紐付けるBOM識別子で、モデル自身の主キーとは別物（紛らわしい命名）。 |
| `PartsUsed` | `models.py:70-138` | `production_plan`は`ProductionPlan`へのFKではなく**文字列**（BOM識別子）。`part`はItem(`item_type="material"`)。`warehouse_rel`は任意（null許容）。 |
| `MaterialAllocation` | `models.py:141-204` | `status` choices: `ALLOCATED`/`ISSUED`/`RETURNED`。`production_plan`は`ProductionPlan`への実FK（`PartsUsed`とは異なる）。`material`/`warehouse_rel`は`part_number`/`warehouse`と同様の`@property`実装（`material_code`/`warehouse`）。 |
| `WorkProgress` | `models.py:207-253` | `status` choices: `NOT_STARTED`/`IN_PROGRESS`/`COMPLETED`/`PAUSED`。`(production_plan, process_step)`に一意制約。`update_production_progress_service`は常に`process_step="Overall Plan Progress"`で`get_or_create`する。 |

## 4. 既存自動テストの状況

`production/tests.py` は空（コメントのみ）。カスタムアクション（`required-parts`/`allocate-materials`/
`update-progress`/`change-status`）、標準CRUD、サービス層のいずれについても自動テストが**存在しない**。
本書はこのギャップを埋めることを主目的とする。

## 5. テストケース一覧

### 5.1 生産計画 CRUD・検索（`ProductionPlanViewSet` 標準機能）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-CRUD-01 | 正常系 | `GET plans/` | 複数件のProductionPlanが存在 | 一覧取得 | 200、`results`に全件含まれる | |
| PP-CRUD-02 | 正常系 | `POST plans/` | Item(`item_type="product"`)が存在 | 有効なデータで作成 | 201、DBにレコード作成 | |
| PP-CRUD-03 | 異常系 | `POST plans/` | - | `planned_start_datetime >= planned_end_datetime` | 400（シリアライザ`validate`） | |
| PP-CRUD-04 | 正常系 | `PATCH plans/{id}/` | 既存のPlanが存在 | `remarks`のみ更新 | 200、他フィールドは不変 | |
| PP-CRUD-05 | 異常系 | `PATCH plans/{id}/` | 既存のPlanが存在 | `planned_start_datetime`のみ更新して既存`planned_end_datetime`以降にする | 400（instanceの既存値とのクロスバリデーション） | |
| PP-CRUD-06 | 正常系 | `GET plans/?plan_name=...` | 複数件存在 | 部分一致検索 | 200、一致する件のみ | `icontains` |
| PP-CRUD-07 | 正常系 | `GET plans/?status__in=PENDING,COMPLETED` | 複数ステータスのPlanが存在 | 複数値OR検索 | 200、該当ステータスのみ | `CharInFilter` |
| PP-CRUD-08 | 正常系 | `GET plans/?ordering=product_code` | 複数Planが存在 | `product_code`でソート指定 | 200、`product`へ変換されエラーにならない | 2026-07-22 `query_params`直接代入によるAttributeErrorを修正済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |
| PP-CRUD-09 | 正常系 | `GET plans/?planned_start_datetime_after=...&planned_start_datetime_before=...` | 複数Planが存在 | 期間検索 | 200、範囲内のみ | |

### 5.2 必要部品リスト取得 `required-parts`（`GET plans/{id}/required-parts/`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-REQ-01 | 正常系 | `required-parts` | `PartsUsed`が紐づく`production_plan`識別子でBOMが定義済み | GET | 200、`part_code`/`required_quantity`/`inventory_quantity`/`already_allocated_quantity`等を含む配列 | 2026-07-22 `part_code`プロパティ誤用によるFieldErrorを修正済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |
| PP-REQ-02 | 境界値 | `required-parts` | `production_plan`(文字列識別子)が未設定、またはBOMが1件もない | GET | 200、空配列 | |
| PP-REQ-03 | 正常系 | `required-parts` | `PartsUsed.warehouse`が指定されている | GET | `inventory_quantity`は指定倉庫のみの在庫数（他倉庫は無視） | |
| PP-REQ-04 | 正常系 | `required-parts` | `PartsUsed.warehouse`が未指定(null) | GET | `inventory_quantity`は全倉庫合計 | |
| PP-REQ-05 | 正常系 | `required-parts` | 同一部品に対し`MaterialAllocation`が既に存在 | GET | `already_allocated_quantity`に引当済数量が反映される | |
| PP-REQ-06 | 境界値 | `required-parts` | 該当`Inventory`が`is_active=False`または`is_allocatable=False` | GET | `inventory_quantity`に含まれない（クエリ側で`is_active=True, is_allocatable=True`に絞込） | |

### 5.3 資材引当 `allocate-materials`（`POST plans/{id}/allocate-materials/`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-ALLOC-01 | 正常系 | `allocate-materials` | 十分な在庫が存在 | 1件の引当リクエスト | 200、`Inventory.reserved`加算、`MaterialAllocation`(status=ALLOCATED)作成、内部`SalesOrder`(`INT-`prefix)作成 | 2026-07-22 `material_code`プロパティ誤用によるFieldErrorを修正済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |
| PP-ALLOC-02 | 正常系 | `allocate-materials` | BOM(`PartsUsed`)が定義済みで、必要数量以内 | 引当リクエスト | 200 | |
| PP-ALLOC-03 | 異常系 | `allocate-materials` | BOM定義済みで、既存引当+今回要求がBOM必要数量を超過 | 引当リクエスト | 400、`Inventory.reserved`は変更されない（トランザクションロールバック） | |
| PP-ALLOC-04 | 異常系 | `allocate-materials` | 対象`Inventory`が存在しない | 引当リクエスト | 400 | |
| PP-ALLOC-05 | 異常系 | `allocate-materials` | `Inventory.is_active=False`または`is_allocatable=False` | 引当リクエスト | 400 | |
| PP-ALLOC-06 | 異常系 | `allocate-materials` | `available_quantity`が要求数量未満 | 引当リクエスト | 400 | |
| PP-ALLOC-07 | 異常系 | `allocate-materials` | 複数件のリクエストのうち1件が失敗 | `allocations`に2件、片方のみ在庫不足 | 400、成功したはずの1件目分も含めて`reserved`は元に戻る（`transaction.atomic`） | |
| PP-ALLOC-08 | 異常系 | `allocate-materials` | - | `allocations`が空リスト/リスト以外 | 400 | |
| PP-ALLOC-09 | 境界値 | `allocate-materials` | - | `quantity_to_allocate=0`または負数 | 0はスキップ（エラーにならず何も処理されない）、負数はエラーメッセージに追加され400 | サービス内で`<=0`はcontinue、`<0`のみエラー追加という非対称な扱い（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |

### 5.4 進捗更新 `update-progress`（`POST plans/{id}/update-progress/`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-PROG-01 | 正常系 | `update-progress` | Plan.status=PENDING | `status=IN_PROGRESS` | 200、`plan.actual_start_datetime`設定、`WorkProgress`(process_step="Overall Plan Progress")作成、status=IN_PROGRESS | |
| PP-PROG-02 | 正常系 | `update-progress` | Plan.status=IN_PROGRESS、完成品`Inventory`未作成 | `status=COMPLETED, good_quantity=10` | 200、完成品`Inventory`が`get_or_create`され`quantity+=10`、`StockMovement`(PRODUCTION_OUTPUT)作成、`WorkProgress.quantity_completed=10` | |
| PP-PROG-03 | 異常系 | `update-progress` | Plan.status=IN_PROGRESS | `status=COMPLETED`（`good_quantity`省略） | 400 | |
| PP-PROG-04 | 異常系 | `update-progress` | - | `good_quantity + defective_quantity > actual_quantity` | 400 | |
| PP-PROG-05 | 正常系 | `update-progress` | Plan.status=IN_PROGRESS、`MaterialAllocation`(ALLOCATED)が存在 | `status=COMPLETED` | 200、対象`MaterialAllocation`がISSUEDに変化、`Inventory.quantity`/`reserved`減算、`StockMovement`(used)作成、内部`SalesOrder`がshipped | 初回完了時のみ実行 |
| PP-PROG-06 | 正常系 | `update-progress` | Plan.status=COMPLETED（完了済み、quantity_completed=10） | 再度`status=COMPLETED, good_quantity=15`（差分再報告） | 200、完成品`Inventory.quantity`は差分(+5)のみ加算、資材は再消費されない（既にISSUED） | `adjustment = new - previous`ロジック |
| PP-PROG-07 | 正常系 | `update-progress` | Plan.status=COMPLETED（quantity_completed=10、資材消費済み） | `status=ON_HOLD` | 200、完成品在庫が10分減算(逆仕訳、`PRODUCTION_REVERSAL`)、消費済み材料が`ALLOCATED`に復元(`quantity`/`reserved`加算、内部SO=pending)、`WorkProgress`各種フィールドが0/Noneにリセット | COMPLETED離脱時の逆仕訳 |
| PP-PROG-08 | 異常系 | `update-progress` | Plan.status=COMPLETED、逆仕訳に必要な完成品在庫が既に減少・不足 | `status=ON_HOLD` | 400（`_reverse_inventory`が`ValueError`） | |
| PP-PROG-09 | 正常系 | `update-progress` | Plan.status=IN_PROGRESS | `status=CANCELLED` | 200、`plan.actual_end_datetime`設定、`WorkProgress.status=PAUSED` | |
| PP-PROG-10 | 異常系 | `update-progress` | - | `status`未指定 | 400 | |
| PP-PROG-11 | 正常系 | `update-progress` | Plan.status=ON_HOLD | `status=PENDING` | 200、`WorkProgress.status=NOT_STARTED` | |

### 5.5 使用部品 CRUD（`PartsUsedViewSet`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PU-CRUD-01 | 正常系 | `GET parts-used/` | 複数件存在 | 一覧取得 | 200、`-used_datetime`降順 | |
| PU-CRUD-02 | 正常系 | `GET parts-used/?production_plan=...` | 複数のBOM識別子が混在 | 部分一致検索 | 200、一致する件のみ | |
| PU-CRUD-03 | 正常系 | `GET parts-used/?part_code=...` | 複数部品が混在 | 部分一致検索 | 200、一致する件のみ | |
| PU-CRUD-04 | 正常系 | `POST parts-used/` | Item(`item_type="material"`)が存在 | 有効なデータで作成 | 201 | |

### 5.6 材料引当 CRUD・削除・ステータス変更（`MaterialAllocationViewSet`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MA-CRUD-01 | 正常系 | `GET material-allocations/` | 複数件存在 | 一覧取得 | 200 | |
| MA-CRUD-02 | 正常系 | `GET material-allocations/?production_plan_id=...` | 複数Planの引当が混在 | フィルタ | 200、一致する件のみ | |
| MA-CRUD-03 | 正常系 | `PATCH material-allocations/{id}/` | 既存の引当が存在 | `status`を直接書き換え | `status`は`read_only_fields`のため無視され変化しない（200だがstatus不変） | change-status経由でのみ変更可能という設計 |
| MA-DEL-01 | 正常系 | `DELETE material-allocations/{id}/` | status=ALLOCATED | 削除 | 204、`Inventory.reserved`が引当数量分解放、内部`SalesOrder`がcanceled、レコード削除 | |
| MA-DEL-02 | 異常系 | `DELETE material-allocations/{id}/` | status=ISSUED | 削除 | 400、レコードは削除されない | |
| MA-DEL-03 | 異常系 | `DELETE material-allocations/{id}/` | status=RETURNED | 削除 | 400 | |
| MA-STATUS-01 | 正常系 | `change-status` | status=ALLOCATED、在庫十分 | `status=ISSUED` | 200、`Inventory.quantity`/`reserved`減算、`StockMovement`(used)作成、内部SO=shipped | |
| MA-STATUS-02 | 異常系 | `change-status` | status=ALLOCATED、`Inventory.quantity`が引当数量未満 | `status=ISSUED` | 400 | 手動で`Inventory.quantity`のみ減らして人為的に不整合を作る |
| MA-STATUS-03 | 正常系 | `change-status` | status=ISSUED | `status=RETURNED` | 200、`Inventory.quantity`加算(`reserved`は変化しない)、`StockMovement`(incoming)作成、内部SO=canceled | 引当解除済みのためreservedは戻さない仕様 |
| MA-STATUS-04 | 異常系 | `change-status` | status=ALLOCATED | `status=RETURNED`（許可されない遷移） | 400 | |
| MA-STATUS-05 | 異常系 | `change-status` | - | `status`未指定 | 400 | |
| MA-STATUS-06 | 異常系 | `change-status` | `allocation.warehouse`が未設定 | `status=ISSUED` | 400 | |

### 5.7 作業進捗 CRUD（`WorkProgressViewSet`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| WP-CRUD-01 | 正常系 | `GET work-progress/` | 複数件存在 | 一覧取得 | 200 | |
| WP-CRUD-02 | 正常系 | `GET work-progress/?production_plan_id=...` | 複数Planの進捗が混在 | フィルタ | 200、一致する件のみ | |
| WP-CRUD-03 | 正常系 | `GET work-progress/?operator_id=...` | 複数作業者の進捗が混在 | フィルタ | 200、一致する件のみ | |
| WP-CRUD-04 | 異常系 | `POST work-progress/` | 同一`(production_plan, process_step)`が既存 | 重複作成 | 400（`IntegrityError`起因、DRFの一意制約バリデーション） | |
| WP-CRUD-05 | 異常系 | `POST work-progress/` | - | `start_datetime >= end_datetime` | 400（シリアライザ`validate`） | |
| WP-CRUD-06 | 正常系 | `PATCH work-progress/{id}/` | 既存レコードが存在 | `status`/`quantity_completed`を直接書き換え | `read_only_fields`のため無視され変化しない | `update-progress`経由でのみ変更可能という設計 |

### 5.8 部品供給シミュレーション（`PartsSupplySimulationView`、`production/tests/test_parts_supply_simulation.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PSS-01 | 正常系 | `GET parts-supply-simulation/` | 単独計画で必要数量が在庫内に収まる | `plan_ids=<id>` | 200、当該計画の`feasible=True`、`shortage_quantity=0` | |
| PSS-02 | 異常系 | `GET parts-supply-simulation/` | 共通部品を必要とする2計画があり、在庫が両方を賄えない | `plan_ids=<id1>,<id2>` | 200、開始日時が後の計画が`feasible=False`、`limiting_parts`に不足部品・不足数量、`parts`側にも`shortage_quantity`/`shortage_plan_id`が記録される | 開始日時が早い計画が優先的に充足される |
| PSS-03 | 正常系 | `GET parts-supply-simulation/` | 対象部品に`MaterialAllocation`（引当済み）が既に存在 | `plan_ids=<id>` | 200、`feasible=True`（引当済み分は`Inventory.reserved`側で加味され、不足として扱われない） | |

## 6. シリアライザの read_only_fields 確認

| ケースID | 分類 | 対象 | 内容 |
|---|---|---|---|
| SER-01 | 正常系 | `MaterialAllocationSerializer` | `status`/`status_display`/`production_plan_name`がPATCHで無視されること |
| SER-02 | 正常系 | `WorkProgressSerializer` | `status`/`quantity_completed`/`actual_reported_quantity`/`defective_reported_quantity`がPATCHで無視されること |
| SER-03 | 正常系 | `ProductionPlanSerializer` | `status_display`がPATCHで無視されること |

## 7. 既知の懸念事項

コードレビューおよび自動テスト作成の過程で判明した実装上の懸念点。項目1・7は自動テストで実際の失敗として
再現され、**2026-07-22に修正済み**。項目2〜6はコードレビューによる推測または軽微な仕様上の
非対称性であり、現時点では未修正。

1. **【修正済み・2026-07-22】`PartsUsed`/`MaterialAllocation`に対するクエリで`@property`名を使用しており
   常に`FieldError`が発生していた**:
   `inventory`アプリで発見したものと全く同じ「Djangoモデルの`@property`（`part_code`/`material_code`等）は
   `_meta`の実フィールドではないため`QuerySet`の`.values()`/`.values_list()`/`.filter()`では解決できない」
   という不具合が、本アプリのサービス層に4箇所存在し、いずれも自動テスト作成時に実際の失敗として発見した。
   - `production/services/allocation.py`の`allocate_materials_service`: 既存引当集計
     `.values('material_code')` → `allocate-materials`アクションが**常に**（対象データの有無に関わらず）
     500エラーになっていた（PP-ALLOC-01〜07, 09, 09b全滅）。`material_id`に修正。
   - `production/services/queries.py`の`get_production_plan_required_parts`: 3箇所
     （`values_list("part_code", ...)`、`MaterialAllocation`の`material_code__in`フィルタと`.values("material_code")`）。
     `PartsUsed`が1件でも存在する生産計画に対して`required-parts`が必ず500エラーになっていた
     （PP-REQ-01, 03〜06）。いずれも`part_id`/`material_id`に修正。
   - あわせて、`rest_views.py`の`ProductionPlanViewSet.filter_queryset`が
     `self.request.query_params = params`と読み取り専用プロパティへ直接代入しており、
     `ordering=product_code`（または`-product_code`）を指定すると`AttributeError`で500になっていた
     （PP-CRUD-08）。`self.request._request.GET = params`（内部のQueryDictを直接書き換え）に修正。
   - 修正後、`script/run_tests.sh production`で全59件成功を確認済み（[reports/production.md](./reports/production.md)）。
     レポートは実行のたびに同一ファイルへ上書きされる方式のため、修正前の失敗内容の個別スナップショットは
     現在は保持していない。
2. **`inventory.Inventory`に対する`.get()`が単一ロケーション前提**:
   `production/services/allocation.py`（`allocate_materials_service`, `release_material_allocation_service`,
   `update_material_allocation_status_service`）と`progress.py`（`_reverse_inventory`,
   `_adjust_inventory_for_completion`, `_consume_materials_for_plan`, `_restore_materials_for_plan`）は、いずれも
   `Inventory.objects.select_for_update().get(part_number_rel_id=..., warehouse_rel_id=...)`（または`get_or_create`）
   という、品番+倉庫のみを条件にした単一行取得を行っている。これは[01_inventory.md 既知の懸念事項2](./01_inventory.md#7-既知の懸念事項)
   で対応した「同一品番+倉庫内で棚番(location)が複数存在する」ケースと全く同じ前提の不備であり、
   同一品番・倉庫に複数ロケーションの`Inventory`行が存在する場合は`Inventory.MultipleObjectsReturned`が
   送出される（`allocate_materials_service`は広い`try/except`を持たないため未処理のまま伝播し500、
   他の関数も同様に未捕捉）。
   - 現時点では本アプリのAPIはロケーションという概念をリクエストに持たないため、`inventory`側で行った
     「Option B: 複数ロケーションにまたがる消費に対応」と同様の対応が必要かはユーザー側の運用方針次第。
   - 対応が必要になった場合は、[01_inventory.md](./01_inventory.md)の`allocate`/`issue`実装
     （`rest_views.py`の`.filter(...).order_by(F("first_received_at").asc(nulls_last=True), "location")`
     による複数ロケーション消費ロジック）を参考にできる。
3. **`allocate_materials_service`の数量バリデーションの非対称性**（PP-ALLOC-09）:
   `quantity_to_allocate <= 0`は無条件で`continue`（無視）されるが、負数の場合のみ`errors`に追加されて
   最終的に400になる。0は「エラーにも成功にもならず単に無視される」という紛らわしい仕様。
4. **`update_progress`の例外処理での`print`使用**:
   `rest_views.py`の`update_progress`アクションは、想定外の例外を`print(traceback.format_exc())`で標準出力に
   出しているのみで、`logging`モジュールを使っていない（他のアクション・サービス層は`logger.error`等を使用）。
   本番環境でのログ収集の一貫性という観点で改善余地あり。
5. **`_consume_materials_for_plan`/`_restore_materials_for_plan`のエラー処理粒度**:
   `_consume_materials_for_plan`は対象の`MaterialAllocation`を`for`ループで処理し、個々の`Inventory.DoesNotExist`
   は`logger.error`のみでスキップして処理を継続する（＝一部の材料が消費されないまま`status=COMPLETED`が
   確定しうる）。一方、在庫不足時は`ValueError`を送出しトランザクション全体がロールバックされる、という
   挙動の非対称性がある。意図的な設計か要確認。
7. **【修正済み・2026-09-05】`ProductionPlanViewSet`/`PartsUsedViewSet`/`MaterialAllocationViewSet`/`WorkProgressViewSet`の
   `permission_classes`がコメントアウトされ、未認証でアクセス可能だった**:
   4つのViewSet全てで認証設定が無効化されており、DRFのデフォルト（`AllowAny`）が適用された結果、
   未認証のリクエストでも生産計画・使用部品・材料引当・作業進捗のCRUDおよびカスタムアクションが
   実行できてしまっていた。`permission_classes = [IsAuthenticated]`を有効化して修正済み。
