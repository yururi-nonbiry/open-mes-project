# テスト仕様書: 在庫管理 (inventory)

## 1. 対象範囲

`backend/src/inventory` アプリが提供するAPI（DRF `ModelViewSet`/`ReadOnlyModelViewSet`）を対象とする。

- 対象: 在庫 (`Inventory`)、入庫予定 (`PurchaseOrder`)、入庫実績 (`Receipt`)、出庫予定 (`SalesOrder`)、
  入出庫履歴 (`StockMovement`) の各エンドポイント（`inventory/rest_views.py`）。
- **範囲外（他アプリの責務）**:
  - 倉庫レイアウト（`WarehouseLocation`）自体のCRUDは `master` アプリの範囲。本書では「レイアウト情報を参照して
    在庫を可視化する」`location-map` / `by-location` アクションのみを対象とする。
  - 資材引当のステータス変更・解除（`MaterialAllocation`）は `production` アプリの範囲。ただし
    `production/services/allocation.py` が `inventory.Inventory` を直接 `select_for_update()` して
    `reserved`/`quantity` を更新するため、他アプリからの整合性への影響は本書 [7. 既知の懸念事項](#7-既知の懸念事項) に注記する。
- 画面遷移用の非APIビュー（`views.py`, `urls.py`, `forms.py`）は実装が空のため対象外。

## 2. 前提・テスト環境

- 実行コマンド: `docker compose exec -it open_mes python3 manage.py test inventory`
- テストクラスは `rest_framework.test.APITestCase` を使用し、`reverse("inventory_api:<url_name>")` でURL解決する。
- 認証: 全ViewSetが `IsAuthenticated`。テストでは `self.client.force_authenticate(user=...)` を使用する。
- 関連モデル（`master.Item`, `master.Warehouse`, `master.WarehouseLocation`, `master.Supplier`）のテストデータ作成が前提となる。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル | 参照 | テスト上の要注意点 |
|---|---|---|
| `Inventory` | `models.py:10-76` | `available_quantity` は `is_active`/`is_allocatable` が False なら常に0。`(part_number, warehouse, location)` に一意制約あり。`quantity`/`reserved` はシリアライザで read_only（move/adjust/process-receipt経由のみ更新想定）。 |
| `PurchaseOrder` | `models.py:144-244` | `status` choices は `pending`/`partially_received`/`fully_received`/`canceled` のみ。`remaining_quantity = quantity - received_quantity`。 |
| `Receipt` | `models.py:248-285` | `purchase_order` へ `on_delete=PROTECT`。Receiptが存在するPOは削除不可。 |
| `SalesOrder` | `models.py:289-347` | `status` choices は `pending`/`shipped`/`canceled`。`remaining_quantity = quantity - shipped_quantity`。 |
| `StockMovement` | `models.py:80-140` | `movement_type` choices: `incoming`/`outgoing`/`used`/`PRODUCTION_OUTPUT`/`PRODUCTION_REVERSAL`/`adjustment`。 |

## 4. 既存自動テストの状況

`inventory/tests.py`（91行）には以下のみ実装済み。カスタムアクション（`move`/`adjust`/`by-location`/`process-receipt`/
`distinct-values`/`location-map`/`allocate`/`issue`）のテストは**存在しない**。本書はこのギャップを埋めることを主目的とする。

- `InventoryAPITests`: 一覧取得、詳細取得、品番フィルタ
- `PurchaseOrderAPITests`: 一覧取得、作成、発注番号重複エラー、削除

> 備考: 既存の `PurchaseOrderAPITests` のセットアップデータ（`po2`）は `status="received"` を設定しているが、
> 現行モデルの choices には `received` が存在しない（正しくは `partially_received`/`fully_received`）。
> 新規テスト作成時にこの値を踏襲しないよう注意する。

## 5. テストケース一覧

### 5.1 在庫 CRUD・検索（`InventoryViewSet` 標準機能）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| INV-CRUD-01 | 正常系 | `GET inventories/` | 在庫2件以上登録済み | 一覧取得 | 200、登録件数が返る | 既存テストあり |
| INV-CRUD-02 | 正常系 | `GET inventories/{id}/` | 在庫1件登録済み | 詳細取得 | 200、対象データが返る | 既存テストあり |
| INV-CRUD-03 | 正常系 | `GET inventories/?part_number_query=` | 品番の異なる在庫複数件 | 部分一致文字列で絞り込み | 200、一致する件のみ返る | 既存テストあり（`icontains`） |
| INV-CRUD-04 | 正常系 | `GET inventories/?warehouse_query=` | 倉庫の異なる在庫複数件 | 部分一致文字列で絞り込み | 200、一致する件のみ返る | |
| INV-CRUD-05 | 正常系 | `GET inventories/?location_query=` | 棚番の異なる在庫複数件 | 部分一致文字列で絞り込み | 200、一致する件のみ返る | |
| INV-CRUD-06 | 正常系 | `GET inventories/?hide_zero_stock_query=true` | `quantity<=reserved` の在庫と `quantity>reserved` の在庫が混在 | フィルタ指定で取得 | 200、`is_active=True`かつ`is_allocatable=True`かつ`quantity>reserved`の行のみ返る | `rest_views.py:83-102` |
| INV-CRUD-07 | 異常系 | `POST inventories/` | 同一 `(part_number, warehouse, location)` の在庫が既存 | 同組み合わせで新規作成 | 400（一意制約違反） | `models.py:70-76` |
| INV-CRUD-08 | 異常系 | `PATCH inventories/{id}/` | 在庫1件登録済み | `quantity`/`reserved` を直接変更するリクエスト | 200だが `quantity`/`reserved` は変更前の値のまま | read_only_fields のため無視されることを確認（`serializers.py`） |
| INV-CRUD-09 | 境界値 | `available_quantity` プロパティ | `is_active=False` または `is_allocatable=False` かつ `quantity>reserved` | 詳細取得 | `available_quantity=0` | `models.py:53-58` |

### 5.2 在庫移動 `move`（`POST inventories/{id}/move/`）

| ケースID | 分類 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| INV-MOVE-01 | 正常系 | 移動元在庫 `quantity=10, reserved=2` | `quantity_to_move=5, target_warehouse=倉庫B, target_location=A-01`（移動先未登録） | 200。移動元 `quantity=5`。移動先に新規 `Inventory`（`quantity=5`）が作成される。`StockMovement` が `outgoing`(移動元)/`incoming`(移動先) の2件記録される | `rest_views.py:122-215` |
| INV-MOVE-02 | 正常系 | 移動先に同一品番・倉庫・棚番の在庫が既存（`quantity=3`） | 上記と同条件で移動 | 200。移動先 `quantity` が加算される（3+5=8）、新規レコードは作成されない | |
| INV-MOVE-03 | 異常系 | 移動元 `quantity=10, reserved=8`（利用可能=2） | `quantity_to_move=5` | 400「利用可能在庫数(引当済みを除く)を超えています」。DB変更なし | |
| INV-MOVE-04 | 異常系 | - | `quantity_to_move` を数値変換できない値（例: `"abc"`） | 400「無効なリクエストデータです。」 | |
| INV-MOVE-05 | 異常系 | - | `target_warehouse` 未指定 | 400 | |
| INV-MOVE-06 | 異常系 | - | `quantity_to_move=0` または負数 | 400 | |
| INV-MOVE-07 | 正常系 | - | `target_location` 省略 | 空文字として扱われ処理継続 | 挙動確認のみ、エラーにならないこと |
| INV-MOVE-08 | 境界値 | 同時に2リクエストが同一在庫に対して move を実行 | 並行実行 | `select_for_update` によりロックされ、逐次的に整合性が保たれる（在庫数がマイナスにならない） | ロック検証（`transaction.atomic`） |

### 5.3 在庫調整 `adjust`（`POST inventories/{id}/adjust/`）

| ケースID | 分類 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| INV-ADJ-01 | 正常系 | `quantity=10, reserved=2` | `quantity=15` | 200。`quantity=15`。`StockMovement`（`incoming`, `quantity=5`, `description="在庫調整: 10 -> 15"`）が作成される | `rest_views.py:217-280` |
| INV-ADJ-02 | 正常系 | `quantity=10, reserved=2` | `quantity=7` | 200。`quantity=7`。`StockMovement`（`outgoing`, `quantity=3`）が作成される | |
| INV-ADJ-03 | 正常系 | `quantity=10` | `quantity=10`（変更なし） | 200。`StockMovement` は作成されない（diff=0） | |
| INV-ADJ-04 | 異常系 | `reserved=5` | `quantity=3`（reserved未満） | 400「調整後の数量は引当済数量以上である必要があります」 | |
| INV-ADJ-05 | 異常系 | - | `quantity` キー未指定 | 400 | |
| INV-ADJ-06 | 異常系 | - | `quantity` が数値変換不可 | 400 | |
| INV-ADJ-07 | 正常系 | - | `location` を併せて指定 | `location` が更新される | 未指定時は棚番が変更されないことも確認 |

### 5.4 棚番指定取得 `by-location`（`GET inventories/by-location/`）

| ケースID | 分類 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| INV-BYL-01 | 正常系 | 指定倉庫・棚番に `quantity>0` の在庫あり | `warehouse=...&location=...` | 200、該当在庫が返る | `rest_views.py:104-120` |
| INV-BYL-02 | 異常系 | - | `warehouse` 未指定 | 400 | |
| INV-BYL-03 | 境界値 | - | `location=""`（空文字） | `location is None` のみをチェックしているため空文字は許容され、`location=""` の在庫を検索する | 実装上の注意点として明記 |
| INV-BYL-04 | 正常系 | `quantity=0` の在庫が該当棚に存在 | 検索 | 結果に含まれない（`quantity__gt=0`） | |

### 5.5 入庫予定 CRUD・検索（`PurchaseOrderViewSet` 標準機能）

| ケースID | 分類 | 対象 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| PO-CRUD-01 | 正常系 | `GET purchase-orders/` | 2件以上登録済み | 一覧取得 | 200 | 既存テストあり |
| PO-CRUD-02 | 正常系 | `POST purchase-orders/` | - | 新規発注データ | 201 | 既存テストあり |
| PO-CRUD-03 | 異常系 | `POST purchase-orders/` | `order_number` が既存と重複 | 同一 `order_number` | 400、エラーキーに `order_number` を含む | 既存テストあり（`validate_order_number`） |
| PO-CRUD-04 | 正常系 | `DELETE purchase-orders/{id}/` | 紐づく `Receipt` なし | 削除 | 204 | 既存テストあり |
| PO-CRUD-05 | 異常系 | `DELETE purchase-orders/{id}/` | 紐づく `Receipt` が存在 | 削除 | 400「この発注は入庫実績が関連付けられているため削除できません。」（`ProtectedError`捕捉） | `rest_views.py:291-300`、未テスト |
| PO-CRUD-06 | 正常系 | `GET purchase-orders/?search_status=received` | `partially_received`/`fully_received` のPOが混在 | 検索 | 両ステータスのPOが返る（特殊OR分岐） | `rest_views.py:335-338`、未テスト |
| PO-CRUD-07 | 正常系 | `GET purchase-orders/?search_q=xxx` | 発注番号/品番/品名/仕入先名/item いずれかに一致するデータ | 横断検索 | 該当データが返る | モバイル向け検索、未テスト |
| PO-CRUD-08 | 正常系 | `GET purchase-orders/?search_order_date_from=...&search_order_date_to=...` | 発注日が異なるPO複数件 | 範囲検索 | 範囲内のみ返る | |
| PO-CRUD-09 | 正常系 | `GET purchase-orders/?search_expected_arrival_from=...&to=...` | 入荷予定日が異なるPO複数件 | 範囲検索 | 範囲内のみ返る。`expected_arrival`未設定分はソート時に最後尾 | |

### 5.6 入庫処理 `process-receipt`（`POST purchase-orders/process-receipt/`）

| ケースID | 分類 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| PO-RECV-01 | 正常系 | PO: `quantity=10, received_quantity=0`, 在庫未存在 | `purchase_order_id, received_quantity=10` | 200。`Receipt` 作成、`Inventory` 新規作成（`quantity=10`）、`StockMovement`(`incoming`, `reference_document="PO: <order_number>"`)作成、PO `received_quantity=10`・`status="fully_received"` | `rest_views.py:355-468`、未テスト |
| PO-RECV-02 | 正常系 | 同上、`received_quantity=6`（一部入庫） | `received_quantity=6` | 200。PO `status="partially_received"`、`received_quantity=6` | |
| PO-RECV-03 | 正常系 | PO-RECV-02実施後、追加で `received_quantity=4` | 2回目の入庫処理 | 200。累積 `received_quantity=10`、`status="fully_received"`（累積計算の確認） | |
| PO-RECV-04 | 正常系 | 対象品番・倉庫・棚番の在庫が既存 | 入庫処理 | 既存 `Inventory.quantity` に加算される（新規作成されない） | |
| PO-RECV-05 | 異常系 | - | `purchase_order_id` または `received_quantity` 未指定 | 400 | |
| PO-RECV-06 | 異常系 | - | `received_quantity` が0以下または数値変換不可 | 400 | |
| PO-RECV-07 | 異常系 | 存在しない `purchase_order_id` | 入庫処理 | 404（`PurchaseOrder.DoesNotExist`） | |
| PO-RECV-08 | 異常系 | PO `part_number_rel` 未設定 | 入庫処理 | 400「品番が設定されていないため入庫処理ができません」 | |
| PO-RECV-09 | 異常系 | PO `remaining_quantity=5` | `received_quantity=10` | 400（残数量超過） | |
| PO-RECV-10 | 正常系 | PO `warehouse_rel`/`location` 設定済み、リクエストで倉庫/棚番省略 | 入庫処理 | POのデフォルト倉庫/棚番が使用される | |
| PO-RECV-11 | 異常系 | PO・リクエスト双方に倉庫未指定 | 入庫処理 | 400「入庫倉庫が指定されていません」 | |

### 5.7 発注フィールド一覧取得 `distinct-values`（`GET purchase-orders/distinct-values/`）

| ケースID | 分類 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|
| PO-DIST-01 | 正常系 | `field=supplier`（CharField） | 200、null/空文字を除いたソート済みユニーク値一覧 | `rest_views.py:470-493`、未テスト |
| PO-DIST-02 | 異常系 | `field` 未指定 | 400 | |
| PO-DIST-03 | 異常系 | `field=quantity`（CharField以外） | 400（ホワイトリスト外） | |
| PO-DIST-04 | 異常系 | `field=nonexistent_field` | 400 | |

### 5.8 入庫実績 CRUD（`ReceiptViewSet`、標準CRUDのみ）

| ケースID | 分類 | 期待結果 | 備考 |
|---|---|---|---|
| RCP-CRUD-01 | 正常系 | 一覧取得（`-received_date`順）、`purchase_order`/`operator`のselect_related確認 | 未テスト |
| RCP-CRUD-02 | 正常系 | 詳細取得、作成、更新、削除の一連の標準CRUD | 未テスト |

### 5.9 出庫予定 CRUD・検索（`SalesOrderViewSet` 標準機能）

| ケースID | 分類 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|
| SO-CRUD-01 | 正常系 | `GET sales-orders/` | 200 | 未テスト |
| SO-CRUD-02 | 正常系 | `GET sales-orders/?search_order_number=` | 部分一致で絞り込み | |
| SO-CRUD-03 | 正常系 | `GET sales-orders/?search_item=` | `item_rel__code` の部分一致 | |
| SO-CRUD-04 | 正常系 | `GET sales-orders/?search_warehouse=` | 部分一致 | |
| SO-CRUD-05 | 正常系 | `GET sales-orders/?search_status=` | 完全一致（`pending`/`shipped`/`canceled`） | |

### 5.10 倉庫レイアウト連携 `location-map`（`GET sales-orders/{id}/location-map/`）

| ケースID | 分類 | 前提条件 | 期待結果 | 備考 |
|---|---|---|---|---|
| SO-MAP-01 | 正常系 | 対象品番の在庫が複数棚に分散（各棚 `quantity>0`） | 200。各棚の `quantity`（`reserved`控除後の合計）と `highlighted=True` が返る | `rest_views.py:525-570`、未テスト |
| SO-MAP-02 | 正常系 | 対象倉庫に登録済みだが在庫が無い `WarehouseLocation` が存在 | 該当ロケーションは `quantity=0, highlighted=False` で返る | |
| SO-MAP-03 | 境界値 | 対象倉庫に `WarehouseLocation` が1件も登録されていない | `locations` が空リストで返る（200のまま） | |
| SO-MAP-04 | 境界値 | 該当在庫が全数引当済み（`reserved>=quantity`）だが `quantity>0` | 集計結果が0以下になり得る（`quantity__gt=0`のみでフィルタし`reserved`控除後の値は考慮していない） | 実装上の注意点。負数/0表示になることを確認し、UI側の扱いを別途確認 |

### 5.11 受注引当 `allocate`（`POST sales-orders/allocate/`）

| ケースID | 分類 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| SO-ALLOC-01 | 正常系 | 在庫 `quantity=10, reserved=0, is_active=True, is_allocatable=True`、`SalesOrder`未登録 | `sales_order_reference, allocations:[{part_number, warehouse, quantity_to_reserve=5}]` | 200。在庫 `reserved=5`。`SalesOrder` が `get_or_create` で新規作成される | `rest_views.py:572-673`、未テスト |
| SO-ALLOC-02 | 正常系 | 同一 `sales_order_reference` の `SalesOrder` が既存（品目・倉庫一致） | 追加の引当リクエスト | 200。既存レコードに対して `reserved` が加算される | |
| SO-ALLOC-03 | 異常系 | 在庫 `available_quantity=3` | `quantity_to_reserve=5` | 400「在庫不足」。`reserved`は変更されない | |
| SO-ALLOC-04 | 異常系 | 指定 `part_number`+`warehouse` の在庫が存在しない | 引当リクエスト | 400「在庫が見つかりません」 | |
| SO-ALLOC-05 | 異常系 | 在庫 `is_active=False` または `is_allocatable=False` | 引当リクエスト | 400 | |
| SO-ALLOC-06 | 異常系 | 既存 `SalesOrder`（品目Aまたは倉庫X） | 同一 `sales_order_reference` で品目/倉庫が異なる引当 | 400「既に異なる品目/倉庫で存在します」 | |
| SO-ALLOC-07 | 異常系 | 2件の allocations（1件目正常、2件目が在庫不足） | 一括リクエスト | 400。トランザクションロールバックにより1件目の `reserved` 加算も取り消される（DBの`reserved`が変化していないことを確認） | `transaction.atomic()` のアトミック性確認 |
| SO-ALLOC-08 | 正常系 | 同一 `part_number`+`warehouse` で棚番違いの `Inventory` が複数存在（例: A-01 `quantity=3`, A-02 `quantity=10`） | `quantity_to_reserve=6` | 200。棚番の昇順で消費され、A-01が使い切られてから残りがA-02に割り当てられる（A-01 `reserved=3`, A-02 `reserved=3`）。レスポンスの `locations_consumed` に消費内訳が含まれる | 2026-07-22 複数ロケーション対応実装済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |
| SO-ALLOC-08b | 異常系 | 複数ロケーションの合計`available_quantity`でも要求数量に届かない | 引当リクエスト | 400「在庫不足」。いずれのロケーションも`reserved`は変更されない | |
| SO-ALLOC-08c | 正常系 | 一部ロケーションが `is_allocatable=False` | 引当リクエスト | 200。無効なロケーションは対象外とし、有効なロケーションのみから引き当てる | |
| SO-ALLOC-08d | 異常系 | 全ロケーションが `is_active=False`（在庫自体は存在） | 引当リクエスト | 400「在庫が有効または引当可能ではありません」 | |
| SO-ALLOC-09 | 異常系 | `allocations` が空リストまたは未指定 | 引当リクエスト | 400 | |
| SO-ALLOC-10 | 異常系 | `sales_order_reference` 未指定 | 引当リクエスト | 400 | |

### 5.12 受注出庫 `issue`（`POST sales-orders/issue/`）

| ケースID | 分類 | 前提条件 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| SO-ISSUE-01 | 正常系 | `SalesOrder status="pending", quantity=10, shipped_quantity=0`、対応在庫 `quantity=10` | `order_id, quantity_to_ship=10` | 200。在庫 `quantity=0`。`shipped_quantity=10`。`status="shipped"`。`StockMovement`(`outgoing`, `reference_document="SO: <order_number>"`) 作成 | `rest_views.py:675-810`、未テスト |
| SO-ISSUE-02 | 正常系 | 同上（部分出庫） | `quantity_to_ship=4` | 200。`shipped_quantity=4`、`status="pending"`のまま（`remaining_quantity>0`） | |
| SO-ISSUE-03 | 正常系 | SO-ISSUE-02実施後、残数量分を追加出庫 | `quantity_to_ship=6` | 200。累積 `shipped_quantity=10`、`status="shipped"` | |
| SO-ISSUE-04 | 異常系 | `SalesOrder status="shipped"` | 出庫リクエスト | 400（既に出庫済み） | |
| SO-ISSUE-05 | 異常系 | `SalesOrder status="canceled"` | 出庫リクエスト | 400（キャンセル済み） | |
| SO-ISSUE-06 | 異常系 | `remaining_quantity=5` | `quantity_to_ship=10` | 400（残数量超過） | |
| SO-ISSUE-07 | 異常系 | 対応する在庫（`part_number`+`warehouse`）が存在しない | 出庫リクエスト | 404 | |
| SO-ISSUE-08 | 正常系 | 同一 `part_number`+`warehouse` で棚番違いの `Inventory` が複数存在（例: A-01 `quantity=4`, A-02 `quantity=10`） | `quantity_to_ship=6` | 200。棚番の昇順で消費され、A-01が使い切られてから残りがA-02から出庫される（A-01 `quantity=0`, A-02 `quantity=8`）。消費したロケーションごとに`StockMovement`(`location`付き)が作成される | 2026-07-22 複数ロケーション対応実装済み（[7. 既知の懸念事項](#7-既知の懸念事項)参照） |
| SO-ISSUE-08b | 異常系 | 複数ロケーションの合計`quantity`でも要求数量に届かない | 出庫リクエスト | 400（実在庫不足）。いずれのロケーションも変更されない | |
| SO-ISSUE-08c | 正常系 | 一部ロケーションが `is_active=False` | 出庫リクエスト | 200。無効なロケーションは対象外とし、有効なロケーションのみから出庫する | |
| SO-ISSUE-09 | 異常系 | 在庫 `is_active=False` | 出庫リクエスト | 400 | |
| SO-ISSUE-10 | 異常系 | 在庫 `quantity=3`（`quantity_to_ship=5`） | 出庫リクエスト | 400（実在庫不足。`available_quantity`ではなく生の`quantity`で判定している点を確認） | |
| SO-ISSUE-11 | 境界値 | 在庫 `quantity=10, reserved=2`、`quantity_to_ship=5`（reservedより多い） | 出庫リクエスト | 200。`reserved` は `min(reserved, quantity_to_ship)` 分のみ減算されマイナスにならない（`reserved=0`になる） | `min()`保護ロジックの確認 |
| SO-ISSUE-12 | 異常系 | `order_id`/`quantity_to_ship` 未指定、または0以下・数値変換不可 | 出庫リクエスト | 400 | |
| SO-ISSUE-13 | 境界値 | 在庫 `is_allocatable=False` だが `is_active=True` | 出庫リクエスト | 現行実装では拒否されない（`issue`は`is_allocatable`を確認しない） | allocateとissueでチェック項目が異なる点の仕様確認テスト |

### 5.13 入出庫履歴 参照専用（`StockMovementViewSet`）

| ケースID | 分類 | 入力 | 期待結果 | 備考 |
|---|---|---|---|---|
| SM-LIST-01 | 正常系 | `GET stock-movements/` | 200、`-movement_date`順 | 未テスト |
| SM-LIST-02 | 正常系 | `?search_movement_type=incoming&search_movement_type=outgoing` | 複数値OR検索（`movement_type__in`） | |
| SM-LIST-03 | 正常系 | `?search_quantity=abc`（数値変換不可） | 400にならず、フィルタ条件が無視されて全件返る | try/except passの挙動確認 |
| SM-LIST-04 | 正常系 | `?search_movement_date_from=...&to=...` | 範囲内のみ返る | |
| SM-LIST-05 | 異常系 | `POST stock-movements/` | 405（読み取り専用のため作成不可） | |
| SM-LIST-06 | 異常系 | `DELETE stock-movements/{id}/` | 405 | |

## 6. シリアライザの read_only_fields 確認

| ケースID | 対象 | 期待結果 |
|---|---|---|
| SER-01 | `InventorySerializer` | `PATCH`で`quantity`/`reserved`を送っても無視される。`available_quantity`はレスポンスに含まれる |
| SER-02 | `PurchaseOrderSerializer` | `PATCH`で`status`/`received_quantity`/`remaining_quantity`を送っても無視される |
| SER-03 | `SalesOrderSerializer` | `PATCH`で`status`/`shipped_quantity`/`remaining_quantity`を送っても無視される |

## 7. 既知の懸念事項

コード調査およびテスト実行の過程で判明した実装上の懸念点。項目1・2は自動テストで実際の失敗として
再現され、**2026-07-22に修正済み**。項目3以降はコードレビューによる推測または軽微な仕様上の
非対称性であり、現時点では未修正。

1. **【修正済み・2026-07-22】`move`/`process-receipt`/`allocate`/`issue` が対象在庫の検索で常に失敗していた**:
   これら4つのアクションはいずれも `Inventory.objects.select_for_update().get(part_number=..., warehouse=...)`
   のように `part_number`/`warehouse` をキーワード引数としてクエリしていた（`rest_views.py` L164-168, L417-419,
   L614-616, L745-747）。しかし `part_number`/`warehouse` は `Inventory` モデルの実フィールドではなく、
   実フィールド `part_number_rel`/`warehouse_rel` の値を返すだけの Python `@property` であるため
   （`models.py:31-45`）、Djangoの `QuerySet.get()`/`filter()` では解決できず、対象の在庫が実在するか否かに
   関わらず必ず `django.core.exceptions.FieldError` が送出されていた。
   - `move`・`process-receipt`・`issue` は広い `except Exception` で捕捉するため常に500エラーとなり
     (INV-MOVE-01/02/07, PO-RECV-01/02/03/04/10, SO-ISSUE-01/02/03/07/09/10/11/13)、`allocate` は
     `ValueError` のみを捕捉するため `FieldError` が未処理のまま伝播していた(SO-ALLOC-01〜07)。
   - 影響範囲: 在庫移動・入庫処理(在庫が既存の場合)・受注引当・受注出庫という在庫管理の中核機能。
   - **同一の不具合が `production` アプリにも計7箇所存在し、あわせて修正した**:
     `production/services/allocation.py`(資材引当時の在庫検索、引当解除、引当ステータス変更、計3箇所)、
     `production/services/progress.py`(生産完了取消・完了時の在庫調整・材料消費・材料復元、計4箇所)、
     `production/services/queries.py`(生産計画に必要な部品の在庫参照、1箇所)。
   - 修正内容: `part_number=<code>`/`warehouse=<warehouse_number>` を
     `part_number_rel_id=<code>`/`warehouse_rel_id=<warehouse_number>` に置き換え(`to_field` 指定により
     `_rel_id` 属性がそのままcode/warehouse_numberの値を保持するため)。また、`process-receipt` の
     発注ID不正時の404判定が `get_object_or_404` の送出する `Http404` を捕捉しておらず500になっていた
     副次的な不具合(PO-RECV-07)もあわせて修正した(`except (PurchaseOrder.DoesNotExist, Http404):`)。
   - 修正後、`script/run_tests.sh inventory` で全99件成功を確認済み
     ([reports/inventory_20260722_122925.md](./reports/inventory_20260722_122925.md))。
   - **訂正**: `move`/`process-receipt` は移動先/入庫先の検索に `location` を含めて `.get()` するため
     （一意制約の3項目全てを指定）、実際には複数ロケーションが存在しても曖昧にはならない。
     `part_number_rel_id`/`warehouse_rel_id` のみで検索しており実際に影響があったのは
     `allocate`/`issue` の2アクションのみだった（当初のレポートでは範囲を誤って広く記載していた）。

2. **【修正済み・2026-07-22】`allocate`/`issue` が複数ロケーションに分散した在庫を扱えなかった
   (`MultipleObjectsReturned`)**:
   `allocate`/`issue` はSalesOrder単位（品目+倉庫のみ）で在庫を扱うAPIで、棚番という概念をリクエストに
   持たない。修正1の適用直後は `part_number_rel_id`+`warehouse_rel_id` の `.get()` のみで検索していたため、
   同一品番・倉庫で棚番違いの `Inventory` 行が複数存在すると `MultipleObjectsReturned` が発生していた
   (`allocate` は `ValueError` のみ捕捉のため未処理のまま伝播、`issue` は広い `except Exception` で捕捉
   するため500)。
   - **対応方針: 複数ロケーションにまたがる引当・出庫に正式対応**（3つの代替案を比較検討し、
     ユーザーの意思決定によりこの案を採用。「locationを必須パラメータにする」案や「品番+倉庫につき
     1棚のみという業務ルールを課す」案は、既存の `location-map`/`move` が複数棚への分散を前提に
     作られていることと矛盾するため見送り）。
   - 実装: `.get()` を `.filter(...).order_by("location")` に変更し、`is_active`(+ `allocate`のみ
     `is_allocatable`)なロケーションを棚番の昇順で列挙。必要数量に達するまで複数ロケーションから
     順に消費する。
     - `allocate`: 各ロケーションの`available_quantity`を使い切ってから次のロケーションへ。
       レスポンスの `allocations_summary[].locations_consumed` に消費内訳（ロケーション・数量）を含む。
     - `issue`: 各ロケーションの`quantity`を使い切ってから次のロケーションへ。消費したロケーションごとに
       個別の `StockMovement`(`location`付き)を作成し、追跡可能にした。
     - 対象ロケーションの合計が要求数量に満たない場合、どのロケーションも変更せずに400を返す
       (在庫の一部だけ引き当てて残りを失敗させることはしない)。
     - 全ロケーションが `is_active=False`(または`allocate`では`is_allocatable=False`)の場合は、
       物理的な在庫行自体は存在していても専用のエラーメッセージを返す。
   - 消費順序は棚番(location)の昇順に固定（先入れ先出し等の日付情報を`Inventory`が持たないため、
     最も単純で予測可能な規則として採用）。運用上、異なる消費順序（残数量が多い棚を優先する等）が
     必要になった場合は本ロジックの調整が必要。
   - テストケース: SO-ALLOC-08/08b/08c/08d、SO-ISSUE-08/08b/08c で検証済み
     （`script/run_tests.sh inventory` で全104件成功、
     [reports/inventory_20260722_124729.md](./reports/inventory_20260722_124729.md)）。
3. **`allocate`/`issue` でのチェック項目の非対称性**（SO-ISSUE-13）:
   `allocate` は `is_active` と `is_allocatable` の両方を確認するが、`issue` は `is_active` のみで
   `is_allocatable` を確認しない。意図的な仕様か要確認。
4. **`location-map` の在庫集計**（SO-MAP-04）:
   `quantity__gt=0` の `Inventory` 行のみを対象に `Sum(quantity - reserved)` を集計しているため、
   全数引当済み（`reserved>=quantity`）でも集計対象に含まれ、結果が0以下になり得る。UI表示への影響を要確認。
5. **`production` アプリからの直接更新**:
   `production/services/allocation.py`・`progress.py` が `inventory.Inventory` の `reserved`/`quantity` を
   直接 `select_for_update()` で更新する。inventory側のロック粒度・整合性に影響するため、production側の
   テスト仕様書作成時に本アプリとの結合テスト（資材引当と受注引当が同一在庫行を競合する場合の挙動）を
   追加検討する。
6. **既存テストデータの不整合**（`inventory/tests.py` の `po2`、現在は`inventory/tests/`パッケージに
   置き換え済み）:
   `status="received"` は現行モデルのchoicesに存在しない値。新規テスト作成時は
   `partially_received`/`fully_received` を使用する。
