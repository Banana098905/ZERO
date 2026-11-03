/* ZeroStudio — ページ（ホーム／プロジェクト／共通ライブラリ／インポート・エクスポート／設定） */
(function (g) {
  'use strict';
  var ZS = (g.ZS = g.ZS || {});
  var U = ZS.util, E = ZS.engines, S = ZS.schema, ui = ZS.ui, h = U.h;
  var P = (ZS.pages = {});
  var TEXT = {
    code: 'HTML・CSS・JavaScript の編集とライブプレビュー。ドット絵（Pixel Lab）、テンプレート、素材のコード利用。',
    logic: '回路エディター、CPU Lab とアセンブリ、Signal Analyzer、Machine Lab（機械シミュレーション）。',
    zero: 'Studio・Experiment・Creation・Remix。部品の作成、派生作品、履歴、再利用。'
  };
  var ZERO_NEW = { studio: '/studio/new', experiment: '/lab', creation: '/create' };
  var LEGACY_LABEL = { 'codelab.projects.v2': 'CODE LAB のプロジェクト', 'codelab.pixel.projects.v1': 'CODE LAB のドット絵', 'lp.proj': 'Logic の保存済み回路', 'lp.auto': 'Logic の回路（自動保存）', 'lp.ml.proj': 'Logic の保存済み機械', 'lp.ml.auto': 'Logic の機械（自動保存）', 'lp.asm': 'Logic のCPUプログラム', 'zero-idb': '旧 Playground Zero の作品' };
  var STATUS = { new: '新規', copy: 'コピーとして追加', same: '取り込み済み', invalid: '取り込めない' };
  var KIND_LABEL = { 'pixel-art': 'ドット絵', image: '画像', circuit: '回路', machine: '機械', 'cpu-program': 'CPUプログラム' };

  function page(children) { var el = h('div', { class: 'zs-page' }); children.forEach(function (c) { if (c) el.appendChild(c); }); return el; }
  function title(t, lead) { return [h('h1', { text: t }), lead ? h('p', { class: 'zs-lead', text: lead }) : null]; }
  function field(label, control) { return h('div', { class: 'zs-field' }, h('label', { text: label }), control); }
  function banner(text, cls, buttons) { return h('div', { class: 'zs-banner ' + (cls || '') }, h('span', { text: text }), buttons || []); }
  function when(iso) { return h('span', { title: U.fmtDate(iso), text: U.fmtAgo(iso) }); }
  function typeLabel(p) { return E.label(p); }

  /* ---------- 新規作成メニューの項目（全エンジン共通） ---------- */
  P.newItems = function (app) {
    var items = [];
    E.all().forEach(function (eng) {
      items.push({ heading: eng.label });
      eng.workTypes.forEach(function (w) { items.push({ label: '新規 ' + w.label, onClick: function () { app.newProject(eng.id, w.id); } }); });
    });
    return items;
  };

  /* ---------- 作品タイプの表示（アイコン・一言説明）。共通の見た目はここで決める ---------- */
  var WT_ICON = { web: 'code', pixel: 'pixel', circuit: 'circuit', 'cpu-program': 'chip', machine: 'settings', studio: 'sparkle', experiment: 'flask', creation: 'blocks' };
  var WT_DESC = {
    web: 'HTML・CSS・JavaScript を書いて、その場でプレビュー',
    pixel: 'ドット絵を描いて、コードや画像として使う',
    circuit: 'ゲートとスイッチをつないで、動きを確かめる',
    'cpu-program': 'アセンブリでプログラムを書き、CPU で動かす',
    machine: '回路の信号で動く機械をシミュレーション',
    studio: '図形と文字で作品をつくる',
    experiment: '流れ・配色・模様・動きの実験室',
    creation: 'ブロックを組んで、自分の実験をつくる'
  };
  P.iconOf = function (p) { return WT_ICON[p.workType] || p.engine; };

  /* ---------- 新規作成ダイアログ（どの画面からでも1回で作品タイプを選べる） ---------- */
  P.createDialog = function (app) {
    return ui.dialog({
      title: '何をつくりますか？', wide: true,
      build: function (b, ctx) {
        var grid = h('div', { class: 'zs-pick' });
        E.all().forEach(function (eng) {
          var sec = h('section', { style: { '--c': eng.hue } }, h('h3', null, ui.icon(eng.id), eng.label));
          eng.workTypes.forEach(function (w) {
            sec.appendChild(h('button', { type: 'button', onclick: function () { ctx.close(true); app.newProject(eng.id, w.id); } },
              h('span', { class: 'ic' }, ui.icon(WT_ICON[w.id] || eng.id)), h('span', { class: 'nm', text: w.label }), h('span', { class: 'ds', text: WT_DESC[w.id] || '' })));
          });
          grid.appendChild(sec);
        });
        b.appendChild(grid);
        b.appendChild(h('p', { class: 'zs-hint', style: { marginTop: '14px' }, text: '作成した作品は自動で保存され、プロジェクト一覧に並びます。' }));
      },
      actions: [{ label: '閉じる', value: null }]
    });
  };

  /* ---------- ホームのメインビジュアル: 3つのエンジンが1つの共通プロジェクトにつながる様子 ---------- */
  function heroArt() {
    var s = ui.svgEl, reduce = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var kids = [];
    function node(x, y, color, name) { return [s('rect', { class: 'node', x: x, y: y, width: 210, height: 112, rx: 14 }), s('circle', { cx: x + 22, cy: y + 24, r: 4.5, fill: color }), (function () { var t = s('text', { class: 'lbl', x: x + 34, y: y + 29 }); t.textContent = name; return t; })()]; }
    function text(cls, x, y, str, anchor) { var t = s('text', { class: cls, x: x, y: y, 'text-anchor': anchor || 'start' }); t.textContent = str; return t; }
    var wires = [['M129 140V206H196', 'zs-w1', 0], ['M431 140V206H366', 'zs-w2', 1.1], ['M281 244V272', 'zs-w3', 2.2]];
    wires.forEach(function (w) { kids.push(s('path', { class: 'wire', d: w[0], id: w[1] })); });
    node(24, 28, '#7db7ff', 'Code Studio').forEach(function (n) { kids.push(n); });
    [[44, 52, 118], [44, 52 + 14, 150], [44, 52 + 28, 92], [44, 52 + 42, 132]].forEach(function (l, i) { kids.push(s('rect', { x: l[0], y: l[1] + 22, width: l[2] * 1, height: 6, rx: 3, fill: i % 2 ? '#8ab8ff' : '#7db7ff', opacity: i % 2 ? .45 : .8 })); });
    kids.push(s('rect', { class: 'cursor', x: 44 + 134, y: 52 + 42 + 20, width: 7, height: 10, rx: 1.5, fill: '#62e6c4' }));
    node(326, 28, '#5fe3c0', 'Logic Studio').forEach(function (n) { kids.push(n); });
    [['M346 84h26', 0], ['M346 110h26', 0], ['M372 68h16a26 26 0 0 1 0 52h-16z', 1], ['M414 94h30', 0]].forEach(function (p) { kids.push(s('path', { d: p[0], fill: p[1] ? 'rgb(95 227 192 / .12)' : 'none', stroke: '#5fe3c0', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); });
    kids.push(s('circle', { cx: 458, cy: 94, r: 8, fill: '#5fe3c0' }));
    node(176, 272, '#b4a8ff', 'Zero Engine').forEach(function (n) { kids.push(n); });
    var dots = [[204, 318, 3], [226, 340, 2.2], [250, 322, 3.4], [276, 346, 2.4], [298, 316, 2.8], [322, 338, 3.2], [346, 322, 2.2], [214, 360, 2], [262, 364, 2.6], [334, 362, 2.4], [304, 358, 1.8], [238, 304, 1.8]];
    kids.push(s('g', { class: 'dots' }, dots.map(function (d, i) { return s('circle', { cx: d[0], cy: d[1], r: d[2], fill: i % 3 === 0 ? '#b4a8ff' : i % 3 === 1 ? '#c9c2ff' : '#8ab8ff', opacity: .9 }); })));
    kids.push(s('rect', { class: 'hub', x: 196, y: 168, width: 170, height: 76, rx: 16 }));
    kids.push(text('lbl', 281, 201, '共通プロジェクト', 'middle'));
    kids.push(text('sub', 281, 222, '保存・版・素材を共有', 'middle'));
    wires.forEach(function (w) {
      if (reduce) return;
      var c = s('circle', { class: 'pulse', r: 4.2 });
      c.appendChild(s('animateMotion', { dur: '3.4s', begin: w[2] + 's', repeatCount: 'indefinite', keyPoints: w[1] === 'zs-w3' ? '1;0' : '0;1', keyTimes: '0;1', calcMode: 'linear' }, [s('mpath', { href: '#' + w[1] })]));
      kids.push(c);
    });
    return h('div', { class: 'zs-hero-art', role: 'img', 'aria-label': 'Code Studio・Logic Studio・Zero Engine が1つの共通プロジェクトにつながっている図' }, s('svg', { viewBox: '0 0 560 410', 'aria-hidden': 'true' }, kids));
  }

  /* ================= ホーム ================= */
  P.home = function (app) {
    var svc = app.svc, notices = h('div'), cards = h('div', { class: 'zs-cards' }), recent = h('div'), cta = h('div', { class: 'cta' });
    var createBtn = h('button', { class: 'zs-btn primary lg', type: 'button', 'aria-haspopup': 'dialog', onclick: function () { app.openCreate(); } }, ui.icon('plus'), '新規作成');
    var importBtn = h('a', { class: 'zs-btn lg', href: '#/io' }, ui.icon('transfer'), 'ファイルを取り込む');
    cta.appendChild(createBtn); cta.appendChild(importBtn);
    E.all().forEach(function (eng) {
      var btns = eng.workTypes.map(function (w) { return h('button', { class: 'zs-btn sm', type: 'button', text: '新規 ' + w.label, onclick: function () { app.newProject(eng.id, w.id); } }); });
      cards.appendChild(h('div', { class: 'zs-card', style: { '--c': eng.hue } },
        h('span', { class: 'tile' }, ui.icon(eng.id)), h('h3', { text: eng.label }), h('p', { text: TEXT[eng.id] || '' }),
        h('div', { class: 'quick' }, btns),
        h('div', { class: 'zs-row' }, h('a', { class: 'zs-btn', href: '#/' + eng.id }, '開く', ui.icon('arrow')))));
    });
    svc.list({ sort: 'updated' }).then(function (r) {
      var list = r.projects.slice(0, 6), last = r.projects.filter(function (p) { return !!E.get(p.engine); })[0];
      if (last) {
        U.clear(cta);
        cta.appendChild(h('button', { class: 'zs-btn primary lg resume', type: 'button', title: '最後に編集したプロジェクトを開く', onclick: function () { app.openProject(last); } }, ui.icon('play'), h('span', { class: 'txt' }, h('small', { text: '続きから' }), h('b', { text: last.title }))));
        cta.appendChild(h('button', { class: 'zs-btn lg', type: 'button', 'aria-haspopup': 'dialog', onclick: function () { app.openCreate(); } }, ui.icon('plus'), '新規作成'));
      }
      recent.appendChild(h('div', { class: 'zs-sechead' }, h('h2', { text: '最近のプロジェクト' }), r.projects.length > list.length ? h('a', { href: '#/projects', text: 'すべて見る（' + r.projects.length + ' 件）' }) : null));
      if (!list.length) return recent.appendChild(h('div', { class: 'zs-empty' }, h('b', { text: 'まだプロジェクトがありません' }), h('span', { text: '最初の作品をつくってみましょう。旧アプリのデータがある場合は取り込みもできます。' }),
        h('div', { class: 'zs-row' }, h('button', { class: 'zs-btn primary', type: 'button', onclick: function () { app.openCreate(); } }, ui.icon('plus'), '新規作成'), h('a', { class: 'zs-btn', href: '#/io', text: '取り込み' }))));
      recent.appendChild(projectList(app, list, { compact: true, grid: true }));
    }).catch(function (e) { ui.error(e); });
    Promise.all([svc.health(), svc.settings(), svc.lastBackupAt(), svc.list(), ZS.host.legacyEnv().then(function (env) { return svc.scanLegacy(env); })]).then(function (r) {
      var hl = r[0], st = r[1], last = r[2], count = r[3].projects.length, leg = r[4];
      if (!hl.ok) notices.appendChild(banner('保存先が「' + hl.label + '」です。ブラウザの設定によって、データが消えたり容量が足りなくなったりする可能性があります。こまめにバックアップを書き出してください。', 'warn', [h('a', { class: 'zs-btn sm', href: '#/settings', text: '詳しく' })]));
      var pending = leg.items.filter(function (i) { return i.status === 'new' || i.status === 'copy'; }).length;
      if (pending) notices.appendChild(banner('このブラウザに、旧アプリ（CODE LAB / LOGIC PLAYGROUND / PLAYGROUND ZERO）の保存データが ' + pending + ' 件見つかりました。元のデータは変更せず、コピーして取り込みます。', '', [h('a', { class: 'zs-btn sm primary', href: '#/io', text: '取り込みへ' })]));
      if (count && st.backupReminderDays) {
        var days = last ? (Date.now() - Date.parse(last)) / 86400000 : Infinity;
        if (days >= st.backupReminderDays) notices.appendChild(banner(last ? 'バックアップから ' + Math.floor(days) + ' 日が経っています。' : 'まだバックアップを書き出していません。', 'warn', [h('button', { class: 'zs-btn sm', type: 'button', text: '今すぐ書き出す', onclick: function () { app.backupNow(); } })]));
      }
    }).catch(function () { /* 通知は任意 */ });
    var hero = h('section', { class: 'zs-hero' },
      h('div', null, h('h1', null, 'コードも回路も、', h('br'), 'ひとつの工房で。'), h('p', { class: 'zs-lead', text: 'Web作品・ロジック回路・Zero の実験を、同じプロジェクト管理でつくり続けられます。作品はこのブラウザに自動で保存されます。' }), cta),
      heroArt());
    return page([notices, hero, h('div', { class: 'zs-sechead' }, h('h2', { text: '制作環境' })), cards, recent, h('p', { class: 'zs-hint', style: { marginTop: '32px' }, text: 'データはこのブラウザの中にだけあります。オンライン共有はまだありません。大切な作品は、定期的にバックアップを書き出してください。' })]);
  };

  /* ================= プロジェクト一覧（共通部品つき） ================= */
  function projectList(app, list, o) {
    o = o || {};
    var box = h('div', { class: 'zs-list' + (o.grid ? ' grid' : '') });
    list.forEach(function (p) {
      var known = !!E.get(p.engine), eng0 = E.get(p.engine);
      var meta = h('div', { class: 'm' }, ui.engineChip(p.engine), h('span', { text: typeLabel(p) }), h('span', { text: 'v' + p.projectVersion, title: 'プロジェクトの版' }), when(p.updatedAt),
        p.derivedFrom ? h('span', { class: 'zs-faint', title: '派生元: ' + p.derivedFrom.projectId + (p.derivedFrom.projectVersion ? ' v' + p.derivedFrom.projectVersion : '') }, '⑂ ' + (p.derivedFrom.title || '派生')) : null,
        p.visibility === 'export-ready' ? ui.chip('公開用に書き出し可', '', 'ローカルの設定です。オンライン公開ではありません') : null);
      var acts = h('div', { class: 'acts' });
      acts.appendChild(h('button', { class: 'zs-btn sm', type: 'button', disabled: !known, title: known ? '' : 'このアプリ版では開けないエンジンです（データは保持されます）', text: '開く', onclick: function () { app.openProject(p); } }));
      if (!o.compact) {
        var more = h('button', { class: 'zs-btn sm', type: 'button', 'aria-haspopup': 'menu', text: '⋯', title: 'その他の操作' });
        more.addEventListener('click', function () { ui.menu(more, rowMenu(app, p, o)); });
        acts.appendChild(more);
      }
      var row = h('div', { class: 'zs-item', style: { '--c': eng0 ? eng0.hue : 'var(--zs-faint)' } });
      row.appendChild(p.thumb ? h('img', { class: 'thumb', src: p.thumb, alt: '' }) : h('span', { class: 'glyph' }, ui.icon(P.iconOf(p))));
      row.appendChild(h('div', { style: { minWidth: 0 } }, h('div', { class: 't', text: p.title, title: p.title }), meta));
      row.appendChild(acts); box.appendChild(row);
    });
    return box;
  }
  function rowMenu(app, p, o) {
    var eng = E.get(p.engine);
    return [
      { label: '名前を変更…', onClick: function () { app.renameProject(p).then(o.refresh); } },
      { label: '複製', onClick: function () { app.svc.duplicate(p.id).then(function (c) { ui.toast('「' + c.title + '」を作成しました（派生元: v' + (c.derivedFrom ? c.derivedFrom.projectVersion : '?') + '）', 'ok'); if (o.refresh) o.refresh(); }, ui.error); } },
      { label: '詳細・依存関係…', onClick: function () { app.showProject(p.id).then(o.refresh); } },
      '-',
      { label: 'ZeroStudio JSON で書き出す', onClick: function () { app.exportProject(p.id); } },
      { label: '元アプリ形式で書き出す', disabled: !eng || !eng.exportFile, onClick: function () { app.exportNative(p.id); } },
      '-',
      { label: '削除…', danger: true, onClick: function () { app.deleteProject(p).then(o.refresh); } }
    ];
  }
  P.projectList = projectList;

  P.projects = function (app) {
    var svc = app.svc, f = { q: '', engine: '', workType: '', sort: 'updated' }, listBox = h('div'), info = h('span', { class: 'zs-muted' }), problems = h('div'), undo = h('span');
    var q = h('input', { class: 'zs-in', type: 'search', placeholder: 'タイトル・説明・タグ・IDで検索', 'aria-label': '検索' });
    var engSel = h('select', { class: 'zs-sel', 'aria-label': 'エンジンで絞り込み' }, h('option', { value: '', text: 'すべてのエンジン' }), E.all().map(function (e) { return h('option', { value: e.id, text: e.label }); }));
    var wtSel = h('select', { class: 'zs-sel', 'aria-label': '作品タイプで絞り込み' });
    var sortSel = h('select', { class: 'zs-sel', 'aria-label': '並べ替え' }, [['updated', '更新日時（新しい順）'], ['created', '作成日時（新しい順）'], ['title', 'タイトル順'], ['version', '版（大きい順）']].map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
    function fillWt() {
      U.clear(wtSel); wtSel.appendChild(h('option', { value: '', text: 'すべての種類' }));
      E.all().filter(function (e) { return !f.engine || e.id === f.engine; }).forEach(function (e) { e.workTypes.forEach(function (w) { wtSel.appendChild(h('option', { value: w.id, text: (f.engine ? '' : e.short + ' / ') + w.label })); }); });
      f.workType = ''; wtSel.value = '';
    }
    function refresh() {
      return svc.list(Object.assign({}, f, { dir: f.sort === 'version' ? 'desc' : undefined })).then(function (r) {
        U.clear(listBox); U.clear(problems);
        info.textContent = r.projects.length + ' 件' + (f.q || f.engine || f.workType ? '（絞り込み中）' : '');
        var filtered = !!(f.q || f.engine || f.workType);
        if (!r.projects.length) listBox.appendChild(h('div', { class: 'zs-empty' }, h('b', { text: filtered ? '条件に合うプロジェクトがありません' : 'まだプロジェクトがありません' }), h('span', { text: filtered ? '検索語や絞り込みを変えてみてください。' : '「新規作成」から始めるか、旧アプリのデータを取り込めます。' }),
          h('div', { class: 'zs-row' }, filtered ? h('button', { class: 'zs-btn', type: 'button', text: '絞り込みを解除', onclick: function () { q.value = ''; engSel.value = ''; f.q = ''; f.engine = ''; fillWt(); refresh(); } }) : [h('button', { class: 'zs-btn primary', type: 'button', onclick: function () { app.openCreate(); } }, ui.icon('plus'), '新規作成'), h('a', { class: 'zs-btn', href: '#/io', text: '取り込み' })])));
        else listBox.appendChild(projectList(app, r.projects, { refresh: refresh, grid: viewMode === 'grid' }));
        if (r.problems.length) problems.appendChild(banner('読み込めないデータが ' + r.problems.length + ' 件あります（削除はしていません）。内容を確認するため JSON として保存できます。', 'bad', [h('button', { class: 'zs-btn sm', type: 'button', text: 'JSON として保存', onclick: function () { ui.downloadJson('zerostudio-unreadable.json', r.problems.map(function (x) { return { errors: x.errors, raw: x.raw }; })); } })]));
        U.clear(undo);
        if (app.lastDeleted) undo.appendChild(h('button', { class: 'zs-btn sm', type: 'button', text: '直前の削除を取り消す（' + U.str(app.lastDeleted.title, 20) + '）', onclick: function () { svc.restoreRaw(app.lastDeleted).then(function () { ui.toast('復元しました', 'ok'); app.lastDeleted = null; refresh(); }, ui.error); } }));
      }, ui.error);
    }
    var tq = U.debounce(function () { f.q = q.value; refresh(); }, 180);
    q.addEventListener('input', tq);
    engSel.addEventListener('change', function () { f.engine = engSel.value; fillWt(); refresh(); });
    wtSel.addEventListener('change', function () { f.workType = wtSel.value; refresh(); });
    sortSel.addEventListener('change', function () { f.sort = sortSel.value; refresh(); });
    var newBtn = h('button', { class: 'zs-btn primary', type: 'button', 'aria-haspopup': 'dialog' }, ui.icon('plus'), '新規作成');
    newBtn.addEventListener('click', function () { app.openCreate(); });
    var viewMode = 'list', listBtn = h('button', { type: 'button', 'aria-label': 'リスト表示', title: 'リスト表示', 'aria-pressed': 'true' }, ui.icon('list')), gridBtn = h('button', { type: 'button', 'aria-label': 'カード表示', title: 'カード表示', 'aria-pressed': 'false' }, ui.icon('grid'));
    function setView(m, save) { viewMode = m; listBtn.setAttribute('aria-pressed', String(m === 'list')); gridBtn.setAttribute('aria-pressed', String(m === 'grid')); if (save) app.store.setMeta('ui:projects-view', m).catch(function () { }); refresh(); }
    listBtn.addEventListener('click', function () { setView('list', true); }); gridBtn.addEventListener('click', function () { setView('grid', true); });
    var seg = h('div', { class: 'zs-seg', role: 'group', 'aria-label': '表示の切り替え' }, listBtn, gridBtn);
    fillWt(); app.store.getMeta('ui:projects-view', 'list').then(function (m) { setView(m === 'grid' ? 'grid' : 'list', false); }, function () { refresh(); });
    var off = app.store.onChange(U.debounce(function (m, ext) { if (m.coll === 'projects' && ext) refresh(); }, 300));
    var el = page(title('プロジェクト', 'すべての制作エンジンの作品を、ここで一括して管理します。').concat([problems, h('div', { class: 'zs-tools' }, [q, engSel, wtSel, sortSel, seg, newBtn]), h('div', { class: 'zs-row', style: { margin: '0 0 8px' } }, [info, undo]), listBox]));
    return { el: el, destroy: off };
  };

  /* ================= プロジェクト詳細 ================= */
  P.projectDialog = function (app, id) {
    var svc = app.svc;
    return Promise.all([svc.get(id), svc.deps(id), svc.settings()]).then(function (r) {
      var p = r[0], d = r[1];
      if (!p) { ui.toast('プロジェクトが見つかりません。', 'err'); return null; }
      var title = h('input', { class: 'zs-in', value: p.title, maxlength: 80 }), desc = h('textarea', { class: 'zs-ta', maxlength: 500 }); desc.value = p.description;
      var tags = h('input', { class: 'zs-in', value: p.tags.join(', '), placeholder: 'カンマ区切り（例: 試作, 学習）' });
      var author = h('input', { class: 'zs-in', value: p.author.name, maxlength: 40 });
      var lic = h('select', { class: 'zs-sel' }, S.LICENSES.map(function (l) { return h('option', { value: l.id, text: l.label, selected: l.id === p.license.id }); }));
      var vis = h('select', { class: 'zs-sel' }, h('option', { value: 'private', text: '非公開（ローカルのみ）', selected: p.visibility === 'private' }), h('option', { value: 'export-ready', text: '公開用データの書き出しを許可（ローカルのみ）', selected: p.visibility === 'export-ready' }));
      var depBox = h('div');
      function depRow(label, items, fmt) {
        if (!items.length) return;
        depBox.appendChild(h('h2', { text: label, style: { fontSize: '13px', margin: '12px 0 4px' } }));
        items.forEach(function (x) { depBox.appendChild(h('div', { class: 'zs-muted', text: fmt(x), style: { fontSize: '13px' } })); });
      }
      depRow('このプロジェクトが使っているもの', d.uses, function (u) {
        if (u.type === 'ref') return '・' + (u.note || '参照');
        var kind = u.type === 'library' ? '素材・部品' : 'プロジェクト';
        return '・' + kind + '「' + (u.name || u.id) + '」 v' + (u.version || '?') + (u.exists === false ? '（見つかりません）' : u.outdated ? '（最新は v' + u.latest + '）' : '');
      });
      depRow('派生元', d.parent ? [d.parent] : (p.derivedFrom ? [{ title: p.derivedFrom.title || p.derivedFrom.projectId, missing: true }] : []), function (x) { return '・' + x.title + (x.missing ? '（現在のストアにありません）' : ' v' + x.projectVersion); });
      depRow('このプロジェクトを使っているもの', d.usedBy, function (x) { return '・' + x.title + '（' + typeLabel(x) + '）'; });
      depRow('このプロジェクトから派生したもの', d.derived, function (x) { return '・' + x.title + '（' + typeLabel(x) + '）'; });
      if (!depBox.children.length) depBox.appendChild(h('p', { class: 'zs-muted', text: '依存関係はありません。' }));
      var kv = h('dl', { class: 'zs-kv' },
        h('dt', { text: 'プロジェクトID' }), h('dd', { class: 'zs-mono', text: p.id }),
        h('dt', { text: 'エンジン / 種類' }), h('dd', { text: (E.get(p.engine) ? E.get(p.engine).label : p.engine) + ' / ' + typeLabel(p) }),
        h('dt', { text: 'プロジェクトの版' }), h('dd', { text: 'v' + p.projectVersion }),
        h('dt', { text: 'データ形式の版' }), h('dd', { text: '共通形式 ' + p.formatVersion + ' / 作品データ schema ' + p.engineData.schemaVersion }),
        h('dt', { text: '作成 / 更新' }), h('dd', { text: U.fmtDate(p.createdAt) + ' / ' + U.fmtDate(p.updatedAt) }));
      var save = function () {
        return svc.update(id, { title: title.value.trim() || p.title, description: desc.value, tags: tags.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean), author: { name: author.value }, license: { id: lic.value, holder: author.value }, visibility: vis.value })
          .then(function () { if (app.onProjectUpdated) return app.onProjectUpdated(id); }).then(function () { ui.toast('保存しました', 'ok'); return true; }, function (e) { ui.error(e); return false; });
      };
      return ui.dialog({
        title: 'プロジェクトの詳細',
        build: function (b) {
          b.appendChild(kv); b.appendChild(h('div', { style: { height: '12px' } }));
          b.appendChild(field('タイトル', title)); b.appendChild(field('説明', desc)); b.appendChild(field('タグ', tags));
          b.appendChild(field('作者名', author)); b.appendChild(field('ライセンス', lic)); b.appendChild(field('公開設定', vis));
          b.appendChild(h('p', { class: 'zs-faint', text: '公開設定はこのブラウザ内の印です。V1 にはオンライン共有の機能はなく、公開用データはファイルとして書き出されます。' }));
          b.appendChild(depBox);
        },
        actions: [{ label: '閉じる', value: false }, { label: '保存', value: true, primary: true, beforeClose: save }]
      });
    });
  };

  /* ================= 共通ライブラリ ================= */
  function previewOf(item) {
    try {
      if (item.kind === 'pixel-art') return ZS.convert.pixelToPngDataUrl(item.data, 2);
      if (item.kind === 'image' && ZS.convert.IMAGE_RE.test(item.data.dataUrl || '')) return item.data.dataUrl;
    } catch (e) { /* プレビューは任意 */ }
    return null;
  }
  P.library = function (app) {
    var svc = app.svc, f = { q: '', kind: '' }, box = h('div'), zbox = h('div');
    var q = h('input', { class: 'zs-in', type: 'search', placeholder: '素材・部品を検索', 'aria-label': '検索' });
    var kindSel = h('select', { class: 'zs-sel', 'aria-label': '種類' }, h('option', { value: '', text: 'すべての種類' }), ['pixel-art', 'image', 'circuit', 'machine', 'cpu-program'].map(function (k) { return h('option', { value: k, text: KIND_LABEL[k] }); }));
    var fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'zs-sr', tabindex: '-1' });
    function refresh() {
      Promise.all([svc.libList({ q: f.q, kind: f.kind }), svc.list(), app.store.getMeta('zero:rxc', [])]).then(function (r) {
        U.clear(box); U.clear(zbox);
        var items = r[0].items, projects = r[1].projects;
        if (!items.length) box.appendChild(h('div', { class: 'zs-empty', text: f.q || f.kind ? '条件に合う素材がありません。' : 'まだ素材がありません。Code Studio のドット絵や Logic Studio の回路を「素材として登録」するか、画像を追加してください。' }));
        else {
          var list = h('div', { class: 'zs-list' });
          items.forEach(function (it) {
            var used = projects.filter(function (p) { return p.assets.some(function (a) { return a.id === it.id; }) || p.dependencies.some(function (d) { return d.type === 'library' && d.id === it.id; }); }).length, pv = previewOf(it);
            var use = h('button', { class: 'zs-btn sm primary', type: 'button', 'aria-haspopup': 'menu', text: '使う ▾' });
            use.addEventListener('click', function () { ui.menu(use, useMenu(app, it)); });
            var det = h('button', { class: 'zs-btn sm', type: 'button', text: '詳細', onclick: function () { P.libraryDialog(app, it.id).then(refresh); } });
            var row = h('div', { class: 'zs-item' + (pv ? '' : ' no-glyph') });
            if (pv) row.appendChild(h('img', { class: 'thumb', src: pv, alt: '' }));
            row.appendChild(h('div', { style: { minWidth: 0 } }, h('div', { class: 't', text: it.name }), h('div', { class: 'm' }, ui.chip(KIND_LABEL[it.kind] || it.kind), h('span', { text: 'v' + it.version }), h('span', { text: used ? used + ' 件のプロジェクトで使用中' : '未使用' }), when(it.updatedAt))));
            row.appendChild(h('div', { class: 'acts' }, [use, det])); list.appendChild(row);
          });
          box.appendChild(list);
        }
        var parts = Array.isArray(r[2]) ? r[2] : [];
        zbox.appendChild(h('h2', { text: 'Zero の部品（Remix で作成）' }));
        zbox.appendChild(h('p', { class: 'zs-muted', text: 'Zero Engine の Remix / Creation で作った部品です。Zero の形式のままで、Code・Logic とは互換がありません。ここでは使用状況の確認ができます。' }));
        if (!parts.length) zbox.appendChild(h('div', { class: 'zs-empty', text: 'Zero の部品はまだありません。' }));
        else {
          var zl = h('div', { class: 'zs-list' });
          parts.slice(0, 100).forEach(function (c) {
            if (!c || typeof c.id !== 'string') return;
            var n = projects.filter(function (p) { return p.dependencies.some(function (d) { return d.type === 'library' && d.id === c.id; }); }).length;
            zl.appendChild(h('div', { class: 'zs-item no-glyph' }, h('div', null, h('div', { class: 't', text: U.str(c.name, 60, c.id) }), h('div', { class: 'm' }, ui.engineChip('zero'), h('span', { text: U.str(c.kind, 12) }), h('span', { text: 'v' + (c.version || 1) }), h('span', { text: n ? n + ' 件のプロジェクトで使用中' : '未使用' }))), h('div', { class: 'acts' }, h('a', { class: 'zs-btn sm', href: '#/zero?go=' + encodeURIComponent('/remix'), text: 'Zero で開く' }))));
          });
          zbox.appendChild(zl);
        }
      }).catch(ui.error);
    }
    q.addEventListener('input', U.debounce(function () { f.q = q.value; refresh(); }, 180));
    kindSel.addEventListener('change', function () { f.kind = kindSel.value; refresh(); });
    var add = h('button', { class: 'zs-btn', type: 'button', text: '画像を追加…', onclick: function () { fileIn.click(); } });
    fileIn.addEventListener('change', function () {
      var file = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!file) return;
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return ui.toast('PNG / JPEG / WebP / GIF の画像だけ追加できます。', 'err');
      ui.readFileAsDataUrl(file, 1.5 * 1024 * 1024).then(function (url) {
        if (!ZS.convert.IMAGE_RE.test(url)) throw U.ZSError('INVALID', '画像の形式を確認できませんでした。');
        return svc.libRegister({ kind: 'image', name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || '画像', data: { dataUrl: url }, mime: file.type });
      }).then(function () { ui.toast('画像を追加しました', 'ok'); refresh(); }, ui.error);
    });
    var impBtn = h('a', { class: 'zs-btn', href: '#/io', text: 'ファイルから取り込む' });
    refresh();
    var off = app.store.onChange(U.debounce(function (m, ext) { if (ext && (m.coll === 'library' || m.coll === 'meta')) refresh(); }, 300));
    var el = page(title('共通ライブラリ', '素材・部品を登録して、別の作品で再利用できます。使用中のプロジェクトと版を追跡します。素材は作品へコピーされ、更新は自動では反映されません（更新があれば通知します）。').concat([h('div', { class: 'zs-tools' }, [q, kindSel, add, impBtn, fileIn]), box, zbox]));
    return { el: el, destroy: off };
  };
  function useMenu(app, it) {
    var items = [];
    if (it.kind === 'pixel-art') {
      items.push({ heading: 'Code Studio の Web作品に挿入' });
      items.push({ label: 'CSS（box-shadow）で挿入', onClick: function () { app.insertIntoCode(it, 'css'); } });
      items.push({ label: 'PNG 画像（img）で挿入', onClick: function () { app.insertIntoCode(it, 'png'); } });
      items.push({ label: 'Canvas 用 JavaScript で挿入', onClick: function () { app.insertIntoCode(it, 'canvas'); } });
      items.push('-'); items.push({ label: 'Pixel Lab で新規プロジェクトとして開く', onClick: function () { app.openFromLibrary(it, 'code', 'pixel'); } });
    } else if (it.kind === 'image') {
      items.push({ label: 'Code Studio の Web作品に <img> で挿入', onClick: function () { app.insertIntoCode(it, 'img'); } });
    } else if (it.kind === 'circuit' || it.kind === 'machine' || it.kind === 'cpu-program') {
      items.push({ label: 'Logic Studio で新規プロジェクトとして開く', onClick: function () { app.openFromLibrary(it, 'logic', it.kind); } });
    }
    items.push('-'); items.push({ label: '素材を JSON で書き出す', onClick: function () { ui.downloadJson(U.safeFileName(it.name, '.zslib.json'), S.buildFile('bundle', [], [it])); } });
    return items;
  }
  P.libraryDialog = function (app, id) {
    var svc = app.svc;
    return Promise.all([svc.libGet(id), svc.libUsage(id)]).then(function (r) {
      var it = r[0], usage = r[1]; if (!it) return null;
      var name = h('input', { class: 'zs-in', value: it.name, maxlength: 80 }), desc = h('textarea', { class: 'zs-ta', maxlength: 500 }); desc.value = it.description;
      var tags = h('input', { class: 'zs-in', value: it.tags.join(', ') }), del = false;
      return ui.dialog({
        title: '素材の詳細',
        build: function (b) {
          var pv = previewOf(it); if (pv) b.appendChild(h('img', { class: 'thumb', src: pv, alt: '', style: { width: '96px', height: '96px', imageRendering: 'pixelated', background: '#0c0d11', border: '1px solid var(--line)', borderRadius: '8px', objectFit: 'contain' } }));
          b.appendChild(h('dl', { class: 'zs-kv', style: { margin: '10px 0 12px' } }, h('dt', { text: '素材ID' }), h('dd', { class: 'zs-mono', text: it.id }), h('dt', { text: '種類 / 版' }), h('dd', { text: (KIND_LABEL[it.kind] || it.kind) + ' / v' + it.version }), h('dt', { text: '更新' }), h('dd', { text: U.fmtDate(it.updatedAt) })));
          b.appendChild(field('名前', name)); b.appendChild(field('説明', desc)); b.appendChild(field('タグ', tags));
          b.appendChild(h('h2', { text: '使用しているプロジェクト', style: { fontSize: '13px' } }));
          if (!usage.length) b.appendChild(h('p', { class: 'zs-muted', text: '使用しているプロジェクトはありません。' }));
          usage.forEach(function (u) { b.appendChild(h('div', { class: 'zs-muted', style: { fontSize: '13px' }, text: '・' + u.project.title + '（' + typeLabel(u.project) + '）— 使用中の版 v' + (u.version || '?') + (u.version && u.version < it.version ? '（最新は v' + it.version + '）' : '') })); });
          b.appendChild(h('div', { style: { height: '10px' } }));
          b.appendChild(h('button', { class: 'zs-btn danger sm', type: 'button', text: 'この素材を削除…', onclick: function (e) { app_delete(e); } }));
        },
        actions: [{ label: '閉じる', value: false }, { label: '保存', value: true, primary: true, beforeClose: function () { return svc.libUpdate(id, { name: name.value.trim() || it.name, description: desc.value, tags: tags.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) }).then(function () { return true; }, function (e) { ui.error(e); return false; }); } }]
      });
      function app_delete(e) {
        var msg = usage.length ? ['この素材は ' + usage.length + ' 件のプロジェクトで使われています。削除しても各作品に埋め込まれたコピーは残りますが、素材の更新通知は出なくなります。'] : ['この素材を削除します。'];
        ui.confirm({ title: '素材を削除しますか？', message: msg.concat(['この操作は元に戻せません。']), okLabel: '削除', danger: true }).then(function (ok) { if (ok) svc.libRemove(id).then(function () { ui.toast('削除しました', 'ok'); e.target.closest('dialog').dispatchEvent(new Event('cancel')); }, ui.error); });
      }
    });
  };

  /* ================= インポート／エクスポート ================= */
  function reportTable(rep) {
    var wrap = h('div');
    function rows(list, kindLabel) {
      if (!list.length) return;
      var t = h('table', { class: 'zs-table' }, h('thead', null, h('tr', null, h('th', { text: kindLabel }), h('th', { text: '状態' }), h('th', { text: 'メモ' }))));
      var tb = h('tbody');
      list.slice(0, 200).forEach(function (it) {
        var memo = (it.errors || []).concat(it.warnings || []).join(' ');
        tb.appendChild(h('tr', null, h('td', null, h('div', { text: it.title || '(名前なし)' }), h('div', { class: 'zs-faint', text: it.engine ? it.engine + ' / ' + (it.workType || '') : (it.kind || '') })), h('td', null, ui.chip(STATUS[it.status] || it.status, it.status)), h('td', { class: 'zs-muted', text: memo })));
      });
      t.appendChild(tb); wrap.appendChild(t);
      if (list.length > 200) wrap.appendChild(h('p', { class: 'zs-muted', text: '…ほか ' + (list.length - 200) + ' 件' }));
    }
    rows(rep.items, 'プロジェクト'); rows(rep.library || [], '素材');
    if (rep.zero) wrap.appendChild(h('p', { text: 'PLAYGROUND ZERO のバックアップ（' + rep.zero.count + ' 件）です。Zero 自身の検証・重複判定で取り込みます（既存の作品は上書きしません）。' }));
    if (rep.meta && rep.meta.length) wrap.appendChild(h('p', { class: 'zs-muted', text: 'Zero の付随データ ' + rep.meta.filter(function (m) { return m.id !== 'settings'; }).length + ' 項目（お気に入り・部品・履歴など）は、まだ無いものだけ追加します。' }));
    (rep.warnings || []).forEach(function (w) { wrap.appendChild(h('p', { class: 'zs-muted', text: '注意: ' + w })); });
    (rep.errors || []).forEach(function (w) { wrap.appendChild(h('p', { style: { color: 'var(--danger)' }, text: w })); });
    return wrap;
  }
  P.io = function (app) {
    var svc = app.svc, out = h('div'), legacyBox = h('div'), pubBox = h('div'), lastBk = h('span', { class: 'zs-muted' });
    var fileIn = h('input', { type: 'file', accept: '.json,application/json,.asm,text/plain', class: 'zs-sr', tabindex: '-1' });
    var drop = h('div', { class: 'zs-drop', tabindex: '0', role: 'button', 'aria-label': 'ファイルを選択' }, h('div', { text: 'ここにファイルをドロップ、またはクリックして選択' }), h('div', { class: 'zs-faint', text: 'ZeroStudio の JSON / バックアップ / 公開用データ、CODE LAB・LOGIC PLAYGROUND の書き出し JSON、Zero のバックアップ（上限 ' + Math.round(S.LIMITS.importBytes / 1048576) + 'MB）' }));
    function handle(file) {
      U.clear(out); out.appendChild(h('p', { class: 'zs-muted', text: '検証中…' }));
      ui.readFile(file, S.LIMITS.importBytes).then(function (text) {
        if (/\.asm$/i.test(file.name) || (file.type === 'text/plain' && !/^\s*[{[]/.test(text))) return svc.inspectImport({ __asm: text }, { filename: file.name });
        return svc.inspectImport(U.parseJson(text, S.LIMITS.importBytes + 1024), { filename: file.name });
      }).then(function (rep) { return confirmImport(app, rep, out); }).catch(function (e) { U.clear(out); out.appendChild(banner(U.explain(e), 'bad')); });
    }
    drop.addEventListener('click', function () { fileIn.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handle(f); });
    fileIn.addEventListener('change', function () { var f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) handle(f); });

    function scanLegacy() {
      U.clear(legacyBox); legacyBox.appendChild(h('p', { class: 'zs-muted', text: '検出中…' }));
      return ZS.host.legacyEnv().then(function (env) { return svc.scanLegacy(env); }).then(function (rep) {
        U.clear(legacyBox);
        var found = Object.keys(rep.sourcesFound);
        if (!found.length && !rep.items.length) return legacyBox.appendChild(h('p', { class: 'zs-muted', text: 'このブラウザ（このサイトの保存領域）に、旧アプリのデータは見つかりませんでした。別の場所（別ドメイン・別のブラウザ）で使っていた場合は、旧アプリ側でバックアップ／JSON を書き出し、上のファイル取り込みを使ってください。' }));
        var ul = h('div', { class: 'zs-row', style: { marginBottom: '8px' } }, found.map(function (k) { return ui.chip((LEGACY_LABEL[k] || k) + ' ' + rep.sourcesFound[k] + ' 件'); }));
        legacyBox.appendChild(ul); legacyBox.appendChild(reportTable({ items: rep.items.map(function (i) { return Object.assign({}, i, { warnings: [] }); }), library: [], meta: rep.meta, warnings: rep.warnings, errors: [] }));
        var n = rep.items.filter(function (i) { return i.status === 'new' || i.status === 'copy'; }).length;
        legacyBox.appendChild(h('div', { class: 'zs-row', style: { marginTop: '10px' } }, h('button', { class: 'zs-btn primary', type: 'button', disabled: !n, text: n ? n + ' 件をコピーして取り込む' : '取り込むものはありません', onclick: function () { svc.applyLegacy(rep).then(function (r) { ui.toast('取り込み完了: ' + r.added + ' 件追加 / ' + r.skipped + ' 件は取り込み済み / ' + r.invalid + ' 件は取り込めませんでした', r.failed ? 'warn' : 'ok'); if (r.errors.length) ui.toast(r.errors.join(' '), 'err'); scanLegacy(); }, ui.error); } }), h('span', { class: 'zs-muted', text: '元のデータは読み取るだけで、変更・削除しません。' })));
      }).catch(function (e) { U.clear(legacyBox); legacyBox.appendChild(banner(U.explain(e), 'bad')); });
    }
    function refreshMeta() {
      svc.lastBackupAt().then(function (t) { lastBk.textContent = t ? '最後のバックアップ: ' + U.fmtDate(t) : 'まだバックアップを書き出していません'; });
      svc.list().then(function (r) {
        U.clear(pubBox); var ready = r.projects.filter(function (p) { return p.visibility === 'export-ready'; });
        if (!ready.length) return pubBox.appendChild(h('p', { class: 'zs-muted', text: '「プロジェクトの詳細」で公開設定を「公開用データの書き出しを許可」にしたプロジェクトが、ここに並びます。' }));
        var l = h('div', { class: 'zs-list' }); ready.forEach(function (p) { l.appendChild(h('div', { class: 'zs-item no-glyph' }, h('div', null, h('div', { class: 't', text: p.title }), h('div', { class: 'm' }, ui.engineChip(p.engine), h('span', { text: 'v' + p.projectVersion }), h('span', { text: 'ライセンス: ' + p.license.id }))), h('div', { class: 'acts' }, h('button', { class: 'zs-btn sm', type: 'button', text: '公開用データを書き出す', onclick: function () { app.exportPublish(p.id); } })))); });
        pubBox.appendChild(l);
      });
    }
    refreshMeta(); scanLegacy();
    return page(title('インポート／エクスポート', 'データはこのブラウザの中にあります。バックアップの書き出しと、JSON の取り込みはここから。').concat([
      h('h2', { text: 'インポート' }), drop, fileIn, out,
      h('h2', { text: 'エクスポートとバックアップ' }),
      h('div', { class: 'zs-row' }, h('button', { class: 'zs-btn primary', type: 'button', text: '全データのバックアップを書き出す', onclick: function () { app.backupNow().then(refreshMeta); } }), h('button', { class: 'zs-btn', type: 'button', text: 'すべてのプロジェクトを JSON で書き出す', onclick: function () { app.exportAllProjects(); } }), lastBk),
      h('p', { class: 'zs-muted', text: '復元は、バックアップファイルを上の「インポート」で読み込みます。既存のプロジェクトは上書きされず、内容が違うものは別の作品として追加されます。' }),
      h('h2', { text: '旧アプリのデータを移行' }), legacyBox,
      h('h2', { text: '公開用データ（将来の Zero 向け）' }),
      h('p', { class: 'zs-muted', text: '作者・ライセンス・派生元・版・使用素材を含む、自己完結したファイルを書き出します。ローカルのファイルであり、オンライン公開ではありません。' }), pubBox
    ]));
  };
  function confirmImport(app, rep, out) {
    U.clear(out);
    var actionable = rep.items.some(function (i) { return i.status === 'new' || i.status === 'copy'; }) || (rep.library || []).some(function (i) { return i.status === 'new' || i.status === 'copy'; }) || !!rep.zero || (rep.meta || []).length > 0;
    out.appendChild(h('h2', { text: '取り込みの確認（まだ何も保存されていません）' }));
    out.appendChild(reportTable(rep));
    var row = h('div', { class: 'zs-row', style: { marginTop: '10px' } });
    var go = h('button', { class: 'zs-btn primary', type: 'button', disabled: !rep.ok || !actionable, text: '取り込む', onclick: function () {
      go.disabled = true;
      app.svc.applyImport(rep).then(function (r) {
        U.clear(out);
        var msg = r.added + ' 件を追加（うち ' + r.copies + ' 件は同じIDの別内容のため別作品として追加）、' + r.skipped + ' 件は取り込み済みのためスキップ、' + r.invalid + ' 件は取り込めませんでした。';
        out.appendChild(banner(msg, r.failed || r.invalid ? 'warn' : '', [h('a', { class: 'zs-btn sm', href: '#/projects', text: 'プロジェクトを見る' })]));
        r.errors.forEach(function (e) { out.appendChild(h('p', { style: { color: 'var(--danger)' }, text: e })); });
      }, function (e) { U.clear(out); out.appendChild(banner(U.explain(e), 'bad')); });
    } });
    row.appendChild(go); row.appendChild(h('button', { class: 'zs-btn', type: 'button', text: 'キャンセル', onclick: function () { U.clear(out); } }));
    out.appendChild(row);
  }

  /* ================= 設定 ================= */
  P.settings = function (app) {
    var svc = app.svc, box = h('div');
    Promise.all([svc.settings(), svc.health()]).then(function (r) {
      var st = r[0], hl = r[1];
      var author = h('input', { class: 'zs-in', value: st.authorName, maxlength: 40 });
      var lic = h('select', { class: 'zs-sel' }, S.LICENSES.map(function (l) { return h('option', { value: l.id, text: l.label, selected: l.id === st.defaultLicense }); }));
      var days = h('input', { class: 'zs-in', type: 'number', min: 0, max: 365, value: st.backupReminderDays, style: { width: '6em' } });
      var save = h('button', { class: 'zs-btn primary', type: 'button', text: '保存', onclick: function () { svc.saveSettings({ authorName: author.value.trim(), defaultLicense: lic.value, backupReminderDays: Math.max(0, Math.min(365, +days.value | 0)) }).then(function () { ui.toast('設定を保存しました', 'ok'); app.refreshStorage(); }, ui.error); } });
      box.appendChild(h('h2', { text: '新規プロジェクトの既定値' }));
      box.appendChild(field('作者名', author)); box.appendChild(field('既定のライセンス', lic)); box.appendChild(field('バックアップを促すまでの日数（0 で通知しない）', days)); box.appendChild(save);
      box.appendChild(h('h2', { text: '保存先' }));
      var est = hl.estimate ? U.fmtBytes(hl.estimate.usage) + ' / ' + U.fmtBytes(hl.estimate.quota) : '取得できません';
      box.appendChild(h('dl', { class: 'zs-kv' }, h('dt', { text: '保存方式' }), h('dd', { text: hl.label + (hl.ok ? '' : '（不安定です。バックアップを推奨）') }), h('dt', { text: '使用量' }), h('dd', { text: est }), h('dt', { text: '永続化' }), h('dd', { text: hl.persisted ? '許可済み（ブラウザが自動削除しにくい状態）' : '未許可（容量が逼迫すると、ブラウザがデータを消すことがあります）' })));
      box.appendChild(h('h2', { text: 'オンライン共有' }));
      box.appendChild(h('p', { class: 'zs-muted', text: 'V1 ではオンラインのアカウント・サーバー・共有機能は実装されていません（提供方式: ' + svc.provider + '＝このブラウザ内のみ）。サービス層（js/zs-service.js）は将来のAPI接続を差し替えられる構造です。' }));
      box.appendChild(h('h2', { text: '登録されているエンジン' }));
      box.appendChild(h('table', { class: 'zs-table' }, h('thead', null, h('tr', null, ['エンジン', '作品タイプ', '素材の種類'].map(function (t) { return h('th', { text: t }); }))), h('tbody', null, E.all().map(function (e) { return h('tr', null, h('td', null, ui.engineChip(e.id, e.label)), h('td', { text: e.workTypes.map(function (w) { return w.label + '(schema ' + w.schemaVersion + ')'; }).join('、') }), h('td', { text: e.libraryKinds.join('、') })); }))));
      box.appendChild(h('p', { class: 'zs-faint', text: 'ZeroStudio ' + S.APP_VERSION + ' ／ 共通形式 formatVersion ' + S.VERSION }));
    }).catch(ui.error);
    return page(title('設定').concat([box]));
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
