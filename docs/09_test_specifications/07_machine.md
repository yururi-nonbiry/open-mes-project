# テスト仕様書: 設備管理 (machine)

## 1. 対象範囲

`backend/src/machine` アプリが提供するAPI（DRF `ModelViewSet`、`machine/rest_views.py`）を対象とする。

- 対象: 設備マスター (`Machine`) のCRUDエンドポイントのみ。
- **範囲外・注記**:
  - [00_overview.md](./00_overview.md)の一覧では「設備の稼働状況・生産実績・資産管理」と記載されているが、
    実装済みのコードは`machine_number`/`name`/`location`/`description`のみを持つ単純な設備マスターCRUDに
    留まっており、稼働状況トラッキングや生産実績との連携機能はコード上に存在しない。本書は現状実装されて
    いる範囲（設備マスターCRUD）のみを対象とする。
  - `machine/urls.py`は空（`api_urls.py`に委譲済み）、`machine/views.py`も「新UIはrest_views.pyで実装」との
    コメントのみのスタブで対象外。
  - `Machine`は他アプリのどのモデルからもFK参照されておらず（`grep`で確認済み）、他アプリ側の整合性検証は
    そもそも存在しない。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh machine`
- テストクラスは`rest_framework.test.APITestCase`を使用し、`reverse("machine_api:machine-list"/"machine-detail")`
  でURL解決する（`machine-detail`は`kwargs={"pk": machine.id}`）。
- ViewSetの`permission_classes`は`[IsAuthenticated]`のみ。
- `master.rest_views.CustomSuccessMessageMixin`を`machine`も再利用しており、応答形式は`master`/`quality`と
  同一（`{"status": "success", "data": ...}`、ページネーションなし、`destroy()`もHTTP 200）。
- `get_serializer_class()`により、`list`アクションのみ`MachineSerializer`（`created_at`を含む）、それ以外
  （`retrieve`/`create`/`update`/`destroy`）は`MachineCreateUpdateSerializer`（`created_at`を含まない）が
  使われる非対称な挙動がある。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル | 参照 | テスト上の要注意点 |
|---|---|---|
| `Machine` | `models.py:7-23` | `machine_number`は`unique=True`（DB制約＋`MachineCreateUpdateSerializer`のカスタム`UniqueValidator`により専用の日本語エラーメッセージ「この設備番号は既に使用されています。」を返す）。`machine_number`はupdate時も`read_only`化されておらず、`master`の各モデルの`code`系フィールドとは異なり自由に変更可能。FK・`@property`は一切なし。 |

## 4. 既存自動テストの状況

`machine/tests.py`は空（コメントのみ）だった。CRUDについて自動テストが**存在しなかった**。加えて、
本アプリには`migrations/`ディレクトリ自体が一つも存在せず（`0001_initial.py`すら無し）、実際の開発用DBにも
`machine_machine`テーブルが存在しない状態だった（設備マスターCRUD機能自体が全く動作しない状態）ことを
コード調査中に発見した。本書はこの2点のギャップを埋めることを主目的とする。

## 5. テストケース一覧

### 5.1 設備マスター CRUD（`MachineViewSet`、`machine/tests/test_machine.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| MCH-01 | 正常系 | `GET machines/` | Machineが存在 | 一覧取得 | 200、各行に`created_at`を含む | list専用の`MachineSerializer` |
| MCH-02 | 正常系 | `POST machines/` | - | 有効なデータで作成 | 201、DBに反映 | |
| MCH-03 | 異常系 | `POST machines/` | `machine_number`重複 | 作成 | 400、カスタムエラーメッセージ「この設備番号は既に使用されています。」を含む | `UniqueValidator(message=...)` |
| MCH-04 | 境界値 | `GET machines/{id}/` | 既存Machineが存在 | 取得 | 200、`created_at`を含まない | `retrieve`は`MachineCreateUpdateSerializer`を使うため（list時との非対称仕様） |
| MCH-05 | 正常系 | `PATCH machines/{id}/` | 既存Machineが存在 | `name`を更新 | 200、DBに反映 | |
| MCH-06 | 正常系 | `PATCH machines/{id}/` | 既存Machineが存在 | `machine_number`を更新 | 200、DBに反映（変更が許容される） | `master`の各モデルと異なり`read_only`化されていない |
| MCH-07 | 正常系 | `DELETE machines/{id}/` | 既存Machineが存在 | 削除 | 200、DBから削除 | |
| MCH-08 | 異常系 | `GET machines/` | 未認証 | 呼び出し | 401 | |

## 6. シリアライザの read_only_fields 確認

明示的な`read_only_fields`はどちらのシリアライザにも定義されていない。`id`（`editable=False`）と
`MachineSerializer`の`created_at`（`auto_now_add=True`）はDRFが自動的に読み取り専用と判定するのみで、
アプリケーション側で意図的に読み取り専用化しているフィールドは存在しない（`machine_number`もupdate時に
書き換え可能、MCH-06で確認）。

## 7. 既知の懸念事項

コードレビューおよび自動テスト作成の過程で判明した実装上の懸念点。

1. **【修正済み・2026-07-23】`machine/migrations/`ディレクトリが一つも存在しなかった**:
   他の全アプリ（`inventory`/`production`/`master`/`quality`/`users`）には`0001_initial.py`を含む
   `migrations/`パッケージが存在するが、`machine`アプリのみ完全に欠落していた。`manage.py showmigrations machine`
   で"(no migrations)"と表示され、実際の開発用DBに対して`connection.introspection.table_names()`で確認した
   ところ`machine_machine`テーブルが存在しないことも確認した（つまり設備マスターCRUD機能は実運用でも
   全く動作しない状態だった）。ユーザーへの確認の上、`manage.py makemigrations machine`で
   `machine/migrations/0001_initial.py`を生成し、`manage.py migrate machine`を実行して開発用DBにも
   テーブルを作成した。Djangoのテストランナーは`run_syncdb`で自動的にテーブルを作成するため、この問題が
   あってもテスト自体は偶然動作してしまう点に注意（テストが通ることと、実運用DBにテーブルが存在することは
   別問題）。
2. **`machine`アプリ自体には`@property`のORM誤用バグ・`__init__.py`欠落のいずれも見つからなかった**:
   `production`/`master`で発見された`__init__.py`欠落は`machine`には存在せず、`inventory`/`production`で
   発見された`@property`関連の`FieldError`パターンも、そもそも`Machine`モデルには`@property`が一切存在しない
   ため該当しない。
3. **`list`と`retrieve`でシリアライザが非対称（`created_at`の有無）**:
   `get_serializer_class()`により`list`アクションのみ`MachineSerializer`（`created_at`を含む）が使われ、
   `retrieve`を含むそれ以外は`MachineCreateUpdateSerializer`（`created_at`を含まない）が使われる。
   フロントエンドが一覧画面と詳細画面で異なるフィールドセットを前提にしている場合は問題ないが、
   API利用者（外部連携等）向けには一見不自然な非対称仕様のため、MCH-04として明示的にテストし記録した。
   修正は行っていない（意図的な設計の可能性があるため）。
4. **`machine/urls.py`はレガシーコード**:
   空の`urlpatterns`かつ`api_urls.py`に委譲済みとのコメントがあり、`quality`/`master`と同様の
   「未使用の空ファイル」パターン。削除を検討してよいが本書の対象外のため削除は行っていない。
