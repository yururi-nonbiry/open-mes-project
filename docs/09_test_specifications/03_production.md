# テスト仕様書: 生産管理 (production)

## 1. 対象範囲

`backend/src/production` アプリが提供するAPI（DRF `ModelViewSet`）を対象とする。

- 対象: 生産計画 (`ProductionPlan`)、生産計画の所要部品 (`ProductionPlanMaterial`)、使用部品 (`PartsUsed`、旧来の部品構成)、材料引当 (`MaterialAllocation`)、
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
| `ProductionPlan` | `models.py` | `status` choices: `PENDING`/`IN_PROGRESS`/`COMPLETED`/`ON_HOLD`/`CANCELLED`。`product`はItem(製品・中間品)へのFK(`to_field="code"`)。`production_plan`(文字列)は旧来`PartsUsed`と紐付けていたBOM識別子で、現在は業務処理から参照しない。 |
| `ProductionPlanMaterial` | `models.py` | 計画ごとの所要部品。`(production_plan, material)`に一意制約。計画作成時にBOMマスターの直下の子品目がコピーされ(`signals.py`)、計画数量の変更で`required_quantity`(1個あたり×計画数量の切り上げ)を再計算、製品の変更でコピーし直す。 |
| `PartsUsed` | `models.py` | 旧来の部品構成(文字列のBOM識別子単位)。所要部品は`ProductionPlanMaterial`に移行済み(マイグレーション0010)で、業務処理からは参照しない。 |
| `MaterialAllocation` | `models.py` | `status` choices: `ALLOCATED`/`ISSUED`/`RETURNED`。`allocation_type`: `NORMAL`(所要量に対する引当)/`ADDITIONAL`(歩留まり・ロス等の追加出庫。即時ISSUED、所要量の消化に数えず、完了取消でも戻さない)。 |
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
| PP-REQ-01 | 正常系 | `required-parts` | 計画に所要部品(`ProductionPlanMaterial`)が登録済み | GET | 200、`part_code`/`quantity_per_unit`/`required_quantity`/`inventory_quantity`/`already_allocated_quantity`/`additional_issued_quantity`/`warehouses`を含む配列 | |
| PP-REQ-02 | 境界値 | `required-parts` | 計画に所要部品が1件もない | GET | 200、空配列 | |
| PP-REQ-03 | 正常系 | `required-parts` | 部品の在庫が複数倉庫にあり、一方は全量引当済み | GET | `warehouses`は引当可能数の多い順で、引当可能数0の倉庫は含まない | 倉庫は引当時に選ぶ |
| PP-REQ-04 | 正常系 | `required-parts` | 部品の在庫が複数倉庫にある | GET | `inventory_quantity`は全倉庫の引当可能数の合計 | |
| PP-REQ-05 | 正常系 | `required-parts` | 通常引当・返却済み引当・追加出庫が混在 | GET | `already_allocated_quantity`は通常引当(返却済みを除く)のみ、`additional_issued_quantity`は追加出庫分 | |
| PP-REQ-06 | 境界値 | `required-parts` | 該当`Inventory`が`is_active=False`または`is_allocatable=False` | GET | `inventory_quantity`に含まれない | |

### 5.3 資材引当 `allocate-materials`（`POST plans/{id}/allocate-materials/`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-ALLOC-01 | 正常系 | `allocate-materials` | 十分な在庫が存在 | 1件の引当リクエスト | 200、`Inventory.reserved`加算、`MaterialAllocation`(status=ALLOCATED)作成、内部`SalesOrder`(`INT-`prefix)作成 | 2026-07-22 `material_code`プロパティ誤用によるFieldErrorを修正済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |
| PP-ALLOC-02 | 正常系 | `allocate-materials` | 計画の所要部品が登録済みで、所要数量以内 | 引当リクエスト | 200 | |
| PP-ALLOC-03 | 異常系 | `allocate-materials` | 既存引当+今回要求が所要数量を超過(同一リクエスト内の重複行を含む。返却済みは数えない: 03b/03c) | 引当リクエスト | 400、`Inventory.reserved`は変更されない（トランザクションロールバック） | |
| PP-ALLOC-03d | 異常系 | `allocate-materials` | 計画の所要部品に含まれない部品 | 引当リクエスト | 400(所要量を超える分・構成外の部品は追加出庫または構成の編集で扱う) | |
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

