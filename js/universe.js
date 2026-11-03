/* ZERO Universe V1.0.4 — 作品を3D空間で探索する独立モジュール（依存なし・生WebGL1・CSP 'self' 対応）
 * 公開API: ZeroUniverse.mount(root, opts) / ZeroUniverse.fromWorks(rows, catOf) / ZeroUniverse.SAMPLE() / ZeroUniverse.CATS
 *   opts: { nodes, sample, notice, sampleHref, liveHref, remix:{can(node)->{ok,message}, run(node)->Promise<{ok,message}|void>} }
 *   nodes: [{id,title,cat,author,authorId,tags[],parent,likes,desc,thumb,license}]  parent は読み込み済みの実在する派生元IDのみ。
 *   mount() の戻り値: { destroy(), info(), select(i), setMode(m), state }。destroy() は何度呼んでも安全（冪等）。
 * 描画は gl.POINTS（全ノード1コール）+ gl.LINES。外部ライブラリは使わない。
 * 失敗時（WebGL非対応・シェーダー失敗・描画例外・コンテキスト復旧失敗）は同じ場所に2Dギャラリーを表示する。 */
(function () {
'use strict';
var CATS = ['Web', 'Pixel', 'Circuit', 'CPU', 'Machine', 'Creation'];
var COL = { Web: [.54, .72, 1], Pixel: [.76, .6, 1], Circuit: [.38, .9, .77], CPU: [.5, .82, 1], Machine: [.68, .72, 1], Creation: [.9, .66, 1] };
var MODES = [['universe', 'Universe'], ['categories', 'Categories'], ['evolution', 'Evolution'], ['creator', 'Creator Space'], ['related', 'Related Works']];
var THUMB_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
var HINT = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'ドラッグで回転 · ピンチでズーム · タップで選択' : 'ドラッグ: 回転 · ホイール: ズーム · クリック: 選択 · Esc: 閉じる';

function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
function rnd(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
function hueRGB(id) { var r = rnd(id)(); return [.5 + .3 * Math.sin(r * 6.28), .7, .9]; }
function colorOf(d) { return COL[d.cat] || hueRGB(d.id); }
function coverOf(d, cls) {
  var c = el('div', cls), k = colorOf(d);
  if (d.thumb) c.style.backgroundImage = 'url(' + d.thumb + ')';
  else { c.style.background = 'linear-gradient(135deg,rgba(' + k.map(function (x) { return (x * 90) | 0; }) + ',1),rgba(' + k.map(function (x) { return (x * 200) | 0; }) + ',1))'; c.textContent = String(d.cat || '').toUpperCase(); }
  return c;
}

function fromWorks(ws, catOf) {
  var ids = {}; ws.forEach(function (w) { ids[w.id] = 1; });
  return ws.map(function (w) {
    var a = w.author || {};
    return { id: w.id, title: w.title, cat: catOf(w), author: a.display_name || a.username || '', authorId: w.author_id || '', tags: w.tags || [],
      parent: w.derived_from && ids[w.derived_from] ? w.derived_from : null, likes: w.likes || 0, desc: w.description || '',
      thumb: THUMB_RE.test(w.thumb || '') ? w.thumb : '', license: w.license || '' };
  });
}
/* サンプル（本物ではない）。UIに SAMPLE と明示する。人気数は持たせない（likes=0）。ID は必ず "sample-" で始まる */
function SAMPLE() {
  var n = [], i, c, authors = ['sample_a', 'sample_b', 'sample_c', 'sample_d'];
  for (i = 0; i < 90; i++) {
    c = CATS[i % 6]; var r = rnd('s' + i);
    n.push({ id: 'sample-' + i, title: 'Sample ' + c + ' ' + (i + 1), cat: c, author: authors[i % 4], authorId: 'sa' + (i % 4), tags: [c.toLowerCase(), ['art', 'tool', 'game'][i % 3]],
      parent: (i > 11 && r() < .6) ? 'sample-' + ((r() * i) | 0) : null, likes: 0, desc: 'これは動作確認用のサンプル作品です（実在しません）。', thumb: '', license: '', sample: true });
  }
  return n;
}

/* ---------- 2Dギャラリー（WebGL が使えない・失敗した場合の代替表示） ---------- */
function fallback2D(root, opt, reason) {
  var N = opt.nodes, wrap = el('div', 'uv uv-2d' + (opt.sample ? ' uv-is-sample' : '')), inp = el('input'), grid = el('div', 'grid');
  wrap.append(el('h2', '', '2Dギャラリー'), el('p', 'warn', reason + '（3D表示の代わりに2Dで表示しています）'));
  if (opt.sample) wrap.append(el('div', 'chip uv-sample', 'SAMPLE DATA — 動作確認用のサンプルです。実在の作品・作者ではありません'));
  var row = el('div', 'row'); inp.type = 'search'; inp.placeholder = '作品名・作者・タグ・カテゴリ'; inp.setAttribute('aria-label', '2Dギャラリー内を検索'); inp.style.maxWidth = '320px';
  row.append(inp); if (opt.sample && opt.liveHref) { var lv = el('a', 'btn', '実作品のUniverseへ'); lv.href = opt.liveHref; row.append(lv); }
  if (!opt.sample) { var home = el('a', 'btn pri', '作品一覧（Discover）へ'); home.href = '#/'; row.append(home); }
  wrap.append(row, grid);
  function render() {
    var q = inp.value.trim().toLowerCase(), list = N.filter(function (d) { return !q || (d.title + ' ' + d.author + ' ' + d.tags.join(' ') + ' ' + d.cat).toLowerCase().indexOf(q) >= 0; }).slice(0, 200);
    grid.replaceChildren.apply(grid, list.length ? list.map(function (d) {
      var c = el(opt.sample ? 'div' : 'a', 'card'); if (!opt.sample) c.href = '#/work/' + d.id;
      var b = el('div', 'cb'), m = el('div', 'meta'); m.append(el('span', '', '@' + (d.author || '?')), el('span', 'chip', d.cat));
      if (opt.sample) m.append(el('span', 'chip', 'SAMPLE'));
      b.append(el('b', '', d.title), m); c.append(coverOf(d, 'cover'), b); return c;
    }) : [el('p', '', '該当する作品がありません')]);
  }
  inp.oninput = render; render(); root.replaceChildren(wrap);
}

function mount(root, opt) {
  var N = opt.nodes, n = N.length, idx = {}, destroyed = false, fellBack = false, cleanups = [];
  N.forEach(function (d, i) { idx[d.id] = i; d.i = i; });
  var kids = N.map(function () { return []; }); N.forEach(function (d) { if (d.parent != null && idx[d.parent] != null) kids[idx[d.parent]].push(d.i); });
  var ctrl = { destroy: destroy, info: info, screenPos: function (i) { if (destroyed || fellBack || !gl || i < 0 || i >= n) return null; mats(); var q = proj(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); return q && { x: q.x, y: q.y }; }, select: function (i, k) { if (!fellBack) select(i, k); }, setMode: function (m) { if (!fellBack) setMode(m); }, state: null };
  function on(target, type, fn, o) { target.addEventListener(type, fn, o); cleanups.push(function () { target.removeEventListener(type, fn, o); }); }

  var wrap = el('div', 'uv' + (opt.sample ? ' uv-is-sample' : '')), cv = el('canvas', 'uv-cv'), bar = el('div', 'uv-bar'), lab = el('div', 'uv-labs'), panel = el('div', 'uv-panel'), mini = el('canvas', 'uv-mini'), hint = el('div', 'uv-hint'), pickUI = el('div', 'uv-pick');
  mini.width = mini.height = 110; mini.setAttribute('aria-hidden', 'true');
  cv.setAttribute('aria-label', '作品の3D空間。ドラッグで回転、ホイール/ピンチでズーム、作品をタップで詳細'); cv.tabIndex = 0;
  pickUI.hidden = true; panel.setAttribute('aria-live', 'polite');
  root.replaceChildren(wrap); wrap.append(cv, lab, bar, panel, mini, hint, pickUI);

  /* ---- 状態 ---- */
  var st = { mode: 'universe', cat: null, q: '', sel: -1, hov: -1, author: null }, matches = {};
  ctrl.state = st;
  var pos = new Float32Array(3 * n), tpos = new Float32Array(3 * n), al = new Float32Array(n), tal = new Float32Array(n), hl = new Uint8Array(n);
  var cam = { y: .6, p: .35, d: 30, t: [0, 0, 0] }, goal = { y: cam.y, p: cam.p, d: cam.d, t: [0, 0, 0] }, home = { y: .6, p: .35, d: 30 };
  var auto = !reduce, dirty = true, raf = 0, running = false, visible = true, last = 0, lastDraw = 0, drewPrev = false, ema = 16, slowSince = 0, frameNo = 0;
  var drag = false, ptrs = {}, moved = 0, pinch = 0;
  var colr = N.map(colorOf), catIdx = N.map(function (d) { return CATS.indexOf(d.cat) % 5; });

  /* ---- 品質（低性能端末向け）: level 0=標準 / 1=軽量 / 2=最軽量。重い（フレーム間隔が長い）場合は自動で下げる ---- */
  var narrow = window.innerWidth < 700;
  var lowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4) || false;
  var level = lowEnd ? 1 : 0, dprCap = 2, dustN = 260;
  function applyQuality() { dprCap = level >= 1 ? 1 : (narrow ? 1.5 : 2); dustN = level >= 2 ? 0 : level === 1 ? 120 : 260; if (level >= 2) auto = false; if (gl) resize(); dirty = true; }

  /* ---- 検索対象の作者一覧（Creator Space） ---- */
  var authors = (function () { var m = {}, out = []; N.forEach(function (d) { if (!d.authorId) return; if (!m[d.authorId]) { m[d.authorId] = { id: d.authorId, name: d.author || '(名前なし)', count: 0 }; out.push(m[d.authorId]); } m[d.authorId].count++; }); return out.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); }); })();
  function authorName(id) { for (var i = 0; i < authors.length; i++) if (authors[i].id === id) return authors[i]; return null; }

  /* ---- レイアウト ---- */
  function anchor(c, R) { var a = CATS.indexOf(c) / 6 * 6.2832; return [Math.cos(a) * R, ((CATS.indexOf(c) % 2) ? 1 : -1) * R * .12, Math.sin(a) * R]; }
  function blob(d, k) { var r = rnd(d.id), u = r() * 2 - 1, a = r() * 6.2832, s = Math.sqrt(1 - u * u), rr = k * Math.cbrt(r()); return [rr * s * Math.cos(a), rr * u * .8, rr * s * Math.sin(a)]; }
  function setP(i, v) { tpos[3 * i] = v[0]; tpos[3 * i + 1] = v[1]; tpos[3 * i + 2] = v[2]; }
  function creatorWorks() { return st.author ? N.filter(function (d) { return d.authorId === st.author; }) : []; }
  function creatorRadius(m) { return 1.7 * Math.sqrt(m + .6); }
  function layout() {
    var i, v, a;
    for (i = 0; i < n; i++) { a = anchor(N[i].cat, st.mode === 'categories' ? 17 : 9); v = blob(N[i], st.mode === 'categories' ? 4.2 : 6.5); setP(i, [a[0] + v[0], a[1] + v[1], a[2] + v[2]]); }
    if (st.mode === 'evolution') {
      var roots = N.filter(function (d) { return d.parent == null && kids[d.i].length; });
      roots.forEach(function (rt, ri) {
        var ang = ri / Math.max(1, roots.length) * 6.2832, R = 5 + roots.length * .9; setP(rt.i, [Math.cos(ang) * R, 0, Math.sin(ang) * R]);
        (function grow(p, dir, dep) { var ch = kids[p], m = ch.length; ch.forEach(function (c, j) { var an = dir + (j - (m - 1) / 2) * (.9 / (dep + 1)), px = tpos[3 * p], pz = tpos[3 * p + 2]; setP(c, [px + Math.cos(an) * 3.2, -dep * 2.2 - 2.2, pz + Math.sin(an) * 3.2]); grow(c, an, dep + 1); }); })(rt.i, ang, 0);
      });
    }
    if (st.mode === 'creator' && st.author) {   // 選んだ作者の作品だけを、中心から渦（フィボナッチ螺旋）状に並べる。他の作者の作品は非表示
      creatorWorks().forEach(function (d, j) { var r = creatorRadius(j), an = j * 2.39996; setP(d.i, [Math.cos(an) * r, (j % 3 - 1) * .7, Math.sin(an) * r]); });
    }
    if (st.mode === 'related' && st.sel >= 0) { setP(st.sel, [0, 0, 0]); var rl = related(st.sel); rl.forEach(function (r, j) { var an = j / rl.length * 6.2832; setP(r.j, [Math.cos(an) * 6, (j % 2 ? 1.5 : -1.5), Math.sin(an) * 6]); }); }
    dirty = true;
  }
  function related(s) {
    var d = N[s], out = [], seen = {}; seen[s] = 1;
    function add(j, kind) { if (j == null || j < 0 || seen[j] || out.length >= 14) return; seen[j] = 1; out.push({ j: j, kind: kind }); }
    if (d.parent != null) { add(idx[d.parent], '派生元'); kids[idx[d.parent]].forEach(function (j) { add(j, '兄弟'); }); }
    kids[s].forEach(function (j) { add(j, '派生作品'); });
    N.forEach(function (o) { if (o.cat === d.cat && o.tags.some(function (t) { return d.tags.indexOf(t) >= 0; })) add(o.i, '同カテゴリ・共通タグ'); });
    N.forEach(function (o) { if (o.authorId && o.authorId === d.authorId) add(o.i, '同じ作者'); });
    return out;
  }
  function visibility() {
    var q = st.q.trim().toLowerCase(), i, d, relSet = null; matches = {};
    if (st.mode === 'related' && st.sel >= 0) { relSet = {}; relSet[st.sel] = 1; related(st.sel).forEach(function (r) { relSet[r.j] = 1; }); }
    var inEvo = {}; if (st.mode === 'evolution') N.forEach(function (o) { if (o.parent != null || kids[o.i].length) inEvo[o.i] = 1; });
    for (i = 0; i < n; i++) {
      d = N[i]; var a = 1;
      if (st.cat && d.cat !== st.cat) a = 0;
      else if (st.mode === 'evolution' && !inEvo[i]) a = .05;
      else if (st.mode === 'creator') a = st.author ? (d.authorId === st.author ? 1 : 0) : .3;   // 作者未選択: 背景として薄く表示（選択UIを出す）
      else if (st.mode === 'related' && relSet && !relSet[i]) a = .04;
      if (q && a > 0) { var m = (d.title + ' ' + d.author + ' ' + d.tags.join(' ') + ' ' + d.cat).toLowerCase().indexOf(q) >= 0; if (m) matches[i] = 1; else a = Math.min(a, .1); }
      tal[i] = a;
    }
    dirty = true; hint.textContent = q ? Object.keys(matches).length + ' 件ヒット' : HINT;
  }
  function apply(relayout) { if (relayout) layout(); visibility(); edges(); }

  /* ---- エッジ（実データ: 派生元→派生作品。Relatedでは関連線を追加）。頂点バッファは再利用して GC を抑える ---- */
  var E = [], ed = new Float32Array(14);
  function edges() {
    E = []; N.forEach(function (d) { if (d.parent != null) E.push([idx[d.parent], d.i, 0]); });
    if (st.mode === 'related' && st.sel >= 0) related(st.sel).forEach(function (r) { if (r.kind.indexOf('同') === 0) E.push([st.sel, r.j, 1]); });
    ed = new Float32Array(Math.max(1, E.length) * 14); dirty = true;
  }

  /* ---- WebGL（初期化・解放を関数化。コンテキスト喪失からの復旧にも使う） ---- */
  var gl = null, P1, P2, bN, bE, bD, U1, U2, maxPt = 64, MM = new Float32Array(16), W = 1, H = 1, dpr = 1;
  var nd = new Float32Array(n * 9), dust = new Float32Array(260 * 9);
  (function () { var dr = rnd('dust'); for (var di = 0; di < 260; di++) { var u = dr() * 2 - 1, an = dr() * 6.28, rr = 40 + dr() * 50, s = Math.sqrt(1 - u * u); dust.set([rr * s * Math.cos(an), rr * u, rr * s * Math.sin(an), .5, .6, .9, .15 + dr() * .2, 9, 0], di * 9); } })();
  var VS1 = 'attribute vec3 p;attribute vec4 c;attribute vec2 s;uniform mat4 m;uniform float k;uniform float mp;varying vec4 vc;varying float sp;void main(){gl_Position=m*vec4(p,1.);gl_PointSize=clamp(s.x*k/gl_Position.w,1.5,mp);vc=c;vc.a*=clamp(1.25-gl_Position.w/110.,.25,1.);sp=s.y;}';
  /* 縁のなめらかさは smoothstep(edge0<edge1) の形で書く（edge0>=edge1 は GLSL 仕様上 未定義）。a = 1 - smoothstep(.8, 1., d) */
  var FS1 = 'precision mediump float;varying vec4 vc;varying float sp;void main(){vec2 q=gl_PointCoord*2.-1.;float d;if(sp<.5)d=length(q);else if(sp<1.5)d=max(abs(q.x),abs(q.y));else if(sp<2.5)d=abs(q.x)+abs(q.y);else if(sp<3.5)d=max(abs(q.x)*.866+abs(q.y)*.5,abs(q.y));else if(sp<4.5)d=pow(pow(abs(q.x),4.)+pow(abs(q.y),4.),.25);else d=length(q);float a=1.-smoothstep(.8,1.,d);if(sp>4.5)a*=smoothstep(.42,.58,d);a=max(a,.14*(1.-d));if(a<.01)discard;gl_FragColor=vec4(vc.rgb,vc.a*a);}';
  var VS2 = 'attribute vec3 p;attribute vec4 c;uniform mat4 m;varying vec4 vc;void main(){gl_Position=m*vec4(p,1.);vc=c;}';
  var FS2 = 'precision mediump float;varying vec4 vc;void main(){gl_FragColor=vc;}';
  function compile(t, src) { var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { var log = gl.getShaderInfoLog(o); gl.deleteShader(o); throw new Error('shader: ' + log); } return o; }
  function link(vs, fs) {
    var v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs), p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'p'); gl.bindAttribLocation(p, 1, 'c'); gl.bindAttribLocation(p, 2, 's'); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);   // リンク後は不要（プログラム削除時に解放）
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { var log = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error('link: ' + log); }
    return p;
  }
  function initGL() {
    P1 = link(VS1, FS1); P2 = link(VS2, FS2);
    U1 = { m: gl.getUniformLocation(P1, 'm'), k: gl.getUniformLocation(P1, 'k'), mp: gl.getUniformLocation(P1, 'mp') }; U2 = { m: gl.getUniformLocation(P2, 'm') };
    var rg = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); maxPt = Math.max(1.5, Math.min(72, rg && rg[1] ? rg[1] : 64));   // 端末の最大ポイントサイズを超えない
    bN = gl.createBuffer(); bE = gl.createBuffer(); bD = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bD); gl.bufferData(gl.ARRAY_BUFFER, dust, gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('gl error after init');
  }
  function releaseGL() {
    var g = gl; gl = null; if (!g) return;
    try {
      [bN, bE, bD].forEach(function (b) { if (b) g.deleteBuffer(b); }); [P1, P2].forEach(function (p) { if (p) g.deleteProgram(p); });
      var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();   // 開閉を繰り返してもコンテキスト数の上限に達しない
    } catch (e) { /* 解放中の例外は無視 */ }
    P1 = P2 = bN = bE = bD = null; cv.width = cv.height = 0;
  }
  function pointer(g) { gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, g.stride, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, g.stride, 12); if (g.stride === 36) gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28); }

  function mats() {
    var cy = Math.cos(cam.p), ex = cam.t[0] + cam.d * cy * Math.sin(cam.y), ey = cam.t[1] + cam.d * Math.sin(cam.p), ez = cam.t[2] + cam.d * cy * Math.cos(cam.y);
    var fx = cam.t[0] - ex, fy = cam.t[1] - ey, fz = cam.t[2] - ez, fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    var rx = -fz, ry = 0, rz = fx, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    var ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx, f = 1 / Math.tan(.5 * .9), as = W / H, nr = .5, fr = 400;
    var V = [rx, ux, -fx, 0, ry, uy, -fy, 0, rz, uz, -fz, 0, -(rx * ex + ry * ey + rz * ez), -(ux * ex + uy * ey + uz * ez), (fx * ex + fy * ey + fz * ez), 1];
    var Pm = [f / as, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0];
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += Pm[k * 4 + r] * V[c * 4 + k]; MM[c * 4 + r] = s; }
  }
  function proj(x, y, z) { var w = MM[3] * x + MM[7] * y + MM[11] * z + MM[15]; if (w <= 0) return null; return { x: (MM[0] * x + MM[4] * y + MM[8] * z + MM[12]) / w * .5 * W + W / 2, y: (-(MM[1] * x + MM[5] * y + MM[9] * z + MM[13]) / w * .5 + .5) * H, w: w }; }
  function resize() {
    if (destroyed || !gl) return;
    dpr = Math.min(window.devicePixelRatio || 1, dprCap); var r = cv.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); gl.viewport(0, 0, cv.width, cv.height); dirty = true;
  }
  function sizeOf(d) { return 15 + Math.min(d.likes, 30) * .3; }

  /* ---- 描画ループ（単一rAF。非表示・画面外では停止。破棄後は二度と再開しない） ---- */
  function step(t) {
    raf = 0; if (destroyed || !running) return;
    if (!cv.isConnected) { destroy(); return; }   // 画面から外れていたら自己解放（リーク防止の保険）
    var dt = Math.min(.05, (t - last) / 1000 || .016), k = reduce ? 1 : 1 - Math.exp(-dt * 4.5), big = false, movingY = false, i; last = t;
    if (auto && st.sel < 0 && !drag) goal.y += dt * .05;
    var dy = goal.y - cam.y; if (Math.abs(dy) > 1e-4) { cam.y += dy * k; movingY = true; }
    ['p', 'd'].forEach(function (a) { var df = goal[a] - cam[a]; if (Math.abs(df) > 1e-4) { cam[a] += df * k; big = true; } });
    for (i = 0; i < 3; i++) { var dd = goal.t[i] - cam.t[i]; if (Math.abs(dd) > 1e-4) { cam.t[i] += dd * k; big = true; } }
    for (i = 0; i < 3 * n; i++) { var e = tpos[i] - pos[i]; if (Math.abs(e) > 1e-4) { pos[i] += e * k; big = true; } }
    for (i = 0; i < n; i++) { var ea = tal[i] - al[i]; if (Math.abs(ea) > 1e-3) { al[i] += ea * k; big = true; } }
    if (big || dirty || movingY) {
      var spinOnly = !big && !dirty && auto && st.sel < 0 && !drag;   // ゆっくりした自動回転だけの間は最大30fps（省電力）。最軽量レベルは常に30fps
      if ((spinOnly || level >= 2) && t - lastDraw < 30) { raf = requestAnimationFrame(step); return; }
      var iv = t - lastDraw; lastDraw = t;
      try { draw(); } catch (err) { if (window.console) console.error('zero universe: draw failed', err); toFallback('3D描画中にエラーが発生しました'); return; }
      dirty = false; frameNo++;
      if (drewPrev && iv < 250) {   // 連続描画中のフレーム間隔を監視し、遅い端末では段階的に軽量化（level 0→1→2）
        ema = ema * .9 + iv * .1;
        if (ema > 45 && level < 2) { if (!slowSince) slowSince = t; else if (t - slowSince > 1500) { level++; slowSince = 0; ema = 16; applyQuality(); } } else slowSince = 0;
      }
      drewPrev = true;
    } else drewPrev = false;
    if (!destroyed && running) raf = requestAnimationFrame(step);
  }
  function start() { if (destroyed || fellBack || !gl || running || !visible || document.hidden) return; running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(step); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; drewPrev = false; }
  function draw() {
    if (!gl || gl.isContextLost()) return;
    mats(); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    var i, o, d, c, a, kk = H * dpr * .5 / Math.tan(.45) * .06;   // dpr は1回だけ掛ける（CSSピクセル基準の pick() と大きさを揃える）
    for (i = 0; i < n; i++) {
      d = N[i]; c = colr[i]; a = al[i]; o = i * 9; var s = sizeOf(d), isSel = i === st.sel, rel = hl[i];
      if (st.q && matches[i]) { s *= 1.5; a = Math.max(a, .9); }
      if (isSel) { s *= 2; a = 1; } else if (i === st.hov) s *= 1.4; else if (rel) s *= 1.25;
      nd[o] = pos[3 * i]; nd[o + 1] = pos[3 * i + 1]; nd[o + 2] = pos[3 * i + 2]; nd[o + 3] = isSel ? 1 : c[0]; nd[o + 4] = isSel ? 1 : c[1]; nd[o + 5] = isSel ? 1 : c[2]; nd[o + 6] = a; nd[o + 7] = s; nd[o + 8] = isSel ? 5 : catIdx[i];
    }
    gl.useProgram(P1); gl.uniformMatrix4fv(U1.m, false, MM); gl.uniform1f(U1.k, kk); gl.uniform1f(U1.mp, maxPt);
    if (dustN) { pointer({ buf: bD, stride: 36 }); gl.drawArrays(gl.POINTS, 0, dustN); }
    var m = 0, q;
    for (q = 0; q < E.length; q++) {
      var e = E[q], a1 = Math.min(al[e[0]], al[e[1]]), hi = (hl[e[0]] && hl[e[1]]) || e[0] === st.sel || e[1] === st.sel;
      var aa = a1 * (hi ? .85 : .32); if (aa < .02) continue; var r = e[2] ? .7 : .38, g = e[2] ? .55 : .9, b = e[2] ? 1 : .77, w = m * 14;
      ed[w] = pos[3 * e[0]]; ed[w + 1] = pos[3 * e[0] + 1]; ed[w + 2] = pos[3 * e[0] + 2]; ed[w + 3] = r; ed[w + 4] = g; ed[w + 5] = b; ed[w + 6] = aa;
      ed[w + 7] = pos[3 * e[1]]; ed[w + 8] = pos[3 * e[1] + 1]; ed[w + 9] = pos[3 * e[1] + 2]; ed[w + 10] = r; ed[w + 11] = g; ed[w + 12] = b; ed[w + 13] = aa; m++;
    }
    if (m) { gl.useProgram(P2); gl.disableVertexAttribArray(2); gl.uniformMatrix4fv(U2.m, false, MM); gl.bindBuffer(gl.ARRAY_BUFFER, bE); gl.bufferData(gl.ARRAY_BUFFER, ed.subarray(0, m * 14), gl.DYNAMIC_DRAW); pointer({ buf: bE, stride: 28 }); gl.drawArrays(gl.LINES, 0, m * 2); gl.enableVertexAttribArray(2); }
    gl.useProgram(P1); gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferData(gl.ARRAY_BUFFER, nd, gl.DYNAMIC_DRAW); pointer({ buf: bN, stride: 36 }); gl.drawArrays(gl.POINTS, 0, n);
    labels(); if (level === 0 || frameNo % (level >= 2 ? 6 : 3) === 0) minimap();
  }

  /* ---- ラベル（表示距離制御: 選択・ホバー・検索ヒット・近傍のみ） ---- */
  var pool = [];
  function labels() {
    var want = [], i; if (st.sel >= 0) want.push(st.sel); if (st.hov >= 0 && st.hov !== st.sel) want.push(st.hov);
    if (st.q) Object.keys(matches).slice(0, 8).forEach(function (m) { want.push(+m); });
    if (cam.d < 14) { var near = []; for (i = 0; i < n; i++) if (al[i] > .5) { var dx = pos[3 * i] - cam.t[0], dy = pos[3 * i + 1] - cam.t[1], dz = pos[3 * i + 2] - cam.t[2]; near.push([dx * dx + dy * dy + dz * dz, i]); } near.sort(function (a, b) { return a[0] - b[0]; }).slice(0, 6).forEach(function (x) { want.push(x[1]); }); }
    var seen = {}; want = want.filter(function (x) { return !seen[x] && (seen[x] = 1); }).slice(0, 14);
    while (pool.length < want.length) { var l = el('div', 'uv-lab'); lab.appendChild(l); pool.push(l); }
    pool.forEach(function (l, j) {
      var w = want[j]; if (w == null) { l.style.display = 'none'; return; } var p = proj(pos[3 * w], pos[3 * w + 1], pos[3 * w + 2]); if (!p) { l.style.display = 'none'; return; }
      l.style.display = 'block'; l.textContent = N[w].title + ' · ' + N[w].cat; l.classList.toggle('on', w === st.sel); l.style.transform = 'translate(' + (p.x + 10).toFixed(0) + 'px,' + (p.y - 8).toFixed(0) + 'px)';
    });
  }
  var mg = null;
  function minimap() {
    mg = mg || mini.getContext('2d'); var g = mg, s = 110, sc = 3.2 / 1.5; if (!g) return; g.clearRect(0, 0, s, s); g.fillStyle = 'rgba(8,14,30,.7)'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < n; i++) { if (al[i] < .3) continue; g.fillStyle = i === st.sel ? '#fff' : 'rgba(138,184,255,.7)'; g.fillRect(s / 2 + pos[3 * i] * sc, s / 2 + pos[3 * i + 2] * sc, 2, 2); }
    var cx = s / 2 + (cam.t[0] + cam.d * Math.cos(cam.p) * Math.sin(cam.y)) * sc, cz = s / 2 + (cam.t[2] + cam.d * Math.cos(cam.p) * Math.cos(cam.y)) * sc;
    g.strokeStyle = '#62e6c4'; g.beginPath(); g.moveTo(cx, cz); g.lineTo(s / 2 + cam.t[0] * sc, s / 2 + cam.t[2] * sc); g.stroke(); g.fillStyle = '#62e6c4'; g.beginPath(); g.arc(cx, cz, 3, 0, 7); g.fill();
  }

  /* ---- 選択・カメラ・パネル ---- */
  function fly(i, dist) { goal.t = [tpos[3 * i], tpos[3 * i + 1], tpos[3 * i + 2]]; if (dist) goal.d = dist; dirty = true; }
  function fitCreator() { var m = creatorWorks().length; goal.t = [0, 0, 0]; goal.d = Math.max(10, Math.min(60, creatorRadius(m) * 2.4 + 6)); dirty = true; }
  function select(i, keepCam) {
    st.sel = i; hl.fill(0); var relayout = false;
    if (i >= 0) { related(i).forEach(function (r) { hl[r.j] = 1; }); if (st.mode === 'creator' && N[i].authorId && N[i].authorId !== st.author) { st.author = N[i].authorId; relayout = true; } }
    apply(st.mode === 'related' || relayout); if (relayout) { creatorUI(); fitCreator(); }
    if (i >= 0) fly(i, keepCam ? 0 : Math.min(goal.d, 14)); showPanel(); dirty = true;
  }
  function showPanel() {
    panel.replaceChildren(); var i = st.sel; if (i < 0) { panel.classList.remove('open'); return; } panel.classList.add('open'); var d = N[i];
    var x = el('button', 'btn uv-x', '×'); x.setAttribute('aria-label', '閉じる'); x.onclick = function () { select(-1); };
    var tagRow = el('div', 'row'); d.tags.forEach(function (t) { tagRow.append(el('span', 'chip', '#' + t)); });
    var acts = el('div', 'row'), note = el('p', 'uv-note'); note.setAttribute('role', 'status');
    if (opt.sample || d.sample) { acts.append(el('span', 'chip uv-sample', 'サンプル作品（遷移・Remixできません）')); }
    else {
      var a1 = el('a', 'btn pri', '作品ページ'); a1.href = '#/work/' + d.id; acts.append(a1);
      var rm = opt.remix;
      if (rm) {
        var chk = rm.can(d);   // 表示用の事前判定。実行時は最新の作品情報とライセンスを取得して必ず再検証する（app.js の remixFromUniverse）
        if (chk.ok) {
          var rb = el('button', 'btn', '⑂ Remix'); rb.onclick = function () {
            rb.disabled = true; note.textContent = 'ライセンスと完全性（SHA-256）を確認しています…';
            Promise.resolve().then(function () { return rm.run(d); }).then(function (res) { if (destroyed) return; if (res && res.ok === false) { note.textContent = res.message || 'Remixできません'; if (res.final) rb.textContent = 'Remix不可'; else rb.disabled = false; } },
              function (err) { if (destroyed) return; note.textContent = (err && err.message) || 'Remixを開始できませんでした'; rb.disabled = false; });
          }; acts.append(rb);
        } else { acts.append(el('span', 'chip', 'Remix不可')); note.textContent = chk.message || 'この作品はRemixできません'; }
      }
    }
    var b1 = el('button', 'btn', 'この作品の関連'); b1.onclick = function () { setMode('related'); }; var b2 = el('button', 'btn', '系譜(Evolution)'); b2.onclick = function () { setMode('evolution'); }; acts.append(b1, b2);
    var meta = el('div', 'meta', '@' + (d.author || '?') + ' · ' + d.cat + (d.license && !d.sample ? ' · ' + d.license : ''));
    panel.append(x, coverOf(d, 'uv-cover'), el('h2', '', d.title), meta, el('p', '', d.desc || '(説明なし)'), tagRow, acts, note);
    var rl = related(i); if (rl.length) { panel.append(el('h2', 'lh', '関連 / 系譜')); rl.forEach(function (r) { var b = el('button', 'uv-rel'); b.append(el('span', 'k', r.kind), el('span', 't', N[r.j].title)); b.onclick = function () { select(r.j, true); }; panel.append(b); }); }
  }
  function setMode(m) {
    st.mode = m;
    if (m === 'creator') { if (st.sel >= 0 && N[st.sel].authorId) st.author = N[st.sel].authorId; else if (!st.author && authors.length === 1) st.author = authors[0].id; }
    else st.author = null;
    apply(true); bar2(); creatorUI();
    if (m === 'creator' && st.author) fitCreator(); else if (m === 'creator') { goal.t = [0, 0, 0]; goal.d = home.d; } else if (st.sel >= 0) fly(st.sel); else if (m === 'evolution') goal.d = 34; else { goal.t = [0, 0, 0]; if (m === 'categories') goal.d = 40; else goal.d = home.d; }
    dirty = true;
  }

  /* ---- Creator Space: 作者の選択UIと現在の作者表示 ---- */
  var crBar = el('div', 'row uv-creator'), crName = el('span', 'chip', ''), crChange = el('button', 'btn', '作者を変更');
  crBar.hidden = true; crBar.append(crName, crChange); crChange.onclick = function () { st.author = null; select(-1); apply(true); creatorUI(); goal.t = [0, 0, 0]; goal.d = home.d; };
  function creatorUI() {
    var on = st.mode === 'creator', cur = st.author && authorName(st.author);
    crBar.hidden = !(on && cur); if (cur) crName.textContent = 'Creator: @' + cur.name + ' · ' + cur.count + ' 作品';
    if (on && !st.author) renderPicker('', true); else pickUI.hidden = true;
  }
  function renderPicker(q, focusFirst) {
    pickUI.hidden = false; pickUI.replaceChildren();
    var h = el('h2', '', 'Creator Space — 作者を選んでください'), p = el('p', 'uv-note', '選んだ作者の作品だけが、中心から渦状に並びます。作品をタップしても、その作者の空間に移れます。');
    var close = el('button', 'btn', 'Universe に戻る'); close.onclick = function () { setMode('universe'); };
    pickUI.append(h, p);
    var list = el('div', 'uv-pick-list'), s = authors.filter(function (a) { return !q || a.name.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    if (authors.length > 8) { var f = el('input'); f.type = 'search'; f.placeholder = '作者名で絞り込み'; f.value = q; f.setAttribute('aria-label', '作者を絞り込み'); f.oninput = function () { var pos2 = f.selectionStart; renderPicker(f.value, false); var nf = pickUI.querySelector('input'); if (nf) { nf.focus(); try { nf.setSelectionRange(pos2, pos2); } catch (e) {} } }; pickUI.append(f); }
    if (!authors.length) list.append(el('p', '', '作者情報のある作品がありません。'));
    else if (!s.length) list.append(el('p', '', '該当する作者がいません'));
    s.slice(0, 60).forEach(function (a) { var b = el('button', 'uv-rel', '@' + a.name + ' · ' + a.count + ' 作品'); b.onclick = function () { st.author = a.id; select(-1); apply(true); creatorUI(); fitCreator(); }; list.append(b); });
    pickUI.append(list, close);
    pickUI.onkeydown = function (e) { if (e.key === 'Escape') { setMode('universe'); cv.focus(); } };
    if (focusFirst) { var first = list.querySelector('button'); if (first) try { first.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---- 入力: 回転 / ズーム / ピンチ / タップ選択（キャンバスのイベントは要素ごと破棄される） ---- */
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) { try { cv.setPointerCapture(e.pointerId); } catch (x) {} ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; drag = true; moved = Object.keys(ptrs).length > 1 ? 99 : 0; auto = false; });
  cv.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId], ks = Object.keys(ptrs);
    if (!p) { if (e.pointerType === 'touch') return; st.hov = pick(e.clientX, e.clientY); cv.style.cursor = st.hov >= 0 ? 'pointer' : 'grab'; dirty = true; return; }
    if (ks.length === 2) { var o = ptrs[ks[0] == e.pointerId ? ks[1] : ks[0]], nd2 = Math.hypot(e.clientX - o.x, e.clientY - o.y); if (pinch && nd2 > 1) goal.d = Math.max(4, Math.min(90, goal.d * pinch / nd2)); pinch = nd2; moved = 99; p.x = e.clientX; p.y = e.clientY; dirty = true; return; }
    goal.y -= (e.clientX - p.x) * .006; goal.p = Math.max(-1.3, Math.min(1.3, goal.p + (e.clientY - p.y) * .006)); moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; cam.y = goal.y; cam.p = goal.p; dirty = true;
  });
  function up(e) { var was = ptrs[e.pointerId]; delete ptrs[e.pointerId]; pinch = 0; drag = !!Object.keys(ptrs).length; if (was && moved < 6 && e.type === 'pointerup') select(pick(e.clientX, e.clientY), true); }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); goal.d = Math.max(4, Math.min(90, goal.d * Math.exp(e.deltaY * .0012))); auto = false; dirty = true; }, { passive: false });
  cv.addEventListener('keydown', function (e) { var m = { ArrowLeft: [.1, 0], ArrowRight: [-.1, 0], ArrowUp: [0, -.1], ArrowDown: [0, .1] }[e.key]; if (m) { goal.y += m[0]; goal.p = Math.max(-1.3, Math.min(1.3, goal.p + m[1])); auto = false; e.preventDefault(); } else if (e.key === '+' || e.key === '=') goal.d *= .85; else if (e.key === '-') goal.d *= 1.18; else if (e.key === 'Escape') select(-1); dirty = true; });
  function pick(cx, cy) {
    var r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, best = -1, bd = 1e9; mats();
    for (var i = 0; i < n; i++) { if (al[i] < .25) continue; var p = proj(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (!p) continue; var dd = Math.hypot(p.x - x, p.y - y), lim = Math.max(14, Math.min(40, sizeOf(N[i]) * H * .5 / Math.tan(.45) * .06 / p.w * .5 + 8)) * (window.innerWidth < 700 ? 1.3 : 1); if (dd < lim && dd + p.w * .05 < bd) { bd = dd + p.w * .05; best = i; } }
    return best;
  }

  /* ---- ツールバー（モード / カテゴリ / 検索 / 位置リセット / 区別バッジ） ---- */
  var mb = el('div', 'row uv-modes'), cb = el('div', 'row uv-cats'), inp = el('input'), sr = el('div', 'row'); inp.type = 'search'; inp.placeholder = '作品名・作者・タグ・カテゴリ'; inp.setAttribute('aria-label', '3D空間内を検索');
  function bar2() { mb.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === st.mode); }); cb.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', (b.dataset.c || null) === st.cat); }); }
  MODES.forEach(function (m) { var b = el('button', 'btn', m[1]); b.dataset.m = m[0]; b.onclick = function () { setMode(m[0]); }; mb.append(b); });
  [''].concat(CATS).forEach(function (c) {
    var b = el('button', 'btn', c || 'All'); b.dataset.c = c;
    b.onclick = function () { st.cat = c || null; apply(false); bar2(); var f = N.filter(function (d) { return !st.cat || d.cat === st.cat; }); if (st.cat && f.length) { var m = [0, 0, 0]; f.forEach(function (d) { m[0] += tpos[3 * d.i]; m[1] += tpos[3 * d.i + 1]; m[2] += tpos[3 * d.i + 2]; }); goal.t = m.map(function (v) { return v / f.length; }); goal.d = 20; } else { goal.t = [0, 0, 0]; goal.d = home.d; } };
    cb.append(b);
  });
  var rs = el('button', 'btn', '⌂ 初期位置'); rs.onclick = function () { select(-1); st.q = ''; inp.value = ''; st.cat = null; st.author = null; setMode('universe'); goal.y = home.y; goal.p = home.p; goal.d = home.d; goal.t = [0, 0, 0]; auto = !reduce && level < 2; };
  inp.oninput = function () { st.q = inp.value; visibility(); };
  inp.onkeydown = function (e) { if (e.key === 'Enter') { var m = Object.keys(matches); if (m.length) { select(+m[0]); fly(+m[0], 10); } } };
  sr.append(inp, rs);
  var cnt = el('span', 'chip', ''), kind = el('div', 'row'), fold = el('div', 'uv-fold'), tog = el('button', 'btn uv-tog', '▾ 検索・カテゴリ');   // 狭い画面では検索・カテゴリを折りたたみ、3D空間を広く使う
  fold.append(sr, cb, cnt); tog.setAttribute('aria-expanded', 'false'); if (narrow) bar.classList.add('fold-closed');
  tog.onclick = function () { var c = bar.classList.toggle('fold-closed'); tog.setAttribute('aria-expanded', String(!c)); tog.textContent = c ? '▾ 検索・カテゴリ' : '▴ 閉じる'; };
  if (opt.sample) {
    kind.append(el('span', 'chip uv-sample', 'SAMPLE DATA — 動作確認用のサンプルです。実在の作品・作者・人気数ではありません'));
    if (opt.notice) kind.append(el('span', 'chip uv-sample', opt.notice));
    if (opt.liveHref) { var lv = el('a', 'btn', '実作品のUniverseへ'); lv.href = opt.liveHref; kind.append(lv); }
  } else {
    kind.append(el('span', 'chip uv-live', 'LIVE — 公開されている実作品'));
    if (opt.sampleHref) { var sv = el('a', 'btn', 'サンプルを見る'); sv.href = opt.sampleHref; kind.append(sv); }
  }
  bar.append(mb, tog, fold, crBar, kind);
  function countText() { return n + (opt.sample ? ' sample works' : ' works') + ' · ' + E.length + ' remix links'; }

  /* ---- 破棄 / フォールバック ---- */
  function destroy() {
    if (destroyed) return; destroyed = true; stop();
    cleanups.splice(0).forEach(function (f) { try { f(); } catch (e) {} });   // window / document / Observer のリスナーをすべて解除
    releaseGL(); pool = []; ptrs = {}; panel.onkeydown = pickUI.onkeydown = null;
  }
  function toFallback(reason) {
    if (destroyed || fellBack) return; fellBack = true; destroy();
    try { fallback2D(root, opt, reason); } catch (e) { root.replaceChildren(el('div', 'box', reason + '。ページを再読み込みしてください。')); }
  }
  function info() { var shown = 0; for (var i = 0; i < n; i++) if (tal[i] >= .5) shown++; return { shown: shown, n: n, edges: E.length, mode: st.mode, author: st.author, sel: st.sel, dist: goal.d, level: level, dpr: dpr, running: running, destroyed: destroyed, fallback: fellBack, gl: !!gl, sample: !!opt.sample, authors: authors.length, maxPt: maxPt, listeners: cleanups.length }; }

  /* ---- 起動 ---- */
  try { gl = cv.getContext('webgl', { antialias: !lowEnd, alpha: true }) || cv.getContext('experimental-webgl'); } catch (e) { gl = null; }
  if (!gl) { toFallback('この環境では WebGL を利用できません'); return ctrl; }
  try { initGL(); } catch (e) { if (window.console) console.error('zero universe: GL init failed', e); toFallback('3D の初期化（シェーダーのコンパイル）に失敗しました'); return ctrl; }
  on(cv, 'webglcontextlost', function (e) { e.preventDefault(); stop(); });
  on(cv, 'webglcontextrestored', function () { try { initGL(); resize(); dirty = true; start(); } catch (err) { toFallback('3D コンテキストの復旧に失敗しました'); } });
  if (window.ResizeObserver) { var rz = new ResizeObserver(function () { resize(); }); rz.observe(cv); cleanups.push(function () { rz.disconnect(); }); } else on(window, 'resize', resize);
  if (window.IntersectionObserver) { var io = new IntersectionObserver(function (en) { visible = en[0].isIntersecting; visible ? start() : stop(); }); io.observe(cv); cleanups.push(function () { io.disconnect(); }); }
  on(document, 'visibilitychange', function () { document.hidden ? stop() : start(); });
  applyQuality(); pos.set(tpos); apply(true); pos.set(tpos); al.set(tal); cnt.textContent = countText(); resize(); bar2(); creatorUI(); start();
  return ctrl;
}
window.ZeroUniverse = { mount: mount, fromWorks: fromWorks, SAMPLE: SAMPLE, CATS: CATS };
})();
