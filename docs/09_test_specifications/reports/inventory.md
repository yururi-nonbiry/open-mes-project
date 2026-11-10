# テスト実行レポート: inventory

- 実行日時: 2026-11-11 07:10:26 JST
- 実行コマンド: `python manage.py test inventory --testrunner=testutils.report_runner.JsonReportDiscoverRunner --verbosity 2`
- 実行時間: 62.15 秒
- 総合結果: **NG**

## サマリー

| 総数 | 成功 | 失敗 | エラー | スキップ |
|---|---|---|---|---|
| 167 | 165 | 2 | 0 | 0 |

## 失敗・エラー一覧

| テストID | 結果 | 概要(docstring) |
|---|---|---|
| `inventory.tests.test_purchase_order.PurchaseOrderCrudTests.test_po_crud_08_search_order_date_range` | FAIL | - |
| `inventory.tests.test_stock_movement.StockMovementTests.test_sm_list_04_date_range_filter` | FAIL | - |

## 失敗・エラー詳細

### inventory.tests.test_purchase_order.PurchaseOrderCrudTests.test_po_crud_08_search_order_date_range

```
Traceback (most recent call last):
  File "/open_mes/inventory/tests/test_purchase_order.py", line 87, in test_po_crud_08_search_order_date_range
    self.assertEqual(response.data["count"], 2)
AssertionError: 0 != 2
```

### inventory.tests.test_stock_movement.StockMovementTests.test_sm_list_04_date_range_filter

```
Traceback (most recent call last):
  File "/open_mes/inventory/tests/test_stock_movement.py", line 48, in test_sm_list_04_date_range_filter
    self.assertEqual(response.data["count"], 2)
AssertionError: 0 != 2
```