旧来の部品構成。所要部品は`ProductionPlanMaterial`に移行済みで、画面からは削除した(APIのみ残存)。

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
| PSS-04 | 正常系 | `GET parts-supply-simulation/` | 不足部品の`Item.lead_time_days`に7を設定し、計画開始日時を現在時刻とする | `plan_ids=<id>` | 200、`parts`側の`lead_time_days=7`、`order_by_date`=`shortage_date - 7日`、期限が既に過去のため`order_overdue=True` | 不足発生日からリードタイム分を遡った「発注要否期限」を算出する |
| PSS-05 | 正常系 | `GET parts-supply-simulation/` | `lead_time_days`未設定（デフォルト0）の部品が、計画開始日時30日後の計画で不足 | `plan_ids=<id>` | 200、`lead_time_days=0`、`order_by_date`が`shortage_date`と一致、`order_overdue=False` | リードタイム0日の場合は不足発生日＝発注要否期限になる |

| PSS-06 | 正常系 | `GET parts-supply-simulation/` | 共通部品の在庫が2倉庫に分かれ(合計8)、2計画がそれぞれ5必要 | `plan_ids=<id1>,<id2>` | 200、所要部品は倉庫を持たないため全倉庫合算で判定し、後の計画が不足2で`feasible=False` | |
| PSS-07 | 正常系 | `GET parts-supply-simulation/` | 所要5に対し追加出庫5のみ、在庫3 | `plan_ids=<id>` | 200、追加出庫は所要量の消化に数えないため不足2 | |
| PSS-08 | 正常系 | `GET parts-supply-simulation/` | 中間品の在庫0、開始前日に終わる中間品の生産計画(20、対象外) | 中間品20を使う計画のみ指定 | 200、`feasible=True`、`incoming_quantity=20`、`incoming_plans`に生産計画 | 対象に選ばない生産予定も数える |
| PSS-09 | 異常系 | `GET parts-supply-simulation/` | 開始後に終わる生産計画、保留中の生産計画 | 同上 | 200、どちらも数えず不足20 | |
| PSS-10 | 正常系 | `GET parts-supply-simulation/` | 在庫0、計画A(5)→生産予定10入荷→計画B(5) | A・Bを指定 | Aは不足、Bは生産可能、部品の不足数量5 | 入荷分はまず不足の穴埋めに充てる |
| PSS-11 | 正常系 | `GET parts-supply-simulation/` | 入荷見込みの生産計画自身が材料不足 | 両計画を指定 | 使う側は生産可能だが`incoming_plans[].at_risk=True` | |

