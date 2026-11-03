// node tests.js — Zero 側の全ユニットテスト（検証ロジック・postMessage連携・投稿ロールバック・SQL静的検査・ワークフロー検査）。1つでも失敗すれば終了コード1。
const h = require('./tests/harness');
['static', 'core', 'link', 'v103'].forEach(n => require('./tests/' + n + '.test.js')(h.t));
if (process.argv.includes('--e2e')) { const r = require('child_process').spawnSync(process.execPath, [require('path').join(__dirname, 'tests/e2e/universe.e2e.js')], { stdio: 'inherit' }); if (r.status) { console.log('E2E に失敗しました'); process.exit(1); } }
h.run().then(r => { console.log(r.fail ? `FAIL: ${r.fail} failed, ${r.pass} passed` : `OK: ${r.pass} tests passed`); process.exit(r.fail ? 1 : 0); });
