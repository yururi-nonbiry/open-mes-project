# テスト仕様書: 品質管理 (quality)

## 1. 対象範囲

`backend/src/quality` アプリが提供するAPI（DRF `ModelViewSet`、`quality/rest_views.py`）を対象とする。

- 対象: 検査項目マスター (`InspectionItem`、`measurement_details`を含むネスト構造)、検査実績 (`InspectionResult`、
  `details`を含むネスト構造)、両モデルに紐づくカスタムaction（`form-data`、`record-result`）、共通の応答整形・
  削除時のエラーハンドリングを行う`CustomSuccessMessageMixin`、判定ロジック（`_judge_detail`/
  `compute_overall_judgment`）。
- **範囲外**:
  - `quality/urls.py`は空（`api_urls.py`に委譲済み）、`quality/views.py`も「新UIはrest_views.pyで実装」との
    コメントのみのスタブで対象外。
  - `quality/forms.py`（`InspectionItemForm`等のDjango `ModelForm`群）は、対応する`urls.py`/`views.py`が
    空のため到達不能なレガシーコードであり対象外。
  - `InspectionResult.part_number`/`related_order_number`等は`master.Item`や`production`のオーダーへの
    実FKではなく単なる文字列フィールドのため、他アプリとの参照整合性はそもそも存在せず本書の対象外。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh quality`
- テストクラスは`rest_framework.test.APITestCase`（判定ロジックの純粋関数テストのみ`django.test.TestCase`）を
  使用し、`reverse("quality_api:<basename>-list"/"-detail")`でURL解決する。
- 全ViewSetの`permission_classes`は`[IsAuthenticated]`で統一されており、staff/superuser等の権限区分はない。
- `CustomSuccessMessageMixin`により、list/retrieve/create/updateのレスポンスは`{"status": "success", "data": ...}`
  でラップされる（`master`と同一パターン）。ページネーションは設定されていない。
- `destroy()`は成功時も**HTTP 200**を返す（DRF標準の204ではない）。
- カスタムaction（`form-data`、`record-result`）は上記と異なり`{"success": true/false, ...}`という
  **別の応答エンベロープ**を使う。テストコードはエンドポイントごとにこの違いを意識する必要がある。
- `quality/migrations/`にはテストDB向けのスタブデータ投入マイグレーションは存在せず、`master`/`production`と
  異なりテストDBは本アプリのモデルに関して完全に空の状態から始まる。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル | 参照 | テスト上の要注意点 |
|---|---|---|
| `InspectionItem` | `models.py:9-49` | `code`は`unique=True`。`inspection_type`/`target_object_type`は`choices`。`MeasurementDetail`から`on_delete=CASCADE`、`InspectionResult`から`on_delete=PROTECT`で参照される。 |
| `MeasurementDetail` | `models.py:52-88` | `inspection_item`への`on_delete=CASCADE`。一意制約なし（同一`inspection_item`内で同名重複可）。定量(`specification_*`)/定性(`expected_qualitative_result`)の使い分けは`measurement_type`次第でアプリケーション側の判断に委ねられる。`InspectionResultDetail`から`on_delete=PROTECT`で参照される。 |
| `InspectionResult` | `models.py:91-164` | `inspection_item`は`on_delete=PROTECT`。`inspected_by`は`on_delete=SET_NULL`（検査員削除時も記録は残る）。`judgment`は`default="pending"`。`part_number`等は他アプリへの実FKではない単なる文字列。 |
| `InspectionResultDetail` | `models.py:167-190` | `inspection_result`への`on_delete=CASCADE`、`measurement_detail`への`on_delete=PROTECT`。一意制約なし。 |

## 4. 既存自動テストの状況

`quality/tests.py`は空（コメントのみ）だった。4モデル全てのCRUD・ネスト構造の同期挙動・カスタムaction・
判定ロジックについて自動テストが**存在しなかった**。本書はこのギャップを埋めることを主目的とする。

## 5. テストケース一覧

### 5.1 検査項目 CRUD（`InspectionItemViewSet`、`quality/tests/test_inspection_item.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| QUA-ITEM-01 | 正常系 | `GET inspection-items/` | InspectionItemが存在 | 一覧取得 | 200、`data`に対象コードを含む | list専用の`InspectionItemListSerializer` |
| QUA-ITEM-02 | 正常系 | `POST inspection-items/` | - | `measurement_details`を含めて作成 | 201、DBに親子とも反映 | `InspectionItemDetailSerializer.create()` |
| QUA-ITEM-03 | 異常系 | `POST inspection-items/` | `code`重複 | 作成 | 400 | |
| QUA-ITEM-04 | 正常系 | `GET inspection-items/{id}/` | 既存Item+MeasurementDetailが存在 | 取得 | 200、`data.measurement_details`にネスト表示 | |
| QUA-ITEM-05 | 正常系 | `PATCH inspection-items/{id}/` | 既存Itemが存在 | `name`を更新（既存detailはid付きでそのまま送信） | 200、DBに反映 | |
| QUA-ITEM-06 | 正常系 | `PATCH inspection-items/{id}/` | 既存detailが存在 | 既存detailを`id`付きで内容変更して送信 | 200、該当detailが更新される | `update()`のid一致による更新分岐 |
| QUA-ITEM-07 | 正常系 | `PATCH inspection-items/{id}/` | 既存detailが存在 | 既存detail(id付き)＋新規detail(id無し)を送信 | 200、detail件数が1件増える | `update()`のid無し＝新規作成分岐 |
| QUA-ITEM-08 | 境界値 | `PATCH inspection-items/{id}/` | detailが2件存在 | 1件だけをid付きで送信（もう1件を省略） | 200、省略されたdetailはDBから削除される | ペイロードに無いdetailは暗黙削除（要注意仕様） |
| QUA-ITEM-09 | 異常系 | `PATCH inspection-items/{id}/` | 省略対象のdetailが`InspectionResultDetail`からPROTECT参照されている | `measurement_details: []`で送信 | 400、`{"status": "error", ...}`、detailは削除されず残存 | `serializers.py:98`の`.delete()`が`ProtectedError`を送出し、`CustomSuccessMessageMixin.update()`が捕捉 |
| QUA-ITEM-10 | 正常系 | `DELETE inspection-items/{id}/` | 参照されていないItem（detail所持） | 削除 | 200、Item・紐づくdetailとも削除される | `on_delete=CASCADE` |
| QUA-ITEM-11 | 異常系 | `DELETE inspection-items/{id}/` | `InspectionResult`から参照されている | 削除 | 400、`{"status": "error", ...}`、DBに残存 | `on_delete=PROTECT` |
| QUA-ITEM-12 | 異常系 | `GET inspection-items/` | 未認証 | 呼び出し | 401 | |

