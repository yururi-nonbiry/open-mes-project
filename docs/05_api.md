# API構造と言語インタフェース

open-mes-projectは、Django REST Framework (DRF) によるREST APIをバックエンドとして持ち、Reactフロントエンドはそのすべてを通じて画面を構成しています。Django側にHTMLを直接レンダリングする画面はほぼ存在せず、UIはSPA + REST APIという構成です。

## URLルーティング

ルートの `base/urls.py` で、アプリ単位のAPIルートを `alphabetically` にincludeしています。

```python
urlpatterns = [
    path("api/token-auth/", authtoken_views.obtain_auth_token, name="api_token_auth"),
    path("api/base/", include("base.api_urls", namespace="base_api")),
    path("api/inventory/", include("inventory.api_urls", namespace="inventory_api")),
    path("api/machine/", include("machine.api_urls", namespace="machine_api")),
    path("api/master/", include("master.api_urls", namespace="master_api")),
    path("api/production/", include("production.api_urls", namespace="production_api")),
    path("api/quality/", include("quality.api_urls", namespace="quality_api")),
    path("api/users/", include("users.api_urls", namespace="users_api")),
    path("__debug__/", include("debug_toolbar.urls")),
]
```

各アプリの `api_urls.py` は、DRFの `DefaultRouter` を使ってViewSetを登録するのが基本パターンです。例えば `inventory` アプリ（`backend/src/inventory/api_urls.py`）:

```python
router = DefaultRouter()
router.register(r"inventories", rest_views.InventoryViewSet, basename="inventory")
router.register(r"purchase-orders", rest_views.PurchaseOrderViewSet, basename="purchaseorder")
router.register(r"sales-orders", rest_views.SalesOrderViewSet, basename="salesorder")
router.register(r"receipts", rest_views.ReceiptViewSet, basename="receipt")
router.register(r"stock-movements", rest_views.StockMovementViewSet, basename="stockmovement")
```

これにより、たとえば `GET /api/inventory/inventories/`（一覧・詳細のCRUD）に加え、`@action`デコレータによるカスタムエンドポイント（例: `POST /api/inventory/inventories/{id}/move/` で棚間移動、`POST /api/inventory/sales-orders/allocate/` で複数ロケーションからのFIFO順在庫引当）が提供されます。ビュー本体（ViewSet、シリアライザ、業務ロジック）は各アプリの `rest_views.py`（`users`アプリのみ `rest.py`）に実装されています。

## 認証

- **JWT認証**（メイン）: `djangorestframework-simplejwt` を使用。`users` アプリの `api_urls.py` に以下のエンドポイントがあります。
  - `POST /api/users/token/`: ログイン（ユーザーID・パスワードでアクセストークン/リフレッシュトークンを取得）
  - `POST /api/users/token/refresh/`: アクセストークンの更新
  - `POST /api/users/token/blacklist/`: リフレッシュトークンの失効（ログアウト）
  - `GET /api/users/session/`: セッション（ログイン中ユーザー）情報の取得
  - アクセストークンの有効期限は60分、リフレッシュトークンは14日間（`ROTATE_REFRESH_TOKENS=True`）です。
- **固定トークン認証**（サブ）: `users.authentication.ScopedTokenAuthentication`（`rest_framework.authentication.TokenAuthentication` のサブクラス）が有効になっており、QRリーダーなど画面を持たないデバイスや外部連携アプリ向けに、`POST /api/token-auth/` で取得できる固定トークンを使った認証が可能です。ユーザー自身のトークンは `GET/POST /api/users/settings/token/` で確認・再発行できます。加えて、管理者は `GET/POST/PATCH /api/users/<uuid:pk>/token/`（`UserViewSet` の `token` アクション）から対象ユーザーのトークン発行・再発行と、`ApiTokenPolicy`（有効フラグ・接続許可IP・アクセス可能APIスコープ）の設定を行えます。ポリシー未設定のユーザーは従来通り無制限にアクセスできます（後方互換）。

CORS設定（`django-cors-headers`）により、Vite開発サーバー（別オリジン）からのAPIリクエストも許可されています。

## 応答形式

