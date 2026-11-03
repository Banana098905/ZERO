const { load, test, summary, assert } = require('./helpers');
const ZS = load('zs-util.js', 'zs-schema.js', 'zs-store.js', 'zs-engines.js', 'zs-service.js');
const U = ZS.util, S = ZS.schema;
const fresh = async (deps) => { const st = await ZS.store.open({ backend: 'memory' }); return { st, svc: ZS.createService(st, deps) }; };
const PIX = (n = 16, v = '#ff0000') => { const f = new Array(n * n).fill(null); f[0] = v; return { version: 1, name: 'p', size: n, frames: [f], palette: ['#7C6CFF'], saved: [], transparent: true, bg: '#171a2b', fps: 4 }; };
const CIRC = { v: 1, name: 'C', nodes: [{ id: 1, t: 'sw', x: 0, y: 0, p: { on: 1 }, lb: 'A' }, { id: 2, t: 'lamp', x: 100, y: 0, p: {}, lb: '' }], wires: [{ id: 1, from: 1, fo: 0, to: 2, ti: 0 }] };
const MACH = { v: 1, kind: 'machine', name: 'M', parts: [{ id: 1, t: 'belt', x: 0, y: 0, p: { src: '3:0', len: 300 } }, { id: 2, t: 'gate', x: 5, y: 5, p: { mode: 'circuit', src: '3:1' } }], balls: [{ id: 1, x: 1, y: 1, c: 'r' }] };

