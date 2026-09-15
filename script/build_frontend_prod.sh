#!/usr/bin/env bash
# 本番環境用にフロントエンド（React/Vite）をビルドし、frontend/dist に静的ファイルを出力する。
# compose.prod.yml / compose.https.yml のreverse-proxyコンテナは、このディレクトリを
# 読み取り専用でマウントして配信するため、本番/HTTPS構成の起動前に実行する必要がある。
#
# 型チェック(tsc --noEmit)はビルドを止めるゲートとして実行する。
# lintは既存コードに多数の警告/エラーが残っているため、結果は表示するがビルドは止めない(参考情報)。
#
# 使い方:
#   script/build_frontend_prod.sh              # lint(参考)・型チェックを行ってからビルド
#   script/build_frontend_prod.sh --skip-checks # lint・型チェックを省略してビルドのみ実行
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.yml"
SKIP_CHECKS=false

for arg in "$@"; do
  case "$arg" in
    --skip-checks)
      SKIP_CHECKS=true
      ;;
    *)
      echo "不明なオプションです: $arg" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "==> .env が見つからないため .env.example からコピーします(初回のみ)。"
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

echo "==> 依存パッケージをインストールしています(npm ci)..."
docker compose -f "$COMPOSE_FILE" run --rm frontend npm ci

if [ "$SKIP_CHECKS" = false ]; then
  echo "==> Lintを実行しています(結果は参考情報。既存の警告/エラーがあってもビルドは継続します)..."
  docker compose -f "$COMPOSE_FILE" run --rm frontend npm run lint || true

  echo "==> 型チェックを実行しています..."
  docker compose -f "$COMPOSE_FILE" run --rm frontend npm run type-check
else
  echo "==> --skip-checks が指定されたため、lint・型チェックを省略します。"
fi

echo "==> 本番用にビルドしています(npm run build)..."
# コンテナ内はrootで実行されるため、ビルド後に成果物の所有者をホスト側の実行ユーザーに合わせる
docker compose -f "$COMPOSE_FILE" run --rm frontend \
  sh -c "npm run build && chown -R $(id -u):$(id -g) dist"

echo "==> 完了しました: frontend/dist"
echo "    本番/HTTPS構成に反映するには、以下のいずれかでreverse-proxyを起動・再起動してください。"
echo "      docker compose -f compose.prod.yml up -d --build"
echo "      docker compose -f compose.https.yml up -d --build"
