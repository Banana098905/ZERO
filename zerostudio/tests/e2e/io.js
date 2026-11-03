const { start, page, test, summary } = require('./lib'); const assert = require('assert'); const fs = require('fs');
const fr = (pg, n) => pg.frames().find(f => f.url().includes('/engines/' + n + '/'));
const list = (pg, q) => pg.evaluate(async (q) => (await ZS.app.svc.list(q || {})).projects, q);
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout waiting'); await new Promise(r => setTimeout(r, 120)); } };
async function openEngine(pg, env, name, q) { await pg.goto(env.base + '/#/' + name + (q || '')); await pg.waitForSelector('.zs-frame'); await waitFor(async () => { const f = fr(pg, name); return f && await f.evaluate(() => !!(window.ZSBridge && ZSBridge.ready)).catch(() => false); }, 15000); await pg.waitForTimeout(500); }
const PIX = (c) => { const f = new Array(256).fill(null); f[3] = c; return { version: 1, name: 'px', size: 16, frames: [f], palette: ['#112233'], saved: [], transparent: true, bg: '#171a2b', fps: 4 }; };
const CIRC = { v: 1, name: 'C', nodes: [{ id: 3, t: 'sw', x: 0, y: 0, p: { on: 1 }, lb: 'A' }, { id: 4, t: 'lamp', x: 100, y: 0, p: { col: '#22d3ee' }, lb: '' }], wires: [{ id: 1, from: 3, fo: 0, to: 4, ti: 0 }] };
const MACH = { v: 1, kind: 'machine', name: 'M', parts: [{ id: 1, t: 'belt', x: 100, y: 200, p: { len: 300, spd: 90, dir: 1, on: 1, src: '3:0' } }], balls: [{ id: 1, x: 120, y: 180, c: 'r' }] };
async function importFile(pg, env, file, confirm = true) {
  await pg.goto(env.base + '/#/io'); await pg.waitForSelector('.zs-drop'); await pg.setInputFiles('input[type=file]', file);
  // 検証結果（確認画面 or エラーのバナー）が実際に描画されるまで待つ。静的な文言には反応しない
  await waitFor(async () => (await pg.locator('h2:has-text("取り込みの確認"), .zs-banner.bad').count()) > 0, 10000);
  if (confirm && await pg.locator('button:text-is("取り込む")').isEnabled().catch(() => false)) { await pg.click('button:text-is("取り込む")'); await pg.waitForSelector('.zs-banner'); }
  return pg.locator('#zs-main').innerText();
}
async function download(pg, clickFn) { const [dl] = await Promise.all([pg.waitForEvent('download'), clickFn()]); return JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); }
async function zeroWorks(pg, env) {
  await openEngine(pg, env, 'zero'); return fr(pg, 'zero').evaluate(async () => {
    const p = await PZ.projects.create('Z作品'); p.objects.push(PZ.model.newObject('rect', p)); p.background = '#123456'; await PZ.projects.save(p, true); await PZ.projects.setTags(p.id, ['試作', 'a']);
    const d = await PZ.projects.derive(p.id, '派生Z', {}); const e = await PZ.projects.createExperiment('flow'); const c = await PZ.projects.createCreation(); return { studio: p.id, derived: d.id, exp: e.id, creation: c.id };
  });
}
const norm = (p) => JSON.stringify([p.id, p.title, p.engine, p.workType, p.projectVersion, p.derivedFrom, p.license, p.visibility, p.tags, p.engineData]);

