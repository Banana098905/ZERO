// 元ソースとの差分を機械的に確認する: 変更してよいのは、記録済みの「フック／ブリッジ差し込み」だけ
const { test, summary, assert, root } = require('./helpers');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const map = { 'codelab/Code/': 'code/', 'logic/': 'logic/', 'zero/playground-zero/': 'zero/' };
const ALLOWED = { 'codelab/Code/app.js': 1, 'codelab/Code/index.html': 1, 'logic/script.js': 1, 'logic/index.html': 1, 'zero/playground-zero/index.html': 1 };
(async () => {
  console.log('# 元ソースとの照合');
  const lines = fs.readFileSync(path.join(root, 'docs/original-sha256.txt'), 'utf8').trim().split('\n');
  const changed = [], missing = []; let same = 0;
  for (const l of lines) {
    const [hash, p] = [l.slice(0, 64), l.slice(66)];
    const key = Object.keys(map).find(k => p.startsWith(k)); const f = path.join(root, 'engines', map[key] + p.slice(key.length));
    if (!fs.existsSync(f)) { missing.push(p); continue; }
    if (crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === hash) same++; else changed.push(p);
  }
  await test(`元の ${lines.length} ファイルがすべて存在する`, () => assert.deepStrictEqual(missing, []));
  await test('変更されたのは許可リストの5ファイルだけ（残りはバイト単位で同一）', () => { assert.deepStrictEqual(changed.filter(c => !ALLOWED[c]), [], '想定外の変更'); assert.strictEqual(same, lines.length - changed.length); console.log(`       同一 ${same} / 変更 ${changed.length}: ${changed.join(', ')}`); });
  await test('フックの差し込みは最小（app.js +1行、script.js 1行置換、index.html 各 +1〜2行）', () => {
    const rd = f => fs.readFileSync(path.join(root, 'docs/patches', f), 'utf8'), n = (t, c) => (t.match(new RegExp('^\\' + c + '[^' + c + ']', 'gm')) || []).length;
    assert.strictEqual(n(rd('code-app.js.diff'), '+'), 1); assert.strictEqual(n(rd('code-app.js.diff'), '-'), 0);
    assert.strictEqual(n(rd('logic-script.js.diff'), '+'), 1); assert.strictEqual(n(rd('logic-script.js.diff'), '-'), 1);
    assert.ok(n(rd('zero-index.html.diff'), '+') <= 2 && n(rd('zero-index.html.diff'), '-') === 0);
  });
  summary('originals');
})();
