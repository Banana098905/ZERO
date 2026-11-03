#!/usr/bin/env node
/* 全テストの一括実行。  node scripts/test-all.js          … ユニット＋ブラウザ(E2E。Playwright と Chromium が必要)
 *                       node scripts/test-all.js --unit   … ユニットのみ（ブラウザ不要）
 * 環境変数 ORIGINALS=<元ソースの親フォルダ> を指定すると、元アプリ単体表示との見た目比較(I3)も実行する。 */
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), unitOnly = process.argv.includes('--unit');
const steps = [
  ['共通層（util / schema / store）', 'node tests/test-core.js'], ['サービス層・取り込み・移行', 'node tests/test-service.js'], ['元ソースとの照合', 'node tests/test-originals.js'], ['Zero 連携（postMessage・URL設定）', 'node tests/test-zero-link.js'],
  ['Zero 付属: logic', 'node scripts/test-logic.js', 'engines/zero'], ['Zero 付属: creation', 'node scripts/test-creation.js', 'engines/zero'], ['Zero 付属: remix', 'node scripts/test-remix.js', 'engines/zero'], ['Zero 付属: リンク検査', 'node scripts/check-links.js', 'engines/zero']
];
let hasPw = false; try { require.resolve('playwright'); hasPw = true; } catch (e) { hasPw = fs.existsSync('/home/claude/.npm-global/lib/node_modules/playwright'); }
if (!unitOnly) {
  if (hasPw) steps.push(['ブリッジ（実ブラウザ）', 'node tests/e2e/bridge-smoke.js'], ['シェル（実ブラウザ）', 'node tests/e2e/shell.js'], ['取り込み・書き出し・移行（実ブラウザ）', 'node tests/e2e/io.js'], ['既存機能・分離・共通ライブラリ（実ブラウザ）', 'node tests/e2e/engines.js'], ['デザイン・UX（実ブラウザ）', 'node tests/e2e/design.js']);
  else console.log('※ Playwright が見つからないため E2E をスキップします（npm i -D playwright && npx playwright install chromium）\n');
}
const rows = []; let bad = 0;
for (const [name, cmd, cwd] of steps) {
  const t = Date.now(); const r = spawnSync(cmd, { cwd: path.join(root, cwd || '.'), shell: true, encoding: 'utf8', timeout: 600000, env: process.env });
  const out = (r.stdout || '') + (r.stderr || ''), m = out.match(/(\d+) (?:tests? )?passed(?:, (\d+) failed)?/g) || []; const ok = r.status === 0;
  if (!ok) { bad++; console.log(out.split('\n').filter(l => /FAIL|Error|assert/i.test(l)).slice(0, 8).join('\n')); }
  rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}  — ${(m.pop() || '').trim()}  (${((Date.now() - t) / 1000).toFixed(1)}s)`); console.log(rows[rows.length - 1]);
}
console.log(bad ? `\n${bad} 件の工程が失敗しました。` : '\nすべての工程が成功しました。'); process.exit(bad ? 1 : 0);
