// V1.0.3 の品質修正テスト（Node のみ・ブラウザ不要）: SQL の search_path / スキーマ修飾 / 0002、Remix のライセンス検証、Universe の静的検査、リポジトリの衛生
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const rd = f => fs.readFileSync(f, 'utf8'), norm = x => x.replace(/\s+/g, ' ').trim();
const Z = require('../js/zero-core.js');
const sql1 = rd('supabase/migrations/0001_zero.sql'), sql2 = rd('supabase/migrations/0002_search_path_hardening.sql'), rls = rd('supabase/tests/rls.test.sql');
const uvSrc = rd('js/universe.js'), app = rd('js/app.js');
const noComments = x => x.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
function fnDefs(sql) { const m = {}; for (const r of noComments(sql).matchAll(/create (?:or replace )?function (public\.\w+)\(([\s\S]*?)\) returns ([\s\S]*?)\$\$([\s\S]*?)\$\$;/g)) m[r[1]] = { text: norm(r[0].replace(/^create or replace function/, 'create function')), head: r[0].slice(0, r[0].indexOf('$$')), body: r[4] }; return m; }
const lines = (sql, re) => noComments(sql).split('\n').filter(l => re.test(l)).map(norm);
const f1 = fnDefs(sql1), f2 = fnDefs(sql2);
const strip = x => x.replace(/\b(public|storage|auth)\.\w+/g, '$1.X');
const APP_TABLES = 'works|profiles|admins|likes|bookmarks|follows|comments|reports', APP_FUNCS = 'is_admin|can_read_payload|is_own_payload_name|payload_in_use|get_work|works_before|bump|comments_rate|handle_new_user|list_orphan_payloads|trending_works|delete_my_account';

