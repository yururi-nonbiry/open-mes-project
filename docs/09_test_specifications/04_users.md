# テスト仕様書: ユーザー管理 (users)

## 1. 対象範囲

`backend/src/users` アプリが提供するAPI（`users/rest.py` のDRFビュー群、`users/api_urls.py`）を対象とする。

- 対象: カスタムユーザーモデル (`CustomUser`)、JWT認証 (`token/`, `token/refresh/`, `token/blacklist/`)、
  セッション情報取得 (`session/`)、自分自身のプロフィール参照・更新 (`settings/`)、パスワード変更
  (`settings/password/`)、APIトークンの参照・再生成 (`settings/token/`)、ログアウト (`logout/`)、
  管理者向けユーザーCRUD (`UserViewSet`)、パスワード有効期限ミドルウェア (`users/middleware.py`)。
- **範囲外（他アプリ・非対象の責務）**:
  - `users/urls.py`（空、非APIビュー用に予約されているが未使用）、`users/forms.py`
    （`CustomPasswordChangeForm`。どこからも参照されていないテンプレートビュー用フォーム）。
  - トップレベル `base/urls.py` の `api/token-auth/`（DRF標準の `obtain_auth_token`）は `users` アプリの
    実装ではないため対象外だが、本書 [7. 既知の懸念事項](#7-既知の懸念事項) で軽く触れる。
  - `register_user` / `CustomObtainAuthToken`（`rest.py`）はどのURLconfからも参照されていないデッドコードのため、
    テスト対象外（[7. 既知の懸念事項](#7-既知の懸念事項) 参照）。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh users`
- テストクラスは `rest_framework.test.APITestCase` を使用し、`reverse("users_api:<url_name>")` でURL解決する。
- `AUTH_USER_MODEL = "users.CustomUser"`。ログインIDは `custom_id`（`USERNAME_FIELD`）であり、`username` は表示用で
  一意制約なし。
- 認証方式は2系統が併存する。
  - **JWT**（`rest_framework_simplejwt`、Webフロントエンドの主経路）: `DEFAULT_AUTHENTICATION_CLASSES` に登録済み。
  - **固定APIトークン**（`rest_framework.authtoken`、QRリーダー等のデバイスや外部データ連携アプリ向け）:
    2026-07-23に正式有効化（詳細は [7. 既知の懸念事項](#7-既知の懸念事項) 項目1）。`DEFAULT_AUTHENTICATION_CLASSES` に
    `TokenAuthentication` を追加し、`INSTALLED_APPS` に `rest_framework.authtoken` を追加、
    `manage.py migrate authtoken` を実行済み。
  - DRFの `DEFAULT_AUTHENTICATION_CLASSES` に `SessionAuthentication` は含まれないため、Djangoのセッションログイン
    (`self.client.login()`) だけではDRFビューの `IsAuthenticated` を満たせない点に注意（後述のミドルウェアテストで
    このズレを踏まえたアサーションを行う）。
- パスワード有効期限: `settings.PASSWORD_EXPIRATION_DAYS`（デフォルト180日）。

## 3. モデル仕様まとめ（テスト観点の根拠）

| モデル/クラス | 参照 | テスト上の要注意点 |
|---|---|---|
| `UserManager` | `models.py:15-42` | `create_user`は`custom_id`必須（空だと`ValueError`）。`create_superuser`は`is_staff`/`is_superuser`を`False`で渡すと`ValueError`。 |
| `CustomUser` | `models.py:46-152` | `id`はUUID主キー。`custom_id`が一意・ログインID。`email`は`unique=True, null=True`で空文字は`save()`時に`None`へ正規化。`set_password()`は`password_last_changed`をメモリ上で更新するのみで保存は呼び出し元の責任（Djangoの慣例通り）。`is_password_expired`は`@property`のみで`setter`なし。 |
| `IsStaffOrSuperuser` | `rest.py:184-190` | `UserViewSet`専用のカスタムパーミッション。`is_staff`または`is_superuser`のいずれかでアクセス許可。 |
| `PasswordExpirationMiddleware` | `middleware.py` | `process_view`フックで動作するため、DRFの認証（JWT/Token）が確定する前に`request.user`を参照する。セッション認証されたユーザーには機能するが、JWT/Tokenのみで認証するリクエストには効果がない（[7. 既知の懸念事項](#7-既知の懸念事項) 項目3）。 |

## 4. 既存自動テストの状況

`users/tests.py` は空（コメントのみ）だった。認証・プロフィール管理・管理者用ユーザーCRUD・
パスワード有効期限ミドルウェアのいずれについても自動テストが**存在しなかった**。本書はこのギャップを
埋めることを主目的とする。

## 5. テストケース一覧

### 5.1 `UserManager` / `CustomUser` モデル（`users/tests/test_model.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-MGR-01 | 異常系 | `UserManager.create_user` | - | `custom_id=""` | `ValueError` | |
| USR-MGR-02 | 正常系 | `UserManager.create_user` | - | 通常作成 | `is_staff`/`is_superuser`ともに`False` | |
| USR-MGR-03 | 正常系 | `UserManager.create_superuser` | - | 通常作成 | `is_staff`/`is_superuser`ともに`True` | |
| USR-MGR-04 | 異常系 | `UserManager.create_superuser` | - | `is_staff=False`を明示指定 | `ValueError` | |
| USR-MGR-05 | 異常系 | `UserManager.create_superuser` | - | `is_superuser=False`を明示指定 | `ValueError` | |
| USR-MODEL-01 | 正常系 | `CustomUser.__str__` | - | `str(user)` | `custom_id`を返す | |
| USR-MODEL-02 | 正常系 | `get_full_name` | `first_name`/`last_name`設定済み | 呼び出し | `"姓 名"`形式 | |
| USR-MODEL-03 | 正常系 | `get_short_name` | - | 呼び出し | `first_name`を返す | |
| USR-MODEL-04 | 境界値 | `save()` | `email=""` | 保存 | `email`が`None`になる | |
| USR-MODEL-05 | 正常系 | `save()` | `email`のドメイン部が大文字混在 | 保存 | ドメイン部が小文字化される（`normalize_email`） | |
| USR-MODEL-06 | 正常系 | `set_password` | - | `set_password`のみ呼び出し、保存前に`refresh_from_db` | `password_last_changed`は変化しない。明示的に`save()`した後は変化する | Djangoの慣例通り、保存は呼び出し元の責任 |
| USR-MODEL-07 | 境界値 | `is_password_expired` | `password_last_changed`が200日前 | プロパティ参照 | `True`（`PASSWORD_EXPIRATION_DAYS=180`） | |
| USR-MODEL-08 | 境界値 | `is_password_expired` | `password_last_changed`が10日前 | プロパティ参照 | `False` | |
| USR-MODEL-09 | 境界値 | `is_password_expired` | `PASSWORD_EXPIRATION_DAYS=None` | プロパティ参照 | 常に`False`（機能無効化） | |
| USR-MODEL-10 | 境界値 | `is_password_expired` | `password_last_changed=None` | プロパティ参照 | `True`（安全側に倒す仕様） | |

### 5.2 JWT認証・セッション情報（`users/tests/test_auth_jwt.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-JWT-01 | 正常系 | `POST token/` | 有効なユーザー | 正しい`custom_id`/`password` | 200、`access`/`refresh`を含む | |
| USR-JWT-02 | 異常系 | `POST token/` | - | 誤ったパスワード | 401 | |
| USR-JWT-03 | 正常系 | `POST token/refresh/` | 有効な`refresh`トークン保有 | リフレッシュ | 200、新しい`access` | |
| USR-JWT-04 | 異常系 | `POST token/refresh/` | `refresh`トークンをブラックリスト登録済み | 同トークンでリフレッシュ | 401 | `token_blacklist`アプリによる失効 |
| USR-SESSION-01 | 正常系 | `GET session/` | 未認証 | 呼び出し | 200、`isAuthenticated: false`（401ではない） | |
| USR-SESSION-02 | 正常系 | `GET session/` | JWT `access`トークンで認証 | `Authorization: Bearer ...`付き呼び出し | 200、`isAuthenticated: true`、`isStaff`/`isSuperuser`が実値と一致 | |

### 5.3 プロフィール参照・更新（`users/tests/test_settings.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-PROFILE-01 | 正常系 | `GET settings/` | 認証済み | 呼び出し | 200、`custom_id`等を含む。`password`は含まれない（`write_only`） | |
| USR-PROFILE-02 | 正常系 | `PATCH settings/` | 認証済み | `username`/`email`を更新 | 200、DBに反映 | |
| USR-PROFILE-03 | 境界値 | `PATCH settings/` | 認証済み一般ユーザー | `is_staff: true`を送信 | 200だが`is_staff`は変化しない | `UserProfileUpdateSerializer`は`username`/`email`のみ受け付ける |

### 5.4 パスワード変更（`users/tests/test_settings.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-PWCHANGE-01 | 正常系 | `POST settings/password/` | 認証済み | 正しい旧パスワード＋一致する新パスワード2回 | 200、新パスワードでログイン可能に | |
| USR-PWCHANGE-02 | 異常系 | `POST settings/password/` | 認証済み | 誤った旧パスワード | 400（`old_password`エラー） | |
| USR-PWCHANGE-03 | 異常系 | `POST settings/password/` | 認証済み | `new_password1`≠`new_password2` | 400 | |

### 5.5 APIトークン参照・再生成（`users/tests/test_api_token.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-TOKEN-01 | 正常系 | `GET settings/token/` | トークン未発行 | 呼び出し | 200、初回呼び出しで自動作成される | 2026-07-23 `GET`未実装（405）を修正済み（[7. 既知の懸念事項](#7-既知の懸念事項) 項目2） |
| USR-TOKEN-02 | 正常系 | `GET settings/token/` | トークン発行済み | 複数回呼び出し | 毎回同じトークン文字列を返す | |
| USR-TOKEN-03 | 正常系 | `POST settings/token/` | トークン発行済み | 再生成リクエスト | 200、新しいトークン文字列（旧トークンは無効化） | |
| USR-TOKEN-04 | 正常系 | `Authorization: Token <key>` | 発行済みトークン | 別クライアントからトークンヘッダーで他エンドポイントを呼び出し | 200で認証される | `TokenAuthentication`登録により実際に機能することを確認 |

### 5.6 ログアウト（`users/tests/test_api_token.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-LOGOUT-01 | 正常系 | `POST logout/` | APIトークン発行済み | 呼び出し | 200、APIトークンが削除される | |
| USR-LOGOUT-02 | 正常系 | `POST logout/` | APIトークン未発行 | 呼び出し | 200（`Token.DoesNotExist`を握りつぶして正常終了） | |

### 5.7 パスワード有効期限ミドルウェア（`users/tests/test_password_expiration_middleware.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-PWEXP-01 | 異常系 | `PasswordExpirationMiddleware` | セッションログイン済み、パスワード期限切れ | 通常エンドポイント呼び出し | 403、`code: "password_expired"` | |
| USR-PWEXP-02 | 正常系 | `PasswordExpirationMiddleware` | セッションログイン済み、パスワード期限内 | 通常エンドポイント呼び出し | `password_expired`ではブロックされない | DRFの`IsAuthenticated`自体は別途401になりうるが、本ケースはミドルウェアの挙動のみを検証 |
| USR-PWEXP-03 | 正常系 | `PasswordExpirationMiddleware` | セッションログイン済み、パスワード期限切れ | 除外対象の`logout/`を呼び出し | `password_expired`ではブロックされない | |
| USR-PWEXP-04 | 境界値 | `PasswordExpirationMiddleware` | JWTで認証、パスワード期限切れ | 通常エンドポイント呼び出し | 200（ブロックされない） | **既知の懸念事項**: JWT認証経路では本チェックが実質無効（[7. 既知の懸念事項](#7-既知の懸念事項) 項目3） |

### 5.8 管理者向けユーザーCRUD（`UserViewSet`、`users/tests/test_user_viewset.py`）

| ケースID | 分類 | 対象 | 前提条件 | 手順・入力 | 期待結果 | 備考 |
|---|---|---|---|---|---|---|
| USR-VS-PERM-01 | 異常系 | `GET /api/users/` | 未認証 | 呼び出し | 401 | |
| USR-VS-PERM-02 | 異常系 | `GET /api/users/` | 一般ユーザーで認証 | 呼び出し | 403 | `IsStaffOrSuperuser` |
| USR-VS-PERM-03 | 正常系 | `GET /api/users/` | staffユーザーで認証 | 呼び出し | 200 | |
| USR-VS-PERM-04 | 正常系 | `GET /api/users/` | superuserで認証 | 呼び出し | 200 | |
| USR-VS-CRUD-01 | 正常系 | `GET /api/users/` | staff認証、複数ユーザー存在 | 一覧取得 | 200、プレーンな配列（ページネーション未設定） | |
| USR-VS-CRUD-02 | 異常系 | `POST /api/users/` | staff認証 | `password`を省略して作成 | 400 | `AdminUserSerializer.create`が明示的に検証 |
| USR-VS-CRUD-03 | 正常系 | `POST /api/users/` | staff認証 | 有効なデータで作成 | 201、パスワードはハッシュ化されて保存 | |
| USR-VS-CRUD-04 | 正常系 | `GET /api/users/{id}/` | staff認証 | 詳細取得 | 200 | |
| USR-VS-CRUD-05 | 正常系 | `PATCH /api/users/{id}/` | staff認証 | `is_staff`を更新 | 200、DBに反映 | `AdminUserSerializer`では`is_staff`はread_only指定なし |
| USR-VS-CRUD-06 | 正常系 | `PATCH /api/users/{id}/` | staff認証 | `password`を更新 | 200、ハッシュ化されて保存（平文と一致しない） | |
| USR-VS-CRUD-07 | 正常系 | `DELETE /api/users/{id}/` | staff認証 | 削除 | 204、DBから削除される | |
| USR-VS-CRUD-08 | 異常系 | `POST /api/users/` | staff認証、`custom_id`重複 | 既存と同じ`custom_id`で作成 | 400（一意制約） | |

## 6. シリアライザの read_only_fields 確認

| ケースID | 分類 | 対象 | 内容 |
|---|---|---|---|
| USR-VS-CRUD-05（兼) | 正常系 | `AdminUserSerializer` | `read_only_fields = ["id", "date_joined", "last_login", "password_last_changed"]`。`is_staff`/`is_superuser`/`is_active`はread_only指定がなく、staff権限を持つ操作者からは更新可能（意図的な仕様と推測されるが、権限昇格の観点で要注意）。 |
| USR-PROFILE-03（兼) | 正常系 | `UserProfileUpdateSerializer` | `fields = ["username", "email"]`のみで、他フィールドはそもそも受け付けない（read_only_fields指定は不要）。 |

## 7. 既知の懸念事項

コードレビューおよび自動テスト作成の過程で判明した実装上の懸念点。項目1・2はユーザーの要望
（QRリーダー等のデバイスやデータ仲介アプリとの連携を見据えたAPIトークン機能の本格運用）を受けて
**2026-07-23に修正済み**。項目3以降は現時点では未修正。

1. **【修正済み・2026-07-23】APIトークン機能(`Token`モデル)が二重に機能していなかった**:
   - `rest_framework.authtoken`が`INSTALLED_APPS`に登録されておらず、`authtoken_token`テーブル自体が
     存在しなかった（`docker compose run --rm --no-deps backend python manage.py shell`で
     `connection.introspection.table_names()`により直接確認）。このため`APILogoutView`(`logout/`)と
     `APITokenView`(`settings/token/`)はToken操作の度に`django.db.utils.ProgrammingError`で500エラーに
     なっていた。トップレベルの`base/urls.py`の`api/token-auth/`（DRF標準`obtain_auth_token`）も同様。
   - 仮にテーブルが存在しても、`REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"]`に
     `TokenAuthentication`が一切登録されておらず、発行された固定トークンを`Authorization: Token ...`
     ヘッダーで提示しても認証できない状態だった（コードベース全文検索でも`authentication_classes`の
     個別上書きは存在しないことを確認済み）。
   - フロントエンド`UserSettings.tsx`には既に「APIトークン管理」UI（表示・再生成ボタン）が実装されており、
     デッドコードではなく実運用を意図した機能と判断。ユーザーからQRリーダー等のデバイス接続・データ仲介
     アプリとの連携を予定していると確認を得た上で、以下の対応を行った。
     - `base/settings.py`: `INSTALLED_APPS`に`"rest_framework.authtoken"`を追加し、
       `manage.py migrate authtoken`を実行（`authtoken.0001_initial`〜`0004_alter_tokenproxy_options`を適用）。
     - `base/settings.py`: `REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"]`に
       `"rest_framework.authentication.TokenAuthentication"`を追加（JWTと併用、Web側はJWT・デバイス/外部連携は
       固定トークンという使い分けを想定）。
   - 修正後、`script/run_tests.sh users`で全49件成功（[reports/users_20260723_031040.md](./reports/users_20260723_031040.md)）、
     既存の`inventory`/`production`テスト（計164件）も引き続き成功することを確認済み（設定変更による回帰なし）。
2. **【修正済み・2026-07-23】`APITokenView`に`GET`が未実装で、既存トークンの参照が常に405だった**:
   フロントエンドは画面初期表示時に`GET settings/token/`で既存トークンを取得しようとするが、
   `APITokenView`(`rest.py`)には`post`しか定義されておらず、`GET`は常に405 Method Not Allowedだった
   （エラーはフロントエンド側で握りつぶされ`console.warn`のみだったため気付きにくい）。この状態では
   ページを再読み込みするたびにユーザーは既存トークンを確認できず、確認したい場合は毎回「再生成」を
   行ってデバイス側の設定をやり直す必要があった。`GET`ハンドラを追加し、`Token.objects.get_or_create`で
   既存トークン（なければ新規作成）を返すよう修正（USR-TOKEN-01/02）。
3. **`PasswordExpirationMiddleware`はJWT/固定トークン認証のリクエストに対して実質機能しない**:
   Djangoの`process_view`ミドルウェアフックは、DRFの`APIView.dispatch()`内で行われる認証処理
   （`perform_authentication` → `request.user`アクセスによるJWT/Token解決）よりも**先に**実行される。
   このため`PasswordExpirationMiddleware`が参照する`request.user`は、この時点では
   `AuthenticationMiddleware`が解決するDjangoの**セッション**ベースの値（未ログインなら`AnonymousUser`）
   のままであり、`is_authenticated`が`False`となって即座にチェックがスキップされる。
   結果として、本アプリの主要な認証経路であるJWT（および今回有効化した固定APIトークン）を使った
   リクエストに対しては、パスワード期限切れでも403でブロックされない（USR-PWEXP-04で実際に再現・確認）。
   セッションCookieで認証している場合（例: Django管理サイトなど、`admin`は別途除外されているため実質該当なし）
   にのみ機能する、という設計と実装のズレがある。対応するには、ミドルウェアではなくDRFの共通
   `permission_classes`／`APIView`の基底クラスなど、DRF認証確定後のフックに移す設計変更が必要になり、
   全API共通の挙動に影響するため、今回は既知の懸念事項としての記録に留め、修正は行っていない。
4. **`PasswordExpirationMiddleware`の除外リストに存在しないURL名が含まれている**:
   `middleware.py`の`exempt_view_names`に`"users_api:api_login"`が含まれるが、現在の`api_urls.py`には
   この名前のURLが存在しない（ログイン相当は`token_obtain_pair`）。実害は小さい
   （項目3の通り、そもそも未認証状態の`token/`呼び出しではミドルウェアのチェック自体がスキップされるため）が、
   コードの意図と実装のズレとして記録する。
5. **`register_user`/ `CustomObtainAuthToken`（`rest.py`）はデッドコード**:
   どちらもどのURLconfからも参照されておらず、到達不能。将来的な整理対象として記録するに留め、
   今回は削除・修正を行っていない。