### 5.2 検査実績 CRUD（`InspectionResultViewSet`、`quality/tests/test_inspection_result.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| QUA-RESULT-01 | 正常系 | `POST inspection-results/` | 定量・定性のMeasurementDetailが存在 | 両方とも規格内の値で作成 | 201、`judgment="pass"` | `compute_overall_judgment`をAPI経由で確認 |
| QUA-RESULT-02 | 異常系 | `POST inspection-results/` | 定量detailが存在 | 規格外の値で作成 | 201（作成自体は成功）、`judgment="fail"` | |
| QUA-RESULT-03 | 境界値 | `POST inspection-results/` | 定量detailが存在 | 値を送信しない | 201、`judgment="pending"` | |
| QUA-RESULT-04 | 正常系 | `POST inspection-results/` | - | `judgment="fail"`を明示的に送信 | 201、実際の`judgment`はサーバ側で再計算した`"pending"`になる、`inspected_by`はリクエストユーザー | `read_only_fields`によりクライアント指定値は無視される |
| QUA-RESULT-05 | 正常系 | `GET inspection-results/` | InspectionResultが存在 | 一覧取得 | 200、`inspected_by_username`が表示される | |
| QUA-RESULT-06 | 正常系 | `DELETE inspection-results/{id}/` | 紐づく`InspectionResultDetail`が存在 | 削除 | 200、detailも連鎖削除される | `on_delete=CASCADE` |
| QUA-RESULT-07 | 異常系 | `GET inspection-results/` | 未認証 | 呼び出し | 401 | |

### 5.3 判定ロジック（純粋関数、`quality/tests/test_judgment_logic.py`）

| ケースID | 分類 | 対象 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|
| QUA-JUDGE-01 | 正常系 | `_judge_detail()` | 定量・規格内 | `True` | |
| QUA-JUDGE-02 | 異常系 | `_judge_detail()` | 定量・下限未満 | `False` | |
| QUA-JUDGE-03 | 異常系 | `_judge_detail()` | 定量・上限超過 | `False` | |
| QUA-JUDGE-04 | 境界値 | `_judge_detail()` | 定量・値未入力 | `None`（保留） | |
| QUA-JUDGE-05 | 正常系 | `_judge_detail()` | 定性・前後空白＋大文字小文字違いで一致 | `True` | `.strip().lower()`比較 |
| QUA-JUDGE-06 | 異常系 | `_judge_detail()` | 定性・不一致 | `False` | |
| QUA-JUDGE-07 | 境界値 | `_judge_detail()` | 定性・結果未入力 | `None`（保留） | |
| QUA-JUDGE-08 | 境界値 | `_judge_detail()` | 定性・`expected_qualitative_result`未設定 | `True`（常に合格扱い） | |
| QUA-JUDGE-OVERALL-01 | 境界値 | `compute_overall_judgment()` | detail無し | `"pending"` | |
| QUA-JUDGE-OVERALL-02 | 異常系 | `compute_overall_judgment()` | 1件でも不合格を含む | `"fail"` | |
| QUA-JUDGE-OVERALL-03 | 境界値 | `compute_overall_judgment()` | 不合格は無いが保留を含む | `"pending"` | |
| QUA-JUDGE-OVERALL-04 | 正常系 | `compute_overall_judgment()` | 全て合格 | `"pass"` | |

