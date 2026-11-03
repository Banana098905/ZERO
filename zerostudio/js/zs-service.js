/*
 * ZeroStudio — サービス層（UI からは保存先の実装を意識せず、ここだけを呼ぶ）
 *
 * 将来 Zero のオンラインAPIに接続するときは、同じメソッドを持つ「RemoteProvider」を用意してここを差し替えます。
 * V1 は LocalProvider（このブラウザ内）のみで、オンライン機能は実装していません。
 * ZS.service.PROVIDER で現在の種類を取得できます（UI は 'local' のとき「ローカル保存」と表示する）。
 */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util, S = ZS.schema, E = ZS.engines, Err = U.ZSError;

  var DEFAULT_SETTINGS = { authorName: '', defaultLicense: 'all-rights-reserved', backupReminderDays: 7 };

  ZS.createService = function (store, deps) {
    deps = deps || {};
    var svc = { provider: 'local', store: store };

    /* ---------- 設定 ---------- */
    svc.settings = function () {
      return store.getMeta('settings', null).then(function (s) {
        var o = Object.assign({}, DEFAULT_SETTINGS, s && typeof s === 'object' ? s : {});
        o.authorName = U.str(o.authorName, S.LIMITS.author);
        if (!S.LICENSES.some(function (l) { return l.id === o.defaultLicense; })) o.defaultLicense = DEFAULT_SETTINGS.defaultLicense;
        o.backupReminderDays = typeof o.backupReminderDays === 'number' && o.backupReminderDays >= 0 && o.backupReminderDays <= 365 ? Math.floor(o.backupReminderDays) : 7;
        return o;
      });
    };
    svc.saveSettings = function (patch) { return svc.settings().then(function (o) { return store.setMeta('settings', Object.assign(o, patch)); }).then(svc.settings); };
    svc.lastBackupAt = function () { return store.getMeta('lastBackupAt', null); };

    /* ---------- 読み取り ---------- */
    function readAll() {
      return store.all('projects').then(function (rows) {
        var ok = [], problems = [];
        rows.forEach(function (raw) {
          var r = S.sanitizeProject(raw);
          if (r.ok) ok.push(r.project); else problems.push({ id: raw && raw.id, errors: r.errors, raw: raw });
        });
        return { projects: ok, problems: problems };
      });
    }
    /** filter: { engine, workType, q, sort: 'updated'|'created'|'title'|'version', dir: 'asc'|'desc' } */
    svc.list = function (filter) {
      filter = filter || {};
      return readAll().then(function (r) {
        var q = (filter.q || '').trim().toLowerCase(), list = r.projects;
        if (filter.engine) list = list.filter(function (p) { return p.engine === filter.engine; });
        if (filter.workType) list = list.filter(function (p) { return p.workType === filter.workType; });
        if (q) list = list.filter(function (p) {
          return p.title.toLowerCase().indexOf(q) >= 0 || p.description.toLowerCase().indexOf(q) >= 0 || p.id.toLowerCase().indexOf(q) >= 0 ||
            p.tags.some(function (t) { return t.toLowerCase().indexOf(q) >= 0; });
        });
        var key = filter.sort || 'updated', dir = filter.dir ? (filter.dir === 'asc' ? 1 : -1) : (key === 'title' ? 1 : -1);
        list.sort(function (a, b) {
          var x = key === 'title' ? a.title.localeCompare(b.title, 'ja') : key === 'version' ? a.projectVersion - b.projectVersion : key === 'created' ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
          return (x || a.id.localeCompare(b.id)) * dir;
        });
        return { projects: list, problems: r.problems };
      });
    };
    svc.get = function (id) {
      return store.get('projects', id).then(function (raw) {
        if (!raw) return null;
        var r = S.sanitizeProject(raw);
        if (!r.ok) throw Err('INVALID', 'このプロジェクトは読み込めません: ' + r.errors.join(' '), { raw: raw });
        return r.project;
      });
    };

    /* ---------- 作成・保存 ---------- */
    function putChecked(p) {
      var r = S.sanitizeProject(p);
      if (!r.ok) return Promise.reject(Err('INVALID', r.errors.join(' ')));
      return store.put('projects', r.project).then(function () { return r.project; });
    }
    /** spec: { engine, workType, title?, payload?, schemaVersion?, ... } */
    svc.create = function (spec) {
      var eng = E.get(spec.engine);
      if (!eng) return Promise.reject(Err('UNSUPPORTED', '未対応のエンジンです: ' + spec.engine));
      var wt = E.workType(spec.engine, spec.workType);
      if (!wt) return Promise.reject(Err('UNSUPPORTED', '未対応の作品タイプです: ' + spec.workType));
      return svc.settings().then(function (st) {
        var payload = spec.payload || eng.defaultPayload(spec.workType);
        var v = eng.validatePayload(spec.workType, wt.schemaVersion, payload);
        if (!v.ok) throw Err('INVALID', v.errors.join(' '));
        var id = spec.id;
        return (id ? Promise.resolve(id) : U.uniqueId(spec.engine === 'zero' ? 'p' : 'zsp', function (x) { return store.exists('projects', x); }, deps.rng)).then(function (newId) {
          if (spec.engine === 'zero' && !spec.id) { v.payload.id = newId; }
          var p = S.newProject({
            id: newId, engine: spec.engine, workType: spec.workType, title: spec.title || ('無題の' + wt.label), description: spec.description,
            schemaVersion: spec.schemaVersion || wt.schemaVersion, payload: v.payload, derivedFrom: spec.derivedFrom, tags: spec.tags,
            license: spec.license || { id: st.defaultLicense, holder: st.authorName }, author: spec.author || { name: st.authorName }, ext: spec.ext,
            assets: spec.assets, dependencies: spec.dependencies
          });
          if (spec.createdAt && U.isoOk(spec.createdAt)) p.createdAt = spec.createdAt;
          if (spec.updatedAt && U.isoOk(spec.updatedAt)) p.updatedAt = spec.updatedAt;
          if (spec.engine === 'zero') { v.payload.name = p.title; }
          // 作成時にも、素材参照・依存関係を内容から求める（保存時と同じ規則）。利用者由来の記録（他プロジェクトへの依存・素材由来）は残す
          p.assets = eng.scanAssets(p);
          p.dependencies = eng.scanDependencies(p).concat(p.dependencies.filter(function (d) { return d.type === 'project' || (d.detail && d.detail.managed === 'provenance'); }));
          return putChecked(p);
        });
      });
    };

    function mergeDeps(project, eng, extra, stored) {
      var scanned = eng ? eng.scanDependencies(project) : (stored ? stored.dependencies.filter(function (d) { return d.type !== 'project'; }) : []);
      // 利用者の操作で付いた記録（他プロジェクトへの依存、素材から作成した由来 detail.managed='provenance'）は再計算で消さない
      var keepProj = (stored ? stored.dependencies : project.dependencies).filter(function (d) { return d.type === 'project' || (d.detail && d.detail.managed === 'provenance'); });
      var extraProj = (extra || []).some(function (d) { return d.type === 'project'; });
      var kept = keepProj.filter(function (d) { return d.type !== 'project' || !extraProj; });
      return scanned.concat(kept, extra || []);
    }
    /**
     * 保存。opts: { baseUpdatedAt（読み込み時の更新日時。別タブが先に更新していたら競合）, extraDeps, commit }
     * 競合時は既存を上書きせず「競合コピー」として別プロジェクトに保存し、{ conflict: true, project: コピー } を返す。
     */
    svc.save = function (project, opts) {
      opts = opts || {};
      var eng = E.get(project.engine);
      return store.get('projects', project.id).then(function (storedRaw) {
        var storedR = storedRaw ? S.sanitizeProject(storedRaw) : null, stored = storedR && storedR.ok ? storedR.project : null;
        if (storedRaw && !stored) throw Err('INVALID', '保存先の既存データが壊れているため、上書きしません。先にバックアップを書き出してください。');
        var payload = project.engineData.payload;
        if (eng) {
          var v = eng.validatePayload(project.workType, project.engineData.schemaVersion, payload);
          if (!v.ok) throw Err('INVALID', v.errors.join(' '));
          payload = v.payload;
        }
        if (stored && opts.baseUpdatedAt && stored.updatedAt !== opts.baseUpdatedAt) {
          return copyOf(project, '（競合コピー）', stored).then(function (c) { return { conflict: true, project: c, original: stored }; });
        }
        var next = U.clone(project);
        next.engineData.payload = payload;
        var now = Date.now(), prev = stored ? Date.parse(stored.updatedAt) : 0;
        next.updatedAt = new Date(now > prev ? now : prev + 1).toISOString();
        next.assets = eng ? eng.scanAssets(next) : (stored ? stored.assets : next.assets);
        next.dependencies = mergeDeps(next, eng, opts.extraDeps, stored);
        if (stored) { next.createdAt = stored.createdAt; next.projectVersion = stored.projectVersion; next.versionHash = stored.versionHash; }
        var chain = putChecked(next);
        return (opts.commit ? chain.then(function (p) { return svc.commitVersion(p.id); }) : chain).then(function (p) { return { conflict: false, project: p }; });
      });
    };
    /** 内容が前回の版から変わっていれば版を +1 する（書き出し・複製・明示的な保存・公開用書き出しの直前に呼ぶ） */
    svc.commitVersion = function (id) {
      return svc.get(id).then(function (p) {
        if (!p) throw Err('NOT_FOUND', 'プロジェクトが見つかりません。');
        var h = S.versionHash(p);
        if (h === p.versionHash) return p;
        p.versionHash = h; p.projectVersion = Math.min(p.projectVersion + 1, 1e6);
        return putChecked(p);
      });
    };
    svc.update = function (id, fields) {
      return svc.get(id).then(function (p) {
        if (!p) throw Err('NOT_FOUND', 'プロジェクトが見つかりません。');
        ['title', 'description', 'tags', 'license', 'visibility', 'author'].forEach(function (k) { if (fields[k] !== undefined) p[k] = fields[k]; });
        if (fields.title !== undefined && p.engine === 'zero') { p.engineData.payload.name = U.str(fields.title, S.LIMITS.title, '無題'); }
        p.updatedAt = new Date(Math.max(Date.now(), Date.parse(p.updatedAt) + 1)).toISOString();
        return putChecked(p);
      });
    };
    svc.rename = function (id, title) {
      title = U.str(title, S.LIMITS.title);
      if (!title) return Promise.reject(Err('INVALID', '名前を入力してください。'));
      return svc.update(id, { title: title });
    };

    function copyOf(src, suffix, parent) {
      var eng = E.get(src.engine);
      return U.uniqueId(src.engine === 'zero' ? 'p' : 'zsp', function (x) { return store.exists('projects', x); }, deps.rng).then(function (newId) {
        var c = U.clone(src), now = U.nowIso(), title = U.str(src.title + suffix, S.LIMITS.title);
        c.id = newId; c.title = title; c.createdAt = now; c.updatedAt = now; c.projectVersion = 1;
        c.derivedFrom = { projectId: (parent || src).id, projectVersion: (parent || src).projectVersion, title: (parent || src).title };
        if (eng && eng.prepareCopy) c.engineData.payload = eng.prepareCopy(c.engineData.payload, newId, title, (parent || src).id);
        c.versionHash = S.versionHash(c);
        c.ext = Object.assign({}, c.ext); delete c.ext.legacy;
        return putChecked(c);
      });
    }
    /** 複製。元プロジェクトの版を確定してから、その版を派生元として記録する */
    svc.duplicate = function (id, opts) {
      return svc.commitVersion(id).then(function (src) { return copyOf(src, (opts && opts.suffix) || ' のコピー', null); });
    };
    svc.remove = function (id) {
      return store.get('projects', id).then(function (raw) {
        if (!raw) throw Err('NOT_FOUND', 'プロジェクトが見つかりません。');
        return store.del('projects', id).then(function () { return raw; });
      });
    };
    svc.restoreRaw = function (raw) { return store.exists('projects', raw.id).then(function (e) { if (e) throw Err('CONFLICT', '同じ ID のプロジェクトが既にあります。'); return store.put('projects', raw); }); };

    /* ---------- 共通ライブラリ ---------- */
    svc.libList = function (filter) {
      filter = filter || {};
      return store.all('library').then(function (rows) {
        var out = [], bad = [];
        rows.forEach(function (raw) { var r = S.sanitizeLibraryItem(raw); if (r.ok) out.push(r.item); else bad.push({ id: raw && raw.id, errors: r.errors }); });
        if (filter.kind) out = out.filter(function (i) { return i.kind === filter.kind; });
        var q = (filter.q || '').trim().toLowerCase();
        if (q) out = out.filter(function (i) { return i.name.toLowerCase().indexOf(q) >= 0 || i.tags.some(function (t) { return t.toLowerCase().indexOf(q) >= 0; }); });
        out.sort(function (a, b) { return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id); });
        return { items: out, problems: bad };
      });
    };
    svc.libGet = function (id) { return store.get('library', id).then(function (raw) { if (!raw) return null; var r = S.sanitizeLibraryItem(raw); return r.ok ? r.item : null; }); };
    svc.libRegister = function (spec) {
      return svc.settings().then(function (st) {
        return U.uniqueId('zsl', function (x) { return store.exists('library', x); }, deps.rng).then(function (id) {
          var it = S.newLibraryItem(Object.assign({}, spec, { id: id, license: spec.license || { id: st.defaultLicense, holder: st.authorName } }));
          return store.put('library', it).then(function () { return it; });
        });
      });
    };
    /** 内容（data）が変わったら版を +1。名前・説明・タグだけの変更では版は変わらない */
    svc.libUpdate = function (id, patch) {
      return svc.libGet(id).then(function (it) {
        if (!it) throw Err('NOT_FOUND', '素材が見つかりません。');
        var next = U.clone(it);
        ['name', 'description', 'tags', 'license'].forEach(function (k) { if (patch[k] !== undefined) next[k] = patch[k]; });
        if (patch.data !== undefined) { next.data = patch.data; if (U.contentHash(patch.data) !== U.contentHash(it.data)) next.version = it.version + 1; }
        next.updatedAt = new Date(Math.max(Date.now(), Date.parse(it.updatedAt) + 1)).toISOString();
        var r = S.sanitizeLibraryItem(next);
        if (!r.ok) throw Err('INVALID', r.errors.join(' '));
        return store.put('library', r.item).then(function () { return r.item; });
      });
    };
    svc.libRemove = function (id) { return store.del('library', id); };
    /** 素材を使っているプロジェクト（使用中の版つき） */
    svc.libUsage = function (id) {
      return readAll().then(function (r) {
        var out = [];
        r.projects.forEach(function (p) {
          var a = p.assets.filter(function (x) { return x.id === id; }).concat(p.dependencies.filter(function (d) { return d.type === 'library' && d.id === id; }));
          if (a.length) out.push({ project: p, version: a[0].version });
        });
        return out;
      });
    };
    /** プロジェクトの依存関係: uses = このプロジェクトが使うもの、usedBy = このプロジェクトを使う／派生元にするもの */
    svc.deps = function (id) {
      return readAll().then(function (r) {
        var byId = {}; r.projects.forEach(function (p) { byId[p.id] = p; });
        var me = byId[id]; if (!me) return { uses: [], usedBy: [], derived: [] };
        return store.all('library').then(function (lib) {
          var libById = {}; lib.forEach(function (i) { libById[i.id] = i; });
          var uses = [];
          me.assets.forEach(function (a) { var it = libById[a.id]; uses.push({ type: 'library', id: a.id, version: a.version, name: it ? it.name : null, exists: !!it, latest: it ? it.version : null, outdated: !!it && it.version > a.version }); });
          me.dependencies.forEach(function (d) {
            if (d.type === 'library') { var it = libById[d.id]; uses.push({ type: 'library', id: d.id, version: d.version, name: it ? it.name : (d.note || null), exists: !!it, latest: it ? it.version : null, outdated: !!it && it.version > (d.version || 1), note: d.note }); }
            else if (d.type === 'project') { var q = byId[d.id]; uses.push({ type: 'project', id: d.id, version: d.version, name: q ? q.title : null, exists: !!q, latest: q ? q.projectVersion : null, outdated: !!q && q.projectVersion > (d.version || 1) }); }
            else uses.push({ type: 'ref', note: d.note, detail: d.detail });
          });
          var usedBy = r.projects.filter(function (p) { return p.id !== id && p.dependencies.some(function (d) { return d.type === 'project' && d.id === id; }); });
          var derived = r.projects.filter(function (p) { return p.derivedFrom && p.derivedFrom.projectId === id; });
          return { uses: uses, usedBy: usedBy, derived: derived, parent: me.derivedFrom ? (byId[me.derivedFrom.projectId] || null) : null };
        });
      });
    };

    /* ---------- 書き出し ---------- */
    svc.exportProjects = function (ids) {
      return Promise.all(ids.map(function (id) { return svc.commitVersion(id); })).then(function (ps) {
        var need = {}; ps.forEach(function (p) { p.assets.forEach(function (a) { need[a.id] = 1; }); });
        return Promise.all(Object.keys(need).map(svc.libGet)).then(function (items) {
          return S.buildFile(ps.length === 1 ? 'project' : 'bundle', ps, items.filter(Boolean));
        });
      });
    };
    /** 全データ。読み込めないレコードも quarantine として同梱し、バックアップで黙って欠落させない */
    svc.exportBackup = function () {
      return Promise.all([readAll(), store.all('library'), store.all('meta')]).then(function (r) {
        var meta = r[2].filter(function (m) { return m.id === 'settings' || m.id.indexOf('zero:') === 0; });
        return S.buildFile('backup', r[0].projects, r[1], { meta: meta, quarantine: r[0].problems.map(function (p) { return p.raw; }) });
      }).then(function (f) { return store.setMeta('lastBackupAt', U.nowIso()).then(function () { return f; }); });
    };
    /** 将来の Zero 投稿用。公開設定が export-ready のものだけ。ローカルファイルでありオンライン公開ではない */
    svc.exportPublish = function (id) {
      return svc.get(id).then(function (p0) {
        if (!p0) throw Err('NOT_FOUND', 'プロジェクトが見つかりません。');
        if (p0.visibility !== 'export-ready') throw Err('INVALID', '公開用に書き出すには、先に公開設定を「公開用に書き出し可」にしてください。');
        return svc.commitVersion(id).then(function (p) {
          return Promise.all(p.assets.map(function (a) { return svc.libGet(a.id); })).then(function (items) { return S.buildPublish(p, items.filter(Boolean)); });
        });
      });
    };

    /* ---------- 取り込み（検証 → 確認 → 適用。検証だけでは何も書き込まない） ---------- */
    function existingMap() { return readAll().then(function (r) { var m = {}; r.projects.forEach(function (p) { m[p.id] = p; }); return m; }); }

    svc.inspectImport = function (json, opts) {
      opts = opts || {};
      var report = { ok: true, kind: 'unknown', items: [], library: [], meta: [], warnings: [], errors: [], truncated: 0, future: false, zero: null };
      var kind = S.classify(json); report.kind = kind;
      var chain;
      if (kind === 'zs-file' || kind === 'zs-publish' || kind === 'zs-project') {
        var projects = kind === 'zs-file' ? json.projects : kind === 'zs-publish' ? [json.project] : [json];
        var lib = kind === 'zs-file' ? (Array.isArray(json.library) ? json.library : []) : kind === 'zs-publish' ? (Array.isArray(json.library) ? json.library : []) : [];
        if (kind === 'zs-file' && json.formatVersion > S.VERSION) { report.future = true; report.warnings.push('新しい版のファイルです。読める範囲だけ取り込みます。'); }
        if (projects.length > S.LIMITS.importItems) { report.truncated = projects.length - S.LIMITS.importItems; projects = projects.slice(0, S.LIMITS.importItems); }
        chain = (kind === 'zs-publish' ? verifyPublish(json, report) : Promise.resolve()).then(function () { return classifyZs(projects, lib, json, report); });
      } else if (kind === 'zero-backup') {
        if (!deps.zeroImporter) { report.ok = false; report.errors.push('PLAYGROUND ZERO のバックアップです。Zero Engine を開いた状態で取り込んでください。'); return Promise.resolve(report); }
        report.zero = { json: json, count: json.projects.length };
        chain = Promise.resolve();
      } else if (kind === 'zero-package') {
        report.ok = false; report.errors.push('これは Zero の作品パッケージです。Zero Engine の Create / Remix 画面の「読み込み」から取り込んでください（読み込んだ作品は共通プロジェクトに自動で反映されます）。');
        return Promise.resolve(report);
      } else {
        // エンジン固有ファイル（元の CODE LAB / LOGIC PLAYGROUND の書き出しファイル）
        var found = null;
        E.all().forEach(function (eng) { if (!found) { var d = eng.importFile && eng.importFile(json, opts.filename); if (d) found = { eng: eng, drafts: d }; } });
        if (!found) { report.ok = false; report.errors.push('対応していない形式です。ZeroStudio のファイル、または CODE LAB / LOGIC PLAYGROUND の書き出しファイルを選んでください。'); return Promise.resolve(report); }
        report.kind = 'native:' + found.eng.id;
        found.drafts.forEach(function (d) {
          if (d.invalid) report.items.push({ type: 'project', status: 'invalid', title: d.title, errors: d.errors, warnings: [] });
          else report.items.push({ type: 'project', status: 'new', title: d.title, engine: found.eng.id, workType: d.workType, draft: d, errors: [], warnings: [] });
        });
        chain = Promise.resolve();
      }
      return chain.then(function () {
        if (!report.items.length && !report.library.length && !report.meta.length && !report.zero) { report.ok = false; report.errors.push('取り込める項目が見つかりませんでした。'); }
        return report;
      });
    };
    function verifyPublish(json, report) {
      var body = JSON.stringify({ project: json.project, library: json.library || [] });
      return U.sha256(body).then(function (h) {
        if (!json.integrity || !h) { report.warnings.push('完全性ハッシュを確認できませんでした。'); return; }
        if (h !== json.integrity.hash) { report.ok = false; report.errors.push('完全性チェックに失敗しました。ファイルが書き換えられた可能性があります。'); }
      });
    }
    function classifyZs(projects, lib, json, report) {
      return Promise.all([existingMap(), store.all('library')]).then(function (r) {
        var have = r[0], haveLib = {}; r[1].forEach(function (i) { haveLib[i.id] = i; });
        var seen = {};
        projects.forEach(function (raw) {
          var s = S.sanitizeProject(raw);
          if (!s.ok) { report.items.push({ type: 'project', status: 'invalid', title: U.str(raw && raw.title, 80, '(不明)'), errors: s.errors, warnings: [] }); return; }
          var p = s.project, eng = E.get(p.engine), errs = [];
          if (eng) { var v = eng.validatePayload(p.workType, p.engineData.schemaVersion, p.engineData.payload); if (!v.ok) errs = v.errors; }
          if (!errs.length && p.engine === 'zero' && p.engineData.payload.id !== p.id) errs = ['Zero 作品の ID が一致しません。'];
          if (errs.length) { report.items.push({ type: 'project', status: 'invalid', title: p.title, errors: errs, warnings: s.warnings }); return; }
          var ex = have[p.id], status = 'new';
          if (seen[p.id]) status = 'copy'; else if (ex) status = (ex.versionHash === p.versionHash && ex.updatedAt === p.updatedAt) ? 'same' : 'copy';
          seen[p.id] = 1;
          report.items.push({ type: 'project', status: status, title: p.title, engine: p.engine, workType: p.workType, project: p, errors: [], warnings: s.warnings.concat(eng ? [] : ['このアプリ版は「' + p.engine + '」エンジンに対応していません。データは保持され、書き出しでも失われません。']) });
        });
        lib.forEach(function (raw) {
          var s = S.sanitizeLibraryItem(raw);
          if (!s.ok) { report.library.push({ type: 'library', status: 'invalid', title: U.str(raw && raw.name, 80, '(不明)'), errors: s.errors }); return; }
          var ex = haveLib[s.item.id], st = !ex ? 'new' : (ex.version === s.item.version && ex.updatedAt === s.item.updatedAt ? 'same' : 'copy');
          report.library.push({ type: 'library', status: st, title: s.item.name, kind: s.item.kind, item: s.item, errors: [], warnings: s.warnings });
        });
        if (Array.isArray(json.meta)) json.meta.forEach(function (m) {
          if (m && typeof m.id === 'string' && (m.id === 'settings' || m.id.indexOf('zero:') === 0) && m.id.length < 200) report.meta.push({ type: 'meta', id: m.id, value: m.value });
        });
        if (Array.isArray(json.quarantine) && json.quarantine.length) report.warnings.push('このバックアップには読み込めなかったデータが ' + json.quarantine.length + ' 件含まれています（取り込みはされません）。');
      });
    }

    /** 検証済みの report を保存する。既存のものは決して上書きしない（衝突は別IDの別プロジェクトにする） */
    svc.applyImport = function (report, opts) {
      opts = opts || {};
      var res = { added: 0, copies: 0, skipped: 0, invalid: 0, failed: 0, libAdded: 0, metaAdded: 0, errors: [], idMap: {} };
      var chain = Promise.resolve();
      function fail(e) { res.failed++; if (res.errors.indexOf(U.explain(e)) < 0) res.errors.push(U.explain(e)); }
      // 素材 → プロジェクトの順（プロジェクトの参照を新IDに付け替えるため）
      report.library.forEach(function (it) {
        if (it.status === 'invalid') { res.invalid++; return; }
        if (it.status === 'same') { res.skipped++; return; }
        chain = chain.then(function () {
          var item = U.clone(it.item), old = item.id;
          return (it.status === 'copy' ? U.uniqueId('zsl', function (x) { return store.exists('library', x); }, deps.rng).then(function (n) { item.id = n; item.name = U.str(item.name + '（取り込み）', 80); res.idMap[old] = n; }) : Promise.resolve())
            .then(function () { return store.put('library', item); }).then(function () { res.libAdded++; }, fail);
        });
      });
      report.items.forEach(function (it) {
        if (it.status === 'invalid') { res.invalid++; return; }
        if (it.status === 'same') { res.skipped++; return; }
        chain = chain.then(function () {
          if (it.draft) return importDraft(it.draft, it.engine, { imported: { from: 'file', at: U.nowIso() } }).then(function () { res.added++; }, fail);
          var p = U.clone(it.project), old = p.id;
          var step = Promise.resolve();
          if (it.status === 'copy') step = U.uniqueId(p.engine === 'zero' ? 'p' : 'zsp', function (x) { return store.exists('projects', x); }, deps.rng).then(function (n) {
            var eng = E.get(p.engine), title = U.str(p.title + '（取り込み）', 80);
            if (!p.derivedFrom) p.derivedFrom = { projectId: old, projectVersion: p.projectVersion, title: p.title };
            p.id = n; p.title = title; p.ext = Object.assign({}, p.ext, { imported: { from: old, at: U.nowIso() } });
            if (eng && eng.prepareCopy) p.engineData.payload = eng.prepareCopy(p.engineData.payload, n, title, old);
            res.idMap[old] = n; res.copies++;
          });
          return step.then(function () {
            p.assets.forEach(function (a) { if (res.idMap[a.id]) a.id = res.idMap[a.id]; });
            p.dependencies.forEach(function (d) { if (d.id && res.idMap[d.id]) d.id = res.idMap[d.id]; });
            if (p.derivedFrom && res.idMap[p.derivedFrom.projectId] && it.status !== 'copy') p.derivedFrom.projectId = res.idMap[p.derivedFrom.projectId];
            return putChecked(p);
          }).then(function () { res.added++; }, fail);
        });
      });
      // 設定・Zero の付随データ: 既にあるキーは触らず、無いものだけ追加
      report.meta.forEach(function (m) {
        chain = chain.then(function () {
          if (m.id === 'settings') return null;
          return store.exists('meta', m.id).then(function (has) { if (!has) return store.setMeta(m.id, m.value).then(function () { res.metaAdded++; }); });
        }).catch(fail);
      });
      if (report.zero && deps.zeroImporter) chain = chain.then(function () { return deps.zeroImporter(report.zero.json).then(function (r) { res.zero = r; res.added += (r && r.added) || 0; res.copies += (r && r.copies) || 0; res.skipped += (r && r.skipped) || 0; res.invalid += (r && r.invalid) || 0; }, fail); });
      return chain.then(function () { return res; });
    };

    /** ドラフト（エンジンの変換結果）をプロジェクトとして保存する */
    function importDraft(d, engineId, ext) {
      var spec = { engine: engineId, workType: d.workType, title: d.title, payload: d.payload, schemaVersion: d.schemaVersion, ext: Object.assign({}, ext, d.legacy ? { legacy: d.legacy } : {}), createdAt: d.createdAt, updatedAt: d.updatedAt };
      if (engineId === 'zero' && d.zeroId) spec.id = d.zeroId;
      return svc.create(spec);
    }

    /* ---------- 既存データ（旧アプリの保存領域）の検出と移行。元データは読むだけで一切変更しない ---------- */
    var LEGACY = [
      { source: 'codelab.projects.v2', engine: 'code', label: 'CODE LAB のプロジェクト', kind: 'array' },
      { source: 'codelab.pixel.projects.v1', engine: 'code', label: 'CODE LAB のドット絵', kind: 'array' },
      { source: 'lp.proj', engine: 'logic', label: 'LOGIC PLAYGROUND の保存済み回路', kind: 'map' },
      { source: 'lp.auto', engine: 'logic', label: 'LOGIC PLAYGROUND の回路（自動保存）', kind: 'one' },
      { source: 'lp.ml.proj', engine: 'logic', label: 'LOGIC PLAYGROUND の保存済み機械', kind: 'map' },
      { source: 'lp.ml.auto', engine: 'logic', label: 'LOGIC PLAYGROUND の機械（自動保存）', kind: 'one' },
      { source: 'lp.asm', engine: 'logic', label: 'LOGIC PLAYGROUND のCPUプログラム', kind: 'text' }
    ];
    svc.LEGACY_SOURCES = LEGACY;
    /** env: { localStorage: {getItem}, zeroRecords?: Promise<record[]>|record[], zeroMeta?: [{id,value}] } */
    svc.scanLegacy = function (env) {
      var report = { items: [], meta: [], sourcesFound: {}, warnings: [] };
      var drafts = [];
      LEGACY.forEach(function (src) {
        var raw = null;
        try { raw = env.localStorage ? env.localStorage.getItem(src.source) : null; } catch (e) { report.warnings.push(src.label + ' を読めませんでした。'); }
        if (raw === null || raw === undefined || raw === '') return;
        var parsed = raw;
        if (src.kind !== 'text') { try { parsed = JSON.parse(raw); } catch (e) { drafts.push({ source: src.source, engine: src.engine, d: { invalid: true, errors: ['保存データが壊れていて読めません。'], title: src.label } }); return; } }
        var recs = src.kind === 'array' ? (Array.isArray(parsed) ? parsed.map(function (r) { return [r, null]; }) : []) : src.kind === 'map' ? (parsed && typeof parsed === 'object' ? Object.keys(parsed).map(function (k) { return [parsed[k], k]; }) : []) : [[parsed, null]];
        if (recs.length) report.sourcesFound[src.source] = recs.length;
        recs.forEach(function (rk) { E.get(src.engine).fromLegacy(src.source, rk[0], rk[1]).forEach(function (d) { drafts.push({ source: src.source, engine: src.engine, d: d }); }); });
      });
      return Promise.resolve(env.zeroRecords || []).then(function (zr) {
        if (zr.length) report.sourcesFound['zero-idb'] = zr.length;
        zr.forEach(function (rec) { E.get('zero').fromLegacy('zero-idb', rec).forEach(function (d) { drafts.push({ source: 'zero-idb', engine: 'zero', d: d }); }); });
        (env.zeroMeta || []).forEach(function (m) { if (m && typeof m.id === 'string' && m.id !== '__probe' && m.id.length < 190) report.meta.push({ id: 'zero:' + m.id, value: m.value }); });
        return readAll();
      }).then(function (all) {
        var legacyKeys = {}, byId = {};
        all.projects.forEach(function (p) {
          byId[p.id] = p;
          if (p.ext && p.ext.legacy) { legacyKeys[p.ext.legacy.source + '|' + p.ext.legacy.id + '|' + p.ext.legacy.hash] = 1; legacyKeys[p.ext.legacy.source + '|' + p.ext.legacy.id] = 1; }
        });
        drafts.forEach(function (x) {
          var d = x.d;
          if (d.invalid) { report.items.push({ source: x.source, engine: x.engine, status: 'invalid', title: d.title, errors: d.errors }); return; }
          var st = 'new', k = d.legacy.source + '|' + d.legacy.id;
          if (d.zeroId && byId[d.zeroId]) st = U.contentHash(byId[d.zeroId].engineData.payload) === U.contentHash(d.payload) ? 'same' : 'copy';
          else if (legacyKeys[k + '|' + d.legacy.hash]) st = 'same';
          else if (legacyKeys[k]) st = 'copy';
          report.items.push({ source: x.source, engine: x.engine, status: st, title: d.title, workType: d.workType, draft: d, errors: [] });
        });
        return report;
      });
    };
    svc.applyLegacy = function (report) {
      var res = { added: 0, skipped: 0, invalid: 0, failed: 0, metaAdded: 0, errors: [] };
      var chain = Promise.resolve();
      report.items.forEach(function (it) {
        if (it.status === 'invalid') { res.invalid++; return; }
        if (it.status === 'same') { res.skipped++; return; }
        chain = chain.then(function () {
          var d = U.clone(it.draft);
          var prep = Promise.resolve();
          if (it.status === 'copy') {
            d.title = U.str(d.title + '（取り込み）', 80);
            if (it.engine === 'zero') prep = U.uniqueId('p', function (x) { return store.exists('projects', x); }, deps.rng).then(function (n) { d.payload = E.get('zero').prepareCopy(d.payload, n, d.title, d.zeroId); d.zeroId = n; });
          }
          return prep.then(function () { return importDraft(d, it.engine, { imported: { from: 'legacy', at: U.nowIso() } }); }).then(function () { res.added++; });
        }).catch(function (e) { res.failed++; if (res.errors.indexOf(U.explain(e)) < 0) res.errors.push(U.explain(e)); });
      });
      report.meta.forEach(function (m) {
        chain = chain.then(function () { return store.exists('meta', m.id).then(function (has) { if (!has) return store.setMeta(m.id, m.value).then(function () { res.metaAdded++; }); }); }).catch(function (e) { res.failed++; });
      });
      return chain.then(function () { return res; });
    };

    /* ---------- 状態 ---------- */
    svc.health = function () { var h = store.health(); return Promise.all([store.estimate(), store.persist()]).then(function (r) { h.estimate = r[0]; h.persisted = r[1]; return h; }); };
    return svc;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