module.exports = function (t) {
  /* ---------- SQL ---------- */
  t('SQL: 0001・0002 の SECURITY DEFINER 関数はすべて search_path を空にし、search_path=public は残らない', () => {
    for (const [name, f2x] of [['0001', f1], ['0002', f2]]) {
      const defs = Object.values(f2x); assert.ok(defs.length >= 12, name + ': 関数の数');
      for (const [fname, d] of Object.entries(f2x)) { if (/security definer/.test(d.head)) assert.ok(/set search_path=''/.test(d.head), name + ' ' + fname + ' は search_path を空にする'); assert.ok(!/search_path\s*=\s*'public'/.test(d.head), name + ' ' + fname); }
      assert.strictEqual(Object.values(f2x).filter(d => /security definer/.test(d.head)).length, 10, name + ': SECURITY DEFINER は10関数');
    }
    assert.ok(!/search_path\s*=\s*'public'/.test(noComments(sql1) + noComments(sql2)));
  });
  t('SQL: 関数本体・ポリシー・トリガーでテーブルと関数が public. / storage. / auth. で修飾されている', () => {
    for (const [name, sql, defs] of [['0001', sql1, f1], ['0002', sql2, f2]]) {
      const targets = Object.entries(defs).map(([k, d]) => [k, d.body]).concat(lines(sql, /^create policy |^drop policy |^create trigger |^drop trigger |^alter table |^revoke |^grant /).map(l => [l.slice(0, 40), l]));
      for (const [k, txt] of targets) { const x = strip(txt);
        const tb = x.match(new RegExp('\\b(?:from|join|update|into|on|table)\\s+(' + APP_TABLES + ')\\b')); assert.ok(!tb, `${name} ${k}: テーブル未修飾 ${tb && tb[0]}`);
        const fn = x.match(new RegExp('(?<![\\w.])(' + APP_FUNCS + ')\\s*\\(')); assert.ok(!fn, `${name} ${k}: 関数未修飾 ${fn && fn[0]}`); } }
  });
  t('SQL: 0002 は 0001 と同一の関数・ポリシー・トリガーを持つ（定義のずれがない）', () => {
    assert.deepStrictEqual(Object.keys(f2).sort(), Object.keys(f1).sort()); for (const k of Object.keys(f1)) assert.strictEqual(f2[k].text, f1[k].text, k + ' の定義が 0001 と一致');
    const p1 = lines(sql1, /^create policy /), p2 = lines(sql2, /^create policy /); assert.strictEqual(p1.length, 23); assert.deepStrictEqual(p2.slice().sort(), p1.slice().sort());
    const tr1 = lines(sql1, /^create trigger /), tr2 = lines(sql2, /^create trigger /); assert.strictEqual(tr1.length, 6); assert.deepStrictEqual(tr2.slice().sort(), tr1.slice().sort());
  });
  t('SQL: 0002 は冪等・1トランザクション・非破壊（関数は create or replace、ポリシー/トリガーは drop if exists → create、データ・テーブルに触れない）', () => {
    const b = noComments(sql2), outside = b.replace(/\$\$[\s\S]*?\$\$/g, '$$$$'); assert.ok(/^\s*begin;/.test(b) && /commit;\s*$/.test(b)); assert.ok(!/create function/.test(b), 'create function ではなく create or replace function');
    for (const l of lines(sql2, /^create policy /)) { const m = l.match(/^create policy (\w+) on ([\w.]+) /); assert.ok(b.includes(`drop policy if exists ${m[1]} on ${m[2]};`), m[1] + ' は drop if exists の後に作り直す'); }
    for (const l of lines(sql2, /^create trigger /)) { const m = l.match(/^create trigger (\w+) .*? on ([\w.]+) for each row/); assert.ok(b.includes(`drop trigger if exists ${m[1]} on ${m[2]};`), m[1]); }
    assert.ok(!/drop\s+(table|function|schema|type|column|extension)|truncate|alter\s+table|^\s*(update|delete\s+from|insert\s+into)\b/im.test(outside), '破壊的な操作を含まない（関数本体の外）');
    assert.ok(/revoke all on function public\.payload_in_use\(text\) from public, anon/.test(b));
  });
  t('SQL: 既存の安全性（works の CHECK 制約・payload_path 検証・RLS 有効化・Storage UPDATE ポリシーなし・Storage バケット非公開）が 0001 に残っている', () => {
    for (const tb of ['profiles', 'admins', 'works', 'likes', 'bookmarks', 'follows', 'comments', 'reports']) assert.ok(new RegExp(`alter table public\\.${tb} enable row level security`).test(sql1), tb);
    assert.ok(/works_payload_path_canonical/.test(sql1) && /payload_path must be/.test(sql1) && !/on storage\.objects for update/.test(sql1 + sql2) && /values \('works','works',false/.test(sql1));
    assert.ok(/remix not permitted by license/.test(sql1) && /ShareAlike requires CC-BY-SA-4.0/.test(sql1) && /rate limit: max 10 posts\/hour/.test(sql1));
  });
  t('SQL: RLSテストに search_path の監査と「空の search_path で実行」テストがある', () => {
    for (const k of ['SECURITY DEFINER functions without an empty search_path', "perform set_config('search_path','',true)", 'get_work works with empty search_path', 'bump trigger works with empty search_path', 'remix license check works with empty search_path', 'storage read policy works with empty search_path']) assert.ok(rls.includes(k), k);
    assert.ok(/rollback;\s*$/.test(rls));
  });
  t('Remix: 許可ライセンスの一覧は SQL（works_before）の規則と一致する', () => {
    const all = sql1.match(/check \(license in \(([^)]*)\)\)/)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1)); assert.deepStrictEqual(all.slice().sort(), Z.ALL_LICENSES.slice().sort());
    assert.deepStrictEqual(all.filter(l => l !== 'all-rights-reserved').sort(), Z.REMIX_LICENSES.slice().sort());
    assert.ok(/p\.license='all-rights-reserved' then raise exception 'remix not permitted by license'/.test(sql1) && /p\.author_id<>new\.author_id/.test(sql1));
  });

  /* ---------- Remix のライセンス検証 ---------- */
  const W = o => Object.assign({ id: 'w1', license: 'CC-BY-4.0', author_id: 'author', visibility: 'public' }, o);
  t('remixCheck: 許可ライセンスは誰でも可、all-rights-reserved は作者本人のみ、不明・欠落・非表示・非公開・サンプルは不可', () => {
    for (const l of Z.REMIX_LICENSES) { assert.ok(Z.remixCheck(W({ license: l }), 'other').ok, l); assert.ok(Z.remixCheck(W({ license: l }), '').ok, l + ' (未ログインでも判定は可。公開画面でログインを求める)'); }
    assert.strictEqual(Z.remixCheck(W({ license: 'all-rights-reserved' }), 'other').code, 'license'); assert.strictEqual(Z.remixCheck(W({ license: 'all-rights-reserved' }), '').code, 'license');
    assert.ok(Z.remixCheck(W({ license: 'all-rights-reserved' }), 'author').ok, '作者本人は可（SQL トリガーと同じ）');
    for (const l of ['', null, undefined, 5, 'GPL-3.0', 'cc-by-4.0', 'CC-BY-4.0 ']) assert.ok(!Z.remixCheck(W({ license: l }), 'author').ok, String(l));
    assert.strictEqual(Z.remixCheck(W({ hidden: true }), 'other').code, 'unavailable'); assert.strictEqual(Z.remixCheck(W({ visibility: 'private' }), 'other').code, 'unavailable'); assert.ok(Z.remixCheck(W({ visibility: 'private' }), 'author').ok);
    assert.strictEqual(Z.remixCheck(W({ id: 'sample-3' }), 'a').code, 'sample'); assert.strictEqual(Z.remixCheck(W({ sample: true }), 'a').code, 'sample');
    for (const bad of [null, undefined, {}, 'x', [], { license: 'MIT' }]) assert.ok(!Z.remixCheck(bad, 'a').ok);
  });
  t('remixLicenses: ShareAlike の元作品（他人）は CC-BY-SA-4.0 のみ、本人・他ライセンスは全種', () => {
    assert.deepStrictEqual(Z.remixLicenses(W({ license: 'CC-BY-SA-4.0' }), 'other'), ['CC-BY-SA-4.0']); assert.deepStrictEqual(Z.remixLicenses(W({ license: 'CC-BY-SA-4.0' }), ''), ['CC-BY-SA-4.0']);
    assert.deepStrictEqual(Z.remixLicenses(W({ license: 'CC-BY-SA-4.0' }), 'author'), Z.ALL_LICENSES); assert.deepStrictEqual(Z.remixLicenses(W({ license: 'MIT' }), 'o'), Z.ALL_LICENSES);
  });
  t('app.js: Remix の入口は startRemix の1か所で、ライセンス検証→（Universeでは）最新の作品情報の再取得→SHA-256 検証済みデータのみ', () => {
    assert.strictEqual((app.match(/pending = \{ pkg: pkg, derived: w \}/g) || []).length, 1, 'pending を作る Remix 経路は startRemix のみ');
    const sr = app.slice(app.indexOf('function startRemix'), app.indexOf('function remixFromUniverse')); assert.ok(/Z\.remixCheck\(w,/.test(sr) && sr.indexOf('Z.remixCheck') < sr.indexOf('pending = '), '検証してから保持');
    assert.ok(/if \(!c\.ok\) return c;/.test(sr), '不可なら保持も遷移もしない');
    const ru = app.slice(app.indexOf('function remixFromUniverse'), app.indexOf('/* ---------- 作品ページ')); assert.ok(/rpc\/get_work/.test(ru) && /Z\.remixCheck\(w,/.test(ru) && /loadPackage\(w\)/.test(ru) && /startRemix\(w, pkg\)/.test(ru));
    assert.ok(ru.indexOf('Z.remixCheck') < ru.indexOf('loadPackage'), '検証 → 読み込み');
    assert.ok(/remix: \{ can: function \(d\) \{ return Z\.remixCheck\(/.test(app) && /run: remixFromUniverse/.test(app));
    assert.ok(/var r = startRemix\(w, res\.pkg\); if \(!r\.ok\) fail/.test(app), '作品ページのボタンも同じ入口');
    assert.ok(!/location\.hash|\bpending\b/.test(uvSrc), 'Universe モジュールは Remix を自前で遷移・保持しない（app.js へ委譲）');
    const pub = app.slice(app.indexOf('function publish()'), app.indexOf('/* ---------- 認証')); assert.ok(/Z\.remixLicenses\(derived, S\.user\.id\)/.test(pub) && /Z\.remixCheck\(derived, S\.user\.id\)/.test(pub), '公開画面でも再検証・ライセンス制限');
  });

  /* ---------- Universe（静的） ---------- */
  t('Universe: シェーダーの smoothstep はすべて edge0 < edge1。縁は 1.-smoothstep(.8,1.,d)（旧: smoothstep(1.,.8,d) は GLSL 仕様上未定義）', () => {
    assert.ok(!/smoothstep\(1\.,\.8/.test(uvSrc)); assert.ok(uvSrc.includes('1.-smoothstep(.8,1.,d)'));
    const shaders = [...uvSrc.matchAll(/var (?:VS|FS)\d = '([^']*)'/g)].map(m => m[1]); assert.strictEqual(shaders.length, 4);
    let n = 0; for (const s of shaders) for (const m of s.matchAll(/smoothstep\(([\d.]+),([\d.]+),/g)) { n++; assert.ok(parseFloat(m[1]) < parseFloat(m[2]), m[0]); } assert.ok(n >= 2);
  });
  t('Universe: window / document のリスナーは破棄時に必ず解除される（登録は on() 経由のみ。Observer は disconnect）', () => {
    const body = uvSrc.replace(/function on\(target[^\n]*\n/, ''); assert.ok(!/(window|document)\.addEventListener/.test(body), 'on() を経由しない window/document リスナーがない');
    assert.ok(/function on\(target, type, fn, o\) \{ target\.addEventListener\(type, fn, o\); cleanups\.push\(function \(\) \{ target\.removeEventListener/.test(uvSrc));
    const d = uvSrc.slice(uvSrc.indexOf('function destroy()'), uvSrc.indexOf('function toFallback')); assert.ok(/destroyed = true; stop\(\)/.test(d) && /cleanups\.splice\(0\)/.test(d) && /releaseGL\(\)/.test(d) && /if \(destroyed\) return;/.test(d), 'destroy は冪等');
    assert.ok(/rz\.disconnect\(\)/.test(uvSrc) && /io\.disconnect\(\)/.test(uvSrc) && /cancelAnimationFrame\(raf\)/.test(uvSrc));
    const rg = uvSrc.slice(uvSrc.indexOf('function releaseGL'), uvSrc.indexOf('function pointer')); for (const k of ['deleteBuffer', 'deleteProgram', 'WEBGL_lose_context', 'loseContext']) assert.ok(rg.includes(k), k);
    assert.ok(/if \(destroyed \|\| fellBack \|\| !gl \|\| running/.test(uvSrc), '破棄後は描画ループを再開しない'); assert.ok(/gl\.deleteShader\(v\); gl\.deleteShader\(f\)/.test(uvSrc));
  });
  t('Universe: 失敗時は2Dギャラリーへ（WebGL 非対応・シェーダー失敗・描画例外・コンテキスト復旧失敗）。コンテキスト喪失は preventDefault で復旧を許可', () => {
    assert.ok(/function fallback2D\(/.test(uvSrc)); const calls = uvSrc.match(/toFallback\('/g) || []; assert.ok(calls.length >= 4, 'フォールバック呼び出し数 ' + calls.length);
    for (const k of ['WebGL を利用できません', 'シェーダーのコンパイル', '3D描画中にエラー', '復旧に失敗']) assert.ok(uvSrc.includes(k), k);
    assert.ok(/webglcontextlost', function \(e\) \{ e\.preventDefault\(\)/.test(uvSrc) && /webglcontextrestored/.test(uvSrc));
    assert.ok(/ALIASED_POINT_SIZE_RANGE/.test(uvSrc), '端末のポイントサイズ上限を使う');
  });
  t('app.js: ナビに Universe、未設定時はサンプルへ、画面離脱時は必ず破棄、読み込み中の離脱は描画しない', () => {
    assert.ok(/var NAV = \[[^\]]*'universe'[^\]]*\]/.test(app)); assert.ok(/location\.replace\('#\/universe\/sample'\)/.test(app)); assert.ok(app.indexOf("p[0] === 'universe'") < app.indexOf('if (!configured()) return setup()'), 'Supabase 未設定でも Universe は setup 画面より先に処理');
    const rt = app.slice(app.indexOf('function route()'), app.indexOf('var NAV')); assert.ok(/uvGen\+\+; if \(uv\) \{ uv\.destroy\(\); uv = null; \}/.test(rt));
    assert.ok(/if \(gen !== uvGen\) return;/.test(app.slice(app.indexOf('function universe('), app.indexOf('/* ---------- Remix の入口'))));
    assert.ok(/function mountUv\(U, o\) \{ if \(uv\) \{ uv\.destroy\(\); uv = null; \} uv = U\.mount/.test(app));
  });
  const mm = () => ({ matches: false }), ctx = { window: { matchMedia: mm }, matchMedia: mm }; vm.createContext(ctx); vm.runInContext(uvSrc, ctx); const U = ctx.window.ZeroUniverse;
  t('Universe: サンプルは sample- 始まりで likes=0、親参照は集合内のみ。実作品変換は親を存在するものに限定し、thumb は data:image のみ通す', () => {
    const s = U.SAMPLE(); assert.strictEqual(s.length, 90); const ids = new Set(s.map(x => x.id)); assert.strictEqual(ids.size, 90);
    s.forEach(x => { assert.ok(/^sample-\d+$/.test(x.id) && x.likes === 0 && x.sample === true && x.thumb === ''); assert.ok(x.parent == null || ids.has(x.parent)); }); assert.strictEqual(new Set(s.map(x => x.cat)).size, 6); assert.strictEqual(new Set(s.map(x => x.authorId)).size, 4);
    const good = 'data:image/png;base64,AAAA', evil = 'data:image/png;base64,AAAA);background:url(//evil/x';
    const nodes = U.fromWorks([{ id: 'a', title: 'A', engine: 'code', work_type: 'web', author_id: 'u1', author: { username: 'alice' }, thumb: good, license: 'MIT', derived_from: null }, { id: 'b', title: 'B', author_id: 'u2', thumb: evil, derived_from: 'a' }, { id: 'c', title: 'C', author_id: 'u2', thumb: 'javascript:1', derived_from: 'missing' }], w => 'Web');
    assert.strictEqual(nodes[0].thumb, good); assert.strictEqual(nodes[1].thumb, ''); assert.strictEqual(nodes[2].thumb, ''); assert.strictEqual(nodes[1].parent, 'a'); assert.strictEqual(nodes[2].parent, null); assert.strictEqual(nodes[0].license, 'MIT'); assert.ok(nodes.every(n => !n.sample));
  });
  t('Universe: サンプルと実作品を区別する表示（SAMPLE DATA / uv-is-sample / LIVE）と、Creator Space の作者選択UIがある', () => {
    for (const k of ['uv-is-sample', 'SAMPLE DATA', 'uv-live', 'LIVE', 'サンプル作品（遷移・Remixできません）', 'Creator Space — 作者を選んでください', 'uv-pick', 'function creatorUI']) assert.ok(uvSrc.includes(k), k);
    assert.ok(/uv-is-sample::after/.test(rd('css/zero.css')) && /\.uv \[hidden\]\{display:none!important\}/.test(rd('css/zero.css')));
  });

  /* ---------- 整理・バージョン ---------- */
  t('整理: 空フォルダ・ブレース展開の残骸フォルダがない', () => {
    const bad = []; (function walk(d) { const es = fs.readdirSync(d, { withFileTypes: true }); if (!es.length) bad.push(d + ' (空)'); es.forEach(e => { if (e.isDirectory() && !['node_modules', '.git'].includes(e.name)) { if (/[{}]/.test(e.name)) bad.push(path.join(d, e.name)); walk(path.join(d, e.name)); } }); })('.');
    assert.deepStrictEqual(bad, []); });
  t('バージョン: README・CHANGES・コード・画面が V1.0.3 で一致し、古い3D説明（Three.js 未取得・Orbit のみ）が残っていない', () => {
    const r = rd('README.md'); assert.ok(/^# ZERO V1\.0\.4/m.test(r)); assert.strictEqual(Z.VERSION, '1.0.4'); assert.ok(fs.existsSync('CHANGES-v1.0.3.md') && /V1\.0\.3/.test(rd('CHANGES-v1.0.3.md')));
    assert.ok(/title="Zero V1\.0\.4"/.test(rd('index.html'))); assert.ok(/V1\.0\.4/.test(uvSrc.split('\n')[0]));
    assert.ok(!/3D は Orbit のみ/.test(r) && !/Three\.js はこの環境/.test(uvSrc) && /Universe/.test(r) && /0002_search_path_hardening\.sql/.test(r));
    assert.ok(!/V1\.0\.[12]\b/.test(r.split('\n').slice(0, 3).join('\n')), 'README 冒頭に古いバージョン表記がない');
  });
};
