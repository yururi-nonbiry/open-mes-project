#!/usr/bin/env python3
"""フロントエンドが呼ぶ /api/... のURLが、バックエンドのURL定義に存在するか検査する。

フロントのURL(frontend/src配下の文字列リテラル)を抽出し、backendコンテナ内の
Django URLリゾルバで解決できるか確認する。解決できないものは「リンク切れ」として
報告し、終了コード1で終了する。

使い方:
  script/check_api_links.py            # compose.yml の backend サービス(要起動)で検査
  script/check_api_links.py --local    # 手元のPython環境(Django導入済み)で直接検査
                                       # backend/src を cwd にして実行される
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONT_SRC = ROOT / "frontend" / "src"
BACKEND_SRC = ROOT / "backend" / "src"

URL_RE = re.compile(r"""['"`](/api/[^'"`\s]*)""")
SKIP_SUFFIXES = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")


def extract():
    """{正規化したパス: [出典 file:line, ...]} を返す。"""
    found = {}
    for path in sorted(FRONT_SRC.rglob("*")):
        if path.suffix not in (".ts", ".tsx", ".js", ".jsx") or path.name.endswith(SKIP_SUFFIXES):
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in URL_RE.finditer(line):
                url = m.group(1).split("?")[0]
                url = re.sub(r"\$\{.*$", "", url) if re.search(r"/\$\{[^}]*\}?$", url) else url  # 末尾の変数はクエリ文字列とみなす
                url = re.sub(r"\$\{[^}]*\}", "{id}", url)  # 途中の変数はIDのプレースホルダー
                if not url.endswith("/") and "." in url.rsplit("/", 1)[-1]:
                    continue  # 静的ファイル等
                found.setdefault(url, []).append(f"{path.relative_to(ROOT)}:{lineno}")
    return found


# Django側で実行する検査コード(stdinで `manage.py shell` に渡す)
CHECKER = r"""
import json, sys
from django.urls import resolve, Resolver404
urls = json.loads(sys.stdin_payload)
bad = []
# IDの型(int / uuid / 文字列)が分からないため、いずれかで解決できればOKとする
DUMMIES = ["1", "00000000-0000-0000-0000-000000000000", "abc"]
for u in urls:
    for d in DUMMIES:
        try:
            resolve(u.replace("{id}", d))
            break
        except Resolver404:
            continue
    else:
        bad.append(u)
print("@@RESULT@@" + json.dumps(bad))
"""


def check_with_django(urls, local):
    payload = json.dumps(sorted(urls))
    code = f"sys_payload = {payload!r}\n" + CHECKER.replace("sys.stdin_payload", "sys_payload")
    if local:
        cmd = [sys.executable, "manage.py", "shell"]
        cwd = BACKEND_SRC
    else:
        cmd = ["docker", "compose", "-f", str(ROOT / "compose.yml"), "exec", "-T", "backend",
               "python", "manage.py", "shell"]
        cwd = ROOT
    proc = subprocess.run(cmd, input=code, text=True, capture_output=True, cwd=cwd, env=os.environ)
    for line in proc.stdout.splitlines():
        if line.startswith("@@RESULT@@"):
            return json.loads(line[len("@@RESULT@@"):])
    sys.exit(f"検査の実行に失敗しました:\n{proc.stdout}\n{proc.stderr}")


def main():
    found = extract()
    bad = check_with_django(found.keys(), "--local" in sys.argv)
    print(f"検査したURL: {len(found)} 件 / リンク切れ: {len(bad)} 件")
    for u in bad:
        print(f"  NG {u}")
        for src in found[u]:
            print(f"      {src}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
