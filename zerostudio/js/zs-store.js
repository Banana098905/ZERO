/*
 * ZeroStudio — 保存層
 *   コレクション: projects（共通プロジェクト）/ library（素材・部品）/ meta（設定・Zero の付随データ）
 *   バックエンド: IndexedDB（本命）→ localStorage（容量小）→ メモリ（最後の手段・UIで警告）
 *   どのバックエンドも同じ Promise インターフェース。キャッシュは持たず、常に保存先を読む
 *   （別タブ／iframe が書いた内容と食い違わないため）。
 *
 *   repo: { kind, all(coll), get(coll,key), put(coll,rec), del(coll,key), persist(), estimate() }
 */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util;
  var Err = U.ZSError;
  var St = (ZS.store = {});
  var COLLS = ['projects', 'library', 'meta'];
  St.DB_NAME = 'zerostudio-v1';
  St.LS_PREFIX = 'zs1:';

  function keyOf(coll, rec) { return coll === 'meta' ? rec.id : rec.id; }
  function wrapQuota(e) { return U.isQuotaError(e) ? Err('QUOTA', U.explain(e), { inner: e && e.name }) : e; }

  /* ---------- メモリ ---------- */
  function MemoryRepo() { this.kind = 'memory'; this.d = { projects: {}, library: {}, meta: {} }; }
  MemoryRepo.prototype.all = function (c) { var d = this.d[c]; return Promise.resolve(Object.keys(d).map(function (k) { return JSON.parse(d[k]); })); };
  MemoryRepo.prototype.get = function (c, k) { var s = this.d[c][k]; return Promise.resolve(s === undefined ? null : JSON.parse(s)); };
  MemoryRepo.prototype.put = function (c, r) { this.d[c][keyOf(c, r)] = JSON.stringify(r); return Promise.resolve(); };
  MemoryRepo.prototype.del = function (c, k) { delete this.d[c][k]; return Promise.resolve(); };
  MemoryRepo.prototype.persist = function () { return Promise.resolve(false); };
  MemoryRepo.prototype.estimate = function () { return Promise.resolve(null); };

  /* ---------- localStorage（コレクションごとに1キー） ---------- */
  function LocalRepo() { this.kind = 'localstorage'; }
  LocalRepo.probe = function () {
    try { localStorage.setItem(St.LS_PREFIX + 'probe', '1'); localStorage.removeItem(St.LS_PREFIX + 'probe'); return true; } catch (e) { return false; }
  };
  LocalRepo.prototype._read = function (c) {
    var key = St.LS_PREFIX + c, raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { throw Err('STORAGE', 'localStorage を読めません。'); }
    if (!raw) return {};
    try { var o = JSON.parse(raw); if (o && typeof o === 'object' && !Array.isArray(o)) return o; throw 0; }
    catch (e) {
      // 壊れている。上書きして失う前に、別キーへ退避してから空として扱う
      try { localStorage.setItem(St.LS_PREFIX + 'corrupt:' + c + ':' + Date.now(), raw); } catch (e2) { /* 退避も無理なら諦める */ }
      return {};
    }
  };
  LocalRepo.prototype._write = function (c, m) {
    try { localStorage.setItem(St.LS_PREFIX + c, JSON.stringify(m)); return Promise.resolve(); }
    catch (e) { return Promise.reject(wrapQuota(e)); }
  };
  LocalRepo.prototype.all = function (c) { var m; try { m = this._read(c); } catch (e) { return Promise.reject(e); } return Promise.resolve(Object.keys(m).map(function (k) { return m[k]; })); };
  LocalRepo.prototype.get = function (c, k) { var m; try { m = this._read(c); } catch (e) { return Promise.reject(e); } return Promise.resolve(m[k] === undefined ? null : m[k]); };
  LocalRepo.prototype.put = function (c, r) { var m; try { m = this._read(c); } catch (e) { return Promise.reject(e); } m[keyOf(c, r)] = r; return this._write(c, m); };
  LocalRepo.prototype.del = function (c, k) { var m; try { m = this._read(c); } catch (e) { return Promise.reject(e); } delete m[k]; return this._write(c, m); };
  LocalRepo.prototype.persist = function () { return Promise.resolve(false); };
  LocalRepo.prototype.estimate = function () { return Promise.resolve(null); };

  /* ---------- IndexedDB ---------- */
  function IdbRepo(db) { this.kind = 'indexeddb'; this.db = db; }
  function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function txP(tx) { return new Promise(function (res, rej) { tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(wrapQuota(tx.error)); }; tx.onabort = function () { rej(wrapQuota(tx.error) || new Error('IndexedDB transaction aborted')); }; }); }
  IdbRepo.prototype._tx = function (c, mode) {
    try { return mode === 'readwrite' ? this.db.transaction(c, mode, { durability: 'strict' }) : this.db.transaction(c, mode); }
    catch (e) { return this.db.transaction(c, mode); }
  };
  IdbRepo.prototype.all = function (c) { return reqP(this._tx(c, 'readonly').objectStore(c).getAll()); };
  IdbRepo.prototype.get = function (c, k) { return reqP(this._tx(c, 'readonly').objectStore(c).get(k)).then(function (r) { return r || null; }); };
  // 書き込みが同期的に例外を投げても（容量・データ不正など）、必ず Promise の拒否として返す
  IdbRepo.prototype.put = function (c, r) { try { var tx = this._tx(c, 'readwrite'); tx.objectStore(c).put(r); return txP(tx); } catch (e) { return Promise.reject(wrapQuota(e)); } };
  IdbRepo.prototype.del = function (c, k) { try { var tx = this._tx(c, 'readwrite'); tx.objectStore(c).delete(k); return txP(tx); } catch (e) { return Promise.reject(wrapQuota(e)); } };
  IdbRepo.prototype.persist = function () {
    var s = g.navigator && g.navigator.storage;
    if (!s || !s.persist) return Promise.resolve(false);
    return s.persisted().then(function (a) { return a ? true : s.persist(); }).catch(function () { return false; });
  };
  IdbRepo.prototype.estimate = function () {
    var s = g.navigator && g.navigator.storage;
    return s && s.estimate ? s.estimate().then(function (e) { return { usage: e.usage, quota: e.quota }; }).catch(function () { return null; }) : Promise.resolve(null);
  };
  IdbRepo.open = function (name) {
    return new Promise(function (resolve, reject) {
      if (!g.indexedDB) return reject(new Error('IndexedDB is not available'));
      var req; try { req = g.indexedDB.open(name, 1); } catch (e) { return reject(e); }
      var done = false, timer = setTimeout(function () { if (!done) { done = true; reject(new Error('IndexedDB open timeout')); } }, 5000);
      req.onupgradeneeded = function () {
        var db = req.result;
        COLLS.forEach(function (c) { if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' }); });
      };
      req.onerror = function () { if (done) return; done = true; clearTimeout(timer); reject(req.error || new Error('IndexedDB open error')); };
      req.onsuccess = function () {
        if (done) { try { req.result.close(); } catch (e) { /* noop */ } return; }
        done = true; clearTimeout(timer);
        var db = req.result; db.onversionchange = function () { db.close(); };
        var repo = new IdbRepo(db);
        // 書き込み確認（プライベートモード等では open できても書けないことがある）
        repo.put('meta', { id: '__probe', value: Date.now() }).then(function () { resolve(repo); }, reject);
      };
    });
  };

  St.MemoryRepo = MemoryRepo; St.LocalRepo = LocalRepo; St.IdbRepo = IdbRepo;

  /* ---------- 公開インターフェース ---------- */
  function Store(repo) {
    var self = this;
    this.repo = repo; this.kind = repo.kind; this.src = U.newId('src');
    this._subs = [];
    this._chan = null;
    if (typeof g.BroadcastChannel === 'function') {
      try {
        this._chan = new g.BroadcastChannel('zerostudio-v1');
        this._chan.onmessage = function (e) {
          var m = e.data;
          if (!m || m.src === self.src) return;
          self._subs.slice().forEach(function (f) { try { f(m, true); } catch (x) { /* 購読側の例外で止めない */ } });
        };
      } catch (e) { this._chan = null; }
      if (this._chan && this._chan.unref) this._chan.unref(); /*cleanup-hook*/ // Node: 開いたままでもプロセスを止めない
    }
  }
  Store.prototype._emit = function (coll, op, id) {
    var m = { coll: coll, op: op, id: id, src: this.src };
    this._subs.slice().forEach(function (f) { try { f(m, false); } catch (x) { /* noop */ } });
    if (this._chan) { try { this._chan.postMessage(m); } catch (e) { /* noop */ } }
  };
  /** 変更通知を購読。cb(msg, fromOtherContext)。解除関数を返す */
  Store.prototype.onChange = function (cb) {
    var s = this._subs; s.push(cb);
    return function () { var i = s.indexOf(cb); if (i >= 0) s.splice(i, 1); };
  };
  Store.prototype.close = function () { if (this._chan) { try { this._chan.close(); } catch (e) { /* noop */ } } if (this.repo.db) { try { this.repo.db.close(); } catch (e) { /* noop */ } } };

  // コレクション操作（書き込み後に通知する）
  Store.prototype.all = function (coll) { return this.repo.all(coll).then(function (a) { return coll === 'meta' ? a.filter(function (r) { return r.id !== '__probe'; }) : a; }); };
  Store.prototype.get = function (coll, id) { return this.repo.get(coll, id); };
  Store.prototype.put = function (coll, rec) {
    var self = this;
    if (!rec || typeof rec.id !== 'string' || !rec.id) return Promise.reject(Err('INVALID', '保存するデータに id がありません。'));
    return this.repo.put(coll, rec).then(function () { self._emit(coll, 'put', rec.id); }, function (e) { throw wrapQuota(e); });
  };
  Store.prototype.del = function (coll, id) {
    var self = this;
    return this.repo.del(coll, id).then(function () { self._emit(coll, 'del', id); });
  };
  Store.prototype.exists = function (coll, id) { return this.repo.get(coll, id).then(function (r) { return !!r; }); };
  /** meta の読み書き（値は JSON として保存できるものだけ） */
  Store.prototype.getMeta = function (key, fb) { return this.repo.get('meta', key).then(function (r) { return r ? r.value : (fb === undefined ? null : fb); }); };
  Store.prototype.setMeta = function (key, value) { return this.put('meta', { id: key, value: value }); };
  Store.prototype.delMeta = function (key) { return this.del('meta', key); };
  Store.prototype.metaKeys = function (prefix) { return this.all('meta').then(function (a) { return a.map(function (r) { return r.id; }).filter(function (k) { return !prefix || k.indexOf(prefix) === 0; }); }); };
  Store.prototype.persist = function () { return this.repo.persist(); };
  Store.prototype.estimate = function () { return this.repo.estimate(); };
  Store.prototype.health = function () {
    var k = this.kind;
    return { kind: k, ok: k === 'indexeddb', label: k === 'indexeddb' ? 'IndexedDB' : k === 'localstorage' ? 'localStorage（容量が小さい）' : 'メモリのみ（保存されません）' };
  };

  St.Store = Store;
  /** 保存先を選んで開く。opts.backend = 'memory' でテスト用に強制できる */
  St.open = function (opts) {
    opts = opts || {};
    if (opts.backend === 'memory') return Promise.resolve(new Store(new MemoryRepo()));
    return IdbRepo.open(opts.dbName || St.DB_NAME).then(function (r) { return new Store(r); }, function (err) {
      if (g.console) console.warn('[ZS] IndexedDB を使えません。代替保存を使います:', err && err.message);
      if (LocalRepo.probe()) return new Store(new LocalRepo());
      return new Store(new MemoryRepo());
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
