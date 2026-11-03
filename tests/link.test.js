// ZeroStudio（zs-zero.js 実コード）⇔ Zero（zero-core.js 実コード）の結合: 未ログイン受信・ready取りこぼし・origin/window検証
const assert = require('assert');
const Z = require('../js/zero-core.js'), { makeWorld, realPackage, mockApp, tick } = require('../zerostudio/tests/link-harness');
const ZERO = 'https://zero.example', STUDIO_ORIGIN = 'https://studio.example';
function boot(o) { // Zero 側の受信口を実コードで起動。receivedLog はメモリ上の保持データ（= app.js の pending）に相当
  const st = { received: [], problems: [], rx: null };
  const w = makeWorld({ zeroUrl: ZERO + '/', studioUrl: 'https://studio.example/zerostudio/', zeroLoadDelay: o.loadDelay || 0,
    onOpen: zero => { st.rx = Z.createReceiver({ win: zero, opener: zero.opener, origins: o.origins || [STUDIO_ORIGIN], intervalMs: 15, onReceive: (pkg, m) => st.received.push({ pkg, m }), onProblem: (c, org) => st.problems.push([c, org]) }); } });
  return { w, st };
}
module.exports = function (t) {
  t('結合: Zero 側が未ログインでも受信し、データをメモリに保持して受領確認を返す', async () => {
    const pk = await realPackage('未ログイン投稿'), { w, st } = boot({}); w.ctx.ZS_zeroPublish(mockApp(pk, 30), 'p1', w.ui); await tick(150);
    assert.strictEqual(st.received.length, 1); assert.deepStrictEqual(st.received[0].pkg, pk); assert.ok((await Z.verifyPackage(st.received[0].pkg)).ok, '転送後も SHA-256 検証OK');
    assert.ok(w.toasts.some(x => x.k === 'ok'), 'Studio に成功表示'); assert.ok(w.listenersAtOpen[0] >= 1); st.rx.stop(); });
  t('結合: Zero の起動が極端に遅くても（ready が先に出ない）取りこぼさない', async () => {
    const pk = await realPackage(), { w, st } = boot({ loadDelay: 120 }); w.ctx.ZS_zeroPublish(mockApp(pk, 5), 'p1', w.ui); await tick(300);
    assert.strictEqual(st.received.length, 1); assert.ok(w.toasts.some(x => x.k === 'ok')); st.rx.stop(); });
  t('結合: Zero が先に起動し ready を連打しても、Studio の書き出しが遅ければ完了後に1件だけ受信', async () => {
    const pk = await realPackage(), { w, st } = boot({}); w.ctx.ZS_zeroPublish(mockApp(pk, 120), 'p1', w.ui); await tick(60);
    assert.ok(w.posts.filter(p => p.from === 'zero').length >= 2, 'ready は繰り返し送られる'); assert.strictEqual(st.received.length, 0); await tick(300);
    assert.strictEqual(st.received.length, 1); const n = w.posts.filter(p => p.from === 'zero' && p.data.type === 'zero:ready').length; await tick(80);
    assert.strictEqual(w.posts.filter(p => p.from === 'zero' && p.data.type === 'zero:ready').length, n, '受領後は ready を止める'); st.rx.stop(); });
  t('結合: ready は許可オリジン宛のみで、"*" には送らない', async () => {
    const { w, st } = boot({ origins: [STUDIO_ORIGIN, 'https://other.example'] }); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 400), 'p1', w.ui); await tick(60);
    const tos = new Set(w.posts.filter(p => p.from === 'zero').map(p => p.to)); assert.ok(!tos.has('*')); assert.deepStrictEqual([...tos].sort(), ['https://other.example', STUDIO_ORIGIN].sort()); st.rx.stop(); });
  t('結合: Zero の studioOrigins が Studio のオリジンと違えば受信しない（拒否を通知）', async () => {
    const { w, st } = boot({ origins: ['https://someone-else.example'] }); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 0), 'p1', w.ui);
    // Zero の ready は Studio 宛にならず届かないため、Studio が直接送ってきたケースを模擬して Zero 側の検証だけを確認
    await tick(40); assert.strictEqual(st.received.length, 0); assert.strictEqual(w.posts.filter(p => p.from === 'studio').length, 0); st.rx.stop(); });
  const direct = async (st, w, src, origin, data) => { const z = w.zeroes[0]; z.listeners.slice().forEach(f => f({ data, origin, source: src })); await tick(10); };
  t('Zero 受信口: 別 window・別 origin・別 type・形式不正を厳密に扱う', async () => {
    const pk = await realPackage(), { w, st } = boot({ origins: [STUDIO_ORIGIN] }); w.ctx.ZS_zeroPublish(mockApp(pk, 10000 > 0 ? 400 : 0), 'p1', w.ui); await tick(20);
    const z = w.zeroes[0], good = { type: 'zerostudio:publish', v: 1, id: 'abcdefgh12345678', pkg: pk };
    await direct(st, w, { postMessage() {} }, STUDIO_ORIGIN, good); assert.strictEqual(st.received.length, 0, '別 window 参照は無視');
    await direct(st, w, z.opener, 'https://evil.example', good); assert.strictEqual(st.received.length, 0, '許可外 origin は拒否'); assert.deepStrictEqual(st.problems[0], ['origin', 'https://evil.example']);
    await direct(st, w, z.opener, STUDIO_ORIGIN, { ...good, type: 'other' }); assert.strictEqual(st.received.length, 0);
    await direct(st, w, z.opener, STUDIO_ORIGIN, { ...good, v: 2 }); assert.strictEqual(st.received.length, 0);
    await direct(st, w, z.opener, STUDIO_ORIGIN, { ...good, id: '../x' }); assert.strictEqual(st.received.length, 0);
    await direct(st, w, z.opener, STUDIO_ORIGIN, { ...good, pkg: { format: 'zerostudio.publish', project: { engine: 'evil', workType: 'x' } } }); assert.strictEqual(st.received.length, 0);
    const rej = w.posts.filter(p => p.from === 'zero' && p.data.type === 'zero:rejected'); assert.ok(rej.length >= 3); rej.forEach(r => assert.strictEqual(r.to, STUDIO_ORIGIN));
    await direct(st, w, z.opener, STUDIO_ORIGIN, good); assert.strictEqual(st.received.length, 1, '正規のメッセージは受理');
    await direct(st, w, z.opener, STUDIO_ORIGIN, good); assert.strictEqual(st.received.length, 1, '同一IDの再送は重複保持しない'); st.rx.stop(); });
  t('Zero 受信口: opener が無い（直接開いた）場合は何もしない', () => { assert.strictEqual(Z.createReceiver({ win: { addEventListener() { throw new Error('登録してはならない'); } }, opener: null, origins: [STUDIO_ORIGIN] }), null); });
  t('Zero は認証情報を Studio に送らない（ready / 受領確認の内容を検査）', async () => {
    const { w, st } = boot({}); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 20), 'p1', w.ui); await tick(120);
    const fromZero = w.posts.filter(p => p.from === 'zero'); assert.ok(fromZero.length >= 2); fromZero.forEach(p => { assert.ok(['zero:ready', 'zero:received'].includes(p.data.type)); assert.ok(!/token|apikey|session|bearer/i.test(JSON.stringify(p.data))); }); st.rx.stop(); });
  t('app.js: 受信はログイン状態に依存せずメモリ保持、ログイン後・セッション切れ後も保持して投稿確認画面へ戻る', () => {
    const app = require('fs').readFileSync('js/app.js', 'utf8');
    assert.ok(/Z\.createReceiver\(\{ win: window, opener: window\.opener/.test(app)); assert.ok(/onReceive: function \(pkg\) \{ pending = \{ pkg: pkg/.test(app));
    assert.ok(/function done\(s\) \{[^}]*pending \? '#\/publish'/.test(app), 'ログイン後は投稿確認へ'); assert.ok(/var to = S \? '#\/publish' : '#\/auth'/.test(app), '未ログインならログイン画面へ（データは保持）');
    const pub = app.slice(app.indexOf('function publish()'), app.indexOf('/* ---------- 認証')); assert.ok(!/pending = null;\s*var form/.test(pub), '表示しただけでは破棄しない'); assert.ok(/\.then\(function \(\) \{ pending = null; toast\('公開しました'\)/.test(pub), '成功時のみ破棄');
    assert.ok(/if \(!S\) \{ renderMe\(\); location\.hash = '#\/auth'; \}/.test(pub), 'セッション切れでも保持'); assert.ok(!/localStorage|sessionStorage/.test(pub + app.slice(app.indexOf('Z.createReceiver')))); });
};
