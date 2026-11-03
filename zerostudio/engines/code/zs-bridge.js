/*
 * Code Studio ブリッジ（CODE LAB ↔ ZeroStudio）
 * app.js より先に読み込まれ、app.js 末尾のフック（__ZS_CODE_HOOK__）から内部状態を受け取ります。
 * フックが呼ばれなければ（単体で開いた場合）何も起きません。
 */
(function () {
  'use strict';
  var COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  var SIZES = [16, 32, 64];

  /** ドット絵JSONを検証して正規化（許可したキーだけ残す）。不正なら null。色は #RGB 系のみ */
  function cleanPixel(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || SIZES.indexOf(p.size) < 0) return null;
    var n = p.size * p.size;
    if (!Array.isArray(p.frames) || !p.frames.length || p.frames.length > 64) return null;
    var frames = [];
    for (var i = 0; i < p.frames.length; i++) {
      var f = p.frames[i];
      if (!Array.isArray(f) || f.length !== n) return null;
      var row = new Array(n);
      for (var j = 0; j < n; j++) {
        var c = f[j];
        if (c === null) row[j] = null;
        else if (typeof c === 'string' && COLOR.test(c)) row[j] = c;
        else return null;
      }
      frames.push(row);
    }
    var cols = function (a, m) { return (Array.isArray(a) ? a : []).filter(function (c) { return typeof c === 'string' && COLOR.test(c); }).slice(0, m); };
    return {
      version: 1, name: typeof p.name === 'string' ? p.name.replace(/[\u0000-\u001F]/g, '').slice(0, 60) : '無題のドット絵',
      size: p.size, frames: frames, palette: cols(p.palette, 32), saved: cols(p.saved, 64), transparent: p.transparent !== false,
      bg: typeof p.bg === 'string' && COLOR.test(p.bg) ? p.bg : '#171a2b',
      fps: typeof p.fps === 'number' && p.fps >= 1 && p.fps <= 12 ? Math.floor(p.fps) : 4
    };
  }

  window.__ZS_CODE_HOOK__ = function (k) {
    var $ = function (s) { return document.querySelector(s); };
    var last = { web: null, pixel: null }, mode = null;

    function send(type, data) {
      try { window.parent.postMessage(Object.assign({ zs: 1, engine: 'code', type: type }, data || {}), location.origin); } catch (e) { /* 単体表示 */ }
    }
    var sigWeb = function () { return [k.el.name.value, k.state.html, k.state.css, k.state.js].join('\u0001'); };
    var sigPx = function () { return JSON.stringify([$('#pixelName').value, k.px.size, k.px.frames, k.px.palette, k.px.saved, k.px.transparent, k.px.bg, k.px.fps]); };
    var currentMode = function () { var v = document.querySelector('.view.active'); return v && v.id === 'pixel' ? 'pixel' : 'workspace'; };

    var api = {
      engine: 'code', version: 1, ready: true,
      getMode: function () { return currentMode(); },
      getWeb: function () {
        return { title: (k.el.name.value || '').trim() || '無題のプロジェクト', payload: { html: k.state.html, css: k.state.css, js: k.state.js } };
      },
      setWeb: function (title, p) {
        if (!p || typeof p.html !== 'string' || typeof p.css !== 'string' || typeof p.js !== 'string') throw new Error('Web作品のデータが正しくありません。');
        var tab = document.querySelector('.code-tab[data-lang="html"]');
        if (k.state.activeLang !== 'html' && tab) tab.click();            // 先に表示中のタブを確定してから状態を差し替える
        k.state = { name: String(title || '無題のプロジェクト').slice(0, 80), html: p.html, css: p.css, js: p.js, id: null, dirty: false, activeLang: 'html' };
        k.el.name.value = k.state.name; k.editor(); k.run(); k.dirty(false);
        last.web = sigWeb(); api.show('workspace');
      },
      getPixel: function () {
        var d = cleanPixel({ name: $('#pixelName').value, size: k.px.size, frames: k.px.frames, palette: k.px.palette, saved: k.px.saved, transparent: k.px.transparent, bg: k.px.bg, fps: k.px.fps });
        if (!d) throw new Error('ドット絵の状態を読み取れませんでした。');
        return { title: d.name, payload: JSON.parse(JSON.stringify(d)) };
      },
      setPixel: function (title, p) {
        var d = cleanPixel(Object.assign({}, p, { name: title || p.name }));
        if (!d) throw new Error('ドット絵のデータが正しくありません。');
        if (k.px.playing) { var pb = $('#playFramesBtn'); if (pb) pb.click(); }
        Object.assign(k.px, { id: null, name: d.name, size: d.size, frames: d.frames, palette: d.palette.length ? d.palette : k.px.palette, saved: d.saved, transparent: d.transparent, bg: d.bg, fps: d.fps, active: 0, history: [], future: [], color: (d.palette[0] || '#7C6CFF'), playing: false });
        $('#pixelName').value = d.name; $('#pixelGridSize').value = d.size; $('#transparentToggle').checked = d.transparent; $('#pixelBackground').value = d.bg; $('#fpsRange').value = d.fps;
        k.renderPx(); last.pixel = sigPx(); api.show('pixel');
      },
      setName: function (slot, name) {
        name = String(name || '').slice(0, 80);
        if (slot === 'pixel') { $('#pixelName').value = name; k.renderPx(); }
        else { k.el.name.value = name; k.dirty(); }
      },
      show: function (which) { var b = document.querySelector('.nav-link[data-view="' + (which === 'pixel' ? 'pixel' : 'workspace') + '"]'); if (b) b.click(); },
      /** 素材のコード片を現在のWeb作品へ追加する（HTML/CSS/JS それぞれ末尾へ） */
      insert: function (parts) {
        var s = k.state, add = function (a, b) { return b ? (a ? a.replace(/\s+$/, '') + '\n\n' : '') + b : a; };
        s.html = add(s.html, parts.html || ''); s.css = add(s.css, parts.css || ''); s.js = add(s.js, parts.js || '');
        api.show('workspace'); k.editor(); k.dirty(true); k.run();
      },
      suspend: function () { if (k.px.playing) { var pb = $('#playFramesBtn'); if (pb) pb.click(); } }
    };
    window.ZSBridge = api;

    // ドット絵JSON読込（元の「JSON読込」）の入口を検証する。不正な色などが innerHTML に入る経路を塞ぐ
    var inp = $('#pixelImportInput');
    if (inp && inp.onchange) {
      var orig = inp.onchange;
      inp.onchange = function (e) {
        var f = e.target.files && e.target.files[0], self = this;
        if (!f) return orig.call(self, e);
        return f.text().then(function (t) {
          var clean = cleanPixel(JSON.parse(t));
          if (!clean) throw new Error('bad');
          var dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(clean)], f.name, { type: 'application/json' }));
          e.target.files = dt.files;
          return orig.call(self, e);
        }).catch(function () { e.target.value = ''; k.toast('有効なPIXEL LAB JSONではありません（形式、または色の値が不正です）'); });
      };
    }

    // 変更検知。基準は「app.js の初期化が終わった直後」に確定する（最初のポーリングまで待つと、その間の編集が基準に吸収されて保存されない）
    setTimeout(function () { if (last.web === null) last.web = sigWeb(); if (last.pixel === null) last.pixel = sigPx(); }, 0);
    setInterval(function () {
      var m = currentMode();
      if (m !== mode) { mode = m; send('mode', { mode: m }); }
      var w = sigWeb(), p = sigPx();
      if (last.web === null) last.web = w; else if (w !== last.web) { last.web = w; send('change', { slot: 'web' }); }
      if (last.pixel === null) last.pixel = p; else if (p !== last.pixel) { last.pixel = p; send('change', { slot: 'pixel' }); }
    }, 600);

    // 元の「保存」ボタン・Ctrl/⌘+S は ZeroStudio の保存（版の確定）としても扱う
    ['#saveBtn', '#pixelSaveBtn'].forEach(function (s) { var b = $(s); if (b) b.addEventListener('click', function () { send('save-request', { slot: s === '#pixelSaveBtn' ? 'pixel' : 'web' }); }); });
    window.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 's') send('save-request', { slot: currentMode() === 'pixel' ? 'pixel' : 'web' }); });
    send('ready', {});
  };
})();
