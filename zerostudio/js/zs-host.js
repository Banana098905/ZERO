/*
 * ZeroStudio — ホスト層（ブラウザ専用）
 *   Frame    : エンジンを同一オリジンの iframe で起動し、ブリッジを安全に呼ぶ（JSON複製・タイムアウト・日本語エラー）
 *   attach   : エンジンごとの「読み込む／読み出す」対応表（共通プロジェクト ⇔ 実際の画面）
 *   Session  : 自動保存・版の確定・競合時のコピー保存。作品タイプごとの「スロット」で管理
 *   legacy   : 旧アプリの保存領域を“読むだけ”で取り込むリーダー
 */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util, Err = U.ZSError;
  var H = (ZS.host = {});
  var clone = function (o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); };

  /* ---------- Frame ---------- */
  function Frame(engine, container, opts) {
    var self = this;
    opts = opts || {};
    this.engine = engine; this.handlers = {}; this.destroyed = false; this.isReady = false;
    this.el = U.h('iframe', { class: 'zs-frame', title: engine.label, src: engine.entry + '?zs=1' + (opts.hash || ''), referrerpolicy: 'no-referrer' });
    this._onMsg = function (e) {
      if (e.origin !== location.origin || e.source !== self.el.contentWindow) return;   // 自分の iframe からの同一オリジンのメッセージだけ
      var m = e.data; if (!m || m.zs !== 1 || m.engine !== engine.id) return;
      if (m.type === 'ready') self.isReady = true;
      (self.handlers[m.type] || []).slice().forEach(function (f) { try { f(m); } catch (x) { console.error('[ZS] handler', x); } });
    };
    g.addEventListener('message', this._onMsg);
    this._readyP = new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(Err('TIMEOUT', engine.label + ' が時間内に起動しませんでした。ページを再読み込みしてください。')); }, 20000);
      self.on('ready', function () { clearTimeout(t); res(); });
      self.on('error', function (m) { clearTimeout(t); rej(Err('ENGINE', m.message || engine.label + ' の起動に失敗しました。')); });
      self.el.addEventListener('error', function () { clearTimeout(t); rej(Err('ENGINE', engine.label + ' を読み込めませんでした。')); });
    });
    this._readyP.catch(function () { /* 呼び出し側で扱う */ });
    // 共通テーマ（トークン＋エンジン用）を、読み込み後に子文書へ追加する。元のエンジンのファイルは変更しない
    this.themed = new Promise(function (res) {
      var done = false, fin = function () { if (!done) { done = true; res(); } };
      setTimeout(fin, 6000);
      self.el.addEventListener('load', function () {
        try {
          var d = self.el.contentDocument, n = 2;
          ['zs-tokens', 'zs-engine-' + engine.id].forEach(function (name) {
            var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = '../../css/' + name + '.css';
            l.addEventListener('load', function () { if (--n === 0) fin(); }); l.addEventListener('error', function () { if (--n === 0) fin(); });
            d.head.appendChild(l);
          });
        } catch (e) { fin(); }
      });
    });
    container.appendChild(this.el);
  }
  Frame.prototype.on = function (type, cb) { (this.handlers[type] = this.handlers[type] || []).push(cb); };
  Frame.prototype.ready = function () { return this._readyP; };
  Frame.prototype.bridge = function () { try { return this.el.contentWindow && this.el.contentWindow.ZSBridge; } catch (e) { return null; } };
  /** ブリッジの関数を呼ぶ。引数・戻り値は JSON で複製する（別 realm のオブジェクトを持ち込まない） */
  Frame.prototype.call = function (method) {
    var args = Array.prototype.slice.call(arguments, 1).map(clone), self = this;
    return new Promise(function (resolve, reject) {
      var b = self.bridge();
      if (!b || typeof b[method] !== 'function') return reject(Err('ENGINE', self.engine.label + ' の機能「' + method + '」を呼び出せません。'));
      var timer = setTimeout(function () { reject(Err('TIMEOUT', self.engine.label + ' が応答しません（' + method + '）。')); }, 15000);
      Promise.resolve().then(function () { return b[method].apply(b, args); }).then(function (r) { clearTimeout(timer); resolve(clone(r)); },
        function (e) { clearTimeout(timer); reject(Err('ENGINE', (e && e.message) || String(e))); });
    });
  };
  Frame.prototype.destroy = function () {
    if (this.destroyed) return; this.destroyed = true;
    g.removeEventListener('message', this._onMsg);
    try { var b = this.bridge(); if (b && b.suspend) b.suspend(); } catch (e) { /* noop */ }
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };
  H.Frame = Frame;

  /* ---------- attach: 共通プロジェクト ⇔ 画面 ---------- */
  H.attach = {
    code: {
      slots: ['web', 'pixel'], defaultSlot: 'web',
      slotOfMode: function (m) { return m === 'pixel' ? 'pixel' : 'web'; },
      load: function (f, p) { return f.call(p.workType === 'pixel' ? 'setPixel' : 'setWeb', p.title, p.engineData.payload); },
      snapshot: function (f, slot) { return f.call(slot === 'pixel' ? 'getPixel' : 'getWeb'); }
    },
    logic: {
      slots: ['circuit', 'cpu-program', 'machine'], defaultSlot: 'circuit',
      slotOfMode: function (m) { return m; },
      load: function (f, p) { var m = p.workType === 'circuit' ? 'setCircuit' : p.workType === 'machine' ? 'setMachine' : 'setCpu'; return f.call(m, p.workType === 'cpu-program' ? null : p.title, p.engineData.payload); },
      snapshot: function (f, slot) { return f.call(slot === 'circuit' ? 'getCircuit' : slot === 'machine' ? 'getMachine' : 'getCpu'); }
    }
  };

  /* ---------- Session ---------- */
  /** hooks: { status(slot, {state, at, message}), slot(slot, project|null), conflict(result), warn(msg) } */
  function Session(svc, engineId, frame, hooks) {
    this.svc = svc; this.engineId = engineId; this.frame = frame; this.hooks = hooks || {};
    this.attach = H.attach[engineId]; this.slots = {}; this.timers = {}; this.closed = false; this.busy = {};
    var self = this;
    this.attach.slots.forEach(function (s) { self.slots[s] = { id: null, base: null, dirty: false }; });
    frame.on('change', function (m) { self.markDirty(m.slot); });
    frame.on('save-request', function (m) { self.save(m.slot, { commit: true, toast: true }); });
  }
  Session.prototype.status = function (slot, state, message) { if (this.hooks.status) this.hooks.status(slot, { state: state, at: Date.now(), message: message || '' }); };
  Session.prototype.project = function (slot) { var s = this.slots[slot]; return s && s.id ? this.svc.get(s.id) : Promise.resolve(null); };
  Session.prototype.open = function (project) {
    var self = this, slot = project.workType;
    if (!this.slots[slot]) return Promise.reject(Err('UNSUPPORTED', 'このエンジンでは開けない作品タイプです: ' + project.workType));
    return this.flush().then(function () { return self.attach.load(self.frame, project); }).then(function () {
      self.slots[slot] = { id: project.id, base: project.updatedAt, dirty: false };
      if (self.hooks.slot) self.hooks.slot(slot, project);
      self.status(slot, 'saved');
      return self.frame.call('show', slot).catch(function () { /* 表示切替は任意 */ });
    }).then(function () { return afterLoadChecks(self, project); });
  };
  function afterLoadChecks(self, p) {
    if (self.engineId !== 'logic' || p.workType !== 'machine') return null;
    var refs = ZS.engines.get('logic').machineRefs(p.engineData.payload);
    if (!refs.length) return null;
    return self.frame.call('missingRefs', refs).then(function (miss) {
      if (miss.length && self.hooks.warn) self.hooks.warn('この機械は回路の信号（' + miss.join(', ') + '）を参照していますが、現在の回路に見つかりません。対応する回路を Circuit Studio で開いてください。');
    }).catch(function () { /* 確認できなくても作業は続行 */ });
  }
  Session.prototype.markDirty = function (slot) {
    var self = this, s = this.slots[slot]; if (!s || this.closed) return;
    s.dirty = true; this.status(slot, 'dirty');
    clearTimeout(this.timers[slot]);
    this.timers[slot] = setTimeout(function () { self.save(slot, {}); }, 800);
  };
  /** opts: { commit: 版を確定する, toast } */
  Session.prototype.save = function (slot, opts) {
    var self = this, s = this.slots[slot]; opts = opts || {};
    if (!s) return Promise.resolve(null);
    clearTimeout(this.timers[slot]);
    // 同じスロットの保存が走っている間は直列化する（古い内容で新しい内容を上書きしない）
    var prev = this.busy[slot] || Promise.resolve();
    var run = prev.then(function () { return doSave(self, slot, opts); });
    this.busy[slot] = run.catch(function () { /* 次の保存は続けて行う */ });
    return run;
  };
  function doSave(self, slot, opts) {
    var s = self.slots[slot];
    self.status(slot, 'saving');
    return self.attach.snapshot(self.frame, slot).then(function (snap) {
      if (!s.id) {                       // まだ共通プロジェクトに結び付いていない画面 → 最初の変更で新規作成
        return extraDeps(self, slot, { engineData: { payload: snap.payload } }).then(function (deps) {
          return self.svc.create({ engine: self.engineId, workType: slot, title: snap.title || undefined, payload: snap.payload, dependencies: deps });
        }).then(function (p) {
          s.id = p.id; s.base = p.updatedAt; s.dirty = false; if (self.hooks.slot) self.hooks.slot(slot, p);
          return opts.commit ? self.svc.commitVersion(p.id) : p;
        });
      }
      return self.svc.get(s.id).then(function (cur) {
        if (!cur) throw Err('NOT_FOUND', '保存先のプロジェクトが削除されています。別のプロジェクトとして保存し直してください。');
        var p = clone(cur); p.engineData.payload = snap.payload; if (snap.title) p.title = snap.title;
        return extraDeps(self, slot, p).then(function (deps) { return self.svc.save(p, { baseUpdatedAt: s.base, extraDeps: deps, commit: opts.commit }); });
      }).then(function (r) {
        if (r.conflict) { s.id = r.project.id; s.base = r.project.updatedAt; if (self.hooks.conflict) self.hooks.conflict(r); if (self.hooks.slot) self.hooks.slot(slot, r.project); return r.project; }
        s.base = r.project.updatedAt; s.dirty = false; return r.project;
      });
    }).then(function (p) { self.status(slot, 'saved'); return p; }, function (e) { self.status(slot, 'error', U.explain(e)); throw e; });
  }
  function extraDeps(self, slot, p) {
    if (self.engineId !== 'logic' || slot !== 'machine') return Promise.resolve(undefined);
    var circ = self.slots.circuit;
    if (!circ || !circ.id || !ZS.engines.get('logic').machineRefs(p.engineData.payload).length) return Promise.resolve(undefined);
    return self.svc.get(circ.id).then(function (c) { return c ? [{ type: 'project', id: c.id, version: c.projectVersion, note: '機械が参照する回路' }] : undefined; });
  }
  /** 未保存の変更をすべて保存（画面を離れる／タブを閉じるとき） */
  Session.prototype.flush = function () {
    var self = this;
    return Promise.all(this.attach.slots.map(function (s) { return self.slots[s].dirty ? self.save(s, {}).catch(function () { /* 状態表示は status で済んでいる */ }) : null; }));
  };
  /** シェル側で名前などを変えたあと、保存の基準（更新日時）を取り直す */
  Session.prototype.rebase = function (slot) { var s = this.slots[slot], self = this; return s && s.id ? this.svc.get(s.id).then(function (p) { if (p) s.base = p.updatedAt; return p; }) : Promise.resolve(null); };
  Session.prototype.close = function () { var self = this; this.closed = true; Object.keys(this.timers).forEach(function (k) { clearTimeout(self.timers[k]); }); };
  H.Session = Session;

  /* ---------- 旧アプリの保存領域（読み取り専用） ---------- */
  /** 旧 Playground Zero の IndexedDB を読む。存在しなければ作らず null（databases() が使えない環境では null） */
  H.readLegacyZero = function () {
    if (!g.indexedDB || !g.indexedDB.databases) return Promise.resolve(null);
    return g.indexedDB.databases().then(function (list) {
      if (!list.some(function (d) { return d.name === 'playground-zero'; })) return null;
      return new Promise(function (resolve) {
        var req = g.indexedDB.open('playground-zero'); // バージョン指定なし = 既存を変更せず開く
        req.onupgradeneeded = function () { req.transaction.abort(); resolve(null); };
        req.onerror = function () { resolve(null); };
        req.onsuccess = function () {
          var db = req.result;
          try {
            if (!db.objectStoreNames.contains('projects')) { db.close(); return resolve(null); }
            var names = ['projects'].concat(db.objectStoreNames.contains('meta') ? ['meta'] : []), tx = db.transaction(names, 'readonly'), out = { records: [], meta: [] };
            var a = tx.objectStore('projects').getAll(); a.onsuccess = function () { out.records = a.result || []; };
            if (names.length > 1) { var b = tx.objectStore('meta').getAll(); b.onsuccess = function () { out.meta = (b.result || []).map(function (m) { return { id: m.key, value: m.value }; }); }; }
            tx.oncomplete = function () { db.close(); resolve(out); };
            tx.onerror = tx.onabort = function () { db.close(); resolve(null); };
          } catch (e) { try { db.close(); } catch (x) { /* noop */ } resolve(null); }
        };
      });
    }, function () { return null; });
  };
  H.legacyEnv = function () {
    return H.readLegacyZero().then(function (z) {
      var ls = null; try { ls = g.localStorage; } catch (e) { /* 利用不可 */ }
      return { localStorage: ls, zeroRecords: z ? z.records : [], zeroMeta: z ? z.meta : [] };
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