### 5.9 生産計画の所要部品（`ProductionPlanMaterialViewSet`・`signals.py`、`production/tests/test_plan_materials.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-MAT-SNAP-01 | 正常系 | 計画作成 | 製品に材料(1.5)・中間品(2)、中間品に材料のBOMあり | 計画数量3で作成 | 所要部品は直下の2件のみ、材料は1.5×3=4.5→切り上げ5、中間品6 | 2階層目は含めない |
| PP-MAT-SNAP-02 | 正常系 | 計画更新 | 同上 | 計画数量を10に変更 | 所要数量を再計算(15) | |
| PP-MAT-SNAP-03 | 正常系 | 計画更新 | 計画の構成を編集済み | 計画名のみ変更 | 編集内容は保持される | |
| PP-MAT-SNAP-04 | 正常系 | 計画更新 | - | 製品を変更 | 新しい製品のBOMでコピーし直す | |
| PP-MAT-SNAP-05 | 正常系 | `POST plans/` | 中間品のBOMあり | 中間品を製品として計画作成 | 201、所要部品は中間品のBOMから作られる | |
| PP-MAT-SNAP-06 | 異常系 | `PATCH plans/{id}/` | 通常引当あり | 製品を変更 | 400(`errors.product_code`) | |
| PP-MAT-SNAP-07 | 正常系 | `PATCH plans/{id}/` | 通常引当あり | 同じ製品コードと計画名を送信 | 200 | |
| PP-MAT-01 | 正常系 | `GET plan-materials/?production_plan_id=` | 複数計画に所要部品あり | 一覧取得 | 対象計画の分のみ、部品名を含む | |
| PP-MAT-02 | 正常系 | `POST plan-materials/` | - | 1個あたり0.25で追加(計画数量10) | 201、`required_quantity=3` | |
| PP-MAT-03 | 異常系 | `POST plan-materials/` | 同じ部品が登録済み | 追加 | 400(`errors.material_code`) | |
| PP-MAT-04 | 異常系 | `POST plan-materials/` | - | 製品(材料・中間品以外)を部品に指定 | 400 | |
| PP-MAT-04b | 異常系 | `POST plan-materials/` | 中間品の計画 | 中間品自身を部品に指定 | 400 | |
| PP-MAT-05 | 異常系/正常系 | `PATCH plan-materials/{id}/` | 8引当済み | 所要数量を5/8にする変更 | 5は400、8は200 | 引当済数量を下回れない |
| PP-MAT-06 | 異常系 | `DELETE plan-materials/{id}/` | 通常引当あり | 削除 | 400 | |
| PP-MAT-07 | 正常系 | `DELETE plan-materials/{id}/` | 返却済み引当のみ | 削除 | 204 | |
| PP-MAT-08 | 異常系 | `PATCH`/`DELETE plan-materials/{id}/` | 計画が完了済み | 変更・削除 | 400 | 完了・中止した計画の構成は固定 |
| PP-MAT-09 | 正常系 | `POST plans/{id}/reset-materials/` | BOMマスターが変わっている | 実行 | 200、BOMマスターの構成でコピーし直す | |
| PP-MAT-10 | 異常系 | `POST plans/{id}/reset-materials/` | 通常引当あり | 実行 | 400、構成は変わらない | |
| PP-MAT-MIG-01 | 正常系 | マイグレーション0010 | 同じBOM識別子を参照する2計画、同一部品のPartsUsedが2行 | 移行 | 各計画に合計数量(10)で1行作成、1個あたりは数量÷計画数量(小数3桁) | 部品未設定の行は無視 |
| PP-MAT-MIG-02 | 正常系 | マイグレーション0010 | 所要部品が既にある計画 | 移行 | 既存の構成を変えない | |

### 5.10 追加出庫（`POST plans/{id}/issue-additional-materials/`、`production/tests/test_additional_issue.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-ADDISSUE-01 | 正常系 | 追加出庫 | 在庫10のうち6が他で引当済み | 3を追加出庫 | 200、在庫7(引当6は不変)、`MaterialAllocation`(ADDITIONAL, ISSUED, 備考)と`StockMovement`(used)作成 | |
| PP-ADDISSUE-02 | 正常系 | 追加出庫後の引当 | 追加出庫済み | 所要数量10を全量引当 | 200 | 追加出庫は所要量の消化に数えない |
| PP-ADDISSUE-03 | 異常系 | 追加出庫 | 2件目が在庫不足 | 2件まとめて出庫 | 400、1件目もロールバック | |
| PP-ADDISSUE-04 | 異常系 | 追加出庫 | - | 所要部品に無い部品 | 400 | |
| PP-ADDISSUE-05 | 異常系 | 追加出庫 | - | 空・リスト以外・0・数値以外 | 400 | |
| PP-ADDISSUE-06 | 異常系 | 追加出庫 | 計画が中止 | 出庫 | 400 | |
| PP-ADDISSUE-07 | 正常系 | 完了の取消 | 追加出庫後に完了 | 完了→進行中 | 追加出庫はISSUEDのまま、在庫も戻らない | |
| PP-ADDISSUE-08 | 正常系 | `change-status` | 追加出庫済み | RETURNED | 200、在庫に戻る | 使わなかった分の返却 |

### 5.11 中間品の子計画（`services/intermediates.py`、`production/tests/test_intermediate_plans.py`）

