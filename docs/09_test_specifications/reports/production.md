# テスト実行レポート: production

- 実行日時: 2026-11-11 07:09:14 JST
- 実行コマンド: `python manage.py test production --testrunner=testutils.report_runner.JsonReportDiscoverRunner --verbosity 2`
- 実行時間: 51.254 秒
- 総合結果: **NG**

## サマリー

| 総数 | 成功 | 失敗 | エラー | スキップ |
|---|---|---|---|---|
| 143 | 142 | 1 | 0 | 0 |

## 失敗・エラー一覧

| テストID | 結果 | 概要(docstring) |
|---|---|---|
| `production.tests.test_additional_issue.AdditionalIssueTests.test_pp_addissue_01_issued_immediately_from_unreserved_stock` | FAIL | - |

## 失敗・エラー詳細

### production.tests.test_additional_issue.AdditionalIssueTests.test_pp_addissue_01_issued_immediately_from_unreserved_stock

```
Traceback (most recent call last):
  File "/open_mes/production/tests/test_additional_issue.py", line 37, in test_pp_addissue_01_issued_immediately_from_unreserved_stock
    self.assertEqual(response.data["data"][0]["allocation_type_display"], "追加出庫")
AssertionError: '追加ピッキング' != '追加出庫'
- 追加ピッキング
+ 追加出庫
```

