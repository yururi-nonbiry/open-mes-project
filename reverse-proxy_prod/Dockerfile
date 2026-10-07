# 特定のバージョンのNginxをベースイメージとして使用します
FROM nginx:1.27-alpine

# 設定ファイルのテンプレートをコンテナ内にコピーします。
# 起動時に環境変数(NGINX_REAL_IP_FROM)を埋め込んだ /etc/nginx/conf.d/default.conf が生成されます
COPY ./default.conf.template /etc/nginx/templates/default.conf.template