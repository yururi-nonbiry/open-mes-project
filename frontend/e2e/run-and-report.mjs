#!/usr/bin/env node
// Playwrightを実行し、結果をMarkdownレポートとして
// docs/09_test_specifications/reports/frontend_responsive.md (画面機能確認は frontend_functional.md) に
// 固定ファイル名で上書き保存するラッパースクリプト。手順は docs/09_test_specifications/10_frontend_e2e.md、
// 11_frontend_e2e_functional.md を参照。
//
// backend側の script/run_tests.sh + script/generate_test_report.py と同じ方針
// (レポートは固定パスに上書き、履歴はgit管理に委ねる)に揃えている。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const REPORT_DIR = path.join(ROOT_DIR, 'docs', '09_test_specifications', 'reports');

// `--suite=functional` を付けると画面機能確認(11_frontend_e2e_functional.md)を実行し、
// frontend_functional.md に保存する。省略時は従来通りレスポンシブ表示確認を実行する。
const args = process.argv.slice(2);
const suite = args.includes('--suite=functional') ? 'functional' : 'responsive';
const extraArgs = args.filter((a) => !a.startsWith('--suite='));
const REPORT_NAME = `frontend_${suite}`;
const REPORT_FILE = path.join(REPORT_DIR, `${REPORT_NAME}.md`);
const RUN_COMMAND = suite === 'functional' ? 'npm run test:e2e:functional' : 'npm run test:e2e';

mkdirSync(REPORT_DIR, { recursive: true });

const result = spawnSync('npx', ['playwright', 'test', '--reporter=json', ...extraArgs], {
  cwd: FRONTEND_DIR,
  env: { ...process.env, E2E_SUITE: suite },
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf-8',
  maxBuffer: 1024 * 1024 * 50,
});

function flattenSpecs(suite, acc) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1];
      acc.push({
        title: `${spec.title} [${t.projectName}]`,
        status: last?.status ?? 'unknown',
        duration: last?.duration ?? 0,
        error: last?.error?.message ?? '',
      });
    }
  }
  for (const child of suite.suites ?? []) {
    flattenSpecs(child, acc);
  }
}

let data;
try {
  data = JSON.parse(result.stdout);
} catch (e) {
  console.error('エラー: PlaywrightのJSON出力の解析に失敗しました。テスト実行自体が失敗した可能性があります。', e);
  process.exit(result.status ?? 1);
}

const tests = [];
for (const suite of data.suites ?? []) {
  flattenSpecs(suite, tests);
}

const total = tests.length;
const passed = tests.filter((t) => t.status === 'passed').length;
const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
const skipped = tests.filter((t) => t.status === 'skipped').length;
const overall = failed === 0 && total > 0 ? 'OK' : 'NG';
const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

const lines = [];
lines.push(`# テスト実行レポート: ${REPORT_NAME}`);
lines.push('');
lines.push(`- 実行日時: ${now} JST`);
lines.push(`- 実行コマンド: \`${RUN_COMMAND}\``);
lines.push(`- 総合結果: **${overall}**`);
lines.push('');
lines.push('## サマリー');
lines.push('');
lines.push('| 総数 | 成功 | 失敗 | スキップ |');
lines.push('|---|---|---|---|');
lines.push(`| ${total} | ${passed} | ${failed} | ${skipped} |`);
lines.push('');

const nonPass = tests.filter((t) => t.status !== 'passed' && t.status !== 'skipped');
if (nonPass.length > 0) {
  lines.push('## 失敗一覧');
  lines.push('');
  lines.push('| テスト | 結果 | エラー概要 |');
  lines.push('|---|---|---|');
  for (const t of nonPass) {
    // Playwrightのエラーメッセージに含まれる色付け用のANSIエスケープはMarkdownでは不要なため取り除く
    const err = (t.error || '-').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].replace(/\|/g, '\\|');
    lines.push(`| ${t.title} | ${t.status.toUpperCase()} | ${err} |`);
  }
  lines.push('');
} else if (total > 0) {
  lines.push('全てのテストが成功しました。');
  lines.push('');
}

// 画面機能確認はテストケース(ケースID)単位で結果を突き合わせられるよう、全件の結果を一覧で残す
if (suite === 'functional' && total > 0) {
  lines.push('## テスト結果一覧');
  lines.push('');
  lines.push('| テスト | 結果 | 実行時間 |');
  lines.push('|---|---|---|');
  for (const t of [...tests].sort((a, b) => a.title.localeCompare(b.title))) {
    lines.push(`| ${t.title.replace(/\|/g, '\\|')} | ${t.status.toUpperCase()} | ${(t.duration / 1000).toFixed(1)}秒 |`);
  }
  lines.push('');
}

writeFileSync(REPORT_FILE, lines.join('\n') + '\n', 'utf-8');
console.log(`==> レポートを生成しました: ${REPORT_FILE}`);
console.log('    git管理下にあるため、必要に応じて \'git add\' でコミットしてください。');
console.log('    失敗時のスクリーンショットは frontend/test-results/ 配下に出力されます(.gitignore対象)。');

process.exit(result.status ?? (failed > 0 ? 1 : 0));
