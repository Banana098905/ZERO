/* ZeroStudio — シェル本体（起動・ルーター・ナビゲーション・エンジン画面・アプリ操作） */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util, E = ZS.engines, ui = ZS.ui, P = ZS.pages, H = ZS.host, h = U.h;
  var NAV = [['home', 'ホーム', 'home'], ['projects', 'プロジェクト', 'folder'], ['code', 'Code Studio', 'code'], ['logic', 'Logic Studio', 'logic'], ['zero', 'Zero Engine', 'zero'], ['library', '共通ライブラリ', 'library'], ['io', 'インポート／エクスポート', 'transfer'], ['settings', '設定', 'settings']];
  var app = (ZS.app = { current: null, lastDeleted: null, pendingInsert: null });
  var main, navEl, rootEl, tabbarEl, scrimEl, menuBtn;

  /* ================= ルーター ================= */
  function parseHash() {
    var raw = (location.hash || '#/home').replace(/^#\/?/, ''), qi = raw.indexOf('?');
    var name = (qi < 0 ? raw : raw.slice(0, qi)) || 'home', q = {};
    if (qi >= 0) raw.slice(qi + 1).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 壊れたクエリは無視 */ } } });
    return { name: NAV.some(function (n) { return n[0] === name; }) ? name : 'home', q: q };
  }
  app.nav = function (hash) { if (location.hash === hash) g.dispatchEvent(new Event('hashchange')); else location.hash = hash; };
  var chain = Promise.resolve();
  function onRoute() { chain = chain.then(go).catch(function (e) { ui.error(e); }); }
  function go() {
    var r = parseHash();
    return teardown().then(function () {
      U.clear(main); main.classList.remove('engine'); main.scrollTop = 0; document.title = 'ZeroStudio';
      var isEng = r.name === 'code' || r.name === 'logic' || r.name === 'zero';
      rootEl.classList.toggle('is-engine', isEng); tabbarEl.classList.toggle('hidden', isEng); app.closeDrawer();
      Array.prototype.forEach.call(document.querySelectorAll('#zs-nav a, #zs-tabbar a'), function (a) { if (a.dataset.name === r.name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      var eng = E.get(r.name);
      if (eng && (r.name === 'code' || r.name === 'logic' || r.name === 'zero')) { main.classList.add('engine'); document.title = eng.label + ' — ZeroStudio'; app.current = engineView(eng, r.q); return app.current.ready; }
      var view = P[r.name](app, r.q);
      if (view && view.el) { app.current = { destroy: view.destroy || function () { } }; main.appendChild(view.el); } else { main.appendChild(view); }
      main.focus({ preventScroll: true });
    });
  }
  function teardown() {
    var c = app.current; app.current = null;
    if (!c) return Promise.resolve();
    return Promise.resolve(c.destroy && c.destroy()).catch(function (e) { ui.error(e, '画面を閉じる際の保存'); });
  }
  function openDrawer() { navEl.classList.add('open'); scrimEl.classList.add('open'); menuBtn.setAttribute('aria-expanded', 'true'); var a = navEl.querySelector('a[aria-current=page]') || navEl.querySelector('a'); if (a && g.innerWidth <= 880) a.focus(); }
  app.closeDrawer = function () { if (!navEl) return; navEl.classList.remove('open'); scrimEl.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); };
  app.openCreate = function () { return P.createDialog(app); };
  app.flush = function () { var c = app.current; return c && c.flush ? c.flush() : Promise.resolve(); };

  /* ================= エンジン画面 ================= */
  function engineView(engine, q) {
    var isZero = engine.id === 'zero', svc = app.svc;
    var el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } });
    var bar = h('div', { class: 'zs-bar' }), stage = h('div', { class: 'zs-stage' });
    el.appendChild(bar); el.appendChild(stage); main.appendChild(el);
    var frame = new H.Frame(engine, stage), loading = h('div', { class: 'zs-loading', text: engine.label + ' を起動しています…' }); stage.appendChild(loading);
    var session = null, slot = isZero ? null : H.attach[engine.id].defaultSlot, projects = {}, work = null, offStore = null, destroyed = false;
    var status = h('span', { class: 'zs-status', role: 'status' }), titleIn = h('input', { class: 'zs-in', 'aria-label': 'プロジェクト名', maxlength: 80 });
    var slotsBox = h('div', { class: 'zs-slots', role: 'group', 'aria-label': '作品タイプ' }), btnBox = h('div', { class: 'zs-row' });
    var ctl = { engineId: engine.id, frame: frame };

    function cur() { return isZero ? (work ? projects.zero : null) : projects[slot]; }
    function labelOf(wt) { var w = E.workType(engine.id, wt); return w ? w.label : wt; }
    function setStatus(st) {
      status.className = 'zs-status ' + (st.state === 'error' ? 'err' : st.state === 'dirty' ? 'dirty' : st.state === 'saving' ? 'saving' : 'ok');
      status.textContent = st.state === 'saved' ? '保存済み ' + U.fmtDate(new Date(st.at).toISOString()).slice(11) : st.state === 'saving' ? '保存中…' : st.state === 'dirty' ? '変更あり（自動保存します）' : '保存できません: ' + st.message;
      status.title = st.message || '';
    }
    function render() {
      U.clear(slotsBox); U.clear(btnBox);
      var p = cur();
      if (!isZero) {
        H.attach[engine.id].slots.forEach(function (s) {
          var b = h('button', { type: 'button', class: 'zs-slot' + (projects[s] ? ' has' : ''), 'aria-pressed': String(s === slot), style: { '--c': engine.hue }, title: projects[s] ? projects[s].title : '未保存（編集すると自動で作成されます）', onclick: function () { slot = s; render(); if (frame.isReady) frame.call('show', s).catch(function () { }); } }, h('span', { class: 'd' }), labelOf(s));
          slotsBox.appendChild(b);
        });
      } else slotsBox.appendChild(h('span', { class: 'zs-chip', style: { '--c': engine.hue } }, h('i'), p ? labelOf(p.workType) : 'Zero Engine'));
      titleIn.value = p ? p.title : ''; titleIn.placeholder = isZero ? '（作品を開くとここに表示されます）' : '（未保存）'; titleIn.disabled = isZero || !frame.isReady;
      var verChip = p ? ui.chip('v' + p.projectVersion, '', 'プロジェクトの版') : null;
      var openB = h('button', { class: 'zs-btn sm', type: 'button', 'aria-haspopup': 'menu', title: 'このエンジンのプロジェクトを開く', disabled: !frame.isReady }, ui.icon('folder'), '開く', ui.icon('chevron'));
      openB.addEventListener('click', function () { openMenu(openB); });
      var newB = h('button', { class: 'zs-btn sm', type: 'button', 'aria-haspopup': 'menu', title: '新しいプロジェクトを作る', disabled: !frame.isReady }, ui.icon('plus'), '新規', ui.icon('chevron'));
      newB.addEventListener('click', function () { ui.menu(newB, engine.workTypes.map(function (w) { return { label: '新規 ' + w.label, onClick: function () { app.newProject(engine.id, w.id, isZero ? null : ctl); } }; })); });
      var saveB = h('button', { class: 'zs-btn sm primary', type: 'button', disabled: !p, title: '内容が変わっていれば版（v）を1つ上げます（Ctrl/⌘+S）', onclick: function () { commit(); } }, ui.icon('save'), isZero ? '版を確定' : '保存');
      var expB = h('button', { class: 'zs-btn sm', type: 'button', 'aria-haspopup': 'menu', title: '書き出す', disabled: !p }, ui.icon('export'), '書き出し', ui.icon('chevron'));
      expB.addEventListener('click', function () { flushThen(function () { ui.menu(expB, [{ label: 'ZeroStudio JSON', onClick: function () { app.exportProject(p.id); } }, { label: '元アプリ形式', onClick: function () { app.exportNative(p.id); } }, { label: 'Zeroに公開', onClick: function () { window.ZS_zeroPublish(app, p.id, ui); } }, { label: '公開用データ（要・公開設定）', onClick: function () { app.exportPublish(p.id); } }]); }); });
      var detB = h('button', { class: 'zs-btn sm', type: 'button', disabled: !p, title: 'プロジェクトの詳細・依存関係', onclick: function () { flushThen(function () { app.showProject(p.id).then(function () { return afterMeta(); }); }); } }, ui.icon('detail'), '詳細');
      [openB].concat(isZero ? [] : [newB]).concat([saveB, expB]).forEach(function (b) { btnBox.appendChild(b); });
      var reg = registerButton(); if (reg) btnBox.appendChild(reg);
      btnBox.appendChild(detB);
      U.clear(bar); bar.appendChild(slotsBox); bar.appendChild(titleIn); if (verChip) bar.appendChild(verChip); bar.appendChild(status); bar.appendChild(h('span', { class: 'zs-spacer' })); bar.appendChild(btnBox);
      if (isZero) bar.insertBefore(h('span', { class: 'zs-faint zs-hide-sm', text: 'Zero の作品は自動で保存されます', style: { fontSize: '12px' } }), status);
    }
    function registerButton() {
      if (isZero || !projects[slot]) return null;
      var label = { pixel: '素材として登録', circuit: 'テンプレートとして登録', machine: 'テンプレートとして登録', 'cpu-program': 'プログラムを登録' }[slot];
      if (!label) return null;
      return h('button', { class: 'zs-btn sm', type: 'button', title: label, onclick: function () { flushThen(function () { app.registerToLibrary(projects[slot]); }); } }, ui.icon('library'), label);
    }
    function flushThen(fn) { (session ? session.flush() : Promise.resolve()).then(function () { return refreshCurrent(); }).then(fn).catch(ui.error); }
    function refreshCurrent() {
      var ids = isZero ? (work ? [['zero', work]] : []) : Object.keys(projects).map(function (s) { return [s, projects[s] && projects[s].id]; }).filter(function (x) { return x[1]; });
      return Promise.all(ids.map(function (x) { return svc.get(x[1]).then(function (p) { if (p) projects[x[0]] = p; else delete projects[x[0]]; }); })).then(render);
    }
    function afterMeta() { return (session ? session.rebase(slot) : Promise.resolve()).then(refreshCurrent); }
    function commit() {
      var p = cur(); if (!p) return;
      var run = isZero ? svc.commitVersion(p.id) : session.save(slot, { commit: true });
      run.then(function (np) { projects[isZero ? 'zero' : slot] = np; render(); ui.toast('保存しました（v' + np.projectVersion + '）', 'ok'); return afterMeta(); }, ui.error);
    }
    function openMenu(anchor) {
      var wt = isZero ? null : slot;
      svc.list({ engine: engine.id, workType: wt || undefined }).then(function (r) {
        var items = r.projects.slice(0, 25).map(function (p) { return { label: p.title + '  ·  ' + (isZero ? labelOf(p.workType) + '  ·  ' : '') + U.fmtAgo(p.updatedAt), onClick: function () { openProject(p); } }; });
        if (!items.length) items = [{ heading: '保存済みのプロジェクトはありません' }];
        items.push('-'); items.push({ label: 'すべてのプロジェクト…', onClick: function () { app.nav('#/projects'); } });
        ui.menu(anchor, items);
      }, ui.error);
    }
    function openProject(p) {
      if (isZero) { work = p.id; projects.zero = p; render(); return frame.call('open', p.engineData.payload).catch(ui.error); }
      return session.open(p).then(function () { slot = p.workType; render(); }, function (e) { ui.error(e, 'プロジェクトを開けません'); });
    }
    titleIn.addEventListener('change', function () {
      var name = titleIn.value.trim(), p = cur(); if (!name) { render(); return; }
      if (p) svc.rename(p.id, name).then(function () { return session ? frame.call('setName', slot, name).catch(function () { }).then(function () { return session.rebase(slot); }) : null; }).then(refreshCurrent, ui.error);
      else if (session) frame.call('setName', slot, name).catch(ui.error);
    });

    ctl.flush = function () { return session ? session.flush() : Promise.resolve(); };
    ctl.openProject = openProject;
    ctl.session = function () { return session; };
    ctl.setProject = function (s, p) { projects[s] = p; if (s === slot) render(); };
    ctl.destroy = function () {
      destroyed = true; if (offStore) offStore();
      var fin = function () { frame.destroy(); };
      if (isZero) { return (work ? svc.commitVersion(work).catch(function () { }) : Promise.resolve()).then(fin); }
      return session.flush().then(function () { session.close(); fin(); remember(); }, function () { session.close(); fin(); });
    };
    function remember() {
      if (isZero || !session) return Promise.resolve();
      var m = {}; Object.keys(projects).forEach(function (s) { if (projects[s]) m[s] = projects[s].id; });
      return app.store.setMeta('last:' + engine.id, m).catch(function () { });
    }

    render();
    ctl.ready = frame.ready().then(function () { return frame.themed; }).then(function () {
      if (destroyed) return;
      if (loading.parentNode) loading.remove();   // iframe は付け直さない（付け直すと再読み込みされる）
      if (!isZero) {
        session = new H.Session(svc, engine.id, frame, {
          status: function (s, st) { if (s === slot) setStatus(st); },
          slot: function (s, p) { projects[s] = p; remember(); if (s === slot) render(); },
          conflict: function (r) { ui.toast('別のタブで同じプロジェクトが先に更新されていました。あなたの変更は「' + r.project.title + '」として別に保存しました。', 'warn'); },
          warn: function (m) { ui.toast(m, 'warn'); }
        });
        frame.on('mode', function (m) { var s = H.attach[engine.id].slotOfMode(m.mode); if (s !== slot) { slot = s; render(); } });
      } else {
        frame.on('route', function (m) { work = m.work; if (!work) { delete projects.zero; return render(); } svc.get(work).then(function (p) { if (p) projects.zero = p; else delete projects.zero; render(); }); });
        offStore = app.store.onChange(U.debounce(function (m, ext) { if (ext && m.coll === 'projects' && work) svc.get(work).then(function (p) { if (p) { projects.zero = p; render(); } }); }, 400));
      }
      return startup();
    }).then(function () { render(); }, function (e) { U.clear(loading); loading.classList.add('failed'); loading.appendChild(h('div', null, h('p', { text: U.explain(e) }), h('button', { class: 'zs-btn', type: 'button', text: '再読み込み', onclick: function () { location.reload(); } }))); if (!loading.parentNode) stage.appendChild(loading); render(); });

    function startup() {
      if (isZero) {
        var chain2 = Promise.resolve();
        if (q.go) chain2 = frame.call('navigate', q.go);
        if (q.p) chain2 = svc.get(q.p).then(function (p) { if (p) return openProject(p); });
        else if (!q.go) { work = frame.bridge() && frame.bridge().currentWork(); }
        return chain2.catch(ui.error);
      }
      var att = H.attach[engine.id];
      return app.store.getMeta('last:' + engine.id, {}).then(function (last) {
        var ids = {}; Object.keys(last || {}).forEach(function (s) { if (att.slots.indexOf(s) >= 0 && typeof last[s] === 'string') ids[s] = last[s]; });
        var target = q.p ? svc.get(q.p) : Promise.resolve(null);
        return target.then(function (tp) {
          if (q.p && !tp) ui.toast('指定されたプロジェクトが見つかりません。', 'err');
          if (tp && tp.engine !== engine.id) { app.nav('#/' + tp.engine + '?p=' + encodeURIComponent(tp.id)); return null; }
          if (tp) { ids[tp.workType] = tp.id; }
          var order = att.slots.filter(function (s) { return ids[s] && (!tp || s !== tp.workType); }).concat(tp ? [tp.workType] : []);
          var seq = Promise.resolve();
          order.forEach(function (s) {
            seq = seq.then(function () { return (tp && s === tp.workType ? Promise.resolve(tp) : svc.get(ids[s])).then(function (p) { if (p) return session.open(p).then(function () { projects[s] = p; slot = s; }); }); }).catch(function (e) { ui.error(e, '前回のプロジェクトを開けません'); });
          });
          return seq;
        });
      }).then(function () {
        if (app.pendingInsert) {
          var ins = app.pendingInsert; app.pendingInsert = null;
          return frame.call('insert', ins.parts).then(function () { ui.toast('「' + ins.name + '」を Web作品に挿入しました', 'ok'); }, ui.error);
        }
      });
    }
    return ctl;
  }

  /* ================= アプリ操作（ページ・エンジン画面から共通で使う） ================= */
  app.newProject = function (engineId, workType, ctl) {
    if (engineId === 'zero') return app.nav('#/zero?go=' + encodeURIComponent({ studio: '/studio/new', experiment: '/lab', creation: '/create' }[workType] || '/'));
    return app.svc.create({ engine: engineId, workType: workType }).then(function (p) {
      if (ctl && ctl.session && ctl.session()) return ctl.openProject(p).then(function () { ui.toast('新しいプロジェクトを作成しました', 'ok'); });
      app.nav('#/' + engineId + '?p=' + encodeURIComponent(p.id));
    }, ui.error);
  };
  app.openProject = function (p) { if (!E.get(p.engine)) return ui.toast('このアプリ版では開けないエンジンです（データは保持されます）。', 'warn'); app.nav('#/' + p.engine + '?p=' + encodeURIComponent(p.id)); };
  app.renameProject = function (p) {
    return ui.prompt({ title: '名前を変更', label: '新しい名前', value: p.title, okLabel: '変更' }).then(function (n) { if (n) return app.svc.rename(p.id, n).then(function () { ui.toast('名前を変更しました', 'ok'); }, ui.error); });
  };
  app.deleteProject = function (p) {
    return ui.dialog({
      title: '「' + U.str(p.title, 30) + '」を削除しますか？',
      build: function (b) { b.appendChild(h('p', { text: 'このプロジェクト（' + E.label(p) + '、v' + p.projectVersion + '）を削除します。素材ライブラリの素材は削除されません。' })); b.appendChild(h('p', { class: 'zs-muted', text: '削除直後は、プロジェクト一覧の「直前の削除を取り消す」で戻せます。画面を離れると戻せません。' })); },
      actions: [{ label: 'キャンセル', value: 'cancel' }, { label: '書き出してから削除', value: 'export' }, { label: '削除', value: 'delete', danger: true }]
    }).then(function (v) {
      if (v !== 'delete' && v !== 'export') return false;
      var pre = v === 'export' ? app.exportProject(p.id) : Promise.resolve();
      return pre.then(function () { return app.svc.remove(p.id); }).then(function (raw) { app.lastDeleted = raw; ui.toast('削除しました', 'ok'); return true; }, function (e) { ui.error(e); return false; });
    });
  };
  app.exportProject = function (id) {
    return app.svc.exportProjects([id]).then(function (f) { var p = f.projects[0]; ui.downloadJson(U.safeFileName(p.title, '.zerostudio.json'), f); ui.toast('書き出しました（v' + p.projectVersion + '）', 'ok'); }, ui.error);
  };
  app.exportAllProjects = function () {
    return app.svc.list().then(function (r) { if (!r.projects.length) return ui.toast('書き出すプロジェクトがありません。', 'warn'); return app.svc.exportProjects(r.projects.map(function (p) { return p.id; })); })
      .then(function (f) { if (f) { ui.downloadJson('zerostudio-projects-' + stamp() + '.json', f); ui.toast(f.projects.length + ' 件を書き出しました', 'ok'); } }, ui.error);
  };
  app.exportNative = function (id) {
    return app.svc.get(id).then(function (p) {
      var eng = E.get(p.engine); if (!eng || !eng.exportFile) throw U.ZSError('UNSUPPORTED', 'このエンジンは元アプリ形式の書き出しに対応していません。');
      var f = eng.exportFile(p); ui.download(f.filename, f.mime, f.text); ui.toast('書き出しました。' + (f.note || ''), 'ok');
    }).catch(ui.error);
  };
  app.exportPublish = function (id) {
    return app.svc.exportPublish(id).then(function (pk) { ui.downloadJson(U.safeFileName(pk.project.title, '.zspublish.json'), pk); ui.toast('公開用データをファイルとして書き出しました（オンライン公開ではありません）。', 'ok'); }, ui.error);
  };
  app.backupNow = function () {
    return app.svc.exportBackup().then(function (f) { ui.downloadJson('zerostudio-backup-' + stamp() + '.json', f); ui.toast('バックアップを書き出しました（' + f.projects.length + ' 件・素材 ' + f.library.length + ' 件）', 'ok'); }, ui.error);
  };
  app.showProject = function (id) { return P.projectDialog(app, id); };
  app.onProjectUpdated = function () { return Promise.resolve(); };
  app.refreshStorage = function () {
    return app.svc.health().then(function (hl) {
      var b = document.getElementById('zs-storage'); b.textContent = hl.ok ? '保存: ブラウザ内' : '保存: 不安定'; b.classList.toggle('bad', !hl.ok);
      b.title = '保存先: ' + hl.label + (hl.persisted ? '（永続化済み）' : '') + '\nクリックで設定を開きます'; b.onclick = function () { app.nav('#/settings'); };
    });
  };
  /** 現在の作品を共通ライブラリへ登録（同じプロジェクト由来の素材があれば更新＝版を上げる） */
  app.registerToLibrary = function (project) {
    var kind = { pixel: 'pixel-art', circuit: 'circuit', machine: 'machine', 'cpu-program': 'cpu-program' }[project.workType];
    if (!kind) return Promise.resolve();
    var svc = app.svc, data = U.clone(project.engineData.payload);
    return svc.libList({ kind: kind }).then(function (r) {
      var prev = r.items.filter(function (i) { return i.origin && i.origin.projectId === project.id; })[0];
      if (!prev) return svc.libRegister({ kind: kind, name: project.title, data: data, origin: { engine: project.engine, projectId: project.id } }).then(function (it) { ui.toast('共通ライブラリに登録しました（v1）', 'ok'); return it; });
      return ui.dialog({ title: '素材を更新しますか？', build: function (b) { b.appendChild(h('p', { text: '「' + prev.name + '」（v' + prev.version + '）は、このプロジェクトから登録された素材です。' })); },
        actions: [{ label: 'キャンセル', value: null }, { label: '新しい素材として登録', value: 'new' }, { label: 'v' + (prev.version + 1) + ' に更新', value: 'update', primary: true }] }).then(function (v) {
        if (v === 'update') return svc.libUpdate(prev.id, { data: data }).then(function (it) { ui.toast(it.version > prev.version ? '素材を v' + it.version + ' に更新しました' : '内容に変更がないため、版は変わりません', 'ok'); });
        if (v === 'new') return svc.libRegister({ kind: kind, name: project.title, data: data, origin: { engine: project.engine, projectId: project.id } }).then(function () { ui.toast('新しい素材として登録しました', 'ok'); });
      });
    }).catch(ui.error);
  };
  app.insertIntoCode = function (it, mode) {
    var C = ZS.convert, parts;
    try {
      if (it.kind === 'pixel-art') parts = mode === 'css' ? C.pixelToWebParts(it.data, it, 8) : mode === 'canvas' ? { html: '', css: '', js: C.pixelToCanvasJs(it.data, it, 8) } : C.imageToWebParts(C.pixelToPngDataUrl(it.data, 8), it, it.name);
      else parts = C.imageToWebParts(it.data.dataUrl, it, it.name);
    } catch (e) { return ui.error(e, '素材を変換できません'); }
    app.pendingInsert = { parts: parts, name: it.name };
    app.nav('#/code');
  };
  app.openFromLibrary = function (it, engineId, workType) {
    app.svc.create({ engine: engineId, workType: workType, title: it.name, payload: U.clone(it.data), dependencies: [{ type: 'library', id: it.id, version: it.version, note: '素材「' + U.str(it.name, 30) + '」から作成', detail: { managed: 'provenance' } }] })
      .then(function (p) { app.nav('#/' + engineId + '?p=' + encodeURIComponent(p.id)); }, ui.error);
  };
  function stamp() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }

  /** サービス層が Zero のバックアップを取り込むとき、Zero 自身の検証・重複判定を使う */
  function zeroImporter(json) {
    var c = app.current;
    if (c && c.engineId === 'zero' && c.frame && c.frame.isReady) return c.frame.call('importBackup', json);
    var box = h('div', { style: { position: 'fixed', left: '-9999px', top: 0, width: '1024px', height: '768px', overflow: 'hidden' }, 'aria-hidden': 'true' });
    document.body.appendChild(box);
    var f = new H.Frame(E.get('zero'), box);
    return f.ready().then(function () { return f.call('importBackup', json); }).then(function (r) { f.destroy(); box.remove(); return r; }, function (e) { f.destroy(); box.remove(); throw e; });
  }

  /* ================= 起動 ================= */
  function boot() {
    main = document.getElementById('zs-main'); navEl = document.getElementById('zs-nav'); rootEl = document.getElementById('zs-root');
    tabbarEl = document.getElementById('zs-tabbar'); scrimEl = document.getElementById('zs-scrim'); menuBtn = document.getElementById('zs-menu');
    NAV.forEach(function (n) {
      var eng = E.get(n[0]);
      var util = ['library', 'io', 'settings'].indexOf(n[0]) >= 0;
      navEl.appendChild(h('a', { href: '#/' + n[0], 'data-name': n[0], class: util ? 'util' + (n[0] === 'library' ? ' first' : '') : null, title: util ? n[1] : null, style: eng ? { '--c': eng.hue } : null }, h('span', { class: 'nav-ic', style: eng ? { color: eng.hue } : null }, ui.icon(n[2])), eng ? h('span', { class: 'dot', style: { background: eng.hue } }) : null, n[1]));
    });
    var createBtn = document.getElementById('zs-create');
    createBtn.appendChild(ui.icon('plus')); createBtn.appendChild(h('span', { class: 't', text: '新規作成' }));
    createBtn.addEventListener('click', function () { app.openCreate(); });
    menuBtn.appendChild(ui.icon('menu'));
    menuBtn.addEventListener('click', function () { if (navEl.classList.contains('open')) app.closeDrawer(); else openDrawer(); });
    scrimEl.addEventListener('click', function () { app.closeDrawer(); });
    navEl.addEventListener('click', function (e) { if (e.target.closest('a')) app.closeDrawer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && navEl.classList.contains('open')) { app.closeDrawer(); menuBtn.focus(); } });
    g.addEventListener('resize', function () { if (g.innerWidth > 880) app.closeDrawer(); });
    [['home', 'ホーム', 'home'], ['projects', 'プロジェクト', 'folder']].forEach(function (t) { tabbarEl.appendChild(h('a', { href: '#/' + t[0], 'data-name': t[0] }, ui.icon(t[2]), t[1])); });
    tabbarEl.appendChild(h('button', { type: 'button', onclick: function () { app.openCreate(); } }, ui.icon('plus'), '新規作成'));
    tabbarEl.appendChild(h('button', { type: 'button', onclick: function () { openDrawer(); } }, ui.icon('menu'), 'メニュー'));
    ZS.store.open().then(function (store) {
      app.store = store; app.svc = ZS.createService(store, { zeroImporter: zeroImporter });
      g.addEventListener('hashchange', onRoute);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') app.flush(); });
      g.addEventListener('pagehide', function () { app.flush(); });
      app.refreshStorage().catch(function () { });
      onRoute();
    }).catch(function (e) {
      main.appendChild(h('div', { class: 'zs-page' }, banner0('ZeroStudio を起動できませんでした: ' + U.explain(e) + ' ブラウザのプライベートモードや、ストレージを無効にする設定を確認してください。')));
    });
    function banner0(t) { return h('div', { class: 'zs-banner bad' }, h('span', { text: t })); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
