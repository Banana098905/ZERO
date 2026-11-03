/*
 * ZeroStudio — 基礎ユーティリティ
 * DOM に依存しない部分は Node でもそのままテストできます（globalThis.ZS に登録）。
 */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = (ZS.util = {});

  /* ---------- エラー ---------- */
  // code: QUOTA / INVALID / NOT_FOUND / CONFLICT / STORAGE / TOO_LARGE / UNSUPPORTED / ENGINE / TIMEOUT
  function ZSError(code, message, detail) {
    var e = new Error(message);
    e.name = 'ZSError';
    e.code = code;
    if (detail !== undefined) e.detail = detail;
    return e;
  }
  U.ZSError = ZSError;
  U.isQuotaError = function (e) {
    return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || (e.inner && U.isQuotaError(e.inner)));
  };
  /** どんな例外でも、利用者に見せられる日本語の文面にする */
  U.explain = function (e) {
    if (!e) return '不明なエラーが発生しました。';
    if (U.isQuotaError(e)) return '保存容量が足りません。不要なプロジェクトを削除するか、先にバックアップを書き出してください。';
    if (e.name === 'ZSError') return e.message;
    return String(e.message || e).slice(0, 300);
  };

  /* ---------- 乱数・ID ---------- */
  var B32 = 'abcdefghijklmnopqrstuvwxyz234567';
  U.randomBytes = function (n) {
    var a = new Uint8Array(n);
    var c = g.crypto;
    if (c && c.getRandomValues) c.getRandomValues(a);
    else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); // 古い環境の最終手段
    return a;
  };
  /**
   * ID を作る: <prefix>_<26文字の base32>（130bit）。rng はテスト用に差し替え可能。
   * 名前やタイトルからは作らないので、同名プロジェクトでも衝突しません。
   */
  U.newId = function (prefix, rng) {
    var bytes = (rng || U.randomBytes)(17), out = '', bits = 0, acc = 0;
    for (var i = 0; i < bytes.length && out.length < 26; i++) {
      acc = (acc << 8) | bytes[i]; bits += 8;
      while (bits >= 5 && out.length < 26) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
      acc &= (1 << bits) - 1;
    }
    return (prefix || 'zs') + '_' + out;
  };
  /**
   * 既存IDと被らないIDを返す。exists は id -> Promise<boolean>。
   * 乱数が同じ値を返し続けても、有限回で諦めて明示的に失敗する（黙って上書きしない）。
   */
  U.uniqueId = function (prefix, exists, rng) {
    var tries = 0;
    function next() {
      if (++tries > 8) return Promise.reject(ZSError('STORAGE', 'ID を重複なく生成できませんでした。'));
      var id = U.newId(prefix, rng);
      return Promise.resolve(exists(id)).then(function (hit) { return hit ? next() : id; });
    }
    return next();
  };

  /* ---------- ハッシュ（重複判定・版の判定用。暗号用途ではない） ---------- */
  U.cyrb53 = function (str, seed) {
    var h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  /** キー順に依存しない JSON 文字列 */
  U.stableStringify = function (v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(U.stableStringify).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + U.stableStringify(v[k]); }).join(',') + '}';
  };
  U.contentHash = function (v) { var s = U.stableStringify(v); return U.cyrb53(s) + '-' + s.length.toString(36); };
  /** 公開用パッケージの完全性確認（SHA-256, 16進）。subtle が無い環境では null */
  U.sha256 = function (text) {
    var s = g.crypto && g.crypto.subtle;
    if (!s) return Promise.resolve(null);
    return s.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  };

  /* ---------- 安全な JSON 取り込み ---------- */
  var DANGEROUS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  /**
   * 信頼できない値を「ただのデータ」に洗う。
   *  - __proto__ / constructor / prototype キーを除去（プロトタイプ汚染対策）
   *  - 関数・undefined・シンボルは除去、NaN/Infinity は null
   *  - 深さ・総ノード数・文字列長の上限を超えたら ZSError('TOO_LARGE')
   * stats に { dropped } を数える。
   */
  U.deepClean = function (value, opts, stats) {
    var o = opts || {};
    var maxDepth = o.maxDepth || 40, maxNodes = o.maxNodes || 3000000, maxStr = o.maxString || 8 * 1024 * 1024;
    var st = stats || {}; st.dropped = st.dropped || 0; st.nodes = 0;
    function walk(v, d) {
      if (++st.nodes > maxNodes) throw ZSError('TOO_LARGE', 'データの要素数が多すぎます。');
      if (v === null) return null;
      var t = typeof v;
      if (t === 'string') {
        if (v.length > maxStr) throw ZSError('TOO_LARGE', '文字列が長すぎます。');
        return v;
      }
      if (t === 'number') return isFinite(v) ? v : (st.dropped++, null);
      if (t === 'boolean') return v;
      if (t !== 'object') { st.dropped++; return undefined; }
      if (d > maxDepth) throw ZSError('TOO_LARGE', 'データの入れ子が深すぎます。');
      var i, out;
      if (Array.isArray(v)) {
        out = [];
        for (i = 0; i < v.length; i++) { var x = walk(v[i], d + 1); out.push(x === undefined ? null : x); }
        return out;
      }
      out = {};
      var keys = Object.keys(v);
      for (i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (DANGEROUS[k]) { st.dropped++; continue; }
        var y = walk(v[k], d + 1);
        if (y !== undefined) out[k] = y;
      }
      return out;
    }
    return walk(value, 0);
  };
  U.byteLength = function (s) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length * 3; };
  /** JSON.parse を、読みやすい日本語エラーで包む */
  U.parseJson = function (text, maxBytes) {
    if (typeof text !== 'string') throw ZSError('INVALID', 'ファイルを文字として読み取れませんでした。');
    if (maxBytes && text.length > maxBytes) throw ZSError('TOO_LARGE', 'ファイルが大きすぎます（上限 ' + Math.round(maxBytes / 1048576) + 'MB）。');
    var t = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text; // BOM
    try { return JSON.parse(t); }
    catch (e) { throw ZSError('INVALID', 'JSON として読み取れませんでした。ファイルが壊れているか、JSON ではありません。'); }
  };

  /* ---------- 小物 ---------- */
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.nowIso = function () { return new Date().toISOString(); };
  U.isoOk = function (s) { return typeof s === 'string' && s.length <= 40 && isFinite(Date.parse(s)); };
  U.str = function (v, max, fallback) {
    if (typeof v !== 'string') return fallback === undefined ? '' : fallback;
    var t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    return t.length > max ? t.slice(0, max) : t;
  };
  U.debounce = function (fn, ms) {
    var t = null;
    var f = function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(self, a); }, ms); };
    f.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    f.cancel = function () { clearTimeout(t); t = null; };
    return f;
  };
  U.fmtDate = function (iso) {
    var d = new Date(iso);
    if (!isFinite(d)) return '—';
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  U.fmtAgo = function (iso, now) {
    var s = Math.round(((now || Date.now()) - Date.parse(iso)) / 1000);
    if (!isFinite(s)) return '—';
    if (s < 45) return 'たった今';
    if (s < 3600) return Math.round(s / 60) + '分前';
    if (s < 86400) return Math.round(s / 3600) + '時間前';
    if (s < 86400 * 30) return Math.round(s / 86400) + '日前';
    return U.fmtDate(iso).slice(0, 10);
  };
  U.fmtBytes = function (n) {
    if (!isFinite(n)) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };
  U.escapeHtml = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  U.safeFileName = function (s, ext) {
    var base = String(s || 'zerostudio').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'zerostudio';
    return base + (ext || '');
  };

  /* ---------- DOM ヘルパー（ブラウザのみ）。子は textContent で入れるので HTML 注入にならない ---------- */
  U.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (sk) { if (sk.slice(0, 2) === '--') el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; }); // --c などのカスタムプロパティは setProperty が必要
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x !== null && x !== undefined && x !== false) el.appendChild(typeof x === 'object' ? x : document.createTextNode(String(x))); });
      else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  U.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
})(typeof globalThis !== 'undefined' ? globalThis : window);