### 5.4 カスタムaction（`InspectionItemViewSet`、`quality/tests/test_custom_actions.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| QUA-ACTION-01 | 正常系 | `GET inspection-items/{id}/form-data/` | MeasurementDetailが存在 | 取得 | 200、`{"success": true, "measurement_details": [...]}` | `{"status": ...}`ではなく`{"success": ...}`エンベロープ |
| QUA-ACTION-02 | 正常系 | `POST inspection-items/{id}/record-result/` | 定量detailが存在 | `measurement_details_payload`をJSON文字列化してmultipartで送信 | 201、`{"success": true, ...}`、`InspectionResult`がDBに作成され`judgment`が計算される、`inspected_by`はリクエストユーザー | `InspectionResultViewSet`を経由しない専用ロジック |
| QUA-ACTION-03 | 異常系 | `POST inspection-items/{id}/record-result/` | - | 存在しない`measurement_detail_id`を含めて送信 | 400、`{"success": false, ...}` | |
| QUA-ACTION-04 | 異常系 | `POST inspection-items/{id}/record-result/` | - | `measurement_details_payload`に不正なJSON文字列を送信 | 400、`{"success": false, ...}` | `json.JSONDecodeError`を捕捉 |

## 6. シリアライザの read_only_fields 確認

| ケースID | 分類 | 対象 | 内容 |
|---|---|---|---|
| QUA-RESULT-04（兼） | 正常系 | `InspectionResultSerializer` | `read_only_fields = ["id", "inspected_at", "inspected_by", "inspected_by_username", "judgment", "judgment_display"]`。`create()`が`inspected_by`・`judgment`を強制的にサーバ側の値で上書きするため、クライアントからの指定は常に無視される。 |

## 7. 既知の懸念事項

コードレビューおよび自動テスト作成の過程で判明した実装上の懸念点（いずれも今回は修正せず、事実として記録するに留める）。

1. **`quality`アプリには`__init__.py`欠落・`@property`のORM誤用バグのいずれも見つからなかった**:
   `production`/`master`で発見された「`__init__.py`欠落によるテスト検出破損」、および`inventory`/`production`で
   発見された「モデルの`@property`を`.filter()`/`.values()`に誤って渡す`FieldError`」のいずれのパターンも
   `quality`には存在しないことを確認した（`__init__.py`は最初から存在、`@property`は`grep`で0件）。
2. **応答エンベロープの不整合（`{"status": ...}` vs `{"success": ...}`）**:
   標準CRUD（`CustomSuccessMessageMixin`経由）は`{"status": "success"|"error", ...}`を返す一方、
   カスタムaction（`form-data`、`record-result`）は`{"success": true|false, ...}`という別形式を返す
   （`rest_views.py:116-123`, `177-192`）。フロントエンド側は両方の形式に対応済みと思われるが、API利用者
   （将来的な外部連携アプリ等）向けドキュメントとしては形式の統一を検討する余地がある。
3. **`update()`内の`ProtectedError`メッセージが「削除できません」と表現される**:
   `CustomSuccessMessageMixin.update()`（rest_views.py:61-70）内で`ProtectedError`を捕捉した際のメッセージが
   「削除できません」という`destroy()`用の文言のままになっている（`update()`文脈では実際には
   ネストしたMeasurementDetailの暗黙削除が原因で発生するため、文言自体は意味上大きくは外れていないが、
   `update()`と`destroy()`で同じ文言を使い回している点はコードの見通しの面で改善の余地がある）。
   QUA-ITEM-09で実際に到達することを確認済み。
4. **`InspectionResultSerializer`にカスタム`update()`が存在しない**:
   ネストされた`details`（`InspectionResultDetailSerializer`、many=True）は`create()`では明示的に処理されるが、
   `update()`はDRFデフォルトの`ModelSerializer.update()`に委ねられており、これは書き込み可能なネストリストを
   処理しない。そのため、`PATCH`/`PUT`で`InspectionResult`を更新しても`details`の内容は反映されず、
   `judgment`の再計算も行われない。将来的にネスト更新をサポートする場合は`InspectionItemDetailSerializer.update()`
   と同様のパターンを実装する必要がある。今回は挙動の確認のみで、修正は行っていない。
5. **`quality/forms.py`はレガシーコード**:
   `InspectionItemForm`等の`ModelForm`群が定義されているが、対応する`urls.py`は空、`views.py`もスタブのため
   到達可能なURLが存在しない。旧サーバーレンダリングUIの名残と見られ、削除を検討してよい（本書の対象外のため
   削除は行っていない）。