- **成否はHTTPステータスコードで判定します。** 本文に `success` / `status: "success"` のような成否フラグは含めません。
- **エラー時（4xx/5xx）の本文は全APIで次の形式に統一されています**（`backend/src/base/responses.py`）。

  ```json
  {
    "error": "画面にそのまま表示できるメッセージ（必須）",
    "errors": {"field": ["項目ごとのエラー"]},
    "code": "not_authenticated"
  }
  ```

  - `errors` は入力値エラー（400）の場合のみ付与され、キーはフィールド名（全体に関わるエラーは `non_field_errors`）です。このとき `error` には最初の項目エラーを添えたメッセージが入ります。
  - `code` は認証エラーなど、クライアントが分岐に使える識別子がある場合のみ付与されます（例: `not_authenticated`、`token_not_valid`、`password_expired`）。
  - DRFの例外（`ValidationError`、`NotFound`、`PermissionDenied`、認証エラー等）は、`REST_FRAMEWORK["EXCEPTION_HANDLER"]` に設定した `base.responses.api_exception_handler` がこの形式に変換します。ビューで個別にエラーを返す場合は `base.responses.error_response(message, status_code)` を使います。
  - 想定外の例外も同ハンドラが捕捉し、内部情報を含まない500応答（`error` のみ）を返したうえで、スタックトレースをログへ出力します。
- 成功時の本文はエンドポイントごとの形式です。マスター系（`master`/`quality`/`machine`、`base.viewsets.CustomSuccessMessageMixin`）は一覧・詳細が `{"data": ...}`、登録・更新が `{"message": ..., "data": ...}`、削除が `{"message": ...}`（HTTP 200）です。それ以外の標準ViewSetはDRF標準（一覧はページネーション形式 `{"count", "next", "previous", "results"}` またはプレーンな配列）、業務処理のカスタムactionは `{"message": ..., ...}` を返します。
- フロントエンドでは `frontend/src/utils/api.ts` の `apiRequest` / `handleError` / `toApiError` を使い、失敗時は `ApiError`（`message`・`status`・`errors`・`code`）として扱います。

## 外部連携API

### 入庫予定の一括登録・更新 `POST /api/inventory/purchase-orders/bulk-upsert/`

外部システム（手配・発注システム等）から入庫予定（`PurchaseOrder`）を発注番号をキーにまとめて登録・更新します。実装は `inventory/rest_views.py` の `PurchaseOrderViewSet.bulk_upsert` と `inventory/services.py` の `bulk_upsert_purchase_orders` です。認証は通常のAPIと同じで、固定トークンのスコープを設定している場合は `inventory` を許可してください。

- 1回に送れるのは **500件まで** です。
- 発注番号で入庫予定を探し、**あれば更新** します。送った項目だけを更新し、省略した項目（倉庫・棚番など）は今の値を残します。
- 見つからない場合は、**`allow_create: true` の行だけ新しく登録** します。印のない行は、その行だけ「該当なし」のエラーになります。
- **1件ずつ別のトランザクションで反映** します。1件が失敗しても、ほかの件は取り消しません。失敗した行は、その行の変更（同じ行の他の項目を含む）がすべて取り消されます。
- 同じ発注番号の行が複数ある場合は、送った順に反映します。

#### リクエスト

```json
{
  "items": [
    {
      "order_number": "A12345",
      "allow_create": true,
      "supplier": "S001",
      "part_number": "P-100",
      "product_name": "ブラケット",
      "quantity": 100,
      "expected_arrival": "2026-10-05T09:00:00+09:00",
      "warehouse": "RCV",
      "delivery_date": "2026-10-03",
      "delivered_quantity": 100,
      "status": "pending"
    }
  ]
}
```