構成: 製品 ← 中間品×2・材料×1 / 中間品(リードタイム2日) ← 材料×3

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PP-INT-01 | 正常系 | 計画作成 | 中間品の在庫なし | 計画数量10で作成 | 中間品20の子計画(親の開始日時に終了、2日前に開始、所要部品は材料60)、手配方法は子計画 | |
| PP-INT-02 | 正常系 | 計画作成 | 中間品の在庫15 | 同上 | 子計画は不足分の5 | |
| PP-INT-03 | 正常系 | `GET plans/{id}/intermediate-requirements/` | 中間品の在庫30 | 計画作成 | 子計画なし、`DECISION_REQUIRED`、見込み30、`pending_intermediate_count=1` | |
| PP-INT-04 | 正常系 | `POST plans/{id}/arrange-intermediates/` | 同上 | STOCK | 200、`COVERED`、`pending_intermediate_count=0` | |
| PP-INT-05 | 正常系 | `POST plans/{id}/arrange-intermediates/` | 同上 | CHILD_PLAN(数量省略)→CHILD_PLAN(4) | 20の子計画を作成、数量を指定すれば追加で作れる | |
| PP-INT-06 | 異常系 | `POST plans/{id}/arrange-intermediates/` | 作成後に在庫が5に減った | STOCK | 400 | 見込みが足りない場合は在庫を選べない |
| PP-INT-07 | 正常系 | 計画作成 | 在庫30、先に始まる計画が20使う | 後の計画を作成 | 子計画は10 | 先の計画の未引当の所要数を差し引く |
| PP-INT-08 | 正常系 | 計画作成 | 開始前に終わる中間品の生産計画(20) | 計画作成 | 子計画なし、`DECISION_REQUIRED` | 他の生産予定も見込みに数える |
| PP-INT-09 | 正常系 | 計画作成 | 中間品が別の中間品を使う | 計画作成 | 孫計画が子計画の開始日時に終わるよう作られる | 多階層 |
| PP-INT-10 | 正常系 | `PATCH plans/{id}/` | 在庫30 | 計画数量を20に変更 | 不足分10の子計画を作成 | |
| PP-INT-11 | 正常系 | `POST plan-materials/` | 在庫のない中間品 | 部品構成に追加 | 子計画を作成 | |
| PP-INT-12 | 異常系 | `POST plans/{id}/arrange-intermediates/` | - | 空・部品構成に無い品目・不正な手配方法・数量0・数値以外、完了した計画 | 400、子計画は作られない | |
| PP-INT-13 | 正常系 | `PATCH plans/{id}/` | 中間品20の子計画あり | 計画数量を6に変更 | 子計画は12(所要部品は36)に減る | |
| PP-INT-14 | 正常系 | `PATCH plans/{id}/` | 在庫15、子計画5 | 計画数量を8→5に変更 | 子計画は1に減り、次に中止。手配方法は未決定に戻り `DECISION_REQUIRED` | |
| PP-INT-15 | 正常系 | 計画の中止 | 未着手の子計画(孫計画あり)と進行中の子計画 | 親を中止 | 未着手の子計画・孫計画は中止、進行中の子計画は残る | |
| PP-INT-16 | 正常系 | `DELETE plan-materials/{id}/` | 中間品の子計画あり | 部品構成から中間品を削除 | 子計画は中止 | |
| PP-INT-17 | 正常系 | 計画作成 | 先に始まる計画の所要20を子計画で賄う(子計画の終了は後の計画の開始より後)、在庫20 | 後の計画を作成 | 子計画なし、見込み20 | 他の計画の子計画はその計画専用とみなす |
| PP-INT-18 | 正常系 | 計画作成 | 先に始まる計画の所要20に対し子計画が25 | 後の計画を作成 | 見込み5、子計画は15 | 所要数を超える子計画の余りは見込みに数える |

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
2. **【修正済み・2026-09-27】`inventory.Inventory`に対する`.get()`が単一ロケーション前提**（PP-MLOC-01〜04）:
   `inventory/services.py`に切り出した共通ヘルパー(`lock_inventory_rows`/`reserve_fifo`/`consume_stock`/
   `add_stock`)を使い、引当・引当解除・出庫(change-status)・生産完了時の材料消費/復元・完成品の計上/取消の
   すべてで、同一品番+倉庫の複数棚を入庫が古い順に扱うよう修正した。完成品の減算(完了取消・完了数量の減少)は
   受注が引き当てている分を減らさない。以下は修正前の記述。

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
4. **【修正済み・2026-09-27】`update_progress`の例外処理での`print`使用**（`logger.exception`に置き換え済み）:
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
