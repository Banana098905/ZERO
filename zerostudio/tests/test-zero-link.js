// Zero 連携（Studio 側）のユニットテスト: URL設定の解決 / 受信登録の順序 / origin・window 検証 / 認証情報を送らない
const assert = require('assert'), fs = require('fs'), path = require('path');
const { makeWorld, realPackage, mockApp, tick } = require('./link-harness');
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e).split('\n').slice(0, 4).join('\n       ')); } }
const ZERO = 'https://zero.example', STUDIO = 'https://studio.example/zerostudio/';
const ready = (z, origin) => z.opener.postMessage({ type: 'zero:ready', v: 1 }, origin || 'https://studio.example');

(async () => {
  const R = (raw, base) => makeWorld({ zeroUrl: raw, studioUrl: base || STUDIO }).ctx.ZS_zeroLink.resolveTarget(raw, base || STUDIO);
  await test('ZS_ZERO_URL 未設定: 同梱構成の ../index.html#/publish を使う（source=default）', () => {
    const r = R(''); assert.ok(r.ok && r.source === 'default'); assert.strictEqual(r.url.href, 'https://studio.example/index.html#/publish'); assert.strictEqual(r.origin, 'https://studio.example');
    assert.strictEqual(R(undefined).source, 'default'); assert.strictEqual(R('   ').source, 'default'); });
  await test('ZS_ZERO_URL 設定: 別オリジンの絶対URL。#/publish を自動付与、既存のハッシュは保持', () => {
    const r = R('https://zero.example/app/'); assert.ok(r.ok && r.source === 'config'); assert.strictEqual(r.url.href, 'https://zero.example/app/#/publish'); assert.strictEqual(r.origin, ZERO);
    assert.strictEqual(R('https://zero.example/app/#/auth').url.hash, '#/auth'); });
  await test('ZS_ZERO_URL の不正値を拒否（http・javascript:・認証情報・URLでない文字列）', () => {
    for (const bad of ['http://zero.example/', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pw@zero.example/', 'https://']) assert.strictEqual(R(bad).ok, false, bad);
    assert.strictEqual(R('http://localhost:8080/index.html').ok, true); assert.strictEqual(R('http://127.0.0.1:8080/').ok, true); });
  await test('不正な設定ではウィンドウを開かず、理由を表示する', () => {
    const w = makeWorld({ zeroUrl: 'http://evil.example/' }); w.ctx.ZS_zeroPublish(mockApp({}), 'p1', w.ui);
    assert.strictEqual(w.opens.length, 0); assert.strictEqual(w.toasts.length, 1); assert.ok(/https/.test(w.toasts[0].m)); });

  await test('受信イベントは window.open より前に登録される', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(await realPackage()), 'p1', w.ui);
    assert.strictEqual(w.opens.length, 1); assert.ok(w.listenersAtOpen[0] >= 1, 'open 時点で listener 数=' + w.listenersAtOpen[0]); });
  await test('ポップアップがブロックされたら受信登録を解除して通知する', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/', popupBlocked: true }); w.ctx.ZS_zeroPublish(mockApp(await realPackage()), 'p1', w.ui);
    assert.strictEqual(w.studio.listeners.length, 0); assert.ok(/ポップアップ/.test(w.toasts[0].m)); });

  await test('zero:ready が書き出し完了より先に届いても、完了後に Zero のオリジン宛へ送る（認証情報なし）', async () => {
    const pk = await realPackage(), w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(pk, 40), 'p1', w.ui);
    ready(w.zeroes[0], 'https://studio.example'); ready(w.zeroes[0], 'https://studio.example'); await tick(10); // 書き出し中に ready ×2
    assert.strictEqual(w.posts.filter(p => p.from === 'studio').length, 0, '書き出し前は送らない'); await tick(80);
    const sent = w.posts.filter(p => p.from === 'studio'); assert.ok(sent.length >= 1);
    sent.forEach(s => { assert.strictEqual(s.to, ZERO, '宛先オリジンを指定'); assert.deepStrictEqual(Object.keys(s.data).sort(), ['id', 'pkg', 'type', 'v']); assert.strictEqual(s.data.type, 'zerostudio:publish');
      assert.ok(!/access_token|refresh_token|apikey|Bearer|supabase/i.test(JSON.stringify(s.data)), '認証情報を含まない'); assert.deepStrictEqual(s.data.pkg, pk); });
    w.zeroes[0].opener.postMessage({ type: 'zero:received', v: 1, id: sent[0].data.id }, 'https://studio.example'); await tick(10);
    assert.ok(w.toasts.some(x => x.k === 'ok'), '受領確認で成功を表示'); assert.strictEqual(w.studio.listeners.length, 0, '完了後は受信登録を解除'); });
  await test('Zero が受領確認を返す前に ready が再送されても、受領後は再送しない', async () => {
    const pk = await realPackage(), w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(pk, 0), 'p1', w.ui);
    ready(w.zeroes[0]); await tick(20); const id = w.posts.find(p => p.from === 'studio').data.id;
    w.zeroes[0].opener.postMessage({ type: 'zero:received', v: 1, id }, 'https://studio.example'); await tick(10); const n = w.posts.filter(p => p.from === 'studio').length;
    ready(w.zeroes[0]); await tick(20); assert.strictEqual(w.posts.filter(p => p.from === 'studio').length, n); });

  await test('別の window / 別 origin / 別 type からのメッセージは無視する', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 0), 'p1', w.ui);
    const attacker = { postMessage() {} }; // 開いた window ではない参照
    w.studio.listeners.slice().forEach(f => f({ data: { type: 'zero:ready', v: 1 }, origin: ZERO, source: attacker })); await tick(20);
    w.studio.listeners.slice().forEach(f => f({ data: { type: 'zero:ready', v: 1 }, origin: 'https://evil.example', source: w.zeroes[0].handle })); await tick(20);
    w.studio.listeners.slice().forEach(f => f({ data: { type: 'other', v: 1 }, origin: ZERO, source: w.zeroes[0].handle })); await tick(20);
    w.studio.listeners.slice().forEach(f => f({ data: { type: 'zero:ready' }, origin: ZERO, source: w.zeroes[0].handle })); await tick(20); // v 欠落
    assert.strictEqual(w.posts.filter(p => p.from === 'studio').length, 0, '何も送らない');
    w.studio.listeners.slice().forEach(f => f({ data: { type: 'zero:received', v: 1, id: 'wrong' }, origin: ZERO, source: w.zeroes[0].handle })); assert.ok(!w.toasts.some(x => x.k === 'ok'), '別IDの受領確認は無効'); });
  await test('Zero が Studio と別オリジンを名乗って返信しても（設定と不一致）作品は送られない', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 0), 'p1', w.ui);
    w.studio.listeners.slice().forEach(f => f({ data: { type: 'zero:ready', v: 1 }, origin: 'https://zero.example.evil.com', source: w.zeroes[0].handle })); await tick(30);
    assert.strictEqual(w.posts.filter(p => p.from === 'studio').length, 0); });
  await test('10秒たっても ready が来なければ設定確認を促す。来ていれば出さない', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 0), 'p1', w.ui); w.fire(10000);
    assert.ok(w.toasts.some(x => /ZS_ZERO_URL/.test(x.m) && /studioOrigins/.test(x.m) && x.k === 'warn'));
    const w2 = makeWorld({ zeroUrl: ZERO + '/' }); w2.ctx.ZS_zeroPublish(mockApp(await realPackage(), 0), 'p1', w2.ui); ready(w2.zeroes[0]); await tick(20); w2.fire(10000); assert.strictEqual(w2.toasts.length, 0); });
  await test('Zero が拒否(zero:rejected)した場合は理由を表示して終了', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp(await realPackage(), 0), 'p1', w.ui); ready(w.zeroes[0]); await tick(20);
    const id = w.posts.find(p => p.from === 'studio').data.id; w.zeroes[0].opener.postMessage({ type: 'zero:rejected', v: 1, id, reason: 'invalid' }, 'https://studio.example'); await tick(10);
    assert.ok(w.toasts.some(x => x.k === 'warn' && /不正/.test(x.m))); assert.strictEqual(w.studio.listeners.length, 0); });
  await test('書き出しに失敗したら Zero のタブを閉じ、受信登録を解除してエラー表示', async () => {
    const w = makeWorld({ zeroUrl: ZERO + '/' }); w.ctx.ZS_zeroPublish(mockApp({}, 0, true), 'p1', w.ui); await tick(30);
    assert.strictEqual(w.errors.length, 1); assert.strictEqual(w.closedByStudio.length, 1); assert.strictEqual(w.studio.listeners.length, 0); });
  await test('zs-zero.js / zs-config.js に認証情報・ストレージへの参照がない', () => {
    const src = fs.readFileSync(path.join(__dirname, '../js/zs-zero.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../js/zs-config.js'), 'utf8');
    assert.ok(!/localStorage|sessionStorage|access_token|refresh_token|supabase|zero\.s\b|service_role/i.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))); assert.ok(!/postMessage\([^)]*'\*'\)/.test(src), "targetOrigin に '*' を使わない"); });
  await test('index.html は zs-config.js を zs-zero.js より前に読み込む', () => {
    const h = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'); const a = h.indexOf('js/zs-config.js'), b = h.indexOf('js/zs-zero.js'); assert.ok(a > 0 && b > a); });

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
