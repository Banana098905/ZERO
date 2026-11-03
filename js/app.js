(function () {
'use strict';
var C = window.ZERO_CONFIG || {}, Z = window.ZeroCore, main = document.getElementById('main'), S = null, pending = null, myProfile = null;
try { S = JSON.parse(localStorage.getItem('zero.s') || 'null'); } catch (e) {}
function h(t, a) { var e = document.createElement(t); a = a || {};
  Object.keys(a).forEach(function (n) { var v = a[n]; if (n.slice(0, 2) === 'on') e.addEventListener(n.slice(2), v); else if (n === 'class') e.className = v; else if (n === 'style') e.style.cssText = v;   // CSP(style-src 'self') 下でも有効にするため setAttribute('style') は使わない
     else if (v !== false && v != null) e.setAttribute(n, v); });
  for (var i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(function (c) { if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c))); }); return e; }
function toast(m, err) { var t = document.getElementById('toast'); t.textContent = m; t.className = err ? 'err' : ''; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 3800); }
function fail(e) { toast(e && e.message || String(e), 1); }
function loading() { return h('div', { class: 'ld', role: 'status' }, '読み込み中…'); }
/* 確認・入力ダイアログ（ブラウザ標準の confirm/prompt の代わり。Esc・背景クリックでキャンセル、フォーカスを元に戻す） */
function ask(msg, o) { o = o || {};
  return new Promise(function (res) { var prev = document.activeElement, inp = null, bg, ok, cancel;
    function close(v) { document.removeEventListener('keydown', kd); bg.remove(); if (prev && prev.focus) prev.focus(); res(v); }
    function kd(e) { if (e.key === 'Escape') close(null); }
    ok = h('button', { class: 'btn ' + (o.danger ? 'dng' : 'pri'), onclick: function () { close(inp ? inp.value : true); } }, o.ok || 'OK');
    cancel = h('button', { class: 'btn', onclick: function () { close(null); } }, 'キャンセル');
    if (o.input) inp = h('input', { maxlength: 300, 'aria-label': msg, onkeydown: function (e) { if (e.key === 'Enter') ok.click(); } });
    bg = h('div', { class: 'dlg-bg', onclick: function (e) { if (e.target === bg) close(null); } }, h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': msg }, h('p', {}, msg), inp, h('div', { class: 'row' }, cancel, ok)));
    document.addEventListener('keydown', kd); document.body.append(bg); (inp || cancel).focus(); }); }
var CATS = { web: 'Web', pixel: 'Pixel', circuit: 'Circuit', 'cpu-program': 'CPU', machine: 'Machine' };
function cat(w) { return w.engine === 'zero' ? 'Creation' : CATS[w.work_type] || w.work_type; }
var sha256 = Z.sha256;
function hue(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 360; return n; }
function ago(s) { var d = (Date.now() - new Date(s)) / 1000; return d < 3600 ? Math.max(1, d / 60 | 0) + '分前' : d < 86400 ? (d / 3600 | 0) + '時間前' : (d / 86400 | 0) + '日前'; }

/* ---------- Supabase (REST/Auth/Storage を fetch で直接。Publishable Key のみ使用) ---------- */
function api(path, o) { o = o || {};
  var hd = Object.assign({ apikey: C.supabaseKey, Authorization: 'Bearer ' + (S && S.access_token || C.supabaseKey) }, o.headers);
  if (o.json !== undefined) { hd['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.json); }
  return fetch(C.supabaseUrl + path, Object.assign({}, o, { headers: hd })).then(function (r) {
    if (r.status === 401 && S && S.refresh_token && !o.retry) return refresh().then(function () { o.retry = 1; return api(path, o); });
    if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var er = new Error(j.message || j.msg || j.error_description || r.statusText); er.status = r.status; throw er; });
    return o.raw ? r : r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; }); }); }
