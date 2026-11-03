/*
 * ZeroStudio — 共通プロジェクト形式（formatVersion 1）
 *
 * 共通メタデータ（このファイルが検証する）と、エンジン固有データ（engineData.payload）を分離します。
 * payload の中身はここでは解釈せず、「ただのデータ」に洗う（deepClean）ことと大きさの確認だけを行います。
 * 中身の検証は各エンジンのアダプター（zs-engines.js の validatePayload）が担当します。
 *
 * {
 *   format: 'zerostudio.project', formatVersion: 1,
 *   id, title, description, createdAt, updatedAt,           // ISO 8601
 *   engine, workType,                                        // 制作エンジンと作品タイプ
 *   projectVersion, versionHash,                             // 作品の版（保存した内容が変わるたびに +1）
 *   engineData: { schemaVersion, payload },                  // エンジン固有データ（不透明）
 *   assets: [{ id, version }],                               // 使用した共通ライブラリの素材・部品
 *   dependencies: [{ type, id?, version?, note?, detail? }], // 他プロジェクト等への依存
 *   derivedFrom: { projectId, projectVersion?, title? } | null,
 *   license: { id, holder?, url? }, visibility, author: { name }, tags[], thumb?, ext
 * }
 */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util;
  var Err = U.ZSError;
  var S = (ZS.schema = {});

  S.APP = 'zerostudio';
  S.APP_VERSION = '1.0.0';
  S.FORMAT = { PROJECT: 'zerostudio.project', LIBRARY: 'zerostudio.library-item', FILE: 'zerostudio.file', PUBLISH: 'zerostudio.publish' };
  S.VERSION = 1; // 共通形式の版。上げるときは migrations に移行処理を足す

  S.LIMITS = {
    title: 80, description: 500, tags: 10, tagLength: 24, author: 40, note: 200,
    projectBytes: 8 * 1024 * 1024,   // 1プロジェクトの作品データ
    libraryBytes: 5 * 1024 * 1024,   // 1素材
    importBytes: 50 * 1024 * 1024,   // 取り込みファイル
    importItems: 2000, thumbBytes: 90000, deps: 200, assets: 200, ext: 20000, detail: 2000, depth: 40
  };

  S.LICENSES = [
    { id: 'all-rights-reserved', label: 'すべての権利を留保' },
    { id: 'CC0-1.0', label: 'CC0（パブリックドメイン）' },
    { id: 'CC-BY-4.0', label: 'CC BY 4.0（表示）' },
    { id: 'CC-BY-SA-4.0', label: 'CC BY-SA 4.0（表示・継承）' },
    { id: 'CC-BY-NC-4.0', label: 'CC BY-NC 4.0（表示・非営利）' },
    { id: 'MIT', label: 'MIT' }
  ];
  // 'export-ready' は「公開用ファイルを書き出してよい」という印です。ローカルのままで、オンライン公開ではありません。
  S.VISIBILITY = ['private', 'export-ready'];

  var ID_RE = S.ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var KEY_RE = S.KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;
  var TAG_RE = /^[^\s<>"'`\\]{1,24}$/;
  var THUMB_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function int(v, min, max, fb) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min && v <= max ? v : fb; }

  /* ---------- 移行（将来 formatVersion を上げるとき用） ---------- */
  S.migrations = {}; // { 1: function (raw) { ...; raw.formatVersion = 2; return raw; } }
  S.migrate = function (raw) {
    var v = raw.formatVersion, guard = 0;
    while (int(v, 1, 1e6, 0) && v < S.VERSION && guard++ < 50) {
      var fn = S.migrations[v];
      if (!fn) throw Err('UNSUPPORTED', 'formatVersion ' + v + ' からの移行方法が登録されていません。');
      raw = fn(raw); v = raw.formatVersion;
    }
    return raw;
  };

  /* ---------- 小さな部品 ---------- */
  function cleanTags(list, warnings) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (typeof t !== 'string') return;
      t = t.trim();
      if (TAG_RE.test(t) && out.indexOf(t) < 0 && out.length < S.LIMITS.tags) out.push(t);
      else if (warnings) warnings.push('使えないタグを除外しました: ' + U.str(t, 12));
    });
    return out;
  }
  function cleanLicense(raw) {
    var known = S.LICENSES.map(function (l) { return l.id; });
    var lic = { id: 'all-rights-reserved' };
    if (isObj(raw)) {
      var id = U.str(raw.id, 40);
      if (known.indexOf(id) >= 0) lic.id = id;
      var holder = U.str(raw.holder, 80); if (holder) lic.holder = holder;
      var url = U.str(raw.url, 200); if (/^https?:\/\/[^\s<>"']+$/.test(url)) lic.url = url;
    }
    return lic;
  }
  function cleanAssets(list, warnings) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).slice(0, S.LIMITS.assets).forEach(function (a) {
      if (!isObj(a) || !ID_RE.test(a.id || '')) { if (warnings) warnings.push('素材参照を1件除外しました'); return; }
      var key = a.id + '@' + int(a.version, 1, 1e6, 1);
      if (seen[key]) return; seen[key] = 1;
      out.push({ id: a.id, version: int(a.version, 1, 1e6, 1) });
    });
    return out;
  }
  function cleanDeps(list, warnings) {
    var out = [];
    (Array.isArray(list) ? list : []).slice(0, S.LIMITS.deps).forEach(function (d) {
      if (!isObj(d)) return;
      var type = d.type === 'project' || d.type === 'library' || d.type === 'ref' ? d.type : null;
      if (!type) { if (warnings) warnings.push('未知の依存関係を除外しました'); return; }
      var o = { type: type };
      if (type !== 'ref') {
        if (!ID_RE.test(d.id || '')) { if (warnings) warnings.push('IDのない依存関係を除外しました'); return; }
        o.id = d.id;
        var v = int(d.version, 1, 1e6, null); if (v) o.version = v;
      }
      var note = U.str(d.note, S.LIMITS.note); if (note) o.note = note;
      if (isObj(d.detail)) {
        try {
          var det = U.deepClean(d.detail, { maxDepth: 6, maxString: 400 });
          if (U.byteLength(JSON.stringify(det)) <= S.LIMITS.detail) o.detail = det;
        } catch (e) { /* 大きすぎる detail は捨てる */ }
      }
      out.push(o);
    });
    return out;
  }
  function cleanDerived(raw) {
    if (!isObj(raw) || !ID_RE.test(raw.projectId || '')) return null;
    var o = { projectId: raw.projectId };
    var v = int(raw.projectVersion, 1, 1e6, null); if (v) o.projectVersion = v;
    var t = U.str(raw.title, S.LIMITS.title); if (t) o.title = t;
    return o;
  }

  /** 作品内容から「版の判定用ハッシュ」を作る（メタデータの変更では変わらない） */
  S.versionHash = function (p) {
    var eng = ZS.engines && ZS.engines.get && ZS.engines.get(p.engine);
    var d = eng && eng.hashPayload ? eng.hashPayload(p.engineData.payload) : p.engineData.payload; // 閲覧しただけで変わる項目は版の判定から除く
    return U.contentHash({ e: p.engine, w: p.workType, s: p.engineData.schemaVersion, d: d });
  };

  /**
   * 検証して、正規化した新しいオブジェクトを返す（入力は書き換えない）。
   * @returns {{ok:boolean, project:object|null, errors:string[], warnings:string[], future:boolean}}
   */
  S.sanitizeProject = function (input, opts) {
    opts = opts || {};
    var errors = [], warnings = [], L = S.LIMITS;
    var fail = function (m) { errors.push(m); return { ok: false, project: null, errors: errors, warnings: warnings, future: false }; };
    if (!isObj(input)) return fail('プロジェクトのデータがオブジェクトではありません。');
    var raw;
    try { raw = S.migrate(input); } catch (e) { return fail(U.explain(e)); }

    var future = int(raw.formatVersion, 1, 1e6, 0) > S.VERSION;
    if (!int(raw.formatVersion, 1, 1e6, 0)) return fail('formatVersion がありません。ZeroStudio のプロジェクトではない可能性があります。');
    if (future) warnings.push('このデータは新しい版（formatVersion ' + raw.formatVersion + '）です。読める項目だけを取り込みます。');

    var id = raw.id;
    if (!ID_RE.test(id || '')) {
      if (opts.assignId) id = U.newId('zsp'); else return fail('ID が不正です（英数字・_・- のみ、64文字まで）。');
    }
    if (!KEY_RE.test(raw.engine || '')) return fail('engine が不正です。');
    if (!KEY_RE.test(raw.workType || '')) return fail('workType が不正です。');
    if (!isObj(raw.engineData) || !isObj(raw.engineData.payload)) return fail('作品データ（engineData.payload）がありません。');

    var statsObj = { dropped: 0 }, payload;
    try { payload = U.deepClean(raw.engineData.payload, { maxDepth: L.depth, maxString: L.projectBytes }, statsObj); }
    catch (e) { return fail(U.explain(e)); }
    if (U.byteLength(JSON.stringify(payload)) > L.projectBytes) return fail('作品データが大きすぎます（上限 ' + Math.round(L.projectBytes / 1048576) + 'MB）。');
    if (statsObj.dropped) warnings.push('作品データから ' + statsObj.dropped + ' 件の危険または不正な値を取り除きました。');

    var now = U.nowIso();
    var created = U.isoOk(raw.createdAt) ? raw.createdAt : (warnings.push('作成日時が不正なため現在時刻にしました。'), now);
    var updated = U.isoOk(raw.updatedAt) ? raw.updatedAt : (warnings.push('更新日時が不正なため現在時刻にしました。'), now);

    var p = {
      format: S.FORMAT.PROJECT, formatVersion: Math.min(int(raw.formatVersion, 1, 1e6, 1), S.VERSION),
      id: id,
      title: U.str(raw.title, L.title, '') || '無題',
      description: U.str(raw.description, L.description),
      createdAt: created, updatedAt: updated,
      engine: raw.engine, workType: raw.workType,
      projectVersion: int(raw.projectVersion, 1, 1e6, 1),
      versionHash: U.str(raw.versionHash, 40),
      engineData: { schemaVersion: int(raw.engineData.schemaVersion, 0, 1e6, 1), payload: payload },
      assets: cleanAssets(raw.assets, warnings),
      dependencies: cleanDeps(raw.dependencies, warnings),
      derivedFrom: cleanDerived(raw.derivedFrom),
      license: cleanLicense(raw.license),
      visibility: S.VISIBILITY.indexOf(raw.visibility) >= 0 ? raw.visibility : 'private',
      author: { name: isObj(raw.author) ? U.str(raw.author.name, L.author) : '' },
      tags: cleanTags(raw.tags, warnings),
      ext: {}
    };
    if (typeof raw.thumb === 'string' && raw.thumb.length <= L.thumbBytes && THUMB_RE.test(raw.thumb)) p.thumb = raw.thumb;
    else if (raw.thumb) warnings.push('サムネイルを除外しました（形式または大きさが不正）。');
    if (isObj(raw.ext)) {
      try {
        var ext = U.deepClean(raw.ext, { maxDepth: 8, maxString: 4000 });
        if (U.byteLength(JSON.stringify(ext)) <= L.ext) p.ext = ext; else warnings.push('拡張情報（ext）が大きすぎるため除外しました。');
      } catch (e) { warnings.push('拡張情報（ext）を除外しました。'); }
    }
    return { ok: true, project: p, errors: errors, warnings: warnings, future: future };
  };

  /** 新規プロジェクトの組み立て（検証つき）。失敗時は ZSError('INVALID') */
  S.newProject = function (spec) {
    var now = U.nowIso();
    var raw = {
      format: S.FORMAT.PROJECT, formatVersion: S.VERSION, id: spec.id || U.newId('zsp', spec.rng),
      title: spec.title, description: spec.description || '', createdAt: now, updatedAt: now,
      engine: spec.engine, workType: spec.workType, projectVersion: 1,
      engineData: { schemaVersion: spec.schemaVersion === undefined ? 1 : spec.schemaVersion, payload: spec.payload },
      assets: spec.assets || [], dependencies: spec.dependencies || [], derivedFrom: spec.derivedFrom || null,
      license: spec.license || { id: 'all-rights-reserved' }, visibility: spec.visibility || 'private',
      author: spec.author || { name: '' }, tags: spec.tags || [], ext: spec.ext || {}
    };
    if (spec.thumb) raw.thumb = spec.thumb;
    var r = S.sanitizeProject(raw);
    if (!r.ok) throw Err('INVALID', r.errors.join(' '));
    r.project.versionHash = S.versionHash(r.project);
    return r.project;
  };

  /* ---------- 共通ライブラリ（素材・部品） ---------- */
  /**
   * { format:'zerostudio.library-item', formatVersion:1, id, kind, name, description, tags,
   *   createdAt, updatedAt, version, origin:{engine?, projectId?}, license, mime?, data }
   * kind の例: image / pixel-art / circuit / machine / cpu-program / text（登録式。新しい kind も追加できる）
   */
  S.sanitizeLibraryItem = function (input, opts) {
    opts = opts || {};
    var errors = [], warnings = [], L = S.LIMITS;
    var fail = function (m) { errors.push(m); return { ok: false, item: null, errors: errors, warnings: warnings }; };
    if (!isObj(input)) return fail('素材のデータがオブジェクトではありません。');
    var id = input.id;
    if (!ID_RE.test(id || '')) { if (opts.assignId) id = U.newId('zsl'); else return fail('素材ID が不正です。'); }
    if (!KEY_RE.test(input.kind || '')) return fail('素材の種類（kind）が不正です。');
    if (!isObj(input.data)) return fail('素材データ（data）がありません。');
    var data;
    try { data = U.deepClean(input.data, { maxDepth: L.depth, maxString: L.libraryBytes }); } catch (e) { return fail(U.explain(e)); }
    if (U.byteLength(JSON.stringify(data)) > L.libraryBytes) return fail('素材が大きすぎます（上限 ' + Math.round(L.libraryBytes / 1048576) + 'MB）。');
    var now = U.nowIso();
    var it = {
      format: S.FORMAT.LIBRARY, formatVersion: S.VERSION, id: id, kind: input.kind,
      name: U.str(input.name, L.title, '') || '無題の素材', description: U.str(input.description, L.description),
      tags: cleanTags(input.tags, warnings),
      createdAt: U.isoOk(input.createdAt) ? input.createdAt : now, updatedAt: U.isoOk(input.updatedAt) ? input.updatedAt : now,
      version: int(input.version, 1, 1e6, 1),
      origin: {}, license: cleanLicense(input.license), data: data
    };
    if (isObj(input.origin)) {
      if (KEY_RE.test(input.origin.engine || '')) it.origin.engine = input.origin.engine;
      if (ID_RE.test(input.origin.projectId || '')) it.origin.projectId = input.origin.projectId;
    }
    if (typeof input.mime === 'string' && /^[a-z]+\/[a-z0-9.+-]{1,40}$/.test(input.mime)) it.mime = input.mime;
    return { ok: true, item: it, errors: errors, warnings: warnings };
  };
  S.newLibraryItem = function (spec) {
    var now = U.nowIso();
    var r = S.sanitizeLibraryItem({
      id: spec.id || U.newId('zsl', spec.rng), kind: spec.kind, name: spec.name, description: spec.description,
      tags: spec.tags, createdAt: now, updatedAt: now, version: 1, origin: spec.origin, license: spec.license, mime: spec.mime, data: spec.data
    });
    if (!r.ok) throw Err('INVALID', r.errors.join(' '));
    return r.item;
  };

  /* ---------- ファイル（書き出し／取り込みの入れ物） ---------- */
  /** kind: 'project'（1件）/ 'bundle'（複数）/ 'backup'（全件） */
  S.buildFile = function (kind, projects, library, extra) {
    var f = {
      app: S.APP, format: S.FORMAT.FILE, formatVersion: S.VERSION, appVersion: S.APP_VERSION,
      exportedAt: U.nowIso(), kind: kind, projects: projects || [], library: library || []
    };
    if (extra) Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
    return f;
  };
  /**
   * 将来の Zero への投稿用パッケージ。ローカルファイルであり、オンライン公開ではありません。
   * 参照している素材を同梱し、内容の SHA-256 を添えます。
   */
  S.buildPublish = function (project, libraryItems) {
    var body = { project: project, library: libraryItems || [] };
    return U.sha256(JSON.stringify(body)).then(function (hash) {
      return {
        app: S.APP, format: S.FORMAT.PUBLISH, formatVersion: S.VERSION, appVersion: S.APP_VERSION,
        exportedAt: U.nowIso(), online: false,
        note: 'このファイルはローカルに書き出された公開用データです。オンライン公開は行われません。',
        integrity: { algorithm: 'SHA-256', hash: hash, of: 'JSON.stringify({project, library})' },
        project: project, library: libraryItems || []
      };
    });
  };
  /** 受け取った JSON が何のファイルかを判定する（中身の検証は別） */
  S.classify = function (j) {
    if (!isObj(j)) return 'unknown';
    if (j.format === S.FORMAT.FILE && Array.isArray(j.projects)) return 'zs-file';
    if (j.format === S.FORMAT.PUBLISH && isObj(j.project)) return 'zs-publish';
    if (j.format === S.FORMAT.PROJECT && isObj(j.engineData)) return 'zs-project';
    if (j.format === S.FORMAT.LIBRARY && isObj(j.data)) return 'zs-library';
    if (j.app === 'playground-zero' && Array.isArray(j.projects)) return 'zero-backup';
    if (j.app === 'playground-zero') return 'zero-package';
    return 'unknown';
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
