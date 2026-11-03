// テスト共通: 共有モジュールを Node に読み込む
const path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
let passed = 0, failed = 0; const failures = [];
function load(...files) { files.forEach(f => require(path.join(root, 'js', f))); return globalThis.ZS; }
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
}
function summary(label) { console.log(`\n${label}: ${passed} passed, ${failed} failed`); if (failed) { console.log('failed:', failures.join(', ')); process.exit(1); } process.exit(0); }
module.exports = { load, test, summary, assert, root };
