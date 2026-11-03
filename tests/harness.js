// 最小のテストハーネス（依存なし）。t(name, fn) で登録 → run() で順に実行。
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
async function run(label) {
  let pass = 0, fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
  }
  return { pass, fail, label };
}
module.exports = { t, run, tests };
