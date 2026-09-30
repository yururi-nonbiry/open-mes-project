# テスト実行レポート: frontend_functional

- 実行日時: 2026/9/30 22:55:25 JST
- 実行コマンド: `npm run test:e2e:functional`
- 総合結果: **OK**

## サマリー

| 総数 | 成功 | 失敗 | スキップ |
|---|---|---|---|
| 24 | 24 | 0 | 0 |

全てのテストが成功しました。

## テスト結果一覧

| テスト | 結果 | 実行時間 |
|---|---|---|
| FE-GR-01 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.5秒 |
| FE-GR-02 表示設定がある場合、設定した列・順序・カスタム表示名で表示されること [functional-hd] | PASSED | 1.4秒 |
| FE-GR-03 一覧表示対象の設定が無く検索項目のみ設定されている場合、既定の列で表示されること [functional-hd] | PASSED | 1.6秒 |
| FE-GR-04 一般ユーザー(スタッフ権限なし)にも表示設定が反映されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-05 検索項目で絞り込みができ、該当なしの場合はメッセージが表示されること [functional-hd] | PASSED | 2.7秒 |
| FE-GR-06 ページ送りで次ページ・前ページの明細が表示されること [functional-hd] | PASSED | 2.5秒 |
| FE-GR-07 入庫モーダルに発注内容と初期値が表示されること [functional-hd] | PASSED | 2.2秒 |
| FE-GR-08 入庫数量が0または残数量超過の場合、入庫処理が実行されないこと [functional-hd] | PASSED | 2.4秒 |
| FE-GR-09 全量入庫すると完了メッセージが表示され、全量入庫済みとして一覧に反映されること [functional-hd] | PASSED | 4.3秒 |
| FE-GR-10 一部入庫すると入庫済数量とステータス(一部入庫)が一覧に反映されること [functional-hd] | PASSED | 4.3秒 |
| FE-GR-11 納品モーダルで納品日・納品数を保存でき、入庫済数量は変わらないこと [functional-hd] | PASSED | 4.1秒 |
| FE-GR-12 入庫予定の取得に失敗した場合、エラーメッセージが表示されること [functional-hd] | PASSED | 1.2秒 |
| FE-GR-13 一部入庫の入庫予定は、残数量を追加で入庫できること [functional-hd] | PASSED | 2.3秒 |
| FE-GR-14 仕入先・品番・入庫倉庫を列と検索項目に設定でき、スタッフ・一般ユーザーの両方で表示されること [functional-hd] | PASSED | 3.5秒 |
| FE-GR-15 ページ項目表示設定画面(入庫処理)で仕入先・品番・入庫倉庫を選択できること [functional-hd] | PASSED | 1.4秒 |
| FE-GRM-01 未入庫の入庫予定が一覧に表示され、各項目(品名・発注番号・残数量・予定日)が表示されること [functional-smartphone] | PASSED | 3.1秒 |
| FE-GRM-02 検索結果が0件の場合、メッセージが表示されること [functional-smartphone] | PASSED | 2.1秒 |
| FE-GRM-03 入庫数量が残数量を超える場合、入庫処理が実行されないこと [functional-smartphone] | PASSED | 3.0秒 |
| FE-GRM-04 入庫フォームに初期値が表示され、入庫実行で全量入庫できること [functional-smartphone] | PASSED | 4.4秒 |
| FE-GRM-05 一部入庫の入庫予定は、一覧に表示され残数量を追加で入庫できること [functional-smartphone] | PASSED | 3.1秒 |
| FE-INV-01 在庫照会: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.2秒 |
| FE-INV-02 在庫照会: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること [functional-hd] | PASSED | 1.3秒 |
| FE-SMH-01 入出庫履歴: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.9秒 |
| FE-SMH-02 入出庫履歴: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること [functional-hd] | PASSED | 1.4秒 |

