"""繰り返し実行するテストの結果をJSONとして保存するカスタムテストランナー。

Djangoのunittest標準出力はロギング(LOGGING設定のconsoleハンドラ)と同じ標準エラー出力を
共有しており、`manage.py test -v 2` の人間向けテキスト出力はテストケース数が増えると
ログと混ざり合ってパースが不安定になる。本モジュールは unittest.TestResult を直接フックして
構造化データ(JSON)を書き出すことで、後段のレポート生成(script/generate_test_report.py)が
安定して動作するようにする。

使い方:
    python manage.py test inventory --testrunner=testutils.report_runner.JsonReportDiscoverRunner

環境変数 TEST_REPORT_JSON にファイルパスを指定すると、そこにJSONレポートを書き出す。
未指定の場合はカレントディレクトリの test_report.json に書き出す。
"""
import json
import os
import time
import unittest

from django.test.runner import DiscoverRunner


class _CollectingTestResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.collected = []
        self._start_times = {}

    @staticmethod
    def _description(test):
        doc = getattr(test, "_testMethodDoc", None) or ""
        return doc.strip().splitlines()[0] if doc.strip() else ""

    def startTest(self, test):
        super().startTest(test)
        self._start_times[test] = time.time()

    def _record(self, test, outcome, detail=""):
        elapsed = time.time() - self._start_times.get(test, time.time())
        self.collected.append(
            {
                "id": test.id(),
                "outcome": outcome,
                "description": self._description(test),
                "detail": detail,
                "elapsed_seconds": round(elapsed, 4),
            }
        )

    def addSuccess(self, test):
        super().addSuccess(test)
        self._record(test, "pass")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._record(test, "fail", self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self._record(test, "error", self._exc_info_to_string(err, test))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self._record(test, "skip", reason)

    def addExpectedFailure(self, test, err):
        super().addExpectedFailure(test, err)
        self._record(test, "expected_failure", self._exc_info_to_string(err, test))

    def addUnexpectedSuccess(self, test):
        super().addUnexpectedSuccess(test)
        self._record(test, "unexpected_success")


class JsonReportDiscoverRunner(DiscoverRunner):
    """DiscoverRunnerを拡張し、実行結果をJSONファイルにも書き出す。"""

    def run_suite(self, suite, **kwargs):
        runner_kwargs = self.get_test_runner_kwargs()
        runner_kwargs["resultclass"] = _CollectingTestResult
        runner = self.test_runner(**runner_kwargs)

        started_at = time.time()
        result = runner.run(suite)
        duration = time.time() - started_at

        report_path = os.environ.get("TEST_REPORT_JSON", "test_report.json")
        payload = {
            "duration_seconds": round(duration, 3),
            "total": result.testsRun,
            "failures": len(result.failures),
            "errors": len(result.errors),
            "skipped": len(result.skipped),
            "expected_failures": len(result.expectedFailures),
            "unexpected_successes": len(result.unexpectedSuccesses),
            "was_successful": result.wasSuccessful(),
            "tests": getattr(result, "collected", []),
        }
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return result
