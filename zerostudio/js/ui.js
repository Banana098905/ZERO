/* ZeroStudio — シェル共通のUI部品。文字は必ず textContent 経由（HTML注入しない） */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util, h = U.h;
  var ui = (ZS.ui = {});

  /* ---------- アイコン（線幅・サイズ・角を統一した1セット） ---------- */
  var ICONS = {
    home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    code: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14',
    logic: 'M4 8h5M4 16h5M9 6h4a6 6 0 0 1 0 12H9zM19 12h2',
    zero: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 16l8-8',
    library: 'M5 4h4v16H5zM11 4h4v16h-4zM17.5 5.5l3.5 1-3.5 13-3.5-1z',
    transfer: 'M12 4v11M8 11l4 4 4-4M5 19h14',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14',
    menu: 'M4 7h16M4 12h16M4 17h16',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
    warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    pixel: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    circuit: 'M3 8h4M3 16h4M17 12h4M7 6h5a6 6 0 0 1 0 12H7z',
    chip: 'M9 9h6v6H9zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M6 6h12v12H6z',
    gear: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    sparkle: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
    flask: 'M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3',
    blocks: 'M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v4h-7zM4 15h7v5H4z',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    play: 'M7 4l13 8-13 8z',
    save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
    chevron: 'M6 9l6 6 6-6',
    export: 'M12 15V4M8 8l4-4 4 4M5 15v4h14v-4',
    detail: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01'
  };
  var NS = 'http://www.w3.org/2000/svg';
  /** アイコン要素を作る（装飾なので aria-hidden）。未知の名前は空のアイコン */
  ui.icon = function (name, size) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'zs-ic'); svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
    (ICONS[name] || '').split('M').filter(Boolean).forEach(function (d) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M' + d); svg.appendChild(p); });
    return svg;
  };
  ui.svgEl = function (tag, attrs, kids) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  };

  ui.toast = function (msg, kind, ms) {
    var box = document.getElementById('zs-toasts');
    var t = h('div', { class: 'zs-toast ' + (kind || ''), title: 'クリックで閉じる' }, ui.icon(kind === 'ok' ? 'check' : kind === 'err' ? 'error' : kind === 'warn' ? 'warn' : 'info'), h('span', { text: msg }));
    function gone() { if (!t.parentNode) return; t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 160); }
    t.addEventListener('click', gone);
    box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(gone, ms || (kind === 'err' || kind === 'warn' ? 7000 : 3200));
  };
  ui.error = function (e, prefix) { ui.toast((prefix ? prefix + ': ' : '') + U.explain(e), 'err'); if (g.console) console.error('[ZS]', e); };

  /**
   * ダイアログ。build(body, ctx) で中身を作る。ctx.close(value) で閉じる。
   * actions: [{label, value, primary, danger}]。戻り値は選ばれた value（キャンセル/Esc は null）
   */
  ui.dialog = function (o) {
    return new Promise(function (resolve) {
      var dlg = h('dialog', { class: 'zs-dlg' + (o.wide ? ' wide' : '') }), done = false;
      var body = h('div', { class: 'body' }), foot = h('footer');
      function close(v) { if (done) return; done = true; try { dlg.close(); } catch (e) { /* noop */ } if (dlg.parentNode) dlg.parentNode.removeChild(dlg); resolve(v === undefined ? null : v); }
      var ctx = { close: close, dialog: dlg };
      (o.actions || [{ label: '閉じる', value: true, primary: true }]).forEach(function (a) {
        var b = h('button', { type: 'button', class: 'zs-btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), text: a.label });
        b.addEventListener('click', function () { if (a.beforeClose) { Promise.resolve(a.beforeClose(ctx)).then(function (ok) { if (ok !== false) close(a.value); }); } else close(a.value); });
        foot.appendChild(b); a.el = b;
      });
      ctx.actions = o.actions || [];
      dlg.appendChild(h('form', { method: 'dialog', onsubmit: function (e) { e.preventDefault(); } }, h('header', null, h('h2', { text: o.title || '' })), body, foot));
      if (o.build) o.build(body, ctx);
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(null); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) close(null); });
      document.body.appendChild(dlg); dlg.showModal();
      var first = body.querySelector('input,textarea,select'); if (first) first.focus();
    });
  };
  ui.confirm = function (o) {
    return ui.dialog({
      title: o.title, build: function (b) { (Array.isArray(o.message) ? o.message : [o.message]).forEach(function (m) { b.appendChild(h('p', { text: m, style: { margin: '0 0 8px' } })); }); },
      actions: [{ label: o.cancelLabel || 'キャンセル', value: false }, { label: o.okLabel || 'OK', value: true, primary: !o.danger, danger: !!o.danger }]
    }).then(function (v) { return v === true; });
  };
  ui.prompt = function (o) {
    var input;
    return ui.dialog({
      title: o.title,
      build: function (b, ctx) {
        input = h('input', { class: 'zs-in', type: 'text', value: o.value || '', maxlength: o.maxlength || 80, style: { width: '100%' } });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) ctx.close(input.value.trim()); } });
        b.appendChild(h('div', { class: 'zs-field' }, h('label', { text: o.label || '' }), input));
      },
      actions: [{ label: 'キャンセル', value: null }, { label: o.okLabel || 'OK', value: '__ok', primary: true, beforeClose: function () { return !!input.value.trim(); } }]
    }).then(function (v) { return v === '__ok' ? input.value.trim() : null; });
  };

  /** アンカー付近に開くメニュー。items: [{label, onClick, danger, disabled} | {heading} | '-'] */
  ui.menu = function (anchor, items) {
    var old = document.querySelector('.zs-menu'); if (old) old.remove();
    var m = h('div', { class: 'zs-menu', role: 'menu' });
    function close() { if (m.parentNode) m.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); }
    function outside(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
    function key(e) { if (e.key === 'Escape') { close(); anchor.focus(); } }
    items.forEach(function (it) {
      if (it === '-') return m.appendChild(h('hr'));
      if (it.heading) return m.appendChild(h('div', { class: 'lab', text: it.heading }));
      m.appendChild(h('button', { type: 'button', role: 'menuitem', disabled: it.disabled, style: it.danger ? { color: 'var(--danger)' } : null, text: it.label, onclick: function () { close(); if (it.onClick) it.onClick(); } }));
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), w = m.offsetWidth, left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 4; if (top + m.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    setTimeout(function () { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', key, true); }, 0);
    var f = m.querySelector('button:not([disabled])'); if (f) f.focus();
    return { close: close };
  };

  ui.download = function (filename, mime, text) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob), a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };
  ui.downloadJson = function (filename, obj) { ui.download(filename, 'application/json', JSON.stringify(obj, null, 2)); };
  /** ファイルを文字として読む。大きすぎる場合は読む前に拒否 */
  ui.readFile = function (file, maxBytes) {
    if (!file) return Promise.reject(U.ZSError('INVALID', 'ファイルが選択されていません。'));
    if (maxBytes && file.size > maxBytes) return Promise.reject(U.ZSError('TOO_LARGE', 'ファイルが大きすぎます（' + U.fmtBytes(file.size) + '。上限 ' + U.fmtBytes(maxBytes) + '）。'));
    return file.text().catch(function () { throw U.ZSError('INVALID', 'ファイルを読み込めませんでした。'); });
  };
  ui.readFileAsDataUrl = function (file, maxBytes) {
    if (maxBytes && file.size > maxBytes) return Promise.reject(U.ZSError('TOO_LARGE', '画像が大きすぎます（上限 ' + U.fmtBytes(maxBytes) + '）。'));
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(U.ZSError('INVALID', '画像を読み込めませんでした。')); }; r.readAsDataURL(file); });
  };
  ui.engineChip = function (engineId, label) {
    var e = ZS.engines.get(engineId), c = e ? e.hue : 'var(--faint)';
    return h('span', { class: 'zs-chip', style: { '--c': c } }, h('i'), label || (e ? e.short : engineId));
  };
  ui.chip = function (text, cls, title) { return h('span', { class: 'zs-chip ' + (cls || ''), text: text, title: title || null }); };
})(typeof globalThis !== 'undefined' ? globalThis : window);
