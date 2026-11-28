# テスト実行レポート: frontend_functional

- 実行日時: 2026/11/28 11:09:04 JST
- 実行コマンド: `npm run test:e2e:functional`
- 総合結果: **OK**

## サマリー

| 総数 | 成功 | 失敗 | スキップ |
|---|---|---|---|
| 91 | 84 | 0 | 7 |

全てのテストが成功しました。

## テスト結果一覧

| テスト | 結果 | 実行時間 |
|---|---|---|
| FE-DI-01 生産計画の登録で、任意の用途・ラインを空欄のまま登録できること [functional-hd] | PASSED | 2.0秒 |
| FE-GI-01 出庫処置: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 2.7秒 |
| FE-GI-02 出庫処置: 用途(車種)を先頭に設定すると、一般ユーザーの画面でも左端の列になること [functional-hd] | PASSED | 4.2秒 |
| FE-GI-03 出庫処置: 表示列を絞っても出庫処理のモーダルが開くこと [functional-hd] | PASSED | 2.3秒 |
| FE-GI-04 ページ項目表示設定(出庫処理)を初めて保存しても、既定の列(未出庫残を含む)のまま表示され、表示名は書き込まれないこと [functional-hd] | PASSED | 3.8秒 |
| FE-GR-01 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.8秒 |
| FE-GR-02 表示設定がある場合、設定した列・順序・カスタム表示名で表示されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-03 一覧表示対象の設定が無く検索項目のみ設定されている場合、既定の列で表示されること [functional-hd] | PASSED | 1.7秒 |
| FE-GR-04 一般ユーザー(スタッフ権限なし)にも表示設定が反映されること [functional-hd] | PASSED | 1.6秒 |
| FE-GR-05 検索項目で絞り込みができ、該当なしの場合はメッセージが表示されること [functional-hd] | PASSED | 2.0秒 |
| FE-GR-06 ページ送りで次ページ・前ページの明細が表示されること [functional-hd] | PASSED | 2.1秒 |
| FE-GR-07 入庫モーダルに発注内容と初期値が表示されること [functional-hd] | PASSED | 2.7秒 |
| FE-GR-08 入庫数量が0または残数量超過の場合、入庫処理が実行されないこと [functional-hd] | PASSED | 2.6秒 |
| FE-GR-09 全量入庫すると完了メッセージが表示され、全量入庫済みとして一覧に反映されること [functional-hd] | PASSED | 4.7秒 |
| FE-GR-10 一部入庫すると入庫済数量とステータス(一部入庫)が一覧に反映されること [functional-hd] | PASSED | 4.6秒 |
| FE-GR-11 納品モーダルで納品日・納品数を保存でき、入庫済数量は変わらないこと [functional-hd] | PASSED | 4.3秒 |
| FE-GR-12 入庫予定の取得に失敗した場合、エラーメッセージが表示されること [functional-hd] | PASSED | 1.5秒 |
| FE-GR-13 一部入庫の入庫予定は、残数量を追加で入庫できること [functional-hd] | PASSED | 2.6秒 |
| FE-GR-14 仕入先・品番・入庫倉庫を列と検索項目に設定でき、スタッフ・一般ユーザーの両方で表示されること [functional-hd] | PASSED | 3.4秒 |
| FE-GR-15 ページ項目表示設定画面(入庫処理)で仕入先・品番・入庫倉庫を選択できること [functional-hd] | PASSED | 1.5秒 |
| FE-GR-16 デフォルト入庫棚番が未登録の品番を入庫すると確認モーダルが表示され、「登録して入庫」で登録されること [functional-hd] | PASSED | 3.6秒 |
| FE-GR-17 確認モーダルで「登録しないで入庫」を選ぶと、入庫のみ実行されデフォルト入庫棚番は登録されないこと [functional-hd] | PASSED | 3.5秒 |
| FE-GR-18 デフォルト入庫棚番が登録済みの品番を入庫する場合、確認モーダルが表示されないこと [functional-hd] | PASSED | 2.8秒 |
| FE-GR-19 入庫予定に倉庫・棚番が無い場合、品番マスタのデフォルト入庫倉庫・棚番が初期値になり、そのまま入庫できること [functional-hd] | PASSED | 2.8秒 |
| FE-GR-20 確認モーダルを×で閉じると、入庫は実行されず入庫処理の画面に戻ること [functional-hd] | PASSED | 3.7秒 |
| FE-GR-21 検索・ページ送りのたびに表示設定を取り直さず、一般ユーザーでも項目定義APIを呼ばないこと [functional-hd] | PASSED | 2.2秒 |
| FE-GRM-01 未入庫の入庫予定が一覧に表示され、各項目(品名・発注番号・残数量・予定日)が表示されること [functional-smartphone] | PASSED | 2.4秒 |
| FE-GRM-02 検索結果が0件の場合、メッセージが表示されること [functional-smartphone] | PASSED | 2.1秒 |
| FE-GRM-03 入庫数量が残数量を超える場合、入庫処理が実行されないこと [functional-smartphone] | PASSED | 2.5秒 |
| FE-GRM-04 入庫フォームに初期値が表示され、入庫実行で全量入庫できること [functional-smartphone] | PASSED | 4.3秒 |
| FE-GRM-05 一部入庫の入庫予定は、一覧に表示され残数量を追加で入庫できること [functional-smartphone] | PASSED | 2.4秒 |
| FE-GRM-06 デフォルト入庫棚番が未登録の品番を入庫すると確認モーダルが表示され、「登録して入庫」で登録されること [functional-smartphone] | PASSED | 2.9秒 |
| FE-GRM-07 確認モーダルで「登録しないで入庫」を選ぶと、入庫のみ実行されデフォルト入庫棚番は登録されないこと [functional-smartphone] | PASSED | 2.8秒 |
| FE-GRM-08 デフォルト入庫棚番が登録済みの品番を入庫する場合、確認モーダルが表示されないこと [functional-smartphone] | PASSED | 2.7秒 |
| FE-GRM-09 確認モーダルで「入庫をやめる」を選ぶと、入庫は実行されないこと [functional-smartphone] | PASSED | 2.7秒 |
| FE-INV-01 在庫照会: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.4秒 |
| FE-INV-02 在庫照会: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること [functional-hd] | PASSED | 1.4秒 |
| FE-INVMV-01 移動の完了後、閉じるまでの間は再送信できず、手で閉じて別の在庫で開き直しても前回の予約で閉じないこと [functional-hd] | PASSED | 3.9秒 |
| FE-MAN-01 使い方ガイド検索: キーワードで画面が絞り込まれ、一致箇所が強調表示されること [functional-hd] | PASSED | 1.8秒 |
| FE-MAN-02 使い方ガイド検索: 意味の近い言葉・ひらがな・全角でも同じ画面が見つかること [functional-hd] | PASSED | 2.1秒 |
| FE-MAN-03 使い方ガイド検索: 該当なしの案内が表示され、クリアで全件に戻ること [functional-hd] | PASSED | 2.0秒 |
| FE-MAN-04 業務の流れ図: 項目クリックで該当画面へ移動し、検索中は図が隠れること [functional-hd] | PASSED | 2.1秒 |
| FE-MAN-05 データの関連図: 表示され、カードのタイトルで該当画面へ移動し、検索中は隠れること [functional-hd] | PASSED | 2.2秒 |
| FE-MLT-01 移動先に別の倉庫の棚番QRを読むと、その倉庫の棚へ移動すること [functional-smartphone] | PASSED | 1.5秒 |
| FE-MPK-01 引当が複数ページにまたがっても全件表示し、計画内の複数のラインをまとめて表示すること [functional-smartphone] | PASSED | 1.3秒 |
| FE-MPW-01 スマホでパスワードの有効期限が切れている場合、設定画面に留まりリダイレクトを繰り返さないこと [functional-smartphone] | PASSED | 2.4秒 |
| FE-PAL-01 用途を指定した計画の引当画面に、用途の列と用途コードが表示されること [functional-hd] | PASSED | 2.2秒 |
| FE-PAL-02 用途を指定しない計画の引当画面では、用途の列に「汎用」と表示されること [functional-hd] | PASSED | 2.1秒 |
| FE-PAL-03 ページ項目表示設定(部品引当)で、列の非表示・表示名・並び順が引当画面に反映されること [functional-hd] | PASSED | 2.2秒 |
| FE-PAL-04 ページ項目表示設定(生産計画一覧)で、一覧の列の追加・非表示・表示名・並び順が反映されること [functional-hd] | PASSED | 3.6秒 |
| FE-PKC-01 ページ項目表示設定(ピッキング・PC)で、列の非表示・表示名・並び順がPCのピッキング画面に反映されること [functional-hd] | PASSED | 3.6秒 |
| FE-PKC-01 ページ項目表示設定(ピッキング・PC)で、列の非表示・表示名・並び順がPCのピッキング画面に反映されること [functional-smartphone] | SKIPPED | 0.1秒 |
| FE-PKC-02 ページ項目表示設定(ピッキング・モバイル)で、明細の項目の非表示・表示名が反映されること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKC-02 ページ項目表示設定(ピッキング・モバイル)で、明細の項目の非表示・表示名が反映されること [functional-smartphone] | PASSED | 3.4秒 |
| FE-PKS-01 既定の検索対象: 品番・計画名では見つかるが、使用用途では見つからないこと [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-01 既定の検索対象: 品番・計画名では見つかるが、使用用途では見つからないこと [functional-smartphone] | PASSED | 1.9秒 |
| FE-PKS-02 使用用途を検索対象にすると、使用用途のキーワードで見つかること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-02 使用用途を検索対象にすると、使用用途のキーワードで見つかること [functional-smartphone] | PASSED | 1.8秒 |
| FE-PKS-03 検索対象から外した項目では見つからず、残した項目では見つかること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-03 検索対象から外した項目では見つからず、残した項目では見つかること [functional-smartphone] | PASSED | 1.7秒 |
| FE-PKS-04 検索対象を空にすると、キーワードでは絞り込めず(該当なし)、空欄なら表示されること [functional-hd] | SKIPPED | 0.1秒 |
| FE-PKS-04 検索対象を空にすると、キーワードでは絞り込めず(該当なし)、空欄なら表示されること [functional-smartphone] | PASSED | 1.9秒 |
| FE-PKS-05 管理者設定: 機能設定で「使用用途」にチェックして保存すると、APIに保存されること [functional-hd] | PASSED | 1.8秒 |
| FE-PKS-05 管理者設定: 機能設定で「使用用途」にチェックして保存すると、APIに保存されること [functional-smartphone] | SKIPPED | 0.1秒 |
| FE-PM-01 統合確認OFF: まとめ引当で確認モーダルは出ず、従来どおり計画ごとに引き当てられること [functional-hd] | PASSED | 3.0秒 |
| FE-PM-02 統合確認ON: モーダルに同一品番のグループ(合計数量・各計画)が表示され、キャンセルすると何も変わらないこと [functional-hd] | PASSED | 2.9秒 |
| FE-PM-03 統合確認ON: 「まとめずに引き当てる」を選ぶと計画ごとに引き当てられ、統合されないこと [functional-hd] | PASSED | 2.7秒 |
| FE-PM-04 統合確認ON: 「まとめて引き当てる」を選ぶと統合計画に引き当てられ、元の計画は統合済になること [functional-hd] | PASSED | 3.3秒 |
| FE-PM-05 統合解除: 引当前の統合計画を一覧から解除すると、元の計画が未着手に戻ること [functional-hd] | PASSED | 2.3秒 |
| FE-PM-06 統合完了: 統合計画の生産完了で、良品数が納期順に元の計画へ割り振られること [functional-hd] | PASSED | 0.4秒 |
| FE-PM-07 管理者設定: 有効機能設定のスイッチで統合確認のON/OFFを切り替えられ、APIに保存されること [functional-hd] | PASSED | 1.6秒 |
| FE-PM-08 部品引当で失敗しても入力内容が残り、エラーを表示して直して再送信できること [functional-hd] | PASSED | 2.2秒 |
| FE-QH-01 検査履歴は絞り込み全体の合否件数を表示し、ページ送りと絞り込みをサーバーへ送ること [functional-hd] | PASSED | 2.3秒 |
| FE-QM-01 検査項目の測定詳細の行を、つまみ(☰)のドラッグ(キーボード操作)で並べ替えられること [functional-hd] | PASSED | 1.9秒 |
| FE-QM-02 共通モーダルはダイアログとして扱われ、Esc・背景のクリックで閉じ、モーダル内から背景へドラッグしても閉じないこと [functional-hd] | PASSED | 1.5秒 |
| FE-QR-01 テンプレートを選び名前を入力して、同じテンプレートからQRコードアクションを3件以上作成できること [functional-hd] | PASSED | 3.3秒 |
| FE-SESS-01 セッション確認がサーバーエラーで失敗しても、ログアウトせずトークンを残すこと [functional-hd] | PASSED | 3.3秒 |
| FE-SMH-01 入出庫履歴: 表示設定が未登録の場合、既定の列で見出しと明細の項目が表示されること [functional-hd] | PASSED | 1.5秒 |
| FE-SMH-02 入出庫履歴: 一般ユーザーにも表示設定(品番・倉庫を含む)が反映されること [functional-hd] | PASSED | 1.5秒 |
| FE-SMH-03 入出庫履歴: 期間(開始日・終了日)で絞り込め、移動種別をすべて外すと0件になること [functional-hd] | PASSED | 2.1秒 |
| FE-SS-01 出庫予定一覧で総件数を表示し、2ページ目以降を表示でき、内部受注は既定で除外・表示時はバッジが付くこと [functional-hd] | PASSED | 1.6秒 |
| FE-TERM-01 用語設定: 既定の呼び方では「出庫予定」などの標準の表記で表示されること [functional-hd] | PASSED | 1.3秒 |
| FE-TERM-02 用語設定: 管理者が画面で呼び方を保存すると、画面全体の表記が変わること [functional-hd] | PASSED | 3.9秒 |
| FE-TERM-03 用語設定: 一般ユーザーにも変更後の呼び方が反映されること [functional-hd] | PASSED | 1.3秒 |
| FE-TERM-04 用語設定: 空欄では保存できず、エラーが表示されて設定が変わらないこと [functional-hd] | PASSED | 2.3秒 |
| FE-TERM-05 用語設定: 呼び方を変えていても、画面を開いたときに一覧のデータ取得が増えず、出庫予定の状態も設定の呼び方で表示されること [functional-hd] | PASSED | 5.7秒 |
| FE-WFVIS-01 管理者が非表示にした業務フローは、別のユーザー・端末のトップ画面でも非表示になること [functional-hd] | PASSED | 1.3秒 |
| FE-WP-01 完了登録で入庫倉庫・棚番の初期値が品番マスタのデフォルトになり、変更した棚番で完成品が入庫されること [functional-hd] | PASSED | 2.2秒 |
| FE-WP-02 入庫倉庫が空の場合はエラーが表示され、完了登録されないこと [functional-hd] | PASSED | 2.2秒 |
| FE-WP-03 完了済みの計画では、入庫倉庫・棚番が計上先の値で表示され変更できないこと [functional-hd] | PASSED | 1.8秒 |
| FE-WP-04 統合計画の完了で完了になった元の計画は、作業進捗から単独で登録できないこと [functional-hd] | PASSED | 1.9秒 |

