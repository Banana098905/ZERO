/* Zero 共通ロジック（ブラウザ・Node 両対応。DOM には触れない）
 *  - SHA-256 検証（verifyPackage）  - ZeroStudio との postMessage 受信（createReceiver / normalizeOrigins）
 *  - 投稿のアップロード→DB登録とロールバック（uploadAndRegister / reclaim / sweepOrphans） */
(function (g) {
  'use strict';
  var FORMAT = 'zerostudio.publish', HASH_RE = /^[0-9a-f]{64}$/, ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
  var MAX_INBOUND = 16 * 1048576, QKEY = 'zero.orphans', memQueue = [];
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function errMsg(e) { return (e && e.message) || String(e); }

  /* ---------- SHA-256 ---------- */
  function webcrypto() { if (g.crypto && g.crypto.subtle) return g.crypto; if (typeof require === 'function') { try { return require('crypto').webcrypto; } catch (e) {} } return null; }
  function sha256(text) { var c = webcrypto(); if (!c) return Promise.reject(new Error('SHA-256 を計算できない環境です'));
    return c.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) { return [].map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function canonical(pkg) { return JSON.stringify({ project: pkg.project, library: pkg.library }); } // ZeroStudio の buildPublish と同一の規約

  function validatePkg(pkg) { var e = [];
    if (!isObj(pkg) || pkg.format !== FORMAT || !isObj(pkg.project)) e.push('zerostudio.publish 形式ではありません');
    else { var p = pkg.project; if (!/^[a-z][a-z0-9-]{0,31}$/.test(p.engine || '') || !/^[a-z][a-z0-9-]{0,31}$/.test(p.workType || '')) e.push('engine / workType が不正です');
      if (['code', 'logic', 'zero'].indexOf(p.engine) < 0) e.push('未対応のエンジン: ' + p.engine);
      if (!p.engineData || typeof p.engineData.payload !== 'object' || p.engineData.payload === null) e.push('作品データがありません'); }
    return e; }

  var VMSG = { format: 'zerostudio.publish 形式ではありません', 'no-integrity': 'SHA-256 のハッシュがありません。ZeroStudio から書き出し直してください',
    algorithm: '完全性情報のアルゴリズムが SHA-256 ではありません', 'hash-format': 'ハッシュの形式が不正です（小文字16進64桁である必要があります）',
    library: '素材リスト(library)が配列ではありません', mismatch: '完全性チェック失敗: ファイルが書き換えられた可能性があります', crypto: 'SHA-256 を計算できませんでした' };
  /** 戻り値: Promise<{ok, code, message, hash}>。ok:true 以外のパッケージは投稿してはならない */
  function verifyPackage(pkg) {
    function bad(code) { return Promise.resolve({ ok: false, code: code, message: VMSG[code], hash: null }); }
    if (!isObj(pkg) || pkg.format !== FORMAT || !isObj(pkg.project)) return bad('format');
    var ig = pkg.integrity; if (!isObj(ig) || typeof ig.hash !== 'string' || ig.hash === '') return bad('no-integrity');
    if (ig.algorithm !== 'SHA-256') return bad('algorithm');
    if (!HASH_RE.test(ig.hash)) return bad('hash-format');
    if (!Array.isArray(pkg.library)) return bad('library');
    var txt; try { txt = canonical(pkg); } catch (e) { return bad('format'); }
    return sha256(txt).then(function (hh) { return hh === ig.hash ? { ok: true, code: 'ok', message: '', hash: hh } : { ok: false, code: 'mismatch', message: VMSG.mismatch, hash: hh }; }, function () { return { ok: false, code: 'crypto', message: VMSG.crypto, hash: null }; });
  }

  /* ---------- Remix のライセンス検証（UI と SQL トリガー works_before の規則を同一にする。DB 側でも必ず再検証される） ---------- */
  var REMIX_OK = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'MIT'], ALL_LICENSES = REMIX_OK.concat(['all-rights-reserved']);
  /** w: 作品行（id, license, author_id, visibility, hidden）。uid: ログイン中ユーザーID（未ログインは空）。 → {ok, code, message}。ok:true 以外は Remix を実行してはならない */
  function remixCheck(w, uid) {
    function no(code, message) { return { ok: false, code: code, message: message }; }
    if (!isObj(w) || typeof w.id !== 'string' || !w.id) return no('unavailable', '作品情報を取得できませんでした');
    if (w.sample === true || /^sample-/.test(w.id)) return no('sample', 'サンプル作品はRemixできません');
    var mine = !!uid && w.author_id === uid;
    if (w.hidden) return no('unavailable', 'この作品は非表示のためRemixできません');
    if (w.visibility === 'private' && !mine) return no('unavailable', 'この作品は非公開のためRemixできません');
    if (typeof w.license !== 'string' || !w.license) return no('license-missing', 'ライセンスが不明なためRemixできません');
    if (w.license === 'all-rights-reserved') return mine ? { ok: true, code: 'ok', message: '' } : no('license', 'この作品は All rights reserved のため、作者以外はRemixできません');
    if (REMIX_OK.indexOf(w.license) < 0) return no('license-unknown', '未対応のライセンス（' + w.license.slice(0, 40) + '）のためRemixできません');
    return { ok: true, code: 'ok', message: '' };
  }
  /** 派生作品に付けてよいライセンス。ShareAlike の元作品（他人の作品）は CC-BY-SA-4.0 のみ（DB トリガーと同じ） */
  function remixLicenses(parent, uid) {
    if (isObj(parent) && parent.license === 'CC-BY-SA-4.0' && !(uid && parent.author_id === uid)) return ['CC-BY-SA-4.0'];
    return ALL_LICENSES.slice();
  }

  /* ---------- ZeroStudio からの受信 ---------- */
  function isLocal(h) { return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; }
  /** studioOrigins を正規化。空なら Zero 自身のオリジン（同一配信構成）。不正な値は bad に集めて採用しない（'*' も不可）。 */
  function normalizeOrigins(list, own) {
    if (typeof list === 'string') list = [list];
    if (!Array.isArray(list) || !list.length) return { origins: own && own !== 'null' ? [own] : [], bad: [], usedDefault: true };
    var out = [], bad = [];
    list.forEach(function (x) { var u; try { u = new URL(String(x)); } catch (e) { bad.push(String(x)); return; }
      if (u.origin === 'null' || u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && isLocal(u.hostname)))) { bad.push(String(x)); return; }
      if (out.indexOf(u.origin) < 0) out.push(u.origin); });
    return { origins: out, bad: bad, usedDefault: false };
  }
  /** Zero 側の受信口。ログイン状態に依存せず、受信データは onReceive でメモリへ渡す。 */
  function createReceiver(o) {
    var w = o.win, opener = o.opener, origins = o.origins || [], seen = {}, stopped = false, timer = null, t0 = Date.now(), maxMs = o.maxMs || 300000;
    if (!opener || opener === w) return null;
    function reply(type, id, origin, reason) { try { var m = { type: type, v: 1 }; if (id) m.id = id; if (reason) m.reason = reason; opener.postMessage(m, origin); } catch (e) {} }
    function stopReady() { stopped = true; if (timer) { (o.clearInterval || g.clearInterval)(timer); timer = null; } }
    function ready() { if (stopped) return; if (opener.closed || Date.now() - t0 > maxMs) return stopReady();
      origins.forEach(function (or) { try { opener.postMessage({ type: 'zero:ready', v: 1 }, or); } catch (e) {} }); }
    function onMsg(e) {
      if (e.source !== opener) return;                                   // window 参照
      var d = e.data; if (!isObj(d) || d.type !== 'zerostudio:publish') return;
      if (origins.indexOf(e.origin) < 0) { if (o.onProblem) o.onProblem('origin', e.origin); return; } // origin
      var id = d.id; if (d.v !== 1 || typeof id !== 'string' || !ID_RE.test(id)) return reply('zero:rejected', null, e.origin, 'format');
      if (seen[id]) return reply('zero:received', id, e.origin);
      if (validatePkg(d.pkg).length) return reply('zero:rejected', id, e.origin, 'invalid');
      var size; try { size = JSON.stringify(d.pkg).length; } catch (x) { size = Infinity; }
      if (size > MAX_INBOUND) return reply('zero:rejected', id, e.origin, 'too-large');
      try { o.onReceive(d.pkg, { id: id, origin: e.origin }); } catch (x) { return reply('zero:rejected', id, e.origin, 'internal'); }
      seen[id] = 1; stopReady(); reply('zero:received', id, e.origin);
    }
    w.addEventListener('message', onMsg);                                // 受信登録 → その後に ready を送る
    ready(); timer = (o.setInterval || g.setInterval)(ready, o.intervalMs || 500);
    return { stop: function () { stopReady(); w.removeEventListener('message', onMsg); } };
  }

  /* ---------- 投稿: アップロード → DB登録。失敗時は保存ファイルを安全に回収 ---------- */
  function qLoad(deps) { var a = []; try { a = JSON.parse((deps.store && deps.store.getItem(QKEY)) || '[]'); } catch (e) {} if (!Array.isArray(a)) a = [];
    return a.filter(function (r) { return isObj(r) && typeof r.path === 'string' && typeof r.uid === 'string'; }).concat(memQueue.filter(function (m) { return !a.some(function (r) { return r.path === m.path; }); })); }
  function qSave(deps, a) { a = a.slice(-50); memQueue = a.slice();
    try { if (a.length) deps.store.setItem(QKEY, JSON.stringify(a)); else deps.store.removeItem(QKEY); } catch (e) { /* 保存不可なら当セッションのメモリ+ログのみ */ } }
  function enqueue(deps, rec, err) { var a = qLoad(deps).filter(function (r) { return r.path !== rec.path; }), prev = qLoad(deps).filter(function (r) { return r.path === rec.path; })[0];
    a.push({ path: rec.path, id: rec.id, uid: rec.uid, at: (prev && prev.at) || new Date().toISOString(), tries: ((prev && prev.tries) || 0) + 1, error: errMsg(err).slice(0, 200) }); qSave(deps, a);
    if (deps.log) deps.log('zero: 保存ファイルの回収待ちに記録しました', rec.path, errMsg(err)); }
  function dequeue(deps, path) { qSave(deps, qLoad(deps).filter(function (r) { return r.path !== path; })); }
  function removeRetry(deps, path, n) {
    return (function loop(k) { return deps.remove(path).then(null, function (e) { if (k + 1 >= n) throw e; return deps.sleep(300 * (k + 1)).then(function () { return loop(k + 1); }); }); })(0); }
  /** 作品行が無いことを確認できた場合だけ削除する。確認できない・削除できない場合は記録して後で再試行。 → 'committed' | 'removed' | 'queued' */
  function reclaim(deps, rec, tries) {
    return deps.exists(rec.id).then(function (ex) { if (ex) { dequeue(deps, rec.path); return 'committed'; }
      return removeRetry(deps, rec.path, tries || 1).then(function () { dequeue(deps, rec.path); return 'removed'; }); })
      .then(null, function (e) { enqueue(deps, rec, e); return 'queued'; });
  }
  function uploadAndRegister(deps, o) {
    var rec = { path: o.path, id: o.id, uid: o.uid };
    return deps.upload(o.path, o.text).then(null, function (err) {
      if (err && typeof err.status === 'number' && err.status < 500) throw err;        // 明確な拒否: 何も保存されていない
      return reclaim(deps, rec, 1).then(function (r) { err.cleanup = r; throw err; });  // 通信断など: 保存された可能性があるので確認して回収
    }).then(function () {
      return deps.insert(o.row).then(function () { return { ok: true }; }, function (err) {
        return reclaim(deps, rec, 3).then(function (r) { if (r === 'committed') return { ok: true, recovered: true }; err.cleanup = r; throw err; }); });
    });
  }
  function sweepOrphans(deps, uid) { var list = qLoad(deps).filter(function (r) { return r.uid === uid; }).slice(0, 10), n = 0;
    return list.reduce(function (p, r) { return p.then(function () { return reclaim(deps, r, 1); }).then(function (x) { if (x !== 'queued') n++; }); }, Promise.resolve()).then(function () { return n; }); }
  function cleanupNote(c) { return c === 'removed' ? '（アップロード済みのファイルは削除しました）' : c === 'queued' ? '（アップロード済みファイルの削除に失敗したため記録しました。次回ログイン時に自動で再試行します）' : ''; }

  var api = { VERSION: '1.0.4', FORMAT: FORMAT, remixCheck: remixCheck, remixLicenses: remixLicenses, REMIX_LICENSES: REMIX_OK.slice(), ALL_LICENSES: ALL_LICENSES.slice(), sha256: sha256, verifyPackage: verifyPackage, validatePkg: validatePkg, normalizeOrigins: normalizeOrigins, createReceiver: createReceiver,
    uploadAndRegister: uploadAndRegister, reclaim: reclaim, sweepOrphans: sweepOrphans, cleanupNote: cleanupNote, queue: qLoad, QUEUE_KEY: QKEY, _resetMem: function () { memQueue = []; } };
  g.ZeroCore = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
