# テスト仕様書: セキュリティ (security)

## 1. 対象範囲

`backend/src/security` アプリと、その組み込み先を対象とする。

- ログイン失敗によるアカウントのロック・IPのブロック（`security/lockout.py`、認証バックエンド `security/backends.py`）
- ログイン画面の画像認証（`security/login_captcha.py`。`POST /api/users/token/`、`POST /api/token-auth/` に組み込み）
- 監査ログ（`security/audit.py`、403を記録する例外ハンドラー `security/exceptions.py`、`users/rest.py`・`base/api.py` での記録）
- 管理者向けAPI（`/api/security/`）と管理コマンド（`unlock_user` / `unblock_ip` / `purge_access_logs`）
- **範囲外**: 画面（`frontend/src/pages/SecurityPage.tsx`、ログイン画面の画像認証表示）は手動で確認する。

## 2. 前提・テスト環境

- 実行コマンド: `script/run_tests.sh security`
- ログイン試行を繰り返すため、テストでは `PASSWORD_HASHERS` を MD5 に差し替えて高速化する（`security/tests/test_helpers.py`）。
- アクセス元IPは `REMOTE_ADDR` で指定する（`TRUST_X_REAL_IP` の既定値は False）。
- 各テストでは、確認したい制限以外のしきい値を `override_settings` で大きくし、他の制限が先に働かないようにする。
- 既定のしきい値: アカウント5回（ロック期間 5分 → 30分 → 管理者解除）、IP 30分以内に20回でブロック30分、画像認証3回。

## 3. テストケース

### 3.1 アカウントのロック（`test_lockout.py` / `AccountLockTests`）

| ケースID | 分類 | 手順・入力 | 期待結果 |
|---|---|---|---|
| SEC-LOCK-01 | 正常系 | 4回失敗後に正しいパスワード → さらに5回失敗 | 4回では200。5回でロック段階1・期限は約5分後、`account_locked` を記録 |
| SEC-LOCK-02 | 異常系 | ロック中に正しいパスワードでログイン | 401。メッセージは通常の失敗と同じ。失敗回数は増えず `login_rejected` を記録 |
| SEC-LOCK-03 | 正常系 | ロック期限切れ → 5回失敗を繰り返す | 2回目は約30分、3回目は管理者解除が必要（期限なし）。正しいパスワードでも401 |
| SEC-LOCK-04 | 正常系 | ロック期限切れ後にログイン成功 → 5回失敗 | ロック情報が削除され、次のロックは段階1（5分）から |
| SEC-LOCK-05 | 異常系 | 存在しないユーザーIDでログイン | 401。ロック情報は作らず、`login_failed`（理由 `unknown_user`・入力ID・IP）を記録 |
| SEC-LOCK-06 | 異常系 | ロック後に `POST /api/token-auth/` へ正しいパスワード | 400。トークンを返さない |

### 3.2 IPのブロック（`test_lockout.py` / `IpBlockTests`）

| ケースID | 分類 | 手順・入力 | 期待結果 |
|---|---|---|---|
| SEC-IP-01 | 正常系 | 同じIPから異なるユーザーIDでしきい値回失敗 | ブロックされ、正しいパスワードでも401（`login_rejected`・理由 `ip_blocked`）。他のIPは200 |
| SEC-IP-02 | 境界値 | ブロック期限切れの直後に1回失敗 → 正しいパスワード | 再ブロックされず200（ブロック前の失敗を数え直さない） |
| SEC-IP-03 | 境界値 | 31分前の失敗 + 直近の失敗でしきい値に達する | 集計期間外の失敗は数えず、ブロックしない |

### 3.3 画像認証（`test_captcha.py`）

| ケースID | 分類 | 手順・入力 | 期待結果 |
|---|---|---|---|
| SEC-CAPTCHA-01 | 正常系 | `GET /api/security/captcha/`（壊れたBearerトークン付き） | 200。`key` と PNG の data URL を返す |
| SEC-CAPTCHA-02 | 正常系 | 3回目の失敗 → 画像認証なしで正しいパスワード | 3回目の応答に `captcha_required: true`。次は401・`captcha_invalid`。アカウントの失敗回数は増えない |
| SEC-CAPTCHA-03 | 正常系 | 正しい答え（大文字）で送信 → 同じキーを再利用 | 1回目は200。キーは削除され、再利用は `captcha_invalid` |
| SEC-CAPTCHA-04 | 異常系 | 誤った答え → 同じキーに正しい答え | どちらも `captcha_invalid`（誤答でもキーは使えなくなる） |
| SEC-CAPTCHA-05 | 正常系 | 存在するID／存在しないIDで、別々のIPから3回目の失敗 | 応答本文が同一（ユーザーIDの有無を推測できない）。失敗していないIPには要求しない |
| SEC-CAPTCHA-06 | 正常系 | 画像認証付きでログイン成功 → 1回失敗 | `captcha_required: false`（成功後の失敗から数え直す） |

