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

## その他の特徴

- `django-filter` を使ったクエリパラメータによる一覧の絞り込みに対応しているエンドポイントがあります。
- CSVインポート（`base`アプリの `CsvColumnMapping` 等）や、時間のかかる処理はCeleryタスクとして非同期実行され、進捗は `base` アプリの `AsyncTask` モデル経由でポーリングできます。
- ヘルスチェック用エンドポイント `GET /api/base/health/` があり、Docker Composeの `backend` サービスのヘルスチェックに使用されています。
- 各アプリの具体的なモデル・エンドポイントの対応は[クラス構造](./08_class_structure.md)、実装ファイルは各アプリの `rest_views.py`（または`rest.py`）・`api_urls.py`・`serializers.py` を参照してください。
