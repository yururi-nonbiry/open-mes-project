#!/usr/bin/env bash
# 自動テストを実行し、結果をMarkdownレポートとして docs/09_test_specifications/reports/ 配下に
# 出力するラッパースクリプト。手順は docs/09_test_specifications/02_running_tests.md を参照。
#
# 使い方:
#   script/run_tests.sh                 # inventory アプリ全体を実行(デフォルト)
#   script/run_tests.sh inventory       # 明示的にアプリ名を指定
#   script/run_tests.sh inventory.tests.test_allocate   # 特定のテストモジュールのみ実行
#   script/run_tests.sh production quality              # 複数アプリを一括実行
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/docs/09_test_specifications/reports"
JSON_REPORT_HOST_PATH="$ROOT_DIR/backend/src/.test_report.json"
JSON_REPORT_CONTAINER_PATH="/open_mes/.test_report.json"

TARGETS=("$@")
if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=(inventory)
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "==> .env が見つからないため .env.example からコピーします(初回のみ)。"
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

mkdir -p "$REPORT_DIR"

echo "==> db コンテナを起動しています..."
docker compose -f "$ROOT_DIR/compose.yml" up -d db

echo "==> db のヘルスチェックを待機しています..."
until [ "$(docker inspect --format='{{.State.Health.Status}}' db 2>/dev/null)" = "healthy" ]; do
  sleep 2
done

TEST_LABEL_SAFE="$(echo "${TARGETS[0]}" | tr '.' '_' | tr '/' '_')"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="$REPORT_DIR/${TEST_LABEL_SAFE}_${TIMESTAMP}.md"
DJANGO_TEST_CMD="python manage.py test ${TARGETS[*]} --testrunner=testutils.report_runner.JsonReportDiscoverRunner --verbosity 2"

echo "==> テストを実行しています: ${TARGETS[*]}"
set +e
docker compose -f "$ROOT_DIR/compose.yml" run --rm \
  -e TEST_REPORT_JSON="$JSON_REPORT_CONTAINER_PATH" \
  backend $DJANGO_TEST_CMD
TEST_EXIT_CODE=$?
set -e

if [ ! -f "$JSON_REPORT_HOST_PATH" ]; then
  echo "エラー: テスト結果JSON ($JSON_REPORT_HOST_PATH) が生成されませんでした。テストの実行自体が失敗した可能性があります。" >&2
  exit 1
fi

echo "==> レポートを生成しています: $REPORT_FILE"
python3 "$ROOT_DIR/script/generate_test_report.py" \
  --json "$JSON_REPORT_HOST_PATH" \
  --output "$REPORT_FILE" \
  --target "${TARGETS[*]}" \
  --command "$DJANGO_TEST_CMD"

rm -f "$JSON_REPORT_HOST_PATH"

echo "==> 完了しました。レポート: $REPORT_FILE"
echo "    git管理下にあるため、必要に応じて 'git add $REPORT_FILE' でコミットしてください。"

exit "$TEST_EXIT_CODE"