(async () => {
  const env = await start(); console.log('# import / export / migration e2e');
  await test('1. 書き出し→全消去→取り込みで、全エンジンの作品が同じIDで保たれる（Zero は実際の作品）', async () => {
    const pg = await page(env); const z = await zeroWorks(pg, env);
    await pg.evaluate(async ([PIX, CIRC, MACH]) => { const s = ZS.app.svc; await s.create({ engine: 'code', workType: 'web', title: 'W', payload: { html: '<p>日本語</p>', css: 'p{}', js: 'x=1' } }); await s.create({ engine: 'code', workType: 'pixel', title: 'P', payload: PIX });
      await s.create({ engine: 'logic', workType: 'circuit', title: 'C', payload: CIRC }); await s.create({ engine: 'logic', workType: 'machine', title: 'M', payload: MACH }); await s.create({ engine: 'logic', workType: 'cpu-program', title: 'A', payload: { asm: 'LDI A, 1\nHLT', input: 9 } });
      const w = (await s.list({ engine: 'code', workType: 'web' })).projects[0]; await s.update(w.id, { license: { id: 'CC-BY-4.0', holder: '私' }, tags: ['t1'], visibility: 'export-ready' }); await s.duplicate(w.id); }, [PIX('#ff0000'), CIRC, MACH]);
    await pg.goto(env.base + '/#/io'); await pg.waitForSelector('.zs-drop');
    const before = (await list(pg)); assert.ok(before.length >= 9); const file = await download(pg, () => pg.click('button:text-is("すべてのプロジェクトを JSON で書き出す")'));
    assert.strictEqual(file.format, 'zerostudio.file'); assert.strictEqual(file.projects.length, before.length);
    const exported = file.projects.map(p => p.id).sort(); await pg.evaluate(async () => { for (const p of (await ZS.app.svc.list()).projects) await ZS.app.svc.remove(p.id); }); assert.strictEqual((await list(pg)).length, 0);
    const text = await importFile(pg, env, { name: 'all.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    assert.ok(/件を追加/.test(text), text); const after = await list(pg); assert.strictEqual(after.length, before.length);
    const byId = Object.fromEntries(after.map(p => [p.id, p])); for (const b of file.projects) { const a = byId[b.id]; assert.ok(a, 'ID が保たれる ' + b.id); assert.strictEqual(norm(a).length > 0, true); assert.deepStrictEqual(a.engineData, b.engineData, b.workType); assert.deepStrictEqual(a.derivedFrom, b.derivedFrom); assert.strictEqual(a.projectVersion, b.projectVersion); assert.deepStrictEqual(a.license, b.license); }
    assert.deepStrictEqual(Object.keys(byId).sort(), exported); const dup = after.find(p => p.title === 'W のコピー'); assert.ok(dup.derivedFrom && dup.derivedFrom.projectId, '複製の派生元が保たれる');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('2. 別のブラウザ環境（空の保存領域）へ移しても、派生元と版が保たれる', async () => {
    const A = await page(env); await A.goto(env.base + '/'); await A.waitForSelector('h1');
    await A.evaluate(async () => { const s = ZS.app.svc; const p = await s.create({ engine: 'code', workType: 'web', title: '親' }); p.engineData.payload.js = 'v2'; await s.save(p, { commit: true }); await s.duplicate(p.id); });
    await A.goto(env.base + '/#/projects'); await A.waitForSelector('.zs-item'); const file = await download(A, async () => { await A.locator('.zs-item', { hasText: '親 のコピー' }).locator('button[aria-haspopup=menu]').click(); await A.click('.zs-menu button:text-is("ZeroStudio JSON で書き出す")'); });
    const B = await page(env); await importFile(B, env, { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    const got = (await list(B))[0]; assert.strictEqual(got.title, '親 のコピー'); assert.strictEqual(got.derivedFrom.projectVersion, 2); assert.ok(got.derivedFrom.projectId); assert.strictEqual(got.id, file.projects[0].id); await A.ctx.close(); await B.ctx.close();
  });
  await test('3. 旧アプリの実データ（旧CODE LAB・旧LOGIC・旧ZERO が作ったもの）を、元データを変えずに取り込める', async () => {
    const pg = await page(env);
    await pg.goto(env.base + '/engines/code/index.html'); await pg.waitForTimeout(700); await pg.fill('#projectName', '旧Web作品'); await pg.fill('#codeInput', '<h1>旧</h1>'); await pg.click('#saveBtn'); await pg.waitForTimeout(300);
    await pg.evaluate(() => ZSBridge.setPixel('旧ドット', { version: 1, size: 16, frames: [Object.assign(new Array(256).fill(null), { 5: '#00ff00' })], palette: ['#123456'], saved: [], transparent: true, bg: '#171a2b', fps: 4 })); await pg.click('#pixelSaveBtn'); await pg.waitForTimeout(300);
    await pg.goto(env.base + '/engines/logic/index.html'); await pg.waitForTimeout(700); await pg.evaluate(c => ZSBridge.setCircuit('旧回路', c), CIRC); await pg.click('#save'); await pg.waitForTimeout(300);
    await pg.evaluate(() => ZSBridge.show('machine')); await pg.evaluate(m => ZSBridge.setMachine('旧機械', m), MACH); await pg.evaluate(() => ZSBridge.show('machine')); await pg.click('#mlsave'); await pg.waitForTimeout(300);
    await pg.evaluate(() => ZSBridge.show('cpu-program')); await pg.fill('#asm', 'LDI A, 5\nHLT'); await pg.waitForTimeout(300);
    await pg.goto(env.base + '/engines/zero/index.html'); await pg.waitForFunction(() => window.PZ && PZ.projects.kind() !== 'none'); await pg.evaluate(async () => { const p = await PZ.projects.create('旧Zero作品'); p.objects.push(PZ.model.newObject('rect', p)); await PZ.projects.save(p, true); await PZ.projects.setFavorite(p.id, true); });
    const snap = () => pg.evaluate(async () => { const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k.startsWith('zs1:')) ls[k] = localStorage.getItem(k); }
      const db = await new Promise(res => { const r = indexedDB.open('playground-zero'); r.onsuccess = () => { const d = r.result, tx = d.transaction(['projects', 'meta'], 'readonly'), a = tx.objectStore('projects').getAll(), b = tx.objectStore('meta').getAll(); tx.oncomplete = () => { d.close(); res({ p: a.result, m: b.result }); }; }; }); return JSON.stringify({ ls, db }); });
    await pg.goto(env.base + '/#/io'); await pg.waitForSelector('.zs-drop'); const before = await snap(); assert.ok(Object.keys(JSON.parse(before).ls).length >= 5, 'localStorage に旧データがある');
    await waitFor(async () => /件をコピーして取り込む/.test(await pg.locator('#zs-main').innerText())); const found = await pg.locator('#zs-main').innerText(); assert.ok(/CODE LAB のプロジェクト/.test(found) && /Logic の保存済み回路/.test(found) && /旧 Playground Zero/.test(found), found.slice(0, 400));
    await pg.click('button:has-text("件をコピーして取り込む")'); await waitFor(async () => (await list(pg)).length >= 6); await pg.waitForTimeout(800);
    const all = await list(pg); const has = (e, w) => all.some(p => p.engine === e && p.workType === w);
    assert.ok(has('code', 'web') && has('code', 'pixel') && has('logic', 'circuit') && has('logic', 'machine') && has('logic', 'cpu-program') && has('zero', 'studio'), JSON.stringify(all.map(p => p.engine + '/' + p.workType)));
    assert.ok(all.find(p => p.title === '旧Web作品').engineData.payload.html === '<h1>旧</h1>'); assert.ok(all.find(p => p.title === '旧Zero作品').engineData.payload.objects.length === 1);
    assert.strictEqual(await snap(), before, '元の保存領域は一切変更されていない'); assert.ok(await pg.evaluate(async () => (await ZS.app.store.getMeta('zero:favorites', null)) !== undefined));
    const n = all.length; await pg.reload(); await pg.waitForSelector('.zs-drop'); await waitFor(async () => /取り込みの状態|取り込み済み/.test(await pg.locator('#zs-main').innerText())); const again = await pg.locator('#zs-main').innerText();
    assert.ok(/取り込むものはありません/.test(again), '2回目は重複しない'); assert.strictEqual((await list(pg)).length, n); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  const bad = [['壊れたJSON', 'garbage.json', '{not json'], ['空ファイル', 'empty.json', ''], ['配列', 'array.json', '[1,2,3]'], ['無関係なJSON', 'other.json', '{"hello":"world"}'], ['途中で切れたJSON', 'trunc.json', '{"app":"zerostudio","format":"zerostudio.file","formatVersion":1,"projects":[{"id":"x"'],
    ['別アプリのバックアップ風', 'fake.json', '{"app":"other","projects":[{"a":1}]}'], ['未来の形式', 'future.json', JSON.stringify({ app: 'zerostudio', format: 'zerostudio.file', formatVersion: 99, kind: 'bundle', projects: [{ format: 'zerostudio.project', formatVersion: 99, id: 'zsp_f', engine: 'code', workType: 'web', title: 'F', engineData: { schemaVersion: 1, payload: { html: 'a', css: 'b', js: 'c' } }, newThing: {} }], library: [] })],
    ['深すぎる入れ子', 'deep.json', JSON.stringify({ app: 'zerostudio', format: 'zerostudio.file', formatVersion: 1, projects: [{ format: 'zerostudio.project', formatVersion: 1, id: 'zsp_d', engine: 'hologram', workType: 'x', title: 'D', engineData: { schemaVersion: 1, payload: JSON.parse('{"a":'.repeat(80) + '1' + '}'.repeat(80)) } }] })],
    ['HTML注入のドット絵', 'xss.json', JSON.stringify(Object.assign(PIX('#fff"><img src=x onerror=window.__pwn=1>'), {}))]];
  await test('4. 不正な取り込み（' + bad.length + '種＋巨大ファイル＋汚染）でアプリが停止せず、理由が表示され、何も壊れない', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1'); await pg.evaluate(async () => { await ZS.app.svc.create({ engine: 'code', workType: 'web', title: '既存' }); });
    for (const [label, name, body] of bad) {
      const text = await importFile(pg, env, { name, mimeType: 'application/json', buffer: Buffer.from(body) }, false);
      const okMsg = /取り込めません|読み取れません|対応していない|見つかりませんでした|取り込みの確認|ファイル|大きすぎ|形式/.test(text); assert.ok(okMsg, label + ': 理由が表示されない: ' + text.slice(0, 200));
      if (/取り込みの確認/.test(text)) assert.ok(!(await pg.locator('button:text-is("取り込む")').isEnabled()) || /future|未来|新しい版|取り込めない/.test(text + label), label + ': 取り込めてはいけない');
      await pg.click('#zs-nav a:text-is("設定")'); await pg.waitForSelector('.zs-page h1'); await pg.click('#zs-nav a:text-is("インポート／エクスポート")'); await pg.waitForSelector('.zs-drop');
    }
    fs.writeFileSync('/tmp/zs-big.json', Buffer.alloc(51 * 1024 * 1024, 32)); const big = await importFile(pg, env, '/tmp/zs-big.json', false); assert.ok(/大きすぎ/.test(big), big.slice(0, 200)); fs.unlinkSync('/tmp/zs-big.json');
    assert.strictEqual((await list(pg)).length, 1, '既存データは無傷で、不正データは1件も入っていない'); assert.strictEqual(await pg.evaluate(() => window.__pwn), undefined); assert.strictEqual(await pg.evaluate(() => ({}).polluted), undefined);
    assert.deepStrictEqual(pg.errors, [], 'ページ全体のエラーなし'); await pg.ctx.close();
  });
  await test('5. プロトタイプ汚染を狙ったJSONを取り込んでも、汚染されず保存データにも残らない', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    const body = '{"app":"zerostudio","format":"zerostudio.file","formatVersion":1,"kind":"bundle","projects":[{"format":"zerostudio.project","formatVersion":1,"id":"zsp_proto","engine":"hologram","workType":"x","title":"P","engineData":{"schemaVersion":1,"payload":{"ok":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}}}}}],"library":[]}';
    const text = await importFile(pg, env, { name: 'proto.json', mimeType: 'application/json', buffer: Buffer.from(body) }); assert.ok(/件を追加/.test(text), text);
    assert.strictEqual(await pg.evaluate(() => ({}).polluted), undefined); assert.strictEqual(await pg.evaluate(() => ({}).polluted2), undefined);
    const p = (await list(pg))[0]; assert.deepStrictEqual(p.engineData.payload, { ok: 1 }); await pg.ctx.close();
  });
  await test('6. Zero 作品: ZeroStudio JSON と Zero のバックアップ形式のどちらでも、データが誤変換されず戻る', async () => {
    const A = await page(env); await zeroWorks(A, env); const works = await list(A, { engine: 'zero' }); assert.ok(works.length >= 4);
    const studio = works.find(w => w.workType === 'studio' && w.title === 'Z作品'); assert.ok(works.some(w => w.workType === 'experiment') && works.some(w => w.workType === 'creation'));
    const derived = works.find(w => w.title === '派生Z'); assert.strictEqual(derived.derivedFrom.projectId, studio.id, 'Zero の派生元が共通形式の派生元に出る');
    await A.goto(env.base + '/#/projects'); await A.waitForSelector('.zs-item'); const zsFile = await download(A, async () => { await A.locator('.zs-item', { hasText: 'Z作品' }).first().locator('button[aria-haspopup=menu]').click(); await A.click('.zs-menu button:text-is("ZeroStudio JSON で書き出す")'); });
    const nativeFile = await download(A, async () => { await A.locator('.zs-item', { hasText: 'Z作品' }).first().locator('button[aria-haspopup=menu]').click(); await A.click('.zs-menu button:text-is("元アプリ形式で書き出す")'); });
    assert.strictEqual(nativeFile.app, 'playground-zero'); assert.strictEqual(nativeFile.projects.length, 1);
    const B = await page(env); await importFile(B, env, { name: 'z.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(zsFile)) }); const got = (await list(B, { engine: 'zero' }))[0];
    assert.deepStrictEqual(got.engineData.payload, studio.engineData.payload, 'ZeroStudio JSON: Zero 作品がバイト単位で同一'); assert.strictEqual(got.id, studio.id);
    const C = await page(env); const t = await importFile(C, env, { name: 'z.pzbackup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(nativeFile)) }); assert.ok(/件を追加/.test(t), t);
    const got2 = (await list(C, { engine: 'zero' }))[0]; assert.strictEqual(got2.title, 'Z作品'); assert.deepStrictEqual(got2.engineData.payload.objects, studio.engineData.payload.objects); assert.strictEqual(got2.engineData.payload.background, '#123456'); assert.deepStrictEqual(got2.tags, studio.tags);
    assert.deepStrictEqual([A.errors, B.errors, C.errors], [[], [], []]); await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
  });
  await test('7. バックアップ→空の環境へ復元: 作品・素材・Zero付随データ・設定が戻り、バックアップ日時が記録される', async () => {
    const A = await page(env); await zeroWorks(A, env);
    await A.evaluate(async (PIX) => { const s = ZS.app.svc; await s.create({ engine: 'code', workType: 'web', title: 'W' }); await s.libRegister({ kind: 'pixel-art', name: '素材', data: PIX }); await s.saveSettings({ authorName: '山田' }); await ZS.app.store.setMeta('zero:favTools', ['flow']); }, PIX('#f00'));
    await A.goto(env.base + '/#/io'); await A.waitForSelector('.zs-drop'); const bk = await download(A, () => A.click('button:text-is("全データのバックアップを書き出す")')); assert.strictEqual(bk.kind, 'backup'); assert.ok(bk.library.length === 1 && bk.meta.some(m => m.id === 'zero:favTools'));
    assert.ok(await A.evaluate(async () => !!(await ZS.app.svc.lastBackupAt())));
    const B = await page(env); const t = await importFile(B, env, { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) }); assert.ok(/件を追加/.test(t), t);
    assert.strictEqual((await list(B)).length, bk.projects.length); assert.strictEqual(await B.evaluate(async () => (await ZS.app.svc.libList()).items.length), 1); assert.deepStrictEqual(await B.evaluate(() => ZS.app.store.getMeta('zero:favTools')), ['flow']);
    const t2 = await importFile(B, env, { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) }); assert.strictEqual((await list(B)).length, bk.projects.length, '2回復元しても重複しない');
    assert.deepStrictEqual([A.errors, B.errors], [[], []]); await A.ctx.close(); await B.ctx.close();
  });
  await test('8. 公開用データ: 公開設定が必要・オンラインではない旨・作者/ライセンス/派生元/版/素材を同梱・改ざん検出', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    await pg.evaluate(async (PIX) => { const s = ZS.app.svc; const it = await s.libRegister({ kind: 'pixel-art', name: '素材', data: PIX }); const p = await s.create({ engine: 'code', workType: 'web', title: '公開候補', payload: { html: `<!-- zs-asset:${it.id}@1 -->`, css: '', js: '' } }); await s.save(await s.get(p.id)); await s.update(p.id, { visibility: 'export-ready', license: { id: 'CC-BY-4.0', holder: '作者A' }, author: { name: '作者A' } }); }, PIX('#f00'));
    await pg.goto(env.base + '/#/io'); await pg.waitForSelector('.zs-item'); const pk = await download(pg, () => pg.click('button:text-is("公開用データを書き出す")'));
    assert.strictEqual(pk.format, 'zerostudio.publish'); assert.strictEqual(pk.online, false); assert.ok(/オンライン公開は行われません/.test(pk.note)); assert.strictEqual(pk.project.license.id, 'CC-BY-4.0'); assert.strictEqual(pk.project.author.name, '作者A'); assert.ok(pk.project.id && pk.project.projectVersion >= 1); assert.strictEqual(pk.library.length, 1); assert.strictEqual(pk.integrity.hash.length, 64);
    pk.project.title = '改ざん'; const B = await page(env); const t = await importFile(B, env, { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pk)) }, false); assert.ok(/完全性チェックに失敗/.test(t), t.slice(0, 200)); assert.strictEqual((await list(B)).length, 0);
    await pg.ctx.close(); await B.ctx.close();
  });
  await env.close(); summary('io');
})();