### 3.4 アクセス元IPと監査ログ（`test_audit.py`）

| ケースID | 分類 | 手順・入力 | 期待結果 |
|---|---|---|---|
| SEC-IPADDR-01 | 正常系 | `TRUST_X_REAL_IP=True`、X-Real-IP と X-Forwarded-For を付与 | X-Real-IP を使う |
| SEC-IPADDR-02 | 異常系 | `TRUST_X_REAL_IP=False` で同上 | REMOTE_ADDR を使う |
| SEC-IPADDR-03 | 異常系 | X-Real-IP がIPアドレスとして不正 | REMOTE_ADDR を使う |
| SEC-AUDIT-01 | 正常系 | ログイン成功 | `login_success`（ユーザー・IP・パス）を記録 |
| SEC-AUDIT-02 | 異常系 | 監査ログの保存で例外が発生 | `log_event` は None を返し、ログインは200で成功する |
| SEC-AUDIT-03 | 異常系 | 一般ユーザーがユーザー一覧を取得 | 403。`permission_denied` を記録 |
| SEC-AUDIT-04 | 異常系 | 不正なリフレッシュトークンで更新 | 401。`token_refresh_failed` を記録 |
| SEC-AUDIT-05 | 正常系 | 管理者がユーザー名とパスワードを変更 | `user_updated` に変更前後のユーザー名と `password_changed: true`。パスワードの値は残さない |
| SEC-AUDIT-06 | 正常系 | 管理者がユーザーを作成・削除 | `user_created`（パスワードを含まない値）・`user_deleted` を記録 |
| SEC-AUDIT-07 | 正常系 | 本人がプロフィールとパスワードを変更 | `profile_updated`（変更前後）・`password_changed` を記録 |
| SEC-AUDIT-08 | 正常系 | QRコードアクションの登録・削除、CSV取込 | `settings_changed`（create/delete）、`csv_imported`（ファイル名・データ種別）を記録 |

### 3.5 管理者向けAPI（`test_api.py`）

| ケースID | 分類 | 手順・入力 | 期待結果 |
|---|---|---|---|
| SEC-LOGAPI-01 | 異常系 | 一般ユーザーが一覧・CSV出力 | 403 |
| SEC-LOGAPI-02 | 正常系 | イベント・IP（前方一致）・開始日で絞り込み | 条件に合う件数。イベントの選択肢と表示名を返す |
| SEC-LOGAPI-03 | 正常系 | CSV出力 | BOM付きUTF-8、見出しとログの行を含む。`access_log_exported` を記録 |
| SEC-LOCKAPI-01 | 正常系 | ロック状況の取得 → アカウントのロック解除 → もう一度解除 | ロック中のアカウントとブロック中のIPを返す。解除で200・`account_unlocked`（操作者・対象）。2回目は404 |
| SEC-LOCKAPI-02 | 正常系 | IPのブロック解除 → もう一度解除 → ログイン | 200・`ip_unblocked`。2回目は404。解除後はログインできる |
| SEC-LOCKAPI-03 | 異常系 | 一般ユーザーがロック状況の取得・解除 | 403 |

### 3.6 管理コマンド（`test_commands.py`）

| ケースID | 分類 | 手順・入力 | 期待結果 |
|---|---|---|---|
| SEC-CMD-01 | 正常系 | `unlock_user --list` → `unlock_user testuser` → 存在しないID | 一覧に表示。解除して `account_unlocked`（by: command）を記録。存在しないIDは CommandError |
| SEC-CMD-02 | 正常系 | 2アカウントをロック → `unlock_user --all` | すべて解除 |
| SEC-CMD-03 | 正常系 | `unblock_ip --list` → `unblock_ip <IP>` | 一覧に表示され、解除後の一覧は空 |
| SEC-CMD-04 | 正常系 | 400日前と現在のログ → `purge_access_logs`、`--days 0` | 古いログだけ削除。`--days 0` は CommandError |

## 4. 既知の懸念事項

1. 開発用の `compose.yml` では Vite の開発サーバーが API を中継するため、すべてのアクセスが frontend コンテナのIPから届く。
   開発環境でログインに何度も失敗すると、全員がブロック・画像認証の対象になる。
   解除は `python manage.py unblock_ip --all`。
2. 画像認証は API のログイン（`/api/users/token/`、`/api/token-auth/`）にだけある。Django Admin は公開していない
   （`base/urls.py` に `/admin/` がない）。