(async () => {
console.log('# service / import / library / legacy');

await test('3エンジン × 同名プロジェクトを複数作成してもIDが衝突しない', async () => {
  const { svc } = await fresh(); const ids = new Set();
  for (let i = 0; i < 40; i++) for (const [e, w] of [['code', 'web'], ['logic', 'circuit'], ['zero', 'studio']]) ids.add((await svc.create({ engine: e, workType: w, title: '同じ名前' })).id);
  assert.strictEqual(ids.size, 120); assert.strictEqual((await svc.list()).projects.length, 120);
});
await test('乱数が衝突し続けても既存プロジェクトを上書きしない', async () => {
  const same = () => new Uint8Array(17).fill(9); const { svc, st } = await fresh({ rng: same });
  const a = await svc.create({ engine: 'code', workType: 'web', title: 'A' });
  await assert.rejects(() => svc.create({ engine: 'code', workType: 'web', title: 'B' }), e => e.code === 'STORAGE');
  assert.strictEqual((await st.get('projects', a.id)).title, 'A');
});
await test('作成 → 保存 → 再読込で内容が保たれる（全作品タイプ）', async () => {
  const { svc } = await fresh();
  const cases = [['code', 'web', { html: '<p>あ</p>', css: 'p{}', js: 'x=1' }], ['code', 'pixel', PIX(16)], ['logic', 'circuit', CIRC], ['logic', 'machine', MACH], ['logic', 'cpu-program', { asm: 'LDI A, 5\nHLT', input: 7 }]];
  for (const [e, w, payload] of cases) {
    const p = await svc.create({ engine: e, workType: w, title: e + w, payload: JSON.parse(JSON.stringify(payload)) });
    const back = await svc.get(p.id); assert.deepStrictEqual(back.engineData.payload, payload, e + '/' + w);
  }
});
await test('不正なエンジン固有データは作成・保存とも拒否（色の値にHTML注入を含むドット絵など）', async () => {
  const { svc } = await fresh(); const evil = PIX(16); evil.frames[0][1] = '#fff"><img src=x onerror=alert(1)>';
  await assert.rejects(() => svc.create({ engine: 'code', workType: 'pixel', payload: evil }), e => e.code === 'INVALID' && /色/.test(e.message));
  const p = await svc.create({ engine: 'code', workType: 'web' }); const bad = JSON.parse(JSON.stringify(p)); bad.engineData.payload.html = 123;
  await assert.rejects(() => svc.save(bad), e => e.code === 'INVALID'); assert.strictEqual((await svc.get(p.id)).engineData.payload.html.includes('新しい作品'), true);
});
await test('保存: 更新日時が単調増加し、作成日時・版は保たれる', async () => {
  const { svc } = await fresh(); let p = await svc.create({ engine: 'code', workType: 'web' }); const c0 = p.createdAt; let prev = p.updatedAt;
  for (let i = 0; i < 5; i++) { p.engineData.payload.js = 'x' + i; p = (await svc.save(p)).project; assert.ok(Date.parse(p.updatedAt) > Date.parse(prev)); prev = p.updatedAt; }
  assert.strictEqual(p.createdAt, c0); assert.strictEqual(p.projectVersion, 1);
});
await test('版: 内容が変わった確定時だけ +1、同じ内容・メタデータ変更では増えない', async () => {
  const { svc } = await fresh(); let p = await svc.create({ engine: 'code', workType: 'web' });
  assert.strictEqual((await svc.commitVersion(p.id)).projectVersion, 1);
  p.engineData.payload.html = '<b>2</b>'; await svc.save(p); assert.strictEqual((await svc.commitVersion(p.id)).projectVersion, 2);
  assert.strictEqual((await svc.commitVersion(p.id)).projectVersion, 2); await svc.rename(p.id, '改名'); assert.strictEqual((await svc.commitVersion(p.id)).projectVersion, 2);
  p = await svc.get(p.id); p.engineData.payload.html = '<b>3</b>'; await svc.save(p, { commit: true }); assert.strictEqual((await svc.get(p.id)).projectVersion, 3);
});
await test('複製: 派生元IDと派生元の版が記録され、元は変わらない', async () => {
  const { svc } = await fresh(); let p = await svc.create({ engine: 'code', workType: 'web', title: '元' });
  p.engineData.payload.js = 'changed'; await svc.save(p);
  const c = await svc.duplicate(p.id); const orig = await svc.get(p.id);
  assert.notStrictEqual(c.id, p.id); assert.strictEqual(c.derivedFrom.projectId, p.id); assert.strictEqual(c.derivedFrom.projectVersion, orig.projectVersion);
  assert.strictEqual(orig.projectVersion, 2); assert.strictEqual(c.projectVersion, 1); assert.deepStrictEqual(c.engineData.payload, orig.engineData.payload);
});
await test('Zero 作品の複製では payload の id・名前・親が付け替わる', async () => {
  const { svc } = await fresh(); const z = await svc.create({ engine: 'zero', workType: 'studio', title: 'Z' });
  const c = await svc.duplicate(z.id); assert.strictEqual(c.engineData.payload.id, c.id); assert.strictEqual(c.engineData.payload.parentId, z.id); assert.strictEqual(c.engineData.payload.name, c.title);
  assert.strictEqual((await svc.get(z.id)).engineData.payload.id, z.id);
});
await test('名前変更・タグ・ライセンス・公開設定・空の名前は拒否', async () => {
  const { svc } = await fresh(); const p = await svc.create({ engine: 'logic', workType: 'circuit' });
  await assert.rejects(() => svc.rename(p.id, '   '), e => e.code === 'INVALID');
  const u = await svc.update(p.id, { title: 'X', tags: ['a', 'b'], license: { id: 'CC0-1.0' }, visibility: 'export-ready' });
  assert.deepStrictEqual([u.title, u.tags, u.license.id, u.visibility], ['X', ['a', 'b'], 'CC0-1.0', 'export-ready']);
  assert.strictEqual((await svc.update(p.id, { visibility: 'public-online' })).visibility, 'private');
});
await test('競合: 別タブが先に更新していたら上書きせず競合コピーに保存する', async () => {
  const { svc } = await fresh(); const p = await svc.create({ engine: 'code', workType: 'web', title: '共有' }); const base = p.updatedAt;
  const other = await svc.get(p.id); other.engineData.payload.js = 'タブB'; await svc.save(other);
  const mine = JSON.parse(JSON.stringify(p)); mine.engineData.payload.js = 'タブA';
  const r = await svc.save(mine, { baseUpdatedAt: base });
  assert.ok(r.conflict); assert.notStrictEqual(r.project.id, p.id); assert.strictEqual((await svc.get(p.id)).engineData.payload.js, 'タブB'); assert.strictEqual(r.project.engineData.payload.js, 'タブA');
});
await test('削除: 対象のみ消え、確認用に元データを返す。復元もできる', async () => {
  const { svc } = await fresh(); const a = await svc.create({ engine: 'code', workType: 'web' }), b = await svc.create({ engine: 'code', workType: 'web' });
  const raw = await svc.remove(a.id); assert.strictEqual(await svc.get(a.id), null); assert.ok(await svc.get(b.id));
  await svc.restoreRaw(raw); assert.ok(await svc.get(a.id));
});
await test('検索・エンジン絞り込み・並べ替え', async () => {
  const { svc } = await fresh(); await svc.create({ engine: 'code', workType: 'web', title: 'りんご' }); await svc.create({ engine: 'logic', workType: 'circuit', title: 'バナナ', tags: ['fruit'] }); await svc.create({ engine: 'zero', workType: 'studio', title: 'みかん' });
  assert.strictEqual((await svc.list({ engine: 'logic' })).projects.length, 1); assert.strictEqual((await svc.list({ q: 'FRUIT' })).projects[0].title, 'バナナ');
  assert.strictEqual((await svc.list({ workType: 'studio' })).projects[0].title, 'みかん'); assert.strictEqual((await svc.list({ sort: 'title' })).projects.length, 3);
});
await test('壊れたレコードは一覧から外れるが、削除されずproblemsに残る', async () => {
  const { svc, st } = await fresh(); await svc.create({ engine: 'code', workType: 'web' });
  await st.put('projects', { id: 'broken1', format: 'zerostudio.project', formatVersion: 1, engine: 'code' });
  const r = await svc.list(); assert.strictEqual(r.projects.length, 1); assert.strictEqual(r.problems.length, 1); assert.ok(await st.get('projects', 'broken1'));
  const bk = await svc.exportBackup(); assert.strictEqual(bk.quarantine.length, 1);
});

// ---- 書き出し／取り込み ----
await test('JSON書き出し→取り込みで作品データが保たれる（全エンジン）', async () => {
  const A = await fresh(), B = await fresh(); const made = [];
  for (const [e, w, pl] of [['code', 'web', { html: 'a', css: 'b', js: 'c' }], ['code', 'pixel', PIX(32)], ['logic', 'circuit', CIRC], ['logic', 'machine', MACH], ['logic', 'cpu-program', { asm: 'HLT', input: 3 }], ['zero', 'studio', undefined]])
    made.push(await A.svc.create({ engine: e, workType: w, title: 'T-' + w, payload: pl && JSON.parse(JSON.stringify(pl)) }));
  const file = await A.svc.exportProjects(made.map(p => p.id));
  const rep = await B.svc.inspectImport(JSON.parse(JSON.stringify(file)));
  assert.ok(rep.ok); assert.ok(rep.items.every(i => i.status === 'new')); const res = await B.svc.applyImport(rep);
  assert.strictEqual(res.added, 6); assert.strictEqual(res.failed, 0);
  for (const p of made) { const q = await B.svc.get(p.id); assert.deepStrictEqual(q.engineData.payload, (await A.svc.get(p.id)).engineData.payload, p.workType); assert.strictEqual(q.engine, p.engine); }
});
await test('取り込み: 同じIDで内容が違えば別IDの別作品として追加し、既存は上書きしない。派生元が入る', async () => {
  const { svc } = await fresh(); const p = await svc.create({ engine: 'code', workType: 'web', title: '元' });
  const file = await svc.exportProjects([p.id]); file.projects[0].engineData.payload.js = '外部で編集'; file.projects[0].updatedAt = new Date(Date.now() + 5000).toISOString(); file.projects[0].versionHash = 'different';
  const rep = await svc.inspectImport(file); assert.strictEqual(rep.items[0].status, 'copy'); const res = await svc.applyImport(rep);
  assert.strictEqual(res.copies, 1); const all = (await svc.list()).projects; assert.strictEqual(all.length, 2);
  const orig = all.find(x => x.id === p.id), cp = all.find(x => x.id !== p.id);
  assert.notStrictEqual(orig.engineData.payload.js, '外部で編集'); assert.strictEqual(cp.engineData.payload.js, '外部で編集'); assert.strictEqual(cp.derivedFrom.projectId, p.id);
});
await test('取り込み: 同一ファイルを2回取り込んでも重複しない（same でスキップ）', async () => {
  const A = await fresh(), B = await fresh(); const p = await A.svc.create({ engine: 'logic', workType: 'circuit', payload: CIRC }); const f = await A.svc.exportProjects([p.id]);
  await B.svc.applyImport(await B.svc.inspectImport(JSON.parse(JSON.stringify(f)))); const r2 = await B.svc.inspectImport(JSON.parse(JSON.stringify(f)));
  assert.strictEqual(r2.items[0].status, 'same'); await B.svc.applyImport(r2); assert.strictEqual((await B.svc.list()).projects.length, 1);
});
await test('取り込み検証: 不正入力でも例外で止まらず、理由つきで拒否する', async () => {
  const { svc } = await fresh();
  const bads = [null, 5, 'str', [], {}, { format: 'zerostudio.file', projects: 'x' }, { format: 'zerostudio.file', formatVersion: 1, projects: [null, 5, {}, { id: '../../x' }] },
    { app: 'zerostudio', format: 'zerostudio.file', formatVersion: 1, projects: [{ format: 'zerostudio.project', formatVersion: 1, id: 'a', engine: 'code', workType: 'web', engineData: { payload: { html: 1 } } }] }];
  for (const b of bads) { const r = await svc.inspectImport(b); assert.ok(r.ok === false || r.items.every(i => i.status === 'invalid'), JSON.stringify(b)); assert.ok(r.errors.length || r.items.some(i => i.errors.length)); }
  assert.strictEqual((await svc.list()).projects.length, 0);
});
await test('取り込み検証: 検証だけでは何も書き込まない', async () => {
  const A = await fresh(), B = await fresh(); const p = await A.svc.create({ engine: 'code', workType: 'web' });
  await B.svc.inspectImport(JSON.parse(JSON.stringify(await A.svc.exportProjects([p.id])))); assert.strictEqual((await B.svc.list()).projects.length, 0);
});
await test('取り込み: プロトタイプ汚染・大きすぎるデータ・多数の項目', async () => {
  const { svc } = await fresh(); const p = await svc.create({ engine: 'code', workType: 'web' }); const f = await svc.exportProjects([p.id]);
  const txt = JSON.stringify(f).replace('"html"', '"__proto__":{"polluted":1},"html"'); const rep = await svc.inspectImport(U.parseJson(txt)); await svc.applyImport(rep);
  assert.strictEqual(({}).polluted, undefined);
  f.projects[0].engineData.payload.js = 'x'.repeat(5 * 1024 * 1024); assert.strictEqual((await svc.inspectImport(f)).items[0].status, 'invalid');
  const many = S.buildFile('bundle', new Array(S.LIMITS.importItems + 50).fill(p), []); const r = await svc.inspectImport(many); assert.strictEqual(r.truncated, 50);
});
await test('将来のエンジン／formatVersion のデータを壊さず保持し、書き出しでも失わない', async () => {
  const { svc } = await fresh(); const p = S.newProject({ engine: 'hologram', workType: 'scene', title: '未来', payload: { x: [1, { y: 2 }] } });
  const rep = await svc.inspectImport(S.buildFile('project', [p], [])); assert.strictEqual(rep.items[0].status, 'new'); assert.ok(rep.items[0].warnings.some(w => /hologram/.test(w)));
  await svc.applyImport(rep); const out = await svc.exportProjects([p.id]); assert.deepStrictEqual(out.projects[0].engineData.payload, { x: [1, { y: 2 }] });
});
await test('エンジン固有ファイル（元アプリの書き出し）を取り込める', async () => {
  const { svc } = await fresh();
  const cases = [[{ name: '元CODE', html: '<p>1</p>', css: '', js: '' }, 'native:code', 'web'], [PIX(16), 'native:code', 'pixel'], [CIRC, 'native:logic', 'circuit'], [MACH, 'native:logic', 'machine']];
  for (const [json, kind, wt] of cases) { const r = await svc.inspectImport(json); assert.strictEqual(r.kind, kind); assert.strictEqual(r.items[0].workType, wt); await svc.applyImport(r); }
  assert.strictEqual((await svc.list()).projects.length, 4);
});
await test('エンジン固有の書き出し→再取り込みで同じデータになる（元アプリ互換形式）', async () => {
  const { svc } = await fresh(); for (const [e, w, pl] of [['code', 'web', { html: 'h', css: 'c', js: 'j' }], ['logic', 'circuit', CIRC], ['logic', 'machine', MACH], ['code', 'pixel', PIX(16)]]) {
    const p = await svc.create({ engine: e, workType: w, title: 'rt', payload: JSON.parse(JSON.stringify(pl)) }); const f = ZS.engines.get(e).exportFile(p);
    const r = await svc.inspectImport(JSON.parse(f.text)); assert.strictEqual(r.items[0].status, 'new', w); const d = r.items[0].draft.payload;
    const base = JSON.parse(JSON.stringify(p.engineData.payload)); if (d.name !== undefined) base.name = d.name; assert.deepStrictEqual(d, base, w);
  }
});
await test('Zero バックアップは Zero 自身の取り込み（zeroImporter）に委譲する。無ければ理由つきで拒否', async () => {
  const j = { app: 'playground-zero', format: 3, projects: [{ id: 'p_1' }] };
  const a = await fresh(); const r0 = await a.svc.inspectImport(j); assert.strictEqual(r0.ok, false);
  let got = null; const b = await fresh({ zeroImporter: async (x) => { got = x; return { added: 1, copies: 0, skipped: 0, invalid: 0 }; } });
  const r1 = await b.svc.inspectImport(j); assert.ok(r1.ok && r1.zero); const res = await b.svc.applyImport(r1); assert.strictEqual(res.added, 1); assert.strictEqual(got, j);
});
await test('公開用書き出し: 公開設定が必要・素材を同梱・ハッシュ検証・改ざん検出・online:false', async () => {
  const { svc } = await fresh(); const it = await svc.libRegister({ kind: 'pixel-art', name: '素材', data: PIX(16) });
  const p = await svc.create({ engine: 'code', workType: 'web', title: 'pub', payload: { html: `<!-- zs-asset:${it.id}@1 -->`, css: '', js: '' } }); await svc.save(await svc.get(p.id));
  await assert.rejects(() => svc.exportPublish(p.id), e => /公開設定/.test(e.message));
  await svc.update(p.id, { visibility: 'export-ready', license: { id: 'CC-BY-4.0', holder: '私' }, author: { name: '私' } });
  const pk = await svc.exportPublish(p.id); assert.strictEqual(pk.online, false); assert.strictEqual(pk.library.length, 1); assert.strictEqual(pk.project.license.id, 'CC-BY-4.0'); assert.ok(pk.project.id);
  const ok = await (await fresh()).svc.inspectImport(JSON.parse(JSON.stringify(pk))); assert.ok(ok.ok);
  const t = JSON.parse(JSON.stringify(pk)); t.project.engineData.payload.html = '改ざん'; const bad = await (await fresh()).svc.inspectImport(t); assert.strictEqual(bad.ok, false); assert.ok(bad.errors.some(e => /完全性/.test(e)));
});
await test('バックアップ → 復元（別環境）で作品・素材・Zero付随データが戻り、既存は上書きしない', async () => {
  const A = await fresh(); await A.svc.create({ engine: 'code', workType: 'web', title: 'W' }); await A.svc.libRegister({ kind: 'pixel-art', name: 'L', data: PIX(16) });
  await A.st.setMeta('zero:favTools', ['flow']); await A.st.setMeta('zero:rxc', [{ id: 'c_1' }]);
  const bk = JSON.parse(JSON.stringify(await A.svc.exportBackup())); assert.strictEqual(bk.kind, 'backup'); assert.ok(await A.svc.lastBackupAt());
  const B = await fresh(); await B.st.setMeta('zero:favTools', ['color']); const rep = await B.svc.inspectImport(bk); const res = await B.svc.applyImport(rep);
  assert.strictEqual(res.added, 1); assert.strictEqual(res.libAdded, 1); assert.deepStrictEqual(await B.st.getMeta('zero:favTools'), ['color']); assert.deepStrictEqual(await B.st.getMeta('zero:rxc'), [{ id: 'c_1' }]);
});

// ---- ライブラリ・依存関係 ----
await test('ライブラリ: 登録・再利用・版管理（内容が変わったときだけ版が上がる）', async () => {
  const { svc } = await fresh(); const it = await svc.libRegister({ kind: 'pixel-art', name: 'ハート', data: PIX(16) }); assert.strictEqual(it.version, 1);
  assert.strictEqual((await svc.libUpdate(it.id, { name: '新名' })).version, 1); assert.strictEqual((await svc.libUpdate(it.id, { data: PIX(16, '#00ff00') })).version, 2);
  assert.strictEqual((await svc.libUpdate(it.id, { data: PIX(16, '#00ff00') })).version, 2); assert.strictEqual((await svc.libList({ kind: 'pixel-art' })).items.length, 1);
});
await test('使用プロジェクトの追跡: マーカーから assets を検出し、削除すると外れる', async () => {
  const { svc } = await fresh(); const it = await svc.libRegister({ kind: 'pixel-art', name: 'S', data: PIX(16) });
  let p = await svc.create({ engine: 'code', workType: 'web', title: 'W' });
  p.engineData.payload.html = `<div></div><!-- zs-asset:${it.id}@1 -->`; p = (await svc.save(p)).project; assert.deepStrictEqual(p.assets, [{ id: it.id, version: 1 }]);
  const usage = await svc.libUsage(it.id); assert.strictEqual(usage.length, 1); assert.strictEqual(usage[0].project.id, p.id);
  p.engineData.payload.html = '<div></div>'; p = (await svc.save(p)).project; assert.strictEqual(p.assets.length, 0); assert.strictEqual((await svc.libUsage(it.id)).length, 0);
});
await test('依存関係の表示: 素材の更新検知・機械→回路・派生・被依存', async () => {
  const { svc } = await fresh(); const it = await svc.libRegister({ kind: 'pixel-art', name: 'S', data: PIX(16) });
  const circ = await svc.create({ engine: 'logic', workType: 'circuit', payload: CIRC });
  let m = await svc.create({ engine: 'logic', workType: 'machine', payload: MACH }); m = (await svc.save(m, { extraDeps: [{ type: 'project', id: circ.id, version: 1 }] })).project;
  assert.ok(m.dependencies.some(d => d.type === 'ref' && d.detail.refs.join() === '3:0,3:1')); assert.ok(m.dependencies.some(d => d.type === 'project' && d.id === circ.id));
  const m2 = (await svc.save(await svc.get(m.id))).project; assert.ok(m2.dependencies.some(d => d.type === 'project' && d.id === circ.id), '再保存でも回路への依存が残る');
  let w = await svc.create({ engine: 'code', workType: 'web' }); w.engineData.payload.css = `/* zs-asset:${it.id}@1 */`; w = (await svc.save(w)).project; await svc.libUpdate(it.id, { data: PIX(16, '#0000ff') });
  const dw = await svc.deps(w.id); assert.ok(dw.uses[0].outdated && dw.uses[0].latest === 2);
  const dc = await svc.deps(circ.id); assert.strictEqual(dc.usedBy[0].id, m.id); const cp = await svc.duplicate(circ.id); assert.strictEqual((await svc.deps(circ.id)).derived[0].id, cp.id);
  assert.strictEqual((await svc.deps(cp.id)).parent.id, circ.id);
});
await test('Zero の Remix 部品の使用が依存関係に出る', async () => {
  const { svc } = await fresh(); const z = await svc.create({ engine: 'zero', workType: 'creation' }); z.engineData.payload.remix = { v: 1, origin: null, lineage: [], summary: '', parts: [{ id: 'c_abc', name: '光る', version: 2 }] };
  const s = (await svc.save(z)).project; assert.ok(s.dependencies.some(d => d.type === 'library' && d.id === 'c_abc' && d.version === 2));
});

// ---- Zero レコードの対応づけ ----
await test('Zero レコード ⇔ 共通形式: 往復で完全一致し、派生元・タグ・サムネイルが共通メタデータに出る', () => {
  const rec = { id: 'p_abc123', name: '作品', schema: 2, kind: 'creation', createdAt: 1700000000000, updatedAt: 1700000100000, lastOpenedAt: 5, tags: ['a', 'b'], favorite: true, collections: ['c1'], parentId: 'p_parent', daily: null, thumb: 'data:image/png;base64,AAAA', creation: { v: 1, scripts: [] }, remix: { v: 1, origin: { id: 'p_origin', name: '元', ver: 3, at: 1 }, lineage: [], summary: '', parts: [] } };
  const env = ZS.engines.zeroMap.wrap(rec, null); assert.strictEqual(env.id, rec.id); assert.strictEqual(env.engine, 'zero'); assert.strictEqual(env.workType, 'creation');
  assert.strictEqual(env.derivedFrom.projectId, 'p_parent'); assert.deepStrictEqual(env.tags, ['a', 'b']); assert.strictEqual(env.updatedAt, new Date(1700000100000).toISOString()); assert.ok(env.thumb);
  assert.deepStrictEqual(ZS.engines.zeroMap.unwrap(env), rec);
});
await test('Zero レコード: 不正IDは拒否、他エンジンのIDとの衝突は拒否', () => {
  assert.throws(() => ZS.engines.zeroMap.wrap({ id: 'a b', name: 'x' }, null), e => e.code === 'INVALID');
  const other = S.newProject({ engine: 'code', workType: 'web', payload: { html: '', css: '', js: '' } });
  assert.throws(() => ZS.engines.zeroMap.wrap({ id: other.id, name: 'x' }, other), e => e.code === 'CONFLICT');
});

// ---- 既存データの移行 ----
const LS = (m) => ({ getItem: (k) => (k in m ? m[k] : null) });
const legacyEnv = () => ({
  'codelab.projects.v2': JSON.stringify([{ id: 'u1', name: '旧Web', html: '<h1>x</h1>', css: '', js: '', updatedAt: '2026-01-02T03:04:05.000Z' }, { id: 'u2', name: '壊れ', html: 1 }]),
  'codelab.pixel.projects.v1': JSON.stringify([Object.assign(PIX(16), { id: 'px1', name: '旧ドット' })]),
  'lp.proj': JSON.stringify({ '回路A': CIRC, '回路B': { v: 9 } }), 'lp.auto': JSON.stringify(CIRC), 'lp.ml.proj': JSON.stringify({ '機械A': MACH }), 'lp.ml.auto': '{broken', 'lp.asm': 'LDI A, 1\nHLT'
});
await test('既存データの移行: 検出→取り込み。元データは変更されない／壊れたものは invalid で報告', async () => {
  const { svc } = await fresh(); const m = legacyEnv(); const before = JSON.stringify(m);
  const rep = await svc.scanLegacy({ localStorage: LS(m) });
  const by = (s) => rep.items.filter(i => i.status === s).length;
  assert.strictEqual(by('new'), 6); assert.strictEqual(by('invalid'), 3); assert.strictEqual(JSON.stringify(m), before);
  const res = await svc.applyLegacy(rep); assert.strictEqual(res.added, 6); assert.strictEqual(res.invalid, 3); assert.strictEqual(JSON.stringify(m), before);
  const all = (await svc.list()).projects; assert.ok(all.some(p => p.title === '旧Web' && p.updatedAt === '2026-01-02T03:04:05.000Z')); assert.ok(all.some(p => p.workType === 'cpu-program'));
});
await test('既存データの移行: 2回実行しても重複しない。旧側が変わったときだけコピーとして追加', async () => {
  const { svc } = await fresh(); const m = legacyEnv(); await svc.applyLegacy(await svc.scanLegacy({ localStorage: LS(m) }));
  const r2 = await svc.scanLegacy({ localStorage: LS(m) }); assert.strictEqual(r2.items.filter(i => i.status === 'same').length, 6); await svc.applyLegacy(r2); assert.strictEqual((await svc.list()).projects.length, 6);
  const arr = JSON.parse(m['codelab.projects.v2']); arr[0].html = '<h1>編集した</h1>'; m['codelab.projects.v2'] = JSON.stringify(arr);
  const r3 = await svc.scanLegacy({ localStorage: LS(m) }); assert.strictEqual(r3.items.find(i => i.title === '旧Web').status, 'copy'); await svc.applyLegacy(r3); assert.strictEqual((await svc.list()).projects.length, 7);
});
await test('既存データの移行: Zero の旧IndexedDB（作品＋付随データ）も同じIDのまま取り込む', async () => {
  const { svc, st } = await fresh(); const z = ZS.engines.get('zero').defaultPayload('studio'); z.name = '旧Zero作品'; const exp = JSON.parse(JSON.stringify(z));
  const rep = await svc.scanLegacy({ localStorage: LS({}), zeroRecords: [z], zeroMeta: [{ id: 'favTools', value: ['flow'] }, { id: '__probe', value: 1 }] });
  assert.strictEqual(rep.items[0].status, 'new'); assert.strictEqual(rep.meta.length, 1); await svc.applyLegacy(rep);
  const back = await svc.get(z.id); assert.deepStrictEqual(back.engineData.payload, exp); assert.deepStrictEqual(await st.getMeta('zero:favTools'), ['flow']);
  const r2 = await svc.scanLegacy({ localStorage: LS({}), zeroRecords: [z] }); assert.strictEqual(r2.items[0].status, 'same');
  const z2 = Object.assign({}, z, { name: '編集後' }); const r3 = await svc.scanLegacy({ localStorage: LS({}), zeroRecords: [z2] }); assert.strictEqual(r3.items[0].status, 'copy');
  await svc.applyLegacy(r3); const all = (await svc.list({ engine: 'zero' })).projects; assert.strictEqual(all.length, 2); assert.ok((await svc.get(z.id)).engineData.payload.name === '旧Zero作品');
});
await test('素材から作った作品の由来（provenance）は自動保存を繰り返しても消えない', async () => {
  const { svc } = await fresh(); const it = await svc.libRegister({ kind: 'circuit', name: 'テンプレ', data: CIRC });
  let p = await svc.create({ engine: 'logic', workType: 'circuit', title: 'from lib', payload: JSON.parse(JSON.stringify(CIRC)), dependencies: [{ type: 'library', id: it.id, version: 1, note: '素材から作成', detail: { managed: 'provenance' } }] });
  for (let i = 0; i < 3; i++) { p.engineData.payload.name = 'n' + i; p = (await svc.save(p)).project; }
  assert.ok(p.dependencies.some(d => d.type === 'library' && d.id === it.id)); assert.strictEqual((await svc.libUsage(it.id)).length, 1);
});
await test('.asm テキストを CPUプログラムとして取り込める', async () => {
  const { svc } = await fresh(); const r = await svc.inspectImport({ __asm: 'LDI A, 3\nHLT' }, { filename: 'prog.asm' });
  assert.strictEqual(r.items[0].workType, 'cpu-program'); assert.strictEqual(r.items[0].title, 'prog'); await svc.applyImport(r); assert.strictEqual((await svc.list()).projects.length, 1);
});
await test('作成時にも素材参照と依存関係が記録される（最初の自動保存で欠落しない）', async () => {
  const { svc } = await fresh(); const it = await svc.libRegister({ kind: 'pixel-art', name: 'S', data: PIX(16) });
  const w = await svc.create({ engine: 'code', workType: 'web', payload: { html: `<!-- zs-asset:${it.id}@1 -->`, css: '', js: '' } }); assert.deepStrictEqual(w.assets, [{ id: it.id, version: 1 }]);
  const c = await svc.create({ engine: 'logic', workType: 'circuit', payload: CIRC });
  const m = await svc.create({ engine: 'logic', workType: 'machine', payload: MACH, dependencies: [{ type: 'project', id: c.id, version: 1 }] });
  assert.ok(m.dependencies.some(d => d.type === 'ref' && d.detail.refs.join() === '3:0,3:1')); assert.ok(m.dependencies.some(d => d.type === 'project' && d.id === c.id));
});
await test('設定: 既定値・著者名とライセンスが新規プロジェクトへ入る・不正値は既定に戻る', async () => {
  const { svc } = await fresh(); await svc.saveSettings({ authorName: '山田', defaultLicense: 'CC-BY-4.0' });
  const p = await svc.create({ engine: 'code', workType: 'web' }); assert.strictEqual(p.author.name, '山田'); assert.strictEqual(p.license.id, 'CC-BY-4.0');
  await svc.saveSettings({ defaultLicense: 'evil', backupReminderDays: -5 }); const s = await svc.settings(); assert.strictEqual(s.defaultLicense, 'all-rights-reserved'); assert.strictEqual(s.backupReminderDays, 7);
});
await test('新しいエンジンを register するだけで作成・保存・書き出しができる（既存形式を壊さない）', async () => {
  const { svc } = await fresh(); ZS.engines.register({ id: 'audio', label: 'Audio Studio', workTypes: [{ id: 'track', label: 'トラック', schemaVersion: 1 }], defaultPayload: () => ({ notes: [] }),
    validatePayload: (w, s, p) => Array.isArray(p.notes) ? { ok: true, errors: [], payload: p } : { ok: false, errors: ['notes が配列ではありません'] }, scanAssets: () => [], scanDependencies: () => [] });
  const p = await svc.create({ engine: 'audio', workType: 'track', payload: { notes: [1, 2] } }); assert.strictEqual((await svc.get(p.id)).engine, 'audio');
  await assert.rejects(() => svc.create({ engine: 'audio', workType: 'track', payload: { notes: 5 } }), e => e.code === 'INVALID');
  assert.strictEqual((await svc.list({ engine: 'code' })).projects.length, 0);
});

summary('service');
})();
