/*
 * ZeroStudio — エンジン登録とアダプター（DOM非依存の部分）
 *
 * 1つのエンジン定義が持つもの:
 *   id, label, short, hue, entry, workTypes[{id,label,schemaVersion}], libraryKinds[]
 *   defaultPayload(workType)                新規作成
 *   validatePayload(workType, schemaVersion, payload) -> {ok, errors, payload}   データの検証
 *   fromLegacy(source, raw) -> draft[]      既存アプリの保存形式からの移行
 *   exportFile(project) / importFile(json)  エンジン固有ファイルの書き出し／取り込み（元アプリでも読める形式）
 *   scanAssets(project) / scanDependencies(project)
 * iframe に実際に読み込む／読み出す処理（load / snapshot）は zs-host.js（ブラウザ専用）にあります。
 * 新しいエンジンは register() を1回呼ぶだけで加わり、未知のエンジンのデータは保存・書き出しで壊れません。
 */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util, S = ZS.schema, Err = U.ZSError;
  var E = (ZS.engines = {});
  var reg = {}, order = [];

  E.register = function (def) {
    if (!def || !S.KEY_RE.test(def.id || '')) throw Err('INVALID', 'エンジンIDが不正です。');
    ['label', 'workTypes', 'defaultPayload', 'validatePayload'].forEach(function (k) { if (!def[k]) throw Err('INVALID', 'エンジン定義に ' + k + ' がありません。'); });
    if (!reg[def.id]) order.push(def.id);
    reg[def.id] = def;
    return def;
  };
  E.get = function (id) { return reg[id] || null; };
  E.all = function () { return order.map(function (i) { return reg[i]; }); };
  E.workType = function (engineId, wt) {
    var e = reg[engineId]; if (!e) return null;
    for (var i = 0; i < e.workTypes.length; i++) if (e.workTypes[i].id === wt) return e.workTypes[i];
    return null;
  };
  E.label = function (p) { var e = reg[p.engine], w = E.workType(p.engine, p.workType); return e ? (w ? w.label : p.workType) : '未対応: ' + p.engine + '/' + p.workType; };

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function res(errors, payload) { return { ok: !errors.length, errors: errors, payload: errors.length ? null : payload }; }
  var COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  var MARK = /zs-asset:([A-Za-z0-9_-]{1,64})@(\d{1,6})/g;
  function iso(ms) { var d = new Date(ms); return isFinite(d) ? d.toISOString() : U.nowIso(); }
  function newestMark(text, out) { var m; MARK.lastIndex = 0; while ((m = MARK.exec(text))) out[m[1] + '@' + m[2]] = { id: m[1], version: +m[2] }; }

  /* =====================================================================
   * Code Studio（CODE LAB）  work: web / pixel
   * ===================================================================== */
  var PX_SIZES = [16, 32, 64];
  function validatePixel(p, errors) {
    if (!isObj(p)) { errors.push('ドット絵のデータがオブジェクトではありません。'); return null; }
    if (PX_SIZES.indexOf(p.size) < 0) { errors.push('キャンバスサイズは 16/32/64 のいずれかです。'); return null; }
    var n = p.size * p.size;
    if (!Array.isArray(p.frames) || !p.frames.length || p.frames.length > 64) { errors.push('フレーム数が不正です（1〜64）。'); return null; }
    var frames = [];
    for (var i = 0; i < p.frames.length; i++) {
      var f = p.frames[i];
      if (!Array.isArray(f) || f.length !== n) { errors.push('フレーム ' + (i + 1) + ' のピクセル数が ' + n + ' ではありません。'); return null; }
      var row = new Array(n);
      for (var j = 0; j < n; j++) {
        var c = f[j];
        if (c === null) row[j] = null;
        else if (typeof c === 'string' && COLOR.test(c)) row[j] = c;
        else { errors.push('フレーム ' + (i + 1) + ' に不正な色の値があります（#RRGGBB 形式のみ使えます）。'); return null; }
      }
      frames.push(row);
    }
    function colors(a, max) { return (Array.isArray(a) ? a : []).filter(function (c) { return typeof c === 'string' && COLOR.test(c); }).slice(0, max); }
    return {
      version: 1, name: U.str(p.name, 60, '無題のドット絵'), size: p.size, frames: frames,
      palette: colors(p.palette, 32), saved: colors(p.saved, 64), transparent: p.transparent !== false,
      bg: typeof p.bg === 'string' && COLOR.test(p.bg) ? p.bg : '#171a2b',
      fps: typeof p.fps === 'number' && p.fps >= 1 && p.fps <= 12 ? Math.floor(p.fps) : 4
    };
  }
  var MAXTXT = 4 * 1024 * 1024;
  E.register({
    id: 'code', label: 'Code Studio', short: 'Code', hue: '#7db7ff', entry: 'engines/code/index.html',
    workTypes: [{ id: 'web', label: 'Web作品', schemaVersion: 1 }, { id: 'pixel', label: 'ドット絵', schemaVersion: 1 }],
    libraryKinds: ['pixel-art', 'image'],
    defaultPayload: function (wt) {
      if (wt === 'pixel') return { version: 1, name: '無題のドット絵', size: 16, frames: [new Array(256).fill(null)], palette: ['#7C6CFF', '#44E5FF', '#FF76B8', '#FFD166', '#59D98E', '#FFFFFF', '#172036', '#E76E55'], saved: [], transparent: true, bg: '#171a2b', fps: 4 };
      return { html: '<main>\n  <h1>新しい作品</h1>\n</main>', css: 'body{margin:0;padding:40px;font-family:system-ui}', js: '' };
    },
    validatePayload: function (wt, sv, p) {
      var errors = [];
      if (wt === 'pixel') { var px = validatePixel(p, errors); return res(errors, px); }
      if (wt !== 'web') return res(['未対応の作品タイプです: ' + wt]);
      if (!isObj(p)) return res(['Web作品のデータがオブジェクトではありません。']);
      ['html', 'css', 'js'].forEach(function (k) {
        if (typeof p[k] !== 'string') errors.push(k + ' が文字列ではありません。');
        else if (p[k].length > MAXTXT) errors.push(k + ' が大きすぎます（4MB まで）。');
      });
      return res(errors, { html: p.html, css: p.css, js: p.js });
    },
    // 旧 CODE LAB の保存: codelab.projects.v2 = [{id,name,html,css,js,updatedAt}], codelab.pixel.projects.v1 = [{...pixel}]
    fromLegacy: function (source, rec) {
      if (!isObj(rec)) return [];
      if (source === 'codelab.projects.v2') {
        var v = E.get('code').validatePayload('web', 1, rec); if (!v.ok) return [{ invalid: true, errors: v.errors, title: U.str(rec.name, 80, '無題') }];
        return [{ workType: 'web', title: U.str(rec.name, 80, '無題のプロジェクト'), payload: v.payload, schemaVersion: 1, legacy: { source: source, id: String(rec.id || ''), hash: U.contentHash(v.payload) }, updatedAt: U.isoOk(rec.updatedAt) ? rec.updatedAt : null }];
      }
      if (source === 'codelab.pixel.projects.v1') {
        var e2 = [], px = validatePixel(rec, e2); if (!px) return [{ invalid: true, errors: e2, title: U.str(rec.name, 80, '無題のドット絵') }];
        return [{ workType: 'pixel', title: px.name, payload: px, schemaVersion: 1, legacy: { source: source, id: String(rec.id || ''), hash: U.contentHash(px) }, updatedAt: U.isoOk(rec.updatedAt) ? rec.updatedAt : null }];
      }
      return [];
    },
    exportFile: function (p) {
      var d = p.engineData.payload;
      if (p.workType === 'pixel') return { filename: U.safeFileName(p.title, '.pixel.json'), mime: 'application/json', text: JSON.stringify(Object.assign({ id: null, updatedAt: p.updatedAt }, d), null, 2), note: '元の CODE LAB の PIXEL LAB で「JSON読込」できます。' };
      return { filename: U.safeFileName(p.title, '.codelab.json'), mime: 'application/json', text: JSON.stringify({ name: p.title, html: d.html, css: d.css, js: d.js }, null, 2), note: '元の CODE LAB の「JSONを読み込む」で読めます。' };
    },
    importFile: function (j) {
      if (!isObj(j)) return null;
      if (typeof j.html === 'string' && typeof j.css === 'string' && typeof j.js === 'string') {
        var v = E.get('code').validatePayload('web', 1, j);
        return [v.ok ? { workType: 'web', title: U.str(j.name, 80, '取り込んだWeb作品'), payload: v.payload, schemaVersion: 1 } : { invalid: true, errors: v.errors, title: U.str(j.name, 80, '') }];
      }
      if (j.size !== undefined && Array.isArray(j.frames)) {
        var er = [], px = validatePixel(j, er);
        return [px ? { workType: 'pixel', title: px.name, payload: px, schemaVersion: 1 } : { invalid: true, errors: er, title: U.str(j.name, 80, '') }];
      }
      return null;
    },
    scanAssets: function (p) {
      var out = {}, d = p.engineData.payload;
      if (p.workType === 'web') { newestMark(d.html || '', out); newestMark(d.css || '', out); newestMark(d.js || '', out); }
      return Object.keys(out).map(function (k) { return out[k]; });
    },
    scanDependencies: function () { return []; }
  });

  /* =====================================================================
   * Logic Studio（LOGIC PLAYGROUND 2.2）  work: circuit / cpu-program / machine
   * ===================================================================== */
  function validateCircuit(d, errors) {
    if (!isObj(d) || d.v !== 1 || !Array.isArray(d.nodes) || !Array.isArray(d.wires)) { errors.push('Circuit Studio の形式（v:1, nodes, wires）ではありません。'); return null; }
    if (d.nodes.length > 400) { errors.push('部品が多すぎます（400個まで）。'); return null; }
    var ids = {};
    for (var i = 0; i < d.nodes.length; i++) {
      var n = d.nodes[i];
      if (!isObj(n) || typeof n.t !== 'string' || !isFinite(n.x) || !isFinite(n.y) || !Number.isInteger(n.id) || ids[n.id]) { errors.push('不正な部品データが含まれています（' + (i + 1) + '番目）。'); return null; }
      ids[n.id] = 1;
    }
    for (var k = 0; k < d.wires.length; k++) {
      var w = d.wires[k];
      if (!isObj(w) || !ids[w.from] || !ids[w.to] || !(w.fo >= 0) || !(w.ti >= 0)) { errors.push('不正な接続データが含まれています（' + (k + 1) + '番目）。'); return null; }
    }
    return d;
  }
  function validateMachine(d, errors) {
    if (!isObj(d) || d.v !== 1 || d.kind !== 'machine' || !Array.isArray(d.parts) || !Array.isArray(d.balls)) { errors.push('Machine Lab の形式（v:1, kind:"machine"）ではありません。'); return null; }
    if (d.parts.length > 200 || d.balls.length > 300) { errors.push('部品またはボールが多すぎます。'); return null; }
    var ids = {};
    for (var i = 0; i < d.parts.length; i++) {
      var p = d.parts[i];
      if (!isObj(p) || typeof p.t !== 'string' || !isFinite(p.x) || !isFinite(p.y) || !Number.isInteger(p.id) || ids[p.id]) { errors.push('不正な部品データが含まれています。'); return null; }
      ids[p.id] = 1;
    }
    for (var b = 0; b < d.balls.length; b++) {
      var q = d.balls[b];
      if (!isObj(q) || !isFinite(q.x) || !isFinite(q.y) || ['r', 'b', 'g'].indexOf(q.c) < 0) { errors.push('不正なボールデータが含まれています。'); return null; }
    }
    return d;
  }
  /** 機械の部品が参照する回路の信号 "ノードID:出力番号" を集める */
  function machineRefs(d) {
    var out = {};
    (d.parts || []).forEach(function (p) { var s = p && p.p && p.p.src; if (typeof s === 'string' && /^\d{1,6}:\d{1,3}$/.test(s)) out[s] = 1; });
    return Object.keys(out).sort();
  }
  var SAMPLE_ASM = '; 新しいプログラム\nLDI A, 1\nOUT A\nHLT\n';
  E.register({
    id: 'logic', label: 'Logic Studio', short: 'Logic', hue: '#5fe3c0', entry: 'engines/logic/index.html',
    workTypes: [{ id: 'circuit', label: '回路', schemaVersion: 1 }, { id: 'cpu-program', label: 'CPUプログラム', schemaVersion: 1 }, { id: 'machine', label: '機械', schemaVersion: 1 }],
    libraryKinds: ['circuit', 'cpu-program', 'machine'],
    defaultPayload: function (wt) {
      if (wt === 'circuit') return { v: 1, name: '無題の回路', nodes: [], wires: [] };
      if (wt === 'machine') return { v: 1, kind: 'machine', name: '無題の機械', parts: [], balls: [] };
      return { asm: SAMPLE_ASM, input: 0 };
    },
    validatePayload: function (wt, sv, p) {
      var errors = [];
      if (wt === 'circuit') { var c = validateCircuit(p, errors); return res(errors, c && U.clone(c)); }
      if (wt === 'machine') { var m = validateMachine(p, errors); return res(errors, m && U.clone(m)); }
      if (wt === 'cpu-program') {
        if (!isObj(p) || typeof p.asm !== 'string') return res(['アセンブリ（asm）が文字列ではありません。']);
        if (p.asm.length > 100000) return res(['プログラムが大きすぎます（10万文字まで）。']);
        var inp = typeof p.input === 'number' && p.input >= 0 && p.input <= 255 ? Math.floor(p.input) : 0;
        return res([], { asm: p.asm, input: inp });
      }
      return res(['未対応の作品タイプです: ' + wt]);
    },
    // 旧 LOGIC PLAYGROUND: lp.proj={名前:回路}, lp.auto=回路, lp.ml.proj={名前:機械}, lp.ml.auto=機械, lp.asm=文字列
    fromLegacy: function (source, rec, key) {
      function fail(e, t) { return [{ invalid: true, errors: e, title: t }]; }
      if (source === 'lp.proj' || source === 'lp.auto') {
        var e1 = [], c = validateCircuit(rec, e1); if (!c) return fail(e1, key || '回路');
        var title = U.str(c.name, 80, key || '回路') + (source === 'lp.auto' ? '（自動保存）' : '');
        return [{ workType: 'circuit', title: title, payload: U.clone(c), schemaVersion: 1, legacy: { source: source, id: String(key || 'auto'), hash: U.contentHash(c) } }];
      }
      if (source === 'lp.ml.proj' || source === 'lp.ml.auto') {
        var e2 = [], m = validateMachine(rec, e2); if (!m) return fail(e2, key || '機械');
        var t2 = U.str(m.name, 80, key || '機械') + (source === 'lp.ml.auto' ? '（自動保存）' : '');
        return [{ workType: 'machine', title: t2, payload: U.clone(m), schemaVersion: 1, legacy: { source: source, id: String(key || 'auto'), hash: U.contentHash(m) } }];
      }
      if (source === 'lp.asm') {
        if (typeof rec !== 'string' || !rec.trim()) return [];
        var v = E.get('logic').validatePayload('cpu-program', 1, { asm: rec, input: 0 });
        return v.ok ? [{ workType: 'cpu-program', title: 'CPUプログラム（前回の内容）', payload: v.payload, schemaVersion: 1, legacy: { source: source, id: 'asm', hash: U.contentHash(v.payload) } }] : fail(v.errors, 'CPUプログラム');
      }
      return [];
    },
    exportFile: function (p) {
      var d = p.engineData.payload;
      if (p.workType === 'cpu-program') return { filename: U.safeFileName(p.title, '.asm'), mime: 'text/plain', text: d.asm, note: 'CPU Lab のアセンブリ欄に貼り付けて使えます。' };
      if (p.workType === 'machine') return { filename: U.safeFileName(p.title, '.machine.json'), mime: 'application/json', text: JSON.stringify(Object.assign({}, d, { name: p.title }), null, 1), note: '元の LOGIC PLAYGROUND の Machine Lab で「JSON読込」できます。' };
      return { filename: U.safeFileName(p.title, '.json'), mime: 'application/json', text: JSON.stringify(Object.assign({}, d, { name: p.title }), null, 1), note: '元の LOGIC PLAYGROUND の Circuit Studio で「JSON読込」できます。' };
    },
    importFile: function (j, filename) {
      if (isObj(j) && typeof j.__asm === 'string') { // .asm テキスト（ページ側でテキストを包んで渡す）
        var va = E.get('logic').validatePayload('cpu-program', 1, { asm: j.__asm, input: 0 });
        return [va.ok ? { workType: 'cpu-program', title: U.str(String(filename || '').replace(/\.[^.]+$/, ''), 80, '取り込んだCPUプログラム'), payload: va.payload, schemaVersion: 1 } : { invalid: true, errors: va.errors, title: '' }];
      }
      if (!isObj(j) || j.v !== 1) return null;
      var e = [];
      if (j.kind === 'machine') { var m = validateMachine(j, e); return [m ? { workType: 'machine', title: U.str(j.name, 80, '取り込んだ機械'), payload: U.clone(m), schemaVersion: 1 } : { invalid: true, errors: e, title: U.str(j.name, 80, '') }]; }
      if (Array.isArray(j.nodes)) { var c = validateCircuit(j, e); return [c ? { workType: 'circuit', title: U.str(j.name, 80, '取り込んだ回路'), payload: U.clone(c), schemaVersion: 1 } : { invalid: true, errors: e, title: U.str(j.name, 80, '') }]; }
      return null;
    },
    scanAssets: function () { return []; },
    // 機械は回路の信号（ノードID:出力番号）を直接参照する。参照先の回路が読み込まれていないと意味が変わる
    scanDependencies: function (p) {
      if (p.workType !== 'machine') return [];
      var refs = machineRefs(p.engineData.payload);
      return refs.length ? [{ type: 'ref', note: '回路の信号 ' + refs.join(', ') + ' を参照しています。対応する回路を同時に読み込んでください。', detail: { kind: 'circuit-signal', refs: refs } }] : [];
    },
    machineRefs: machineRefs
  });

  /* =====================================================================
   * Zero Engine（PLAYGROUND ZERO）  work: studio / experiment / creation
   * Zero の作品レコード（schema 2）を payload にそのまま保持する。共通形式との相互変換は下記。
   * ===================================================================== */
  var ZMAP = E.zeroMap = {};
  var ZKINDS = ['studio', 'experiment', 'creation'];
  ZMAP.wrap = function (rec, existing) {
    if (!isObj(rec) || typeof rec.id !== 'string' || !S.ID_RE.test(rec.id)) throw Err('INVALID', 'Zero の作品 ID が共通形式で使えない文字を含んでいます。');
    if (existing && existing.engine !== 'zero') throw Err('CONFLICT', 'この ID は別のエンジンのプロジェクトが使用中です。');
    var kind = ZKINDS.indexOf(rec.kind) >= 0 ? rec.kind : 'studio';
    var now = U.nowIso();
    var parent = typeof rec.parentId === 'string' && S.ID_RE.test(rec.parentId) ? rec.parentId : (rec.remix && rec.remix.origin && typeof rec.remix.origin.id === 'string' && S.ID_RE.test(rec.remix.origin.id) ? rec.remix.origin.id : null);
    var deps = [];
    if (rec.remix && Array.isArray(rec.remix.parts)) rec.remix.parts.forEach(function (pt) {
      if (pt && typeof pt.id === 'string' && S.ID_RE.test(pt.id)) deps.push({ type: 'library', id: pt.id, version: pt.version || 1, note: 'Zero 部品: ' + U.str(pt.name, 40) });
    });
    var raw = {
      format: S.FORMAT.PROJECT, formatVersion: S.VERSION, id: rec.id,
      title: U.str(rec.name, S.LIMITS.title, '無題'), description: existing ? existing.description : '',
      createdAt: typeof rec.createdAt === 'number' ? iso(rec.createdAt) : (existing ? existing.createdAt : now),
      updatedAt: typeof rec.updatedAt === 'number' ? iso(rec.updatedAt) : now,
      engine: 'zero', workType: kind, projectVersion: existing ? existing.projectVersion : 1, versionHash: existing ? existing.versionHash : '',
      engineData: { schemaVersion: typeof rec.schema === 'number' ? rec.schema : 2, payload: rec },
      assets: [], dependencies: deps,
      derivedFrom: parent ? { projectId: parent, title: rec.remix && rec.remix.origin ? U.str(rec.remix.origin.name, 80) : undefined } : null,
      license: existing ? existing.license : { id: 'all-rights-reserved' }, visibility: existing ? existing.visibility : 'private',
      author: existing ? existing.author : { name: '' }, tags: Array.isArray(rec.tags) ? rec.tags : [], ext: existing ? existing.ext : {}
    };
    if (typeof rec.thumb === 'string') raw.thumb = rec.thumb;
    var r = S.sanitizeProject(raw);
    if (!r.ok) throw Err('INVALID', r.errors.join(' '));
    if (!r.project.versionHash) r.project.versionHash = S.versionHash(r.project);
    return r.project;
  };
  ZMAP.unwrap = function (env) { return U.clone(env.engineData.payload); };

  E.register({
    id: 'zero', label: 'Zero Engine', short: 'Zero', hue: '#b4a8ff', entry: 'engines/zero/index.html',
    workTypes: [{ id: 'studio', label: 'Studio作品', schemaVersion: 2 }, { id: 'experiment', label: 'Experiment', schemaVersion: 2 }, { id: 'creation', label: 'Creation / Remix', schemaVersion: 2 }],
    libraryKinds: ['zero-part'],
    // Zero の作品は Zero 自身が作る（画面から作成）。ここは Zero の既定値に準じた最小の作品
    defaultPayload: function (wt) {
      var now = Date.now(), id = U.newId('p');
      var base = { id: id, name: '無題', schema: 2, kind: wt, createdAt: now, updatedAt: now, lastOpenedAt: 0, tags: [], favorite: false, collections: [], parentId: null, daily: null };
      if (wt === 'experiment') return Object.assign(base, { tool: 'flow', params: { seed: 1 } });
      return Object.assign(base, { width: 960, height: 600, background: '#1d2127', objects: [] });
    },
    validatePayload: function (wt, sv, p) {
      if (!isObj(p) || typeof p.id !== 'string' || !S.ID_RE.test(p.id)) return res(['Zero の作品レコード（id）ではありません。']);
      if (ZKINDS.indexOf(p.kind || 'studio') < 0) return res(['Zero の作品種別（kind）が不正です。']);
      return res([], p); // 深い検証は Zero 自身（model.sanitizeProject）が読み込み時に行う
    },
    // 旧 Zero の IndexedDB 'playground-zero' の作品レコード
    fromLegacy: function (source, rec) {
      if (source !== 'zero-idb') return [];
      try {
        var env = ZMAP.wrap(rec, null);
        return [{ workType: env.workType, title: env.title, payload: env.engineData.payload, schemaVersion: env.engineData.schemaVersion, legacy: { source: source, id: rec.id, hash: U.contentHash(rec) }, updatedAt: env.updatedAt, createdAt: env.createdAt, zeroId: rec.id }];
      } catch (e) { return [{ invalid: true, errors: [U.explain(e)], title: U.str(rec && rec.name, 80, '') }]; }
    },
    // Zero 作品1件を Zero 自身が読める形式（projects が1件のバックアップ）で書き出す
    exportFile: function (p) {
      return { filename: U.safeFileName(p.title, '.pzbackup.json'), mime: 'application/json', note: 'PLAYGROUND ZERO の「バックアップ読み込み」で復元できます。',
        text: JSON.stringify({ app: 'playground-zero', format: 3, appVersion: 'zerostudio-' + S.APP_VERSION, exportedAt: U.nowIso(), projects: [p.engineData.payload], collections: [] }, null, 2) };
    },
    importFile: function () { return null; }, // Zero のバックアップは Zero 自身の検証・取り込み（zs-host.js 経由）を使う
    // 版の判定から除く項目: 閲覧・整理・サムネイルの更新だけでは「内容が変わった」とみなさない
    hashPayload: function (pl) {
      var c = Object.assign({}, pl); ['lastOpenedAt', 'updatedAt', 'favorite', 'collections', 'tags', 'thumb'].forEach(function (k) { delete c[k]; }); return c;
    },
    // 複製時に Zero 作品側の id・名前・親を付け替える
    prepareCopy: function (payload, newId, title, parentId) {
      var c = U.clone(payload); var now = Date.now();
      c.id = newId; c.name = title; c.createdAt = now; c.updatedAt = now; c.lastOpenedAt = 0; c.parentId = parentId; c.favorite = false; c.collections = [];
      return c;
    },
    scanAssets: function () { return []; },
    scanDependencies: function (p) {
      var out = [], r = p.engineData.payload.remix;
      if (r && Array.isArray(r.parts)) r.parts.forEach(function (pt) {
        if (pt && typeof pt.id === 'string' && S.ID_RE.test(pt.id)) out.push({ type: 'library', id: pt.id, version: pt.version || 1, note: 'Zero 部品: ' + U.str(pt.name, 40) });
      });
      return out;
    }
  });

  /* =====================================================================
   * 変換（形式が実際に対応しているものだけ）
   *   ドット絵(pixel-art) → CSS / Canvas JS / PNG（Code Studio の Web作品へ素材として挿入）
   * ===================================================================== */
  var C = (ZS.convert = {});
  function filled(frame, size) { var a = []; for (var i = 0; i < frame.length; i++) if (frame[i]) a.push([i, frame[i]]); return a; }
  C.pixelToShadow = function (px, frameIndex) {
    var f = px.frames[frameIndex || 0] || px.frames[0];
    return filled(f, px.size).map(function (e) { return (e[0] % px.size) + 'px ' + Math.floor(e[0] / px.size) + 'px 0 ' + e[1]; }).join(',') || 'none';
  };
  function slug(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'x'; }
  /** Web作品へ挿入するコード片。マーカー（zs-asset:ID@版）で素材の使用を追跡する */
  C.pixelToWebParts = function (px, item, scale) {
    var cls = 'zs-px-' + slug(item.id.slice(-8)), mark = 'zs-asset:' + item.id + '@' + item.version, sc = Math.max(1, Math.min(64, scale | 0 || 8));
    var label = U.escapeHtml(px.name);
    return {
      html: '<!-- ' + mark + ' -->\n<div class="' + cls + '" role="img" aria-label="' + label + '"></div>',
      css: '/* ' + mark + ' */\n.' + cls + '{width:1px;height:1px;box-shadow:' + C.pixelToShadow(px) + ';transform:scale(' + sc + ');transform-origin:top left;image-rendering:pixelated;margin:0 ' + (px.size * (sc - 1)) + 'px ' + (px.size * (sc - 1)) + 'px 0}',
      js: ''
    };
  };
  C.pixelToCanvasJs = function (px, item, scale) {
    var mark = 'zs-asset:' + item.id + '@' + item.version, sc = Math.max(1, Math.min(64, scale | 0 || 8));
    return '// ' + mark + '\nconst zsPixels = { size: ' + px.size + ', pixels: ' + JSON.stringify(filled(px.frames[0], px.size)) + ' };\n' +
      'function zsDrawPixels(ctx, x, y, scale = ' + sc + ') {\n  zsPixels.pixels.forEach(([i, c]) => { ctx.fillStyle = c; ctx.fillRect(x + (i % zsPixels.size) * scale, y + Math.floor(i / zsPixels.size) * scale, scale, scale); });\n}\n';
  };
  /** PNG（data URL）。ブラウザ専用 */
  C.pixelToPngDataUrl = function (px, scale, frameIndex) {
    if (typeof document === 'undefined') throw Err('UNSUPPORTED', 'PNG への変換はブラウザでのみ使えます。');
    var sc = Math.max(1, Math.min(16, scale | 0 || 4)), c = document.createElement('canvas'); c.width = c.height = px.size * sc;
    var x = c.getContext('2d');
    if (!px.transparent) { x.fillStyle = px.bg; x.fillRect(0, 0, c.width, c.height); }
    (px.frames[frameIndex || 0] || px.frames[0]).forEach(function (v, i) { if (v) { x.fillStyle = v; x.fillRect((i % px.size) * sc, Math.floor(i / px.size) * sc, sc, sc); } });
    return c.toDataURL('image/png');
  };
  /** img 要素として挿入するコード片（PNG を data URL で埋め込む） */
  C.imageToWebParts = function (dataUrl, item, alt) {
    var mark = 'zs-asset:' + item.id + '@' + item.version;
    return { html: '<!-- ' + mark + ' -->\n<img src="' + dataUrl + '" alt="' + U.escapeHtml(alt || item.name) + '" style="image-rendering:pixelated">', css: '', js: '' };
  };
  C.IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
})(typeof globalThis !== 'undefined' ? globalThis : window);
