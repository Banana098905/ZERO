// ZeroStudio ⇔ Zero の postMessage を Node 上で再現する疑似ウィンドウ。
// ブラウザと同じく: 宛先オリジンが一致しない postMessage は黙って捨てられ、event.source は送信側 window、受信は非同期。
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));

function deliver(target, evt, targetOrigin) {
  if (targetOrigin !== '*' && targetOrigin !== target.origin) return;           // 宛先オリジン不一致 → 配信されない
  setTimeout(() => target.listeners.slice().forEach(f => f(evt)), 0);
}
/** 実コード（zs-zero.js）を ZeroStudio のウィンドウとして動かす。o: { studioUrl, zeroUrl, onOpen(zero), popupBlocked } */
function makeWorld(o) {
  const studioUrl = o.studioUrl || 'https://studio.example/zerostudio/', studio = { origin: new URL(studioUrl).origin, listeners: [] };
  const w = { studio, zeroes: [], opens: [], listenersAtOpen: [], posts: [], toasts: [], errors: [], timers: [], seq: 0, closedByStudio: [] };
  function openZero(url) {
    if (o.popupBlocked) return null;
    const zero = { origin: new URL(url).origin, url, listeners: [], addEventListener(t, f) { if (t === 'message') zero.listeners.push(f); }, removeEventListener(t, f) { zero.listeners = zero.listeners.filter(x => x !== f); } };
    const toZero = { closed: false, close() { toZero.closed = true; w.closedByStudio.push(zero); }, postMessage(d, to) { w.posts.push({ from: 'studio', data: d, to }); deliver(zero, { data: structuredClone(d), origin: studio.origin, source: toZero_ }, to); } };
    const toStudio = { closed: false, postMessage(d, to) { w.posts.push({ from: 'zero', data: d, to }); deliver(studio, { data: structuredClone(d), origin: zero.origin, source: toZero_ }, to); } };
    const toZero_ = toZero; zero.opener = toStudio; zero.handle = toZero;
    // Zero が見ている「Studio」と、Studio が見ている「Zero」は別の参照。それぞれの送信元として正しい参照を渡す
    toStudio.postMessage = (d, to) => { w.posts.push({ from: 'zero', data: d, to }); deliver(studio, { data: structuredClone(d), origin: zero.origin, source: toZero }, to); };
    toZero.postMessage = (d, to) => { w.posts.push({ from: 'studio', data: d, to }); deliver(zero, { data: structuredClone(d), origin: studio.origin, source: toStudio }, to); };
    w.zeroes.push(zero); w.opens.push(url); w.listenersAtOpen.push(studio.listeners.length);
    if (o.onOpen) setTimeout(() => o.onOpen(zero), o.zeroLoadDelay || 0);
    return toZero;
  }
  const ctx = { console, URL, Uint8Array, structuredClone, location: { href: studioUrl }, crypto: crypto.webcrypto, ZS_ZERO_URL: o.zeroUrl,
    addEventListener: (t, f) => { if (t === 'message') studio.listeners.push(f); }, removeEventListener: (t, f) => { studio.listeners = studio.listeners.filter(x => x !== f); },
    open: openZero,
    setTimeout: (f, ms) => { const id = ++w.seq; w.timers.push({ id, f, ms }); return id; }, clearTimeout: (id) => { w.timers = w.timers.filter(x => x.id !== id); },
    setInterval: (f, ms) => { const id = ++w.seq; w.timers.push({ id, f, ms, iv: 1 }); return id; }, clearInterval: (id) => { w.timers = w.timers.filter(x => x.id !== id); } };
  ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/zs-zero.js'), 'utf8'), ctx);
  w.ctx = ctx;
  w.fire = (ms) => w.timers.filter(x => x.ms === ms && !x.iv).forEach(x => { w.timers = w.timers.filter(y => y !== x); x.f(); });
  w.ui = { toast: (m, k) => w.toasts.push({ m, k }), error: (e) => w.errors.push(e) };
  return w;
}
/** ZeroStudio の実コード（zs-util / zs-schema）で本物の公開パッケージを作る */
async function realPackage(title) {
  const c = { console, crypto: crypto.webcrypto, TextEncoder }; c.globalThis = c; c.window = c; vm.createContext(c);
  ['zs-util', 'zs-schema'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c));
  const S = c.ZS.schema, proj = S.newProject({ engine: 'code', workType: 'web', title: title || 'リンクテスト', payload: { html: '<h1>hi</h1>', css: '', js: '' }, license: { id: 'CC-BY-4.0' } });
  return JSON.parse(JSON.stringify(await S.buildPublish(proj, [])));
}
const mockApp = (pk, delay, fail) => ({ svc: { update: () => tick(delay || 0).then(() => { if (fail) throw new Error('boom'); }), exportPublish: () => tick(delay || 0).then(() => pk) } });
module.exports = { makeWorld, realPackage, mockApp, tick };
