#!/usr/bin/env python3
"""JSONテスト結果 (testutils.report_runner.JsonReportDiscoverRunner の出力) を
Markdownのテスト実行レポートに変換する。

script/run_tests.sh から呼び出されることを想定しているが、単体でも実行可能:

    python3 script/generate_test_report.py \\
        --json /path/to/test_report.json \\
        --output docs/09_test_specifications/reports/inventory_20260722_120000.md \\
        --target inventory \\
        --command "python manage.py test inventory"
"""
import argparse
import json
import sys
from datetime import datetime, timezone, timedelta


JST = timezone(timedelta(hours=9))


def load_report(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def render_markdown(data, target, command):
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S JST")
    total = data["total"]
    failures = data["failures"]
    errors = data["errors"]
    skipped = data["skipped"]
    passed = total - failures - errors - skipped
    duration = data["duration_seconds"]
    overall = "OK" if data["was_successful"] else "NG"

    lines = []
    lines.append(f"# テスト実行レポート: {target}")
    lines.append("")
    lines.append(f"- 実行日時: {now}")
    lines.append(f"- 実行コマンド: `{command}`")
    lines.append(f"- 実行時間: {duration} 秒")
    lines.append(f"- 総合結果: **{overall}**")
    lines.append("")
    lines.append("## サマリー")
    lines.append("")
    lines.append("| 総数 | 成功 | 失敗 | エラー | スキップ |")
    lines.append("|---|---|---|---|---|")
    lines.append(f"| {total} | {passed} | {failures} | {errors} | {skipped} |")
    lines.append("")

    non_pass = [t for t in data["tests"] if t["outcome"] not in ("pass", "skip")]
    if non_pass:
        lines.append("## 失敗・エラー一覧")
        lines.append("")
        lines.append("| テストID | 結果 | 概要(docstring) |")
        lines.append("|---|---|---|")
        for t in non_pass:
            desc = t["description"].replace("|", "\\|") or "-"
            lines.append(f"| `{t['id']}` | {t['outcome'].upper()} | {desc} |")
        lines.append("")

        lines.append("## 失敗・エラー詳細")
        lines.append("")
        for t in non_pass:
            lines.append(f"### {t['id']}")
            lines.append("")
            if t["description"]:
                lines.append(f"docstring: {t['description']}")
                lines.append("")
            lines.append("```")
            lines.append(t["detail"].strip())
            lines.append("```")
            lines.append("")
    else:
        lines.append("全てのテストが成功しました。")
        lines.append("")

    skip_list = [t for t in data["tests"] if t["outcome"] == "skip"]
    if skip_list:
        lines.append("## スキップ一覧")
        lines.append("")
        for t in skip_list:
            lines.append(f"- `{t['id']}`: {t['detail']}")
        lines.append("")

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", required=True, help="report_runner が出力したJSONファイルのパス")
    parser.add_argument("--output", required=True, help="生成するMarkdownレポートの出力先パス")
    parser.add_argument("--target", required=True, help="テスト対象ラベル (例: inventory)")
    parser.add_argument("--command", required=True, help="実行した manage.py test コマンド全文")
    args = parser.parse_args()

    data = load_report(args.json)
    markdown = render_markdown(data, args.target, args.command)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"Report written to {args.output}")
    return 0 if data["was_successful"] else 1


if __name__ == "__main__":
    sys.exit(main())