var rest = function (p, o) { return api('/rest/v1/' + p, o); };
function encPath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
var store = null; try { store = window.localStorage; } catch (e) {}
var deps = { store: store, log: function () { console.warn.apply(console, arguments); }, sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  upload: function (path, text) { return api('/storage/v1/object/works/' + encPath(path), { method: 'POST', body: new Blob([text], { type: 'application/json' }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' } }); },
  insert: function (row) { return rest('works', { method: 'POST', json: row }); },
  exists: function (id) { return rest('works?select=id&id=eq.' + encodeURIComponent(id)).then(function (a) { return a.length > 0; }); },
  remove: function (path) { return api('/storage/v1/object/works/' + encPath(path), { method: 'DELETE' }).then(function () { return true; }, function (e) { if (e.status === 404) return true; throw e; }); } };
function sweep() { if (S && S.user) Z.sweepOrphans(deps, S.user.id).catch(function () {}); }
function setSession(s) { S = s; myProfile = null; if (s) localStorage.setItem('zero.s', JSON.stringify(s)); else localStorage.removeItem('zero.s'); }
function refresh() { return fetch(C.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: S.refresh_token }) })
  .then(function (r) { if (!r.ok) { setSession(null); throw new Error('ログインの有効期限が切れました'); } return r.json(); }).then(setSession); }
function count(table, q) { return rest(table + '?select=*&' + q, { raw: 1, method: 'GET', headers: { Prefer: 'count=exact', Range: '0-0' } }).then(function (r) { return +(r.headers.get('content-range') || '*/0').split('/')[1] || 0; }); }
var SEL = 'id,title,description,engine,work_type,tags,license,visibility,version,thumb,likes,comments,remixes,created_at,derived_from,author_id,author:author_id(username,display_name)';

/* ---------- 部品 ---------- */
function card(w) {
  var au = (w.author && (w.author.display_name || w.author.username)) || '';
  var cv = w.thumb ? h('div', { class: 'cover', style: 'background-image:url(' + w.thumb + ')' }) : h('div', { class: 'cover', style: 'background:radial-gradient(120% 90% at 18% 8%,hsl(' + (160 + hue(w.id) % 40) + ' 55% 30%),transparent 70%),linear-gradient(135deg,hsl(' + (205 + hue(w.id) % 85) + ' 55% 14%),hsl(' + (235 + hue(w.id) % 70) + ' 50% 27%))' });
  return h('a', { class: 'card', href: '#/work/' + w.id }, h('div', { class: 'cover-w' }, cv, h('span', { class: 'cat-b' }, cat(w))), h('div', { class: 'cb' }, h('b', {}, w.title),
    h('div', { class: 'by' }, au ? h('i', {}, au.slice(0, 1).toUpperCase()) : null, au),
    h('div', { class: 'st' }, h('span', {}, '♥ ' + w.likes), h('span', {}, '💬 ' + w.comments), h('span', {}, '⑂ ' + w.remixes))));
}
function need(m) { return S ? null : h('div', { class: 'warn' }, m || 'この操作にはログインが必要です。 ', h('a', { href: '#/auth' }, 'ログイン / 登録')); }
function sanitizeQ(q) { return q.replace(/[,()*{}%\\"']/g, ' ').trim().slice(0, 60); }

/* ---------- 画面: フィード ---------- */
var TABS = [['', 'Discover'], ['trending', 'Trending'], ['latest', 'Latest'], ['following', 'Following'], ['orbit', 'Orbit 3D'], ['universe', 'Universe'], ['cat/Web', 'Web'], ['cat/Circuit', 'Circuit'], ['cat/CPU', 'CPU'], ['cat/Machine', 'Machine'], ['cat/Creation', 'Creation']];
var CATQ = { Web: 'engine=eq.code&work_type=eq.web', Pixel: 'engine=eq.code&work_type=eq.pixel', Circuit: 'engine=eq.logic&work_type=eq.circuit', CPU: 'engine=eq.logic&work_type=eq.cpu-program', Machine: 'engine=eq.logic&work_type=eq.machine', Creation: 'engine=eq.zero' };
function feed(tab, q) {
  var box = h('input', { type: 'search', placeholder: '作品・作者・タグを検索', value: q || '', 'aria-label': '検索', onkeydown: function (e) { if (e.key === 'Enter') location.hash = '#/search/' + encodeURIComponent(box.value); } });
  var home = !q && !tab, lab = ''; TABS.forEach(function (t) { if (t[0] === tab) lab = t[1]; });
  var grid = h('div', { class: 'grid', 'aria-busy': 'true' }, [1, 2, 3, 4, 5, 6, 7, 8].map(function () { return h('div', { class: 'sk' }); }));
  var hero = home ? h('section', { class: 'hero' }, h('div', { class: 'hero-t' }, h('div', { class: 'eyebrow' }, 'Creative Universe'), h('h1', {}, '作品が、', h('em', {}, '宇宙'), 'になる。'),
    h('p', {}, '公開された作品を見つけ、動かし、Remixする。作品どうしのつながりを、3D空間で探索できます。'), h('div', { class: 'row' }, h('a', { class: 'btn pri', href: '#/universe' }, 'Universe で探索する'), h('a', { class: 'btn', href: '#/publish' }, '作品を公開'))), h('div', { class: 'fe sk' })) : null;
  main.replaceChildren.apply(main, [hero, home ? null : h('h1', {}, q ? '検索: ' + q : lab || 'Zero'), h('div', { class: 'search' }, box),
    h('div', { class: 'tabs' }, TABS.map(function (t) { return h('a', { class: 'chip' + (!q && t[0] === tab ? ' on' : ''), href: '#/' + (t[0] ? t[0] : '') }, t[1]); })), home ? h('div', { class: 'sec-h' }, h('h2', {}, 'Trending')) : null, grid].filter(Boolean));
  var p, base = 'works?select=' + SEL + '&visibility=eq.public';
  if (q) { var s = sanitizeQ(q); p = Promise.all([rest(base + '&or=(title.ilike.*' + s + '*,description.ilike.*' + s + '*,tags.cs.{' + s.replace(/\s/g, '') + '})&order=created_at.desc&limit=48'),
      rest('profiles?select=username,display_name&or=(username.ilike.*' + s + '*,display_name.ilike.*' + s + '*)&limit=6')]).then(function (r) { r[1].forEach(function (u) { grid.before(h('a', { class: 'chip', href: '#/u/' + encodeURIComponent(u.username) }, '@' + u.username)); }); return r[0]; }); }
  else if (tab === 'latest') p = rest(base + '&order=created_at.desc&limit=48');
  else if (tab === 'trending') p = rest('rpc/trending_works', { method: 'POST', json: { lim: 48 } }).then(function (a) { return a.filter(function (w) { return w.likes + w.comments + w.remixes > 0; }); }).then(hydrate);
  else if (tab === 'following') { if (!S) { grid.replaceChildren(need('フォロー中の作品を見るにはログインしてください。 ')); return; }
    p = rest('follows?select=followee_id&follower_id=eq.' + S.user.id).then(function (f) { return f.length ? rest(base + '&author_id=in.(' + f.map(function (x) { return x.followee_id; }).join(',') + ')&order=created_at.desc&limit=48') : []; }); }
  else if (tab && tab.indexOf('cat/') === 0) p = rest(base + '&' + (CATQ[tab.slice(4)] || 'id=is.null') + '&order=created_at.desc&limit=48');
  else p = rest('rpc/trending_works', { method: 'POST', json: { lim: 48 } }).then(hydrate);
  p.then(function (ws) { var fe = hero && hero.querySelector('.fe'), total = ws.length; grid.removeAttribute('aria-busy');
    if (fe) { if (total) { var f = card(ws[0]); f.classList.add('feat'); fe.replaceWith(f); ws = ws.slice(1); } else { fe.remove(); hero.classList.add('solo'); } }
    grid.replaceChildren.apply(grid, total ? ws.map(card) : [h('p', { class: 'empty' }, q ? '「' + q + '」に一致する作品はありません。' : 'まだ作品がありません。最初の作品を公開してみましょう。')]); },
  function (e) { var fe = hero && hero.querySelector('.fe'); if (fe) { fe.remove(); hero.classList.add('solo'); } grid.removeAttribute('aria-busy'); grid.replaceChildren(h('p', { class: 'empty' }, '作品を読み込めませんでした。時間をおいて再度お試しください。')); fail(e); });
}
function hydrate(ws) { if (!ws.length) return ws; return rest('profiles?select=id,username,display_name&id=in.(' + ws.map(function (w) { return w.author_id; }).join(',') + ')').then(function (ps) { var m = {}; ps.forEach(function (u) { m[u.id] = u; }); ws.forEach(function (w) { w.author = m[w.author_id]; }); return ws; }); }

/* ---------- 3D Orbit: 作品を球面に配置し、Remix の派生関係を線で結ぶ（実データのみ） ---------- */
function orbit() {
  var cv = h('canvas', { class: 'stage', width: 1100, height: 690, 'aria-label': '作品の3D空間' }), info = h('p', { style: 'color:var(--mu)' }, 'ドラッグで回転 / 点をクリックで作品へ。線は Remix（派生元→派生作品）。');
  main.replaceChildren(h('h1', {}, 'Orbit'), info, cv);
  rest('works?select=id,title,engine,work_type,derived_from,likes&visibility=eq.public&order=created_at.desc&limit=200').then(function (ws) {
    if (!ws.length) { info.textContent = 'まだ作品がありません。'; return; }
    var n = ws.length, pts = ws.map(function (w, i) { var y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996 + hue(w.id) / 90; return { w: w, x: r * Math.cos(a), y: y, z: r * Math.sin(a) }; });
    var idx = {}; pts.forEach(function (p) { idx[p.w.id] = p; });
    var ry = 0, rx = .3, drag = null, moved = 0, g = cv.getContext('2d'), proj = [], raf;
    function frame() { if (!document.body.contains(cv)) return cancelAnimationFrame(raf); if (!drag) ry += .003;
      var cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx); g.clearRect(0, 0, 1100, 690);
      proj = pts.map(function (p) { var x = p.x * cy + p.z * sy, z = -p.x * sy + p.z * cy, y = p.y * cx - z * sx; z = p.y * sx + z * cx; var k = 2.6 / (2.6 - z); p.s = { x: 550 + x * 270 * k, y: 345 + y * 270 * k, k: k, z: z }; return p; });
      g.lineWidth = 1; proj.forEach(function (p) { var q = p.w.derived_from && idx[p.w.derived_from]; if (q) { g.strokeStyle = 'rgba(98,230,196,' + (.15 + .35 * (p.s.k - .7)) + ')'; g.beginPath(); g.moveTo(q.s.x, q.s.y); g.lineTo(p.s.x, p.s.y); g.stroke(); } });
      proj.slice().sort(function (a, b) { return a.s.z - b.s.z; }).forEach(function (p) { var r = (3 + Math.min(p.w.likes, 20) * .4) * p.s.k; g.fillStyle = 'hsla(' + hue(p.w.id) + ',80%,70%,' + (.35 + .65 * (p.s.z + 1) / 2) + ')'; g.beginPath(); g.arc(p.s.x, p.s.y, r, 0, 7); g.fill(); });
      raf = requestAnimationFrame(frame); }
    function pos(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * 1100 / b.width, y: (e.clientY - b.top) * 690 / b.height }; }
    cv.onpointerdown = function (e) { drag = pos(e); moved = 0; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = function (e) { var q = pos(e); if (drag) { ry += (q.x - drag.x) * .006; rx = Math.max(-1.2, Math.min(1.2, rx + (q.y - drag.y) * .006)); moved += Math.abs(q.x - drag.x) + Math.abs(q.y - drag.y); drag = q; return; }
      var best = hit(q); info.textContent = best ? best.w.title + '（' + cat(best.w) + '）' : 'ドラッグで回転 / 点をクリックで作品へ。線は Remix（派生元→派生作品）。'; };
    cv.onpointerup = function (e) { drag = null; if (moved < 6) { var b = hit(pos(e)); if (b) location.hash = '#/work/' + b.w.id; } };
    function hit(q) { var b = null, d = 14; proj.forEach(function (p) { var e = Math.hypot(p.s.x - q.x, p.s.y - q.y); if (e < d && p.s.z > -.2) { d = e; b = p; } }); return b; }
    frame(); }, fail);
}

/* ---------- Universe: 独立モジュール js/universe.js（実データ or 明示されたサンプル） ---------- */
var uv = null, uvGen = 0;
function configured() { return !!(C.supabaseUrl && C.supabaseKey); }
function uvBox(msg, sampleToo) { main.classList.remove('wide');
  main.replaceChildren(h('div', { class: 'box', style: 'margin:24px auto;max-width:640px' }, h('h1', {}, 'Universe'), h('p', {}, msg), h('div', { class: 'row' }, h('a', { class: 'btn pri', href: '#/' }, '2Dギャラリーへ'), sampleToo ? h('a', { class: 'btn', href: '#/universe/sample' }, 'サンプルUniverseを見る') : null))); }
function mountUv(U, o) { if (uv) { uv.destroy(); uv = null; } uv = U.mount(main, o); }
function universe(sample) { var U = window.ZeroUniverse, gen = uvGen, live = configured(); main.classList.add('wide');
  if (!U) return uvBox('Universe を読み込めません。', false);
  if (sample) { mountUv(U, { nodes: U.SAMPLE(), sample: true, liveHref: live ? '#/universe' : null, notice: live ? null : 'Supabase 未設定のためサンプルを表示中（実作品は表示されません）' }); return; }
  main.replaceChildren(loading());
  rest('works?select=' + SEL + '&visibility=eq.public&order=created_at.desc&limit=500').then(function (ws) {
    if (gen !== uvGen) return;   // 読み込み中に別の画面へ移動した場合は何も描画しない（二重マウント防止）
    if (!ws.length) return uvBox('まだ公開作品がありません。', true);
    mountUv(U, { nodes: U.fromWorks(ws, cat), sampleHref: '#/universe/sample', remix: { can: function (d) { return Z.remixCheck({ id: d.id, license: d.license, author_id: d.authorId, visibility: 'public' }, S && S.user && S.user.id); }, run: remixFromUniverse } }); },
  function (e) { if (gen !== uvGen) return; uvBox('作品を読み込めませんでした: ' + (e && e.message || e), true); }); }

/* ---------- Remix の入口は1つ: startRemix（作品ページ・Universe の両方から使う。ライセンス検証→保持→公開画面） ---------- */
function startRemix(w, pkg) {
  var c = Z.remixCheck(w, S && S.user && S.user.id); if (!c.ok) return c;   // ライセンスを必ず検証。不可なら何も保持せず・画面遷移もしない
  if (!pkg || Z.validatePkg(pkg).length) return { ok: false, code: 'package', message: '作品データを読み込めないためRemixできません' };
  pending = { pkg: pkg, derived: w }; pubGen++; location.hash = '#/publish'; return { ok: true, code: 'ok', message: '' };
}
/* Universe のパネルから。表示用の判定には頼らず、最新の作品情報（ライセンス・公開状態）を取得して再検証し、SHA-256 検証済みのデータだけを使う */
function remixFromUniverse(d) {
  return rest('rpc/get_work', { method: 'POST', json: { p_id: d.id } }).then(function (a) { var w = a[0];
    if (!w) return { ok: false, final: true, message: 'この作品は非公開・削除、または審査により非表示になっています。' };
    var c = Z.remixCheck(w, S && S.user && S.user.id); if (!c.ok) return { ok: false, final: true, message: c.message };
    return loadPackage(w).then(function (pkg) { var r = startRemix(w, pkg); return r.ok ? { ok: true } : { ok: false, final: true, message: r.message }; },
      function (e) { return { ok: false, final: e.message === 'INTEGRITY', message: e.message === 'INTEGRITY' ? '完全性チェック（SHA-256）に失敗したため、Remixできません。' : '作品データを読み込めませんでした: ' + e.message }; }); }); }

/* ---------- 作品ページ ---------- */
function loadPackage(w) { return api('/storage/v1/object/authenticated/works/' + w.payload_path.split('/').map(encodeURIComponent).join('/'), { raw: 1 }).then(function (r) { return r.text(); }).then(function (t) {
  var pkg = JSON.parse(t); return sha256(JSON.stringify({ project: pkg.project, library: pkg.library || [] })).then(function (hh) { if (hh !== w.sha256) throw new Error('INTEGRITY'); return pkg; }); }); }
function runner(w, pkg) {
  var p = pkg.project.engineData.payload, wt = w.work_type;
  if (wt === 'web') { var f = h('iframe', { class: 'stage', sandbox: 'allow-scripts', src: 'run.html', title: w.title, referrerpolicy: 'no-referrer' });
    var on = function (e) { if (e.source === f.contentWindow && e.data === 'zero-run-ready') { f.contentWindow.postMessage({ html: p.html, css: p.css, js: p.js }, '*'); removeEventListener('message', on); } }; addEventListener('message', on); return f; }
  if (wt === 'pixel') { var cv = h('canvas', { class: 'stage', width: p.size, height: p.size, style: 'image-rendering:pixelated;aspect-ratio:1;max-width:520px' }), g = cv.getContext('2d'), i = 0;
    (function draw() { if (!document.body.contains(cv)) return; g.fillStyle = p.bg; g.fillRect(0, 0, p.size, p.size); p.frames[i % p.frames.length].forEach(function (c, k) { if (c) { g.fillStyle = c; g.fillRect(k % p.size, k / p.size | 0, 1, 1); } }); i++; setTimeout(draw, 1000 / (p.fps || 4)); })(); return cv; }
  var lines = wt === 'circuit' ? ['部品: ' + (p.nodes || []).length, '配線: ' + (p.wires || []).length] : wt === 'machine' ? ['パーツ: ' + (p.parts || []).length, 'ボール: ' + (p.balls || []).length] : wt === 'cpu-program' ? ['アセンブリ ' + String(p.asm).split('\n').length + ' 行'] : ['オブジェクト: ' + (p.objects || []).length, 'ツール: ' + (p.tool || '—')];
  return h('div', { class: 'box' }, h('b', {}, '詳細表示（この形式はZeroでは実行せず、内容を安全に表示します）'), h('p', {}, lines.join(' / ')), wt === 'cpu-program' ? h('pre', {}, p.asm) : null, h('p', { style: 'color:var(--mu)' }, 'ZeroStudio で開くには「ダウンロード」した公開用データを取り込んでください。'));
}
function work(id) {
  main.replaceChildren(loading());
  rest('rpc/get_work', { method: 'POST', json: { p_id: id } }).then(function (a) { var w = a[0]; if (!w) { main.replaceChildren(h('h1', {}, '作品が見つかりません'), h('p', {}, '非公開、削除、または審査により非表示になっています。')); return; }
    return Promise.all([rest('profiles?select=id,username,display_name,bio&id=eq.' + w.author_id), w.derived_from ? rest('rpc/get_work', { method: 'POST', json: { p_id: w.derived_from } }) : [], rest('works?select=' + SEL + '&visibility=eq.public&derived_from=eq.' + w.id + '&limit=12'), rest('works?select=' + SEL + '&visibility=eq.public&engine=eq.' + w.engine + '&work_type=eq.' + w.work_type + '&id=neq.' + w.id + '&order=likes.desc&limit=4'),
      loadPackage(w).then(function (p) { return { pkg: p }; }, function (e) { return { err: e.message }; }),
      S ? Promise.all([rest('likes?select=work_id&user_id=eq.' + S.user.id + '&work_id=eq.' + w.id), rest('bookmarks?select=work_id&user_id=eq.' + S.user.id + '&work_id=eq.' + w.id)]) : [[], []],
      rest('comments?select=id,body,created_at,user_id&work_id=eq.' + w.id + '&order=created_at.asc&limit=100')]).then(function (r) { r[7] = w; return r; }); })
  .then(function (r) { if (!r) return; var w = r[7], au = r[0][0] || {}, parent = r[1][0], remixes = r[2], related = r[3], res = r[4], st = r[5], cms = r[6], mine = S && S.user.id === w.author_id;
    return Promise.all([hydrate(remixes), hydrate(related), rest('profiles?select=id,username&id=in.(' + (cms.map(function (c) { return c.user_id; }).concat([w.author_id]).join(',')) + ')')]).then(function (x) {
      var names = {}; x[2].forEach(function (u) { names[u.id] = u.username; });
      var liked = !!st[0].length, marked = !!st[1].length, lk = h('button', { class: 'btn' + (liked ? ' on' : ''), onclick: toggle('likes', liked, lk, '♥') }, '♥ ' + w.likes), bm = h('button', { class: 'btn' + (marked ? ' on' : ''), onclick: toggle('bookmarks', marked, bm, '🔖') }, marked ? '🔖 保存済み' : '🔖 保存');
      function toggle(tbl, on, btn, ic) { return function () { if (!S) return fail(new Error('ログインしてください')); (on ? rest(tbl + '?user_id=eq.' + S.user.id + '&work_id=eq.' + w.id, { method: 'DELETE' }) : rest(tbl, { method: 'POST', json: { user_id: S.user.id, work_id: w.id } })).then(function () { work(id); }, fail); }; }
      var stage = res.pkg ? runner(w, res.pkg) : h('div', { class: 'warn' }, res.err === 'INTEGRITY' ? '完全性チェック（SHA-256）に失敗したため、この作品は実行しません。' : '作品データを読み込めませんでした: ' + res.err);
      var cl = h('div', {}, cms.map(function (c) { return h('div', { class: 'cm' }, h('a', { href: '#/u/' + encodeURIComponent(names[c.user_id] || '') }, '@' + (names[c.user_id] || '?')), ' · ', h('small', {}, ago(c.created_at)), h('div', {}, c.body), (S && S.user.id === c.user_id) ? h('button', { class: 'btn dng', onclick: function () { rest('comments?id=eq.' + c.id, { method: 'DELETE' }).then(function () { work(id); }, fail); } }, '削除') : null); }));
      var ta = h('textarea', { maxlength: 500, rows: 2, placeholder: 'コメント（500文字まで）' });
      var rc = Z.remixCheck(w, S && S.user && S.user.id), actions = h('div', { class: 'acts' }, lk, bm,
        h('button', { class: 'btn', onclick: function () { var u = location.href.split('#')[0] + '#/work/' + w.id; (navigator.share ? navigator.share({ title: w.title, url: u }) : navigator.clipboard.writeText(u).then(function () { toast('リンクをコピーしました'); })).catch(function () {}); } }, '共有'),
        !rc.ok ? h('span', { class: 'chip', title: rc.message }, rc.code.indexOf('license') === 0 ? 'Remix不可（ライセンス）' : 'Remix不可') : h('button', { class: 'btn pri', disabled: res.pkg ? null : 'disabled', onclick: function () { var r = startRemix(w, res.pkg); if (!r.ok) fail(new Error(r.message)); } }, '⑂ Remix'),
        res.pkg ? h('button', { class: 'btn', onclick: function () { var a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(res.pkg)], { type: 'application/json' })), download: w.title.replace(/[^\w\-]+/g, '_') + '.zspublish.json' }); a.click(); } }, 'ZeroStudio用に保存') : null,
        h('button', { class: 'btn', onclick: function () { if (!S) return fail(new Error('ログインしてください')); ask('通報の理由（300文字まで）', { input: 1, ok: '通報する' }).then(function (r) { if (r) rest('reports', { method: 'POST', json: { reporter_id: S.user.id, target_type: 'work', target_id: w.id, reason: r.slice(0, 300) } }).then(function () { toast('通報を受け付けました'); }, fail); }); } }, '通報'));
      var owner = mine ? h('div', { class: 'row', style: 'margin-top:12px' }, h('select', { onchange: function (e) { rest('works?id=eq.' + w.id, { method: 'PATCH', json: { visibility: e.target.value } }).then(function () { toast('公開設定を変更しました'); }, fail); } }, ['public', 'unlisted', 'private'].map(function (v) { return h('option', { value: v, selected: v === w.visibility ? 'selected' : null }, { public: 'Public', unlisted: 'Unlisted（リンクを知る人のみ）', 'private': 'Private' }[v]); })),
        h('button', { class: 'btn dng', onclick: function () { ask('この作品を削除しますか？', { danger: 1, ok: '削除する' }).then(function (y) { if (y) rest('works?id=eq.' + w.id, { method: 'DELETE' }).then(function () { Z.reclaim(deps, { path: w.payload_path, id: w.id, uid: S.user.id }, 2); location.hash = '#/'; }, fail); }); } }, '削除')) : null;
      main.replaceChildren(h('div', { class: 'two' }, h('div', {}, stage, h('h2', {}, '派生作品 (' + w.remixes + ')'), h('div', { class: 'grid' }, x[0].length ? x[0].map(card) : h('p', { class: 'empty' }, 'まだ派生作品はありません')), h('h2', {}, '関連作品'), h('div', { class: 'grid' }, x[1].length ? x[1].map(card) : h('p', { class: 'empty' }, '関連作品はありません'))),
        h('div', { class: 'wk' }, h('h1', {}, w.title), h('div', { class: 'meta' }, h('a', { href: '#/u/' + encodeURIComponent(au.username || '') }, '@' + (au.username || '?')), h('span', { class: 'chip' }, cat(w)), h('span', { class: 'chip' }, w.license), h('span', { class: 'chip' }, 'v' + w.version), w.visibility !== 'public' ? h('span', { class: 'chip' }, w.visibility) : null),
          h('p', {}, w.description), h('div', { class: 'row' }, w.tags.map(function (t) { return h('a', { class: 'chip', href: '#/search/' + encodeURIComponent(t) }, '#' + t); })),
          parent ? h('div', { class: 'lin' }, h('small', {}, '派生元'), h('a', { href: '#/work/' + parent.id }, parent.title + ' (v' + w.derived_version + ')')) : w.derived_from ? h('div', { class: 'lin' }, h('small', {}, '派生元'), h('span', { class: 'meta' }, '削除または非公開です')) : null,
          actions, owner, h('p', { class: 'sha' }, 'SHA-256 ' + w.sha256.slice(0, 16) + '…'), h('h2', {}, 'コメント (' + w.comments + ')'), cl, S ? h('div', {}, ta, h('button', { class: 'btn pri', style: 'margin-top:8px', onclick: function () { var b = ta.value.trim(); if (b) rest('comments', { method: 'POST', json: { work_id: w.id, user_id: S.user.id, body: b } }).then(function () { work(id); }, fail); } }, '投稿')) : need('コメントするにはログインしてください。 '))));
    }); }).catch(fail);
}

