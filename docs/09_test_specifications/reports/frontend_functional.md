# テスト実行レポート: frontend_functional

- 実行日時: 2026/11/22 21:17:55 JST
- 実行コマンド: `npm run test:e2e:functional`
- 総合結果: **OK**

## サマリー

| 総数 | 成功 | 失敗 | スキップ |
|---|---|---|---|
| 61 | 56 | 0 | 5 |

全てのテストが成功しました。

## テスト結果一覧

| テスト | 結果 | 実行時間 |
|---|---|---|
| FE-GI-01 出庫処置: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 2.3秒 |
| FE-GI-02 出庫処置: 用途(車種)を先頭に設定すると、一般ユーザーの画面でも左端の列になること [functional-hd] | PASSED | 2.2秒 |
| FE-GI-03 出庫処置: 表示列を絞っても出庫処理のモーダルが開くこと [functional-hd] | PASSED | 2.3秒 |
| FE-GR-01 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.9秒 |
| FE-GR-02 表示設定がある場合、設定した列・順序・カスタム表示名で表示されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-03 一覧表示対象の設定が無く検索項目のみ設定されている場合、既定の列で表示されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-04 一般ユーザー(スタッフ権限なし)にも表示設定が反映されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-05 検索項目で絞り込みができ、該当なしの場合はメッセージが表示されること [functional-hd] | PASSED | 3.0秒 |
| FE-GR-06 ページ送りで次ページ・前ページの明細が表示されること [functional-hd] | PASSED | 2.4秒 |
| FE-GR-07 入庫モーダルに発注内容と初期値が表示されること [functional-hd] | PASSED | 2.6秒 |
| FE-GR-08 入庫数量が0または残数量超過の場合、入庫処理が実行されないこと [functional-hd] | PASSED | 2.7秒 |
| FE-GR-09 全量入庫すると完了メッセージが表示され、全量入庫済みとして一覧に反映されること [functional-hd] | PASSED | 4.7秒 |
| FE-GR-10 一部入庫すると入庫済数量とステータス(一部入庫)が一覧に反映されること [functional-hd] | PASSED | 4.7秒 |
| FE-GR-11 納品モーダルで納品日・納品数を保存でき、入庫済数量は変わらないこと [functional-hd] | PASSED | 4.4秒 |
| FE-GR-12 入庫予定の取得に失敗した場合、エラーメッセージが表示されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-13 一部入庫の入庫予定は、残数量を追加で入庫できること [functional-hd] | PASSED | 2.8秒 |
| FE-GR-14 仕入先・品番・入庫倉庫を列と検索項目に設定でき、スタッフ・一般ユーザーの両方で表示されること [functional-hd] | PASSED | 3.9秒 |
| FE-GR-15 ページ項目表示設定画面(入庫処理)で仕入先・品番・入庫倉庫を選択できること [functional-hd] | PASSED | 1.5秒 |
| FE-GR-16 デフォルト入庫棚番が未登録の品番を入庫すると確認モーダルが表示され、「登録して入庫」で登録されること [functional-hd] | PASSED | 4.0秒 |
| FE-GR-17 確認モーダルで「登録しないで入庫」を選ぶと、入庫のみ実行されデフォルト入庫棚番は登録されないこと [functional-hd] | PASSED | 4.1秒 |
| FE-GR-18 デフォルト入庫棚番が登録済みの品番を入庫する場合、確認モーダルが表示されないこと [functional-hd] | PASSED | 3.4秒 |
| FE-GRM-01 未入庫の入庫予定が一覧に表示され、各項目(品名・発注番号・残数量・予定日)が表示されること [functional-smartphone] | PASSED | 2.5秒 |
| FE-GRM-02 検索結果が0件の場合、メッセージが表示されること [functional-smartphone] | PASSED | 2.1秒 |
| FE-GRM-03 入庫数量が残数量を超える場合、入庫処理が実行されないこと [functional-smartphone] | PASSED | 2.4秒 |
| FE-GRM-04 入庫フォームに初期値が表示され、入庫実行で全量入庫できること [functional-smartphone] | PASSED | 4.2秒 |
| FE-GRM-05 一部入庫の入庫予定は、一覧に表示され残数量を追加で入庫できること [functional-smartphone] | PASSED | 2.4秒 |
| FE-GRM-06 デフォルト入庫棚番が未登録の品番を入庫すると確認モーダルが表示され、「登録して入庫」で登録されること [functional-smartphone] | PASSED | 2.9秒 |
| FE-GRM-07 確認モーダルで「登録しないで入庫」を選ぶと、入庫のみ実行されデフォルト入庫棚番は登録されないこと [functional-smartphone] | PASSED | 2.7秒 |
| FE-GRM-08 デフォルト入庫棚番が登録済みの品番を入庫する場合、確認モーダルが表示されないこと [functional-smartphone] | PASSED | 2.7秒 |
| FE-INV-01 在庫照会: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.4秒 |
| FE-INV-02 在庫照会: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること [functional-hd] | PASSED | 1.3秒 |
| FE-MAN-01 使い方ガイド検索: キーワードで画面が絞り込まれ、一致箇所が強調表示されること [functional-hd] | PASSED | 1.8秒 |
| FE-MAN-02 使い方ガイド検索: 意味の近い言葉・ひらがな・全角でも同じ画面が見つかること [functional-hd] | PASSED | 2.0秒 |
| FE-MAN-03 使い方ガイド検索: 該当なしの案内が表示され、クリアで全件に戻ること [functional-hd] | PASSED | 2.0秒 |
| FE-MAN-04 業務の流れ図: 項目クリックで該当画面へ移動し、検索中は図が隠れること [functional-hd] | PASSED | 2.1秒 |
| FE-MAN-05 データの関連図: 表示され、カードのタイトルで該当画面へ移動し、検索中は隠れること [functional-hd] | PASSED | 2.1秒 |
| FE-PAL-01 用途を指定した計画の引当画面に、用途の列と用途コードが表示されること [functional-hd] | PASSED | 2.2秒 |
| FE-PAL-02 用途を指定しない計画の引当画面では、用途の列に「汎用」と表示されること [functional-hd] | PASSED | 2.1秒 |
| FE-PKS-01 既定の検索対象: 品番・計画名では見つかるが、使用用途では見つからないこと [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-01 既定の検索対象: 品番・計画名では見つかるが、使用用途では見つからないこと [functional-smartphone] | PASSED | 1.4秒 |
| FE-PKS-02 使用用途を検索対象にすると、使用用途のキーワードで見つかること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-02 使用用途を検索対象にすると、使用用途のキーワードで見つかること [functional-smartphone] | PASSED | 1.5秒 |
| FE-PKS-03 検索対象から外した項目では見つからず、残した項目では見つかること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-03 検索対象から外した項目では見つからず、残した項目では見つかること [functional-smartphone] | PASSED | 1.3秒 |
| FE-PKS-04 検索対象を空にすると、キーワードでは絞り込めず(該当なし)、空欄なら表示されること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-04 検索対象を空にすると、キーワードでは絞り込めず(該当なし)、空欄なら表示されること [functional-smartphone] | PASSED | 1.5秒 |
| FE-PKS-05 管理者設定: 機能設定で「使用用途」にチェックして保存すると、APIに保存されること [functional-hd] | PASSED | 1.8秒 |
| FE-PKS-05 管理者設定: 機能設定で「使用用途」にチェックして保存すると、APIに保存されること [functional-smartphone] | SKIPPED | 0.1秒 |
| FE-PM-01 統合確認OFF: まとめ引当で確認モーダルは出ず、従来どおり計画ごとに引き当てられること [functional-hd] | PASSED | 2.3秒 |
| FE-PM-02 統合確認ON: モーダルに同一品番のグループ(合計数量・各計画)が表示され、キャンセルすると何も変わらないこと [functional-hd] | PASSED | 2.7秒 |
| FE-PM-03 統合確認ON: 「まとめずに引き当てる」を選ぶと計画ごとに引き当てられ、統合されないこと [functional-hd] | PASSED | 3.0秒 |
| FE-PM-04 統合確認ON: 「まとめて引き当てる」を選ぶと統合計画に引き当てられ、元の計画は統合済になること [functional-hd] | PASSED | 3.3秒 |
| FE-PM-05 統合解除: 引当前の統合計画を一覧から解除すると、元の計画が未着手に戻ること [functional-hd] | PASSED | 2.4秒 |
| FE-PM-06 統合完了: 統合計画の生産完了で、良品数が納期順に元の計画へ割り振られること [functional-hd] | PASSED | 0.4秒 |
| FE-PM-07 管理者設定: 有効機能設定のスイッチで統合確認のON/OFFを切り替えられ、APIに保存されること [functional-hd] | PASSED | 1.6秒 |
| FE-SMH-01 入出庫履歴: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.4秒 |
| FE-SMH-02 入出庫履歴: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること [functional-hd] | PASSED | 1.4秒 |
| FE-TERM-01 用語設定: 既定の呼び方では「出庫予定」などの標準の表記で表示されること [functional-hd] | PASSED | 1.3秒 |
| FE-TERM-02 用語設定: 管理者が画面で呼び方を保存すると、画面全体の表記が変わること [functional-hd] | PASSED | 3.4秒 |
| FE-TERM-03 用語設定: 一般ユーザーにも変更後の呼び方が反映されること [functional-hd] | PASSED | 1.3秒 |
| FE-TERM-04 用語設定: 空欄では保存できず、エラーが表示されて設定が変わらないこと [functional-hd] | PASSED | 2.4秒 |