| 項目 | 必須 | 説明 |
|---|---|---|
| `order_number` | ○ | 発注番号（20文字まで）。検索キー |
| `allow_create` | | `true` のときだけ、見つからなければ新しく登録する。省略時は `false` |
| `status` | | `canceled`（キャンセル）または `pending`（キャンセル取り消し）のみ指定できる。下表を参照 |
| そのほかの項目 | | `PurchaseOrderSerializer` で変更できる項目（`supplier`（仕入先番号）、`part_number`（品番コード）、`item`、`quantity`、`product_name`、`parent_part_number`、`instruction_document`、`shipment_number`、`model_type`、`is_first_time`、`color_info`、`delivery_destination`、`delivery_source`、`remarks1`〜`remarks5`、`expected_arrival`、`warehouse`（倉庫番号）、`location`、`delivery_date`、`delivered_quantity`）。入力チェックは個別の登録・更新API（`POST`/`PATCH purchase-orders/`）と同じ |

`received_quantity`・`remaining_quantity`・`order_date`・`id` は読み取り専用のため、送っても無視されます。

**`status` の扱い**

| 指定 | 今のステータス | 結果 |
|---|---|---|
| `canceled` | 入庫済数量が0 | `canceled` にする（キャンセル済みなら変更なし） |
| `canceled` | 入庫済数量が1以上 | その行はエラー（入庫済みのものはキャンセルできない） |
| `pending` | `canceled` | `pending`（未入庫）に戻す（キャンセル取り消し）。管理画面などで入庫後にキャンセルされていた場合は、入庫済数量に応じて `partially_received`/`fully_received` に戻す |
| `pending` | それ以外 | 変更しない（入庫の進捗は巻き戻さない） |
| 上記以外の値 | - | その行はエラー |

**そのほかの入力チェック**

- `quantity` は入庫済数量を下回る値にできません（その行はエラー）。入庫済みの入庫予定の数量を変えると、`partially_received`/`fully_received` を計算し直します。
- `supplier`・`part_number`・`warehouse` は、open-mesのマスタに登録済みの番号・コードである必要があります。未登録のものを指定した行はエラーになります。
- `delivery_date`（納品日、`YYYY-MM-DD`）・`delivered_quantity`（納品数）は、外部システム（仕入先側）での受領を記録するだけの項目です。在庫・入庫済数量・ステータスには反映しません。あとから入庫処置画面（「納品」ボタン）や `PATCH purchase-orders/{id}/` で直せます。

#### レスポンス

リクエスト全体が正しければ、一部の行が失敗していても **HTTP 200** を返します。行ごとの成否は `results[].result` で判定します。

```json
{
  "message": "入庫予定の一括登録・更新が完了しました(登録 1件、更新 0件、エラー 1件)。",
  "summary": {"created": 1, "updated": 0, "error": 1},
  "results": [
    {"index": 0, "order_number": "A12345", "result": "created", "id": "0192...", "status": "pending"},
    {
      "index": 1,
      "order_number": "A12346",
      "result": "error",
      "error": "入力内容に誤りがあります。(part_number: code=P-999 のデータが存在しません。)",
      "errors": {"part_number": ["code=P-999 のデータが存在しません。"]}
    }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `index` | リクエストの `items` での位置（0始まり） |
| `order_number` | 送られた発注番号 |
| `result` | `created`（新規登録）／`updated`（更新。変更がなかった場合も含む）／`error` |
| `id`, `status` | 成功時のみ。入庫予定のIDと反映後のステータス |
| `error`, `errors` | 失敗時のみ。形式はエラー応答（上記「応答形式」）と同じ。`errors` は項目別の詳細がある場合のみ |

次の場合は **HTTP 400**（エラー応答形式）を返し、1件も反映しません。

- 本文がオブジェクトでない、`items` がない・配列でない・空
- `items` が500件を超える

## その他の特徴

- `django-filter` を使ったクエリパラメータによる一覧の絞り込みに対応しているエンドポイントがあります。
- CSVインポート（`base`アプリの `CsvColumnMapping` 等）や、時間のかかる処理はCeleryタスクとして非同期実行され、進捗は `base` アプリの `AsyncTask` モデル経由でポーリングできます。
- ヘルスチェック用エンドポイント `GET /api/base/health/` があり、Docker Composeの `backend` サービスのヘルスチェックに使用されています。
- 各アプリの具体的なモデル・エンドポイントの対応は[クラス構造](./08_class_structure.md)、実装ファイルは各アプリの `rest_views.py`（または`rest.py`）・`api_urls.py`・`serializers.py` を参照してください。
