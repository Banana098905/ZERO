/* ZeroStudio → Zero 直接投稿（追加ファイル。制作エンジンには触れない）。既存の exportPublish（SHA-256つき zerostudio.publish）をそのまま再利用する。
 * 認証情報は Studio に渡さず、Studio からは作品データだけを Zero へ送る。ハンドシェイク:
 *   1. クリック時、window.open より「前」に message 受信を登録する（取りこぼし防止）
 *   2. Zero が起動すると zero:ready を（受信されるまで）繰り返し送る  3. Studio は書き出し完了後に zerostudio:publish を Zero のオリジン宛に送る
 *   4. Zero が zero:received を返す → 完了。受信は e.source===開いた window かつ e.origin===Zero のオリジンのものだけ採用。 */
(function (g) {
  'use strict';
  var DEFAULT_URL = '../index.html#/publish', WARN_MS = 10000, LIFE_MS = 180000;
  function isLocal(h) { return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; }
  /** ZS_ZERO_URL の解決。{ ok, url, origin, source:'config'|'default', error } */
  function resolveTarget(raw, base) {
    var src = typeof raw === 'string' && raw.trim() ? 'config' : 'default', u, b;
    try { b = new URL(base); u = new URL(src === 'config' ? raw.trim() : DEFAULT_URL, b); } catch (e) { return { ok: false, error: 'ZS_ZERO_URL が URL として正しくありません: ' + String(raw) }; }
    if (u.username || u.password) return { ok: false, error: 'ZS_ZERO_URL に認証情報を含めないでください' };
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && (isLocal(u.hostname) || u.origin === b.origin)))) return { ok: false, error: 'ZS_ZERO_URL は https のURLを指定してください（localhost のみ http 可）' };
    if (!u.hash) u.hash = '#/publish';
    return { ok: true, url: u, origin: u.origin, source: src };
  }
  function rid() { var a = new Uint8Array(12); (g.crypto || {}).getRandomValues ? g.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return [].map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  var REJECT = { format: '形式が不正です', invalid: '作品データが不正です', 'too-large': 'サイズが大きすぎます', internal: '内部エラー' };

  g.ZS_zeroLink = { resolveTarget: resolveTarget };
  g.ZS_zeroPublish = function (app, id, ui) {
    var t = resolveTarget(g.ZS_ZERO_URL, g.location.href);
    if (!t.ok) { ui.toast(t.error, 'warn'); return; }
    var win = null, done = false, acked = false, gotReady = false, tid = rid(), timers = [], prep;
    function finish() { done = true; g.removeEventListener('message', onMsg); timers.forEach(function (x) { g.clearTimeout(x); g.clearInterval(x); }); }
    function onMsg(e) {
      if (done || !win || e.source !== win || e.origin !== t.origin) return;           // window 参照と origin を厳密に検証
      var d = e.data; if (!d || typeof d !== 'object' || d.v !== 1) return;
      if (d.type === 'zero:ready') { gotReady = true; if (acked) return;
        prep.then(function (pk) { if (done || acked) return; win.postMessage({ type: 'zerostudio:publish', v: 1, id: tid, pkg: pk }, t.origin); }, function () {}); }
      else if (d.type === 'zero:received' && d.id === tid) { acked = true; finish(); ui.toast('Zero に作品を送りました。Zero 側でログイン・内容確認をして公開してください。', 'ok'); }
      else if (d.type === 'zero:rejected' && (d.id === tid || d.id === undefined)) { finish(); ui.toast('Zero が作品を受け取れませんでした（' + (REJECT[d.reason] || '理由不明') + '）。', 'warn'); }
    }
    g.addEventListener('message', onMsg);                                              // ★ window.open より前に受信登録
    win = g.open(t.url.href, '_blank');                                                // クリック操作中に同期で開く（ポップアップ対策）
    if (!win) { finish(); ui.toast('ポップアップがブロックされました。許可してもう一度お試しください。', 'warn'); return; }
    prep = app.svc.update(id, { visibility: 'export-ready' }).then(function () { return app.svc.exportPublish(id); });
    prep.then(null, function (e) { if (done) return; finish(); try { win.close(); } catch (x) {} ui.error(e); });
    timers.push(g.setTimeout(function () { if (!done && !gotReady) ui.toast('Zero から応答がありません。ZS_ZERO_URL（' + t.origin + '）と Zero 側の studioOrigins を確認してください。', 'warn'); }, WARN_MS));
    timers.push(g.setTimeout(function () { if (!done) { finish(); if (!acked) ui.toast('Zero への送信がタイムアウトしました。もう一度お試しください。', 'warn'); } }, LIFE_MS));
    timers.push(g.setInterval(function () { if (!done && win.closed) finish(); }, 1000));
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
