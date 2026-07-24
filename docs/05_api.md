# API構造と言語インタフェース

open-mes-projectは、Django REST Framework (DRF) によるREST APIをバックエンドとして持ち、Reactフロントエンドはそのすべてを通じて画面を構成しています。Django側にHTMLを直接レンダリングする画面はほぼ存在せず、UIはSPA + REST APIという構成です。

## URLルーティング

ルートの `base/urls.py` で、アプリ単位のAPIルートを `alphabetically` にincludeしています。

```python
urlpatterns = [
    path("admin/", admin.site.urls),
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
- **固定トークン認証**（サブ）: `rest_framework.authentication.TokenAuthentication` も有効になっており、QRリーダーなど画面を持たないデバイスや外部連携アプリ向けに、`POST /api/token-auth/` で取得できる固定トークンを使った認証が可能です。ユーザー自身のトークンは `GET/POST /api/users/settings/token/` で確認・再発行できます。

CORS設定（`django-cors-headers`）により、Vite開発サーバー（別オリジン）からのAPIリクエストも許可されています。

## その他の特徴

- `django-filter` を使ったクエリパラメータによる一覧の絞り込みに対応しているエンドポイントがあります。
- CSVインポート（`base`アプリの `CsvColumnMapping` 等）や、時間のかかる処理はCeleryタスクとして非同期実行され、進捗は `base` アプリの `AsyncTask` モデル経由でポーリングできます。
- ヘルスチェック用エンドポイント `GET /api/base/health/` があり、Docker Composeの `backend` サービスのヘルスチェックに使用されています。
- 各アプリの具体的なモデル・エンドポイントの対応は[クラス構造](./08_class_structure.md)、実装ファイルは各アプリの `rest_views.py`（または`rest.py`）・`api_urls.py`・`serializers.py` を参照してください。
