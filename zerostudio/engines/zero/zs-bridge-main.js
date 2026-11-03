/*
 * Zero Engine ブリッジ（PLAYGROUND ZERO ↔ ZeroStudio）
 * Zero の保存層は Repo インターフェースで差し替え可能（docs/ARCHITECTURE.md「クラウド保存への移行」）。
 * ここでは Zero の作品を ZeroStudio の共通プロジェクト（engine:'zero'）として共通ストアに保存する Repo を用意し、
 * PZ.storage.open だけを差し替える。Zero の元コードは1行も変更しない。
 * ?zs=1 付きで開かれたときだけ有効（付かなければ、従来どおり Zero 自身の IndexedDB を使う単体動作）。
 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('zs') !== '1') return;
  var ZS = window.ZS, PZ = window.PZ;
  if (!ZS || !ZS.store || !ZS.engines || !PZ || !PZ.storage) { console.error('[ZS] 共通モジュールを読み込めないため、Zero の単体保存で動作します。'); return; }
  var S = ZS.schema, U = ZS.util, ZMAP = ZS.engines.zeroMap;

  function send(type, data) { try { window.parent.postMessage(Object.assign({ zs: 1, engine: 'zero', type: type }, data || {}), location.origin); } catch (e) { /* 単体表示 */ } }

  /** Zero の Repo インターフェース（list/get/put/remove/getMeta/setMeta/persist/kind）を共通ストアで実装 */
  function ZSRepo(store) { this.kind = store.kind; this.store = store; }
  var isZero = function (r) { return !!r && r.engine === 'zero' && r.engineData && r.engineData.payload; };
  ZSRepo.prototype.list = function () { return this.store.all('projects').then(function (rows) { return rows.filter(isZero).map(ZMAP.unwrap); }); };
  ZSRepo.prototype.get = function (id) { return this.store.get('projects', id).then(function (r) { return isZero(r) ? ZMAP.unwrap(r) : null; }); };
  ZSRepo.prototype.put = function (rec) {
    var st = this.store;
    return st.get('projects', rec && rec.id).then(function (raw) {
      var existing = null;
      if (raw) {
        var r = S.sanitizeProject(raw);
        if (!r.ok) throw U.ZSError('STORAGE', '保存先の既存データが壊れているため、上書きしません。ZeroStudio のプロジェクト画面でバックアップを書き出してください。');
        existing = r.project;
      }
      return st.put('projects', ZMAP.wrap(rec, existing));
    });
  };
  ZSRepo.prototype.remove = function (id) {
    var st = this.store;
    return st.get('projects', id).then(function (r) { if (isZero(r)) return st.del('projects', id); });
  };
  ZSRepo.prototype.getMeta = function (key) { return this.store.getMeta('zero:' + key, null); };
  ZSRepo.prototype.setMeta = function (key, value) { return this.store.setMeta('zero:' + key, value); };
  ZSRepo.prototype.persist = function () { return this.store.persist(); };

  PZ.storage.open = function () { return ZS.store.open().then(function (store) { return new ZSRepo(store); }); };

  function currentWork() {
    var raw = (location.hash || '').replace(/^#/, ''), qi = raw.indexOf('?'), path = qi < 0 ? raw : raw.slice(0, qi), q = qi < 0 ? '' : raw.slice(qi + 1);
    var m = /^\/studio\/([^/]+)$/.exec(path);
    if (m && m[1] !== 'new') { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    var w = /(?:^|&)work=([^&]+)/.exec(q);
    if (w) { try { return decodeURIComponent(w[1]); } catch (e) { return w[1]; } }
    return null;
  }

  var api = {
    engine: 'zero', version: 1, ready: false,
    currentWork: currentWork,
    getMode: function () { return 'zero'; },
    open: function (record) { var href = PZ.projects.hrefFor(record); location.hash = '#' + href; },
    navigate: function (path) { location.hash = '#' + path; },
    /** Zero のバックアップ（app:'playground-zero'）を Zero 自身の検証・取り込みで共通ストアへ入れる */
    importBackup: function (json) { return PZ.projects.importBackup(json); },
    inspectBackup: function (json) { return PZ.projects.inspectBackup(json).then(function (r) { return { ok: r.ok, error: r.error, count: r.items ? r.items.length : 0, invalid: r.invalid }; }); },
    suspend: function () { /* Zero は画面離脱時に自身で保存する（router の cleanup） */ }
  };
  window.ZSBridge = api;

  window.addEventListener('hashchange', function () { send('route', { work: currentWork(), hash: location.hash }); });
  var tries = 0, t = setInterval(function () {
    var ok = false; try { ok = PZ.projects && PZ.projects.kind() !== 'none'; } catch (e) { /* まだ初期化中 */ }
    if (ok || ++tries > 200) { clearInterval(t); api.ready = ok; send(ok ? 'ready' : 'error', ok ? { work: currentWork() } : { message: 'Zero の保存層を初期化できませんでした。' }); }
  }, 50);
})();