/* ---------- 公開 / Remix（ZeroStudio からの直接投稿 or JSON） ---------- */
var validatePkg = Z.validatePkg;
function buildPkg(pkg, o) { var p = JSON.parse(JSON.stringify(pkg.project)); p.title = o.title; p.description = o.description; p.tags = o.tags; p.license = { id: o.license }; p.visibility = 'export-ready';
  if (o.derived) { p.id = 'zr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24); p.derivedFrom = { projectId: o.derived.id, projectVersion: o.derived.version, title: o.derived.title }; p.projectVersion = 1; }
  var lib = pkg.library || []; return sha256(JSON.stringify({ project: p, library: lib })).then(function (hh) { return { hash: hh, pkg: { app: 'zerostudio', format: 'zerostudio.publish', formatVersion: 1, exportedAt: new Date().toISOString(), online: true, integrity: { algorithm: 'SHA-256', hash: hh, of: 'JSON.stringify({project, library})' }, project: p, library: lib } }; }); }
var pubGen = 0;
function held(cur) { return h('div', { class: 'warn' }, (cur.from === 'studio' ? 'ZeroStudio から受信した作品' : 'Remix 元のデータ') + '「' + ((cur.pkg && cur.pkg.project && cur.pkg.project.title) || '無題') + '」をこのタブのメモリに保持しています（タブを閉じる・再読み込みすると失われます）。 ',
  h('button', { class: 'btn', onclick: function () { pending = null; pubGen++; route(); } }, '破棄')); }
function publish() {
  var cur = pending;
  if (!S) { main.replaceChildren(h('h1', {}, '公開'), cur ? held(cur) : null, need('作品を公開するにはログインしてください。ログイン後、保持中の作品は投稿確認画面に戻ります。 ')); return; }
  var form = h('div', { class: 'box' }), drop = h('input', { type: 'file', accept: '.json,application/json' });
  main.replaceChildren(h('h1', {}, cur && cur.derived ? 'Remix して公開' : 'Zero に公開'), h('p', { style: 'color:var(--mu)' }, 'ZeroStudio の「Zeroに公開」から送られた作品、または .zspublish.json を読み込みます。SHA-256 を検証できた作品だけ投稿できます。'), cur ? held(cur) : null, drop, form);
  function show(pkg, derived) { var my = ++pubGen, err = validatePkg(pkg);
    if (err.length) { form.replaceChildren(h('div', { class: 'warn' }, '投稿できません: ' + err.join(' / '))); return; }
    if (derived) { var rc0 = Z.remixCheck(derived, S.user.id); if (!rc0.ok) { form.replaceChildren(h('div', { class: 'warn' }, 'Remixできません: ' + rc0.message)); return; } }   // 保持中の Remix 元も、ログイン状態を踏まえて再検証
    form.replaceChildren(h('p', { style: 'color:var(--mu)' }, 'SHA-256 を検証しています…'));
    Z.verifyPackage(pkg).then(function (v) { if (my !== pubGen) return;
      if (!v.ok) { form.replaceChildren(h('div', { class: 'warn' }, '投稿できません: ' + v.message)); return; }
      var p = pkg.project, t = h('input', { value: (derived ? p.title + ' (Remix)' : p.title) || '', maxlength: 80 }), d = h('textarea', { rows: 3, maxlength: 500 }, p.description || ''), tg = h('input', { value: (p.tags || []).join(' ') }), allowed = derived ? Z.remixLicenses(derived, S.user.id) : Z.ALL_LICENSES, want = derived && derived.license === 'CC-BY-SA-4.0' ? 'CC-BY-SA-4.0' : (p.license && p.license.id) || 'CC-BY-4.0', pick = allowed.indexOf(want) >= 0 ? want : allowed[0],
        lic = h('select', {}, ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0-1.0', 'MIT', 'all-rights-reserved'].filter(function (l) { return allowed.indexOf(l) >= 0; }).map(function (l) { return h('option', { value: l, selected: l === pick ? 'selected' : null }, l); })), vis = h('select', {}, ['public', 'unlisted', 'private'].map(function (v) { return h('option', { value: v }, v); }));
      form.replaceChildren(h('p', {}, cat({ engine: p.engine, work_type: p.workType }) + ' · v' + (p.projectVersion || 1) + (derived ? ' · 派生元: ' + derived.title + '（原作者: 元作品ページに表示）' : '')), h('p', { class: 'meta' }, 'SHA-256 検証OK ' + v.hash.slice(0, 16) + '…'), h('label', {}, 'タイトル'), t, h('label', {}, '説明'), d, h('label', {}, 'タグ（スペース区切り・10個まで）'), tg, h('label', {}, 'ライセンス'), lic, h('label', {}, '公開設定'), vis,
        h('button', { class: 'btn pri', style: 'margin-top:16px', onclick: function (e) { var btn = e.target; btn.disabled = true;
          Z.verifyPackage(pkg).then(function (v2) { if (!v2.ok) throw new Error(v2.message); // 投稿直前にも再検証（検証前・検証失敗では投稿しない）
            if (derived) { var rc1 = Z.remixCheck(derived, S.user.id); if (!rc1.ok) throw new Error(rc1.message); if (Z.remixLicenses(derived, S.user.id).indexOf(lic.value) < 0) throw new Error('元作品のライセンス（' + derived.license + '）により、この派生作品は ' + Z.remixLicenses(derived, S.user.id).join(' / ') + ' で公開してください'); }
            return buildPkg(pkg, { title: t.value.trim().slice(0, 80) || '無題', description: d.value.slice(0, 500), tags: tg.value.split(/\s+/).filter(function (x) { return /^[^\s<>"'`\\]{1,24}$/.test(x); }).slice(0, 10), license: lic.value, derived: derived }); }).then(function (b) {
            var txt = JSON.stringify(b.pkg); if (new Blob([txt]).size > 8 * 1048576) throw new Error('作品が大きすぎます（8MBまで）');
            var id = crypto.randomUUID(), path = S.user.id + '/' + id + '.json', th = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.thumb || '') && p.thumb.length <= 90000 ? p.thumb : null;
            return Z.uploadAndRegister(deps, { uid: S.user.id, id: id, path: path, text: txt, row: { id: id, author_id: S.user.id, title: b.pkg.project.title, description: b.pkg.project.description, engine: p.engine, work_type: p.workType, tags: b.pkg.project.tags, license: lic.value, visibility: vis.value, sha256: b.hash, payload_path: path, thumb: th, derived_from: derived ? derived.id : null } })
              .then(function () { pending = null; toast('公開しました'); location.hash = '#/work/' + id; }); })
          .catch(function (er) { btn.disabled = false; if (!S) { renderMe(); location.hash = '#/auth'; } // セッション切れ: 保持中の作品はそのまま、ログイン後に戻る
            fail(new Error(errMsg(er) + Z.cleanupNote(er && er.cleanup))); }); } }, '公開する')); }); }
  function errMsg(e) { return e && e.message || String(e); }
  drop.onchange = function () { var f = drop.files[0]; if (!f) return; if (f.size > 50 * 1048576) return fail(new Error('ファイルが大きすぎます')); f.text().then(function (t) { pending = null; show(JSON.parse(t), null); }).catch(function (e) { fail(new Error('JSONを読み込めません: ' + e.message)); }); };
  if (cur) show(cur.pkg, cur.derived);
}

/* ---------- 認証 / プロフィール / 設定 ---------- */
function auth() { var em = h('input', { type: 'email', autocomplete: 'email' }), pw = h('input', { type: 'password', autocomplete: 'current-password', minlength: 8 }), un = h('input', { placeholder: '英小文字・数字・_ 3〜20文字（登録時）', maxlength: 20 });
  function done(s) { setSession(s); renderMe(); sweep(); location.hash = pending ? '#/publish' : '#/'; }
  main.replaceChildren(h('div', { class: 'box narrow' }, h('h1', {}, 'ログイン / 登録'), pending ? held(pending) : null, h('label', {}, 'メールアドレス（公開されません）'), em, h('label', {}, 'パスワード（8文字以上）'), pw, h('label', {}, 'ユーザー名（登録のみ）'), un,
    h('div', { class: 'row', style: 'margin-top:16px' }, h('button', { class: 'btn pri', onclick: function () { api('/auth/v1/token?grant_type=password', { method: 'POST', json: { email: em.value, password: pw.value } }).then(done, fail); } }, 'ログイン'),
      h('button', { class: 'btn', onclick: function () { if (!/^[a-z0-9_]{3,20}$/.test(un.value)) return fail(new Error('ユーザー名の形式が不正です')); api('/auth/v1/signup', { method: 'POST', json: { email: em.value, password: pw.value, data: { username: un.value } } }).then(function (s) { if (s.access_token) done(s); else toast('確認メールを送りました。メール内のリンクで認証後にログインしてください'); }, fail); } }, '新規登録')))); }
function profile(name) { main.replaceChildren(loading());
  rest('profiles?select=id,username,display_name,bio,created_at&username=eq.' + encodeURIComponent(name)).then(function (a) { var u = a[0]; if (!u) { main.replaceChildren(h('div', { class: 'empty' }, 'ユーザーが見つかりません')); return; }
    return Promise.all([rest('works?select=' + SEL + '&visibility=eq.public&author_id=eq.' + u.id + '&order=created_at.desc&limit=60'), count('follows', 'followee_id=eq.' + u.id), count('follows', 'follower_id=eq.' + u.id), S ? rest('follows?select=followee_id&follower_id=eq.' + S.user.id + '&followee_id=eq.' + u.id) : []]).then(function (r) { r[0].forEach(function (w) { w.author = u; });
      var fb = S && S.user.id !== u.id ? h('button', { class: 'btn' + (r[3].length ? ' on' : ''), onclick: function () { (r[3].length ? rest('follows?follower_id=eq.' + S.user.id + '&followee_id=eq.' + u.id, { method: 'DELETE' }) : rest('follows', { method: 'POST', json: { follower_id: S.user.id, followee_id: u.id } })).then(function () { profile(name); }, fail); } }, r[3].length ? 'フォロー中' : 'フォロー') : null;
      main.replaceChildren(h('div', { class: 'phead' }, h('div', { class: 'av', 'aria-hidden': 'true' }, (u.display_name || u.username).slice(0, 1).toUpperCase()),
        h('div', {}, h('h1', {}, u.display_name || u.username), h('div', { class: 'meta' }, '@' + u.username), u.bio ? h('p', { class: 'bio' }, u.bio) : null,
          h('div', { class: 'pst' }, h('span', {}, h('b', {}, r[0].length), '作品'), h('span', {}, h('b', {}, r[1]), 'フォロワー'), h('span', {}, h('b', {}, r[2]), 'フォロー中'))), fb),
        h('h2', {}, '作品'), h('div', { class: 'grid' }, r[0].length ? r[0].map(card) : h('p', { class: 'empty' }, 'まだ公開作品がありません'))); }); }).catch(fail); }
function settings() { if (!S) { main.replaceChildren(need()); return; }
  rest('profiles?select=username,display_name,bio&id=eq.' + S.user.id).then(function (a) { var u = a[0]; var dn = h('input', { value: u.display_name || '', maxlength: 40 }), bio = h('textarea', { rows: 3, maxlength: 300 }, u.bio || '');
    main.replaceChildren(h('div', { class: 'box narrow' }, h('h1', {}, 'アカウント設定'), h('label', {}, '表示名'), dn, h('label', {}, '自己紹介'), bio,
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn pri', onclick: function () { rest('profiles?id=eq.' + S.user.id, { method: 'PATCH', json: { display_name: dn.value, bio: bio.value } }).then(function () { toast('保存しました'); }, fail); } }, '保存'), h('button', { class: 'btn', onclick: logout }, 'ログアウト')),
      h('h2', {}, '危険な操作'), h('button', { class: 'btn dng', onclick: function () { ask('アカウントと全作品を完全に削除します。ユーザー名「' + u.username + '」を入力してください', { input: 1, danger: 1, ok: '完全に削除' }).then(function (v) { if (v === u.username) rest('rpc/delete_my_account', { method: 'POST', json: {} }).then(function () { setSession(null); renderMe(); location.hash = '#/'; toast('アカウントを削除しました'); }, fail); }); } }, 'アカウントを削除'))); }, fail); }
function logout() { api('/auth/v1/logout', { method: 'POST' }).catch(function () {}).then(function () { setSession(null); renderMe(); location.hash = '#/'; }); }
function renderMe() { var me = document.getElementById('me'); me.replaceChildren(S ? h('div', { class: 'row' }, h('a', { class: 'btn pri', href: '#/publish' }, '公開'), h('a', { class: 'btn', href: '#/settings' }, '設定')) : h('a', { class: 'btn pri', href: '#/auth' }, 'ログイン')); }

/* ---------- ルーター ---------- */
function setup() { main.replaceChildren(h('div', { class: 'box' }, h('h1', {}, 'セットアップが必要です'), h('p', {}, 'js/config.js に Supabase の URL と Publishable (anon) Key を設定してください。未設定のため、オンライン機能（作品・ログイン・公開）は動作しません。ダミーデータは表示しません。'), h('p', {}, '手順は README.md を参照してください。'), h('p', {}, '3D空間の動作確認には、実作品ではなく「SAMPLE」と明示したサンプルを用意しています。'), h('a', { class: 'btn pri', href: '#/universe/sample' }, 'サンプルUniverseを見る（Supabase不要）'))); }
function route() { var p = location.hash.replace(/^#\/?/, '').split('/'), cur = '#/' + (p[0] || '');
  document.querySelectorAll('nav a').forEach(function (a) { var on = a.getAttribute('href') === cur; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  uvGen++; if (uv) { uv.destroy(); uv = null; } main.classList.remove('wide');   // 画面を離れる前に必ず破棄（描画ループ・リスナー・WebGL を解放）
  main.focus({ preventScroll: true }); window.scrollTo(0, 0);
  if (p[0] === 'universe') {   // Supabase 未設定でもサンプルUniverseは開ける。実作品とは別URL（#/universe/sample）で明示的に区別する
    if (p[1] === 'sample') return universe(true);
    if (!configured()) { location.replace('#/universe/sample'); return; }
    return universe(false); }
  if (!configured()) return setup();
  var r = p[0]; if (r === 'work') work(p[1]); else if (r === 'u') profile(decodeURIComponent(p[1] || '')); else if (r === 'publish') publish(); else if (r === 'auth') auth(); else if (r === 'settings') settings(); else if (r === 'orbit') orbit();
  else if (r === 'search') feed('', decodeURIComponent(p[1] || '')); else if (r === 'cat') feed('cat/' + p[1]); else feed(r); }
var NAV = ['', 'trending', 'latest', 'following', 'universe', 'orbit'], TABN = {}; TABS.forEach(function (t) { TABN[t[0]] = t[1]; });
document.getElementById('nav').replaceChildren.apply(document.getElementById('nav'), NAV.map(function (k) { return h('a', { href: '#/' + k }, TABN[k]); }));
/* ZeroStudio からの直接投稿: ログイン前でも受信してメモリに保持し、ログイン後に投稿確認画面へ戻す */
var oi = Z.normalizeOrigins(C.studioOrigins, location.origin), warnedOrigin = false;
oi.bad.forEach(function (b) { console.warn('zero: studioOrigins の無効な値を無視しました:', b); });
function afterReceive() { var to = S ? '#/publish' : '#/auth'; if (location.hash === to) route(); else location.hash = to; }
Z.createReceiver({ win: window, opener: window.opener, origins: oi.origins,
  onReceive: function (pkg) { pending = { pkg: pkg, derived: null, from: 'studio' }; pubGen++; toast(S ? 'ZeroStudio から作品を受信しました。内容を確認して公開してください。' : 'ZeroStudio から作品を受信しました。ログインすると投稿確認画面に進みます。'); afterReceive(); },
  onProblem: function () { if (!warnedOrigin) { warnedOrigin = true; toast('許可されていない送信元からの投稿を拒否しました。js/config.js の studioOrigins を確認してください'); } } });
addEventListener('hashchange', route); renderMe(); sweep(); route();
})();
