# 本番サーバーのセキュリティ設定

ログイン失敗によるロック・IPブロック・画像認証と監査ログ（`security` アプリ）を正しく動かすための、サーバー側の設定です。
アプリ側の仕様は [API構造と言語インタフェース](../05_api.md#ログインの保護と監査ログsecurity-アプリ) を参照してください。

| 手順 | 必須か | 内容 |
|---|---|---|
| [1. アクセス元IPを Django に正しく渡す](#1-アクセス元ipを-django-に正しく渡す) | 必須 | ブロックや監査ログが、本来のアクセス元IPで動くようにする |
| [2. 前段にホストの nginx を置く場合](#2-前段にホストの-nginx-を置く場合) | 該当する構成のみ必須 | コンテナの nginx を外部に公開せず、ホストの nginx から X-Real-IP を受け取る |
| [3. 国別のアクセス制限（日本のみ許可）](#3-国別のアクセス制限日本のみ許可) | 任意 | GeoIP2 で日本以外からのアクセスを拒否する |
| [4. ファイアウォール](#4-ファイアウォール) | 推奨 | 必要なポートだけを開ける |
| [5. ロックの解除とログの削除](#5-ロックの解除とログの削除) | 運用 | コマンドでの解除、古いログの定期削除 |

## 0. 反映手順

1. 追加したパッケージ（`django-simple-captcha` など）を入れるため、backend のイメージを作り直して起動します。
   起動時に `migrate` が実行され、監査ログなどのテーブルが作られます。

   ```bash
   docker compose -f compose.prod.yml up -d --build
   ```

2. フロントエンドを再ビルドします（`script/build_frontend_prod.sh`）。
3. 下記の 1・2 を、サーバーの構成に合わせて設定します。

## 1. アクセス元IPを Django に正しく渡す

Django はアクセス元IPを次のように判定します。`X-Forwarded-For` はクライアントが任意の値を送れるため使いません。

- `TRUST_X_REAL_IP=True` のとき: nginx が付ける `X-Real-IP` ヘッダー
- それ以外: 接続元のアドレス（`REMOTE_ADDR`）

`compose.prod.yml` と `compose.https.yml` では backend に `TRUST_X_REAL_IP=True` を設定済みです。同梱の nginx は
`proxy_set_header X-Real-IP $remote_addr;` で、クライアントが送った値を必ず上書きします。
backend はポートを公開していないため、nginx を通らずに偽の `X-Real-IP` を送ることはできません。

**同梱の nginx を使わない構成**（`.env` で `START_NGINX=0` とし、別の nginx から backend へ中継する場合）では、
その nginx にも次の設定を入れてください。入れないと、全員が同じIPに見え、1人の失敗で全員がブロックされます。

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

backend のポートを外部に公開する構成では、`.env` で `TRUST_X_REAL_IP=False` にしてください。

### 確認方法

ログインしてから「管理者メニュー > セキュリティ > アクセスログ」を開き、「ログイン成功」の IPアドレスが
自分の端末（またはルーター）のアドレスになっていることを確認します。`172.x.x.x` などの Docker 内部のアドレスに
なっている場合は、X-Real-IP が正しく渡っていません。

## 2. 前段にホストの nginx を置く場合

ホストにも nginx があり（TLS終端や、他のアプリとの共用など）、そこからコンテナの nginx に中継する構成の設定です。

### 2.1 コンテナの nginx を外部に公開しない

`.env` に次を設定します。コンテナの nginx はホスト内（127.0.0.1）からしか接続できなくなります。

```dotenv
NGINX_BIND=127.0.0.1
NGINX_PORT=8080
# ホストの nginx からの接続は Docker のネットワークのゲートウェイ経由で届くため、その範囲を信頼する
NGINX_REAL_IP_FROM=172.16.0.0/12
```

`NGINX_REAL_IP_FROM` は、コンテナの nginx が `X-Real-IP` を信頼する接続元です。既定値（127.0.0.1）では信頼しません。
Docker のネットワークが `172.16.0.0/12` 以外（`192.168.x.x` など）になっている場合は、次のコマンドで確認した範囲を指定してください。

```bash
docker network inspect $(docker inspect prod_reverse_proxy -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}') \
  -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

> **注意**: `NGINX_BIND=0.0.0.0`（既定）のまま `NGINX_REAL_IP_FROM` を広い範囲にすると、その範囲から直接つないだ端末が
> `X-Real-IP` を偽装できます。社内LANから直接つなぐ構成では `NGINX_REAL_IP_FROM` を設定しないでください。

反映します。

```bash
docker compose -f compose.prod.yml up -d --build reverse-proxy
```

### 2.2 ホストの nginx の設定

`proxy_pass` を 127.0.0.1 宛てにし、`X-Real-IP` を付けます。

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    # ssl_certificate などは環境に合わせて設定

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

ホストの nginx をほかのアプリと共用している場合も、open-mes 宛ての `location` に `X-Real-IP` の設定が必要です。

## 3. 国別のアクセス制限（日本のみ許可）

任意の設定です。ホストの nginx に GeoIP2 モジュールを入れ、日本以外からのアクセスを 403 にします。
ログイン画面への総当たりの多くは海外から来るため、ロックやブロックに達する前に減らせます。

> **80番ポート（HTTP）には国別の制限をかけないでください。** Let's Encrypt は海外の複数の拠点から
> `/.well-known/acme-challenge/` にアクセスして確認するため、制限すると証明書の自動更新が失敗します。
> 制限は 443番ポート（HTTPS）の `server` だけにかけます。

### 3.1 モジュールと国別データベースの用意（Ubuntu の例）

```bash
sudo apt install libnginx-mod-http-geoip2 geoipupdate
```

MaxMind のアカウント（無料）を作り、ライセンスキーを `/etc/GeoIP.conf` に設定してから、データベースを取得します。

```bash
# /etc/GeoIP.conf の AccountID / LicenseKey を設定し、EditionIDs を GeoLite2-Country にする
sudo geoipupdate
ls /var/lib/GeoIP/GeoLite2-Country.mmdb
```

データベースは毎週更新されるため、cron などで `geoipupdate` を定期的に実行してください。

### 3.2 nginx の設定

`http` ブロック（例: `/etc/nginx/conf.d/geoip2.conf`）に追加します。社内LANなどのプライベートアドレスは国を判定できないため、許可します。

```nginx
geoip2 /var/lib/GeoIP/GeoLite2-Country.mmdb {
    $geoip2_country_code country iso_code;
}

geo $is_private_addr {
    default 0;
    127.0.0.0/8 1;
    10.0.0.0/8 1;
    172.16.0.0/12 1;
    192.168.0.0/16 1;
}

# 1 なら拒否する
map "$is_private_addr:$geoip2_country_code" $deny_by_country {
    default 1;
    "~^1:" 0;
    "0:JP" 0;
}
```

443番ポートの `server` に追加します。

```nginx
server {
    listen 443 ssl;
    # ...
    if ($deny_by_country) {
        return 403;
    }
    # location / { ... }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

海外出張先などから使う必要がある場合は、VPN を使うか、`geo` に許可するアドレスを追加してください。

## 4. ファイアウォール

クラウド（Amazon Lightsail、EC2 のセキュリティグループなど）のファイアウォールでは、必要なポートだけを開けます。

| ポート | 許可する接続元 | 用途 |
|---|---|---|
| 22 (SSH) | 管理者のIPアドレスのみ | サーバーの保守 |
| 80 (HTTP) | すべて | HTTPS へのリダイレクトと、証明書の自動更新 |
| 443 (HTTPS) | すべて（国別の制限は nginx で行う） | アプリケーション |

8080 など、コンテナの nginx のポートは開けないでください。

Lightsail の場合は、インスタンスの「ネットワーキング」タブで、IPv4 と IPv6 の両方のファイアウォールを設定します。

> **注意**: Docker が公開したポートは `ufw` の設定より優先されるため、`ufw` だけではコンテナのポートを閉じられません。
> コンテナのポートを外部に出さないためには、2.1 の `NGINX_BIND=127.0.0.1` か、クラウド側のファイアウォールを使ってください。

## 5. ロックの解除とログの削除

画面（「管理者メニュー > セキュリティ > ロック状況」）から解除できます。管理者自身がロックされた場合などは、サーバー上でコマンドを実行します。

```bash
# ロック状態の一覧
docker compose -f compose.prod.yml exec backend python manage.py unlock_user --list
# アカウントのロック解除（ログインID を指定。--all ですべて）
docker compose -f compose.prod.yml exec backend python manage.py unlock_user admin

# ブロック中のIPの一覧と解除（--all ですべて）
docker compose -f compose.prod.yml exec backend python manage.py unblock_ip --list
docker compose -f compose.prod.yml exec backend python manage.py unblock_ip 203.0.113.10
```

監査ログは自動では削除されません。保存期間（`ACCESS_LOG_RETENTION_DAYS`、既定365日）を過ぎたログを削除するよう、
ホストの cron に登録してください。期限切れのIPブロックと画像認証のデータも一緒に削除されます。

```cron
# 毎日 3:00 に実行
0 3 * * * cd /path/to/open-mes-project && docker compose -f compose.prod.yml exec -T backend python manage.py purge_access_logs
```

### しきい値の変更

`.env` で変更できます（変更後は `docker compose -f compose.prod.yml up -d backend` で反映）。

| 変数 | 既定値 | 内容 |
|---|---|---|
| `LOGIN_LOCK_THRESHOLD` | 5 | アカウントをロックするまでの連続失敗回数 |
| `LOGIN_LOCK_DURATIONS_MINUTES` | 5,30 | ロック期間（分）の段階。最後の段階を超えると管理者が解除するまでロック |
| `LOGIN_IP_BLOCK_THRESHOLD` | 20 | IPをブロックするまでの失敗回数 |
| `LOGIN_IP_BLOCK_WINDOW_MINUTES` | 30 | IPの失敗回数を数える期間（分） |
| `LOGIN_IP_BLOCK_MINUTES` | 30 | IPのブロック期間（分） |
| `LOGIN_CAPTCHA_THRESHOLD` | 3 | 画像認証を求めるまでの、同じIPからの失敗回数 |
| `ACCESS_LOG_RETENTION_DAYS` | 365 | 監査ログの保存日数 |
