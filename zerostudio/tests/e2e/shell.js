const { start, page, test, summary } = require('./lib'); const assert = require('assert');
const fr = (pg, n) => pg.frames().find(f => f.url().includes('/engines/' + n + '/'));
const list = (pg, q) => pg.evaluate(async (q) => (await ZS.app.svc.list(q || {})).projects, q);
const waitFor = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout waiting'); await new Promise(r => setTimeout(r, 120)); } };
async function openEngine(pg, env, name, q) { await pg.goto(env.base + '/#/' + name + (q || '')); await pg.waitForSelector('.zs-frame'); await waitFor(async () => { const f = fr(pg, name); return f && await f.evaluate(() => !!(window.ZSBridge && ZSBridge.ready)).catch(() => false); }, 15000); await pg.waitForTimeout(400); }

(async () => {
  const env = await start(); console.log('# shell e2e');
  await test('1. 起動: 全ページが描画され、コンソールエラー0・外部通信0', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    assert.strictEqual(await pg.locator('#zs-nav a').count(), 8);
    for (const r of ['home', 'projects', 'library', 'io', 'settings']) { await pg.goto(env.base + '/#/' + r); await pg.waitForTimeout(500); assert.ok(await pg.locator('.zs-page').count(), r); }
    for (const r of ['code', 'logic', 'zero']) await openEngine(pg, env, r);
    assert.deepStrictEqual(pg.errors, []); assert.deepStrictEqual(pg.requests, []); await pg.ctx.close();
  });
  await test('2. Code Studio: 編集が共通ストアへ自動保存され、再読み込みで復元される', async () => {
    const pg = await page(env); await openEngine(pg, env, 'code'); const f = fr(pg, 'code');
    await f.fill('#projectName', '保存テスト'); await f.fill('#codeInput', '<h1 id="t">自動保存</h1>');
    const p = await waitFor(async () => (await list(pg, { engine: 'code' })).find(x => x.title === '保存テスト' && x.engineData.payload.html.includes('自動保存')));
    assert.strictEqual(p.workType, 'web'); assert.strictEqual(p.format, 'zerostudio.project'); assert.strictEqual(p.projectVersion, 1);
    assert.ok(/保存済み/.test(await pg.textContent('.zs-status')));
    await pg.reload(); await openEngine(pg, env, 'code'); const f2 = fr(pg, 'code');
    assert.strictEqual(await f2.inputValue('#projectName'), '保存テスト'); assert.ok((await f2.inputValue('#codeInput')).includes('自動保存'));
    assert.strictEqual(await pg.inputValue('.zs-bar input'), '保存テスト'); assert.strictEqual((await list(pg)).length, 1, '再読み込みでプロジェクトが増えない');
    assert.strictEqual(await f2.getAttribute('#previewFrame', 'sandbox'), 'allow-scripts allow-modals');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('3. 版: 「保存」で内容が変わっていれば +1、変わっていなければ増えない', async () => {
    const pg = await page(env); await openEngine(pg, env, 'code'); const f = fr(pg, 'code');
    await f.fill('#codeInput', '<p>v1</p>'); await waitFor(async () => (await list(pg)).length === 1);
    await pg.click('.zs-bar button:text-is("保存")'); await pg.waitForTimeout(500); assert.strictEqual((await list(pg))[0].projectVersion, 1);
    await f.fill('#codeInput', '<p>v2</p>'); await pg.waitForTimeout(1600); await pg.click('.zs-bar button:text-is("保存")');
    await waitFor(async () => (await list(pg))[0].projectVersion === 2); await pg.click('.zs-bar button:text-is("保存")'); await pg.waitForTimeout(500);
    assert.strictEqual((await list(pg))[0].projectVersion, 2); await pg.ctx.close();
  });
  await test('4. 同名プロジェクトを UI から複数作成してもIDが衝突しない（3エンジン）', async () => {
    const pg = await page(env); const ids = new Set();
    for (const t of ['新規 Web作品', '新規 Web作品', '新規 Web作品', '新規 回路', '新規 回路', '新規 機械']) { await pg.goto(env.base + '/#/home'); await pg.waitForSelector('.zs-card'); await pg.click(`.zs-card button:text-is("${t}")`); await pg.waitForSelector('.zs-frame'); await pg.waitForTimeout(900); }
    const all = await list(pg); all.forEach(p => ids.add(p.id)); assert.strictEqual(all.length, 6); assert.strictEqual(ids.size, 6);
    assert.strictEqual(all.filter(p => p.title === '無題のWeb作品').length, 3); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('5. プロジェクト一覧: 検索・絞り込み・名前変更・複製（派生元）・削除の確認と取り消し', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    await pg.evaluate(async () => { const s = ZS.app.svc; await s.create({ engine: 'code', workType: 'web', title: 'りんご' }); await s.create({ engine: 'logic', workType: 'circuit', title: 'バナナ', tags: ['fruit'] }); await s.create({ engine: 'code', workType: 'pixel', title: 'ぶどう' }); });
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item');
    assert.strictEqual(await pg.locator('.zs-item').count(), 3);
    await pg.fill('input[type=search]', 'fruit'); await pg.waitForTimeout(400); assert.strictEqual(await pg.locator('.zs-item').count(), 1); await pg.fill('input[type=search]', ''); await pg.waitForTimeout(400);
    await pg.selectOption('select[aria-label="エンジンで絞り込み"]', 'code'); await pg.waitForTimeout(300); assert.strictEqual(await pg.locator('.zs-item').count(), 2);
    await pg.selectOption('select[aria-label="作品タイプで絞り込み"]', 'pixel'); await pg.waitForTimeout(300); assert.strictEqual(await pg.locator('.zs-item').count(), 1);
    await pg.selectOption('select[aria-label="エンジンで絞り込み"]', ''); await pg.waitForTimeout(300);
    const row = pg.locator('.zs-item', { hasText: 'りんご' }); await row.locator('button[aria-haspopup=menu]').click(); await pg.click('.zs-menu button:text-is("名前を変更…")');
    await pg.fill('dialog input', 'みかん'); await pg.click('dialog button:text-is("変更")'); await pg.waitForTimeout(500); assert.ok(await pg.locator('.zs-item', { hasText: 'みかん' }).count());
    await pg.locator('.zs-item', { hasText: 'みかん' }).locator('button[aria-haspopup=menu]').click(); await pg.click('.zs-menu button:text-is("複製")'); await pg.waitForTimeout(600);
    const dup = (await list(pg)).find(p => p.title === 'みかん のコピー'); const orig = (await list(pg)).find(p => p.title === 'みかん'); assert.strictEqual(dup.derivedFrom.projectId, orig.id); assert.strictEqual(dup.derivedFrom.projectVersion, orig.projectVersion);
    // 削除: キャンセルでは消えない → 削除で消える → 取り消しで戻る
    const target = pg.locator('.zs-item', { hasText: 'バナナ' }); await target.locator('button[aria-haspopup=menu]').click(); await pg.click('.zs-menu button:text-is("削除…")');
    assert.ok(await pg.locator('dialog').isVisible()); await pg.click('dialog button:text-is("キャンセル")'); await pg.waitForTimeout(300); assert.ok((await list(pg)).some(p => p.title === 'バナナ'));
    await target.locator('button[aria-haspopup=menu]').click(); await pg.click('.zs-menu button:text-is("削除…")'); await pg.click('dialog button:text-is("削除")'); await pg.waitForTimeout(500);
    assert.ok(!(await list(pg)).some(p => p.title === 'バナナ')); await pg.click('button:has-text("直前の削除を取り消す")'); await pg.waitForTimeout(500); assert.ok((await list(pg)).some(p => p.title === 'バナナ'));
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('6. 詳細ダイアログ: タグ・ライセンス・公開設定が保存され、公開設定に「オンラインではない」旨が出る', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    const id = await pg.evaluate(async () => (await ZS.app.svc.create({ engine: 'code', workType: 'web', title: '詳細' })).id);
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); await pg.locator('.zs-item').first().locator('button[aria-haspopup=menu]').click(); await pg.click('.zs-menu button:has-text("詳細")');
    await pg.waitForSelector('dialog'); assert.ok((await pg.textContent('dialog')).includes('オンライン共有の機能はなく'));
    await pg.fill('dialog input[placeholder^="カンマ"]', 'a, b'); await pg.selectOption('dialog select >> nth=0', 'CC-BY-4.0'); await pg.selectOption('dialog select >> nth=1', 'export-ready'); await pg.click('dialog button:text-is("保存")'); await pg.waitForTimeout(600);
    const p = (await list(pg))[0]; assert.deepStrictEqual([p.tags, p.license.id, p.visibility], [['a', 'b'], 'CC-BY-4.0', 'export-ready']); assert.strictEqual(p.id, id); await pg.ctx.close();
  });
  await test('7. 競合: 別タブが先に更新していたら上書きせず「競合コピー」に保存する', async () => {
    const A = await page(env); await openEngine(A, env, 'code'); const fa = fr(A, 'code'); await fa.fill('#codeInput', '<p>元</p>'); const p0 = await waitFor(async () => (await list(A))[0]);
    const B = await A.ctx.newPage(); B.on('dialog', d => d.accept()); await B.goto(env.base + '/#/code?p=' + p0.id); await B.waitForSelector('.zs-frame'); await waitFor(async () => { const f = fr(B, 'code'); return f && await f.evaluate(() => !!(window.ZSBridge && ZSBridge.ready)).catch(() => false); }, 15000); await B.waitForTimeout(500);
    await fr(B, 'code').fill('#codeInput', '<p>タブB</p>'); await waitFor(async () => (await list(A)).find(x => x.id === p0.id).engineData.payload.html === '<p>タブB</p>');
    await fa.fill('#codeInput', '<p>タブA</p>'); await waitFor(async () => (await list(A)).length === 2);
    const all = await list(A); assert.strictEqual(all.find(x => x.id === p0.id).engineData.payload.html, '<p>タブB</p>'); const copy = all.find(x => x.id !== p0.id);
    assert.ok(copy.title.includes('競合コピー')); assert.strictEqual(copy.engineData.payload.html, '<p>タブA</p>'); assert.strictEqual(copy.derivedFrom.projectId, p0.id);
    assert.ok(await A.locator('.zs-toast.warn').count()); await A.ctx.close();
  });
  await test('8. 容量不足: 分かりやすいエラーを表示し、アプリは止まらず、回復後は保存できる', async () => {
    const pg = await page(env); await openEngine(pg, env, 'code'); const f = fr(pg, 'code'); await f.fill('#codeInput', '<p>1</p>'); await waitFor(async () => (await list(pg)).length === 1);
    await pg.evaluate(() => { window.__put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
    await f.fill('#codeInput', '<p>2</p>'); await waitFor(async () => /保存できません/.test(await pg.textContent('.zs-status')));
    assert.ok(/容量/.test(await pg.textContent('.zs-status'))); assert.ok(await pg.locator('.zs-nav a').first().isVisible()); assert.strictEqual((await list(pg))[0].engineData.payload.html, '<p>1</p>', '失敗した保存で既存データが壊れない');
    await pg.evaluate(() => { IDBObjectStore.prototype.put = window.__put; }); await f.fill('#codeInput', '<p>3</p>'); await waitFor(async () => (await list(pg))[0].engineData.payload.html === '<p>3</p>');
    assert.ok(/保存済み/.test(await pg.textContent('.zs-status'))); await pg.ctx.close();
  });
  await test('9. Logic: 回路・CPU・機械が3つの作品として別々に保存され、再読み込みで全部復元される', async () => {
    const pg = await page(env); await openEngine(pg, env, 'logic'); const f = fr(pg, 'logic');
    // 回路: 3番ノードを置いてから、名前を編集（利用者の操作）
    await f.evaluate(() => ZSBridge.setCircuit('回路', { v: 1, name: '回路', nodes: [{ id: 3, t: 'sw', x: 50, y: 50, p: { on: 1 }, lb: 'S' }], wires: [] })); await f.fill('#pname', '回路X'); await f.press('#pname', 'Enter');
    await waitFor(async () => (await list(pg, { engine: 'logic' })).some(p => p.workType === 'circuit' && p.title === '回路X'));
    // CPU: タブを開いてアセンブリを編集
    await f.evaluate(() => ZSBridge.show('cpu-program')); await f.fill('#asm', 'LDI A, 7\nOUT A\nHLT'); await waitFor(async () => (await list(pg, { engine: 'logic' })).some(p => p.workType === 'cpu-program'));
    // 機械: 回路の信号 3:0 を参照する機械を読み込み、名前を編集
    await f.evaluate(() => ZSBridge.show('machine')); await f.evaluate(() => ZSBridge.setMachine('機械', { v: 1, kind: 'machine', name: '機械', parts: [{ id: 1, t: 'belt', x: 100, y: 200, p: { len: 300, spd: 90, dir: 1, on: 1, src: '3:0' } }], balls: [] }));
    await f.fill('#mlname', '機械Y'); await f.press('#mlname', 'Enter'); const m = await waitFor(async () => (await list(pg, { engine: 'logic' })).find(p => p.workType === 'machine' && p.title === '機械Y'));
    const circ = (await list(pg, { engine: 'logic' })).find(p => p.workType === 'circuit');
    assert.ok(m.dependencies.some(d => d.type === 'ref' && d.detail.refs[0] === '3:0'), '機械→回路の信号参照を記録');
    assert.ok(m.dependencies.some(d => d.type === 'project' && d.id === circ.id), '機械→回路プロジェクトへの依存を記録');
    await pg.waitForTimeout(800); await pg.reload(); await openEngine(pg, env, 'logic'); const f2 = fr(pg, 'logic');
    assert.strictEqual(await f2.evaluate(() => ZSBridge.getCircuit().payload.nodes.length), 1); assert.strictEqual(await f2.evaluate(() => ZSBridge.getCircuit().title), '回路X');
    assert.ok((await f2.inputValue('#asm')).includes('LDI A, 7')); assert.strictEqual(await f2.evaluate(() => ZSBridge.getMachine().payload.parts.length), 1); assert.strictEqual(await f2.evaluate(() => ZSBridge.getMachine().title), '機械Y');
    assert.strictEqual((await list(pg, { engine: 'logic' })).length, 3, '復元で作品が増えない'); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('10. 機械の読み込み時、参照先の回路が無ければ警告する', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    const id = await pg.evaluate(async () => (await ZS.app.svc.create({ engine: 'logic', workType: 'machine', title: '参照つき', payload: { v: 1, kind: 'machine', name: 'm', parts: [{ id: 1, t: 'belt', x: 100, y: 200, p: { len: 300, spd: 90, dir: 1, on: 1, src: '9:0' } }], balls: [] } })).id);
    await openEngine(pg, env, 'logic', '?p=' + id); await pg.waitForSelector('.zs-toast.warn'); assert.ok((await pg.textContent('.zs-toast.warn')).includes('9:0')); await pg.ctx.close();
  });
  await test('11. 未対応エンジンのデータは一覧に残り、開けないと明示され、書き出しでも失われない', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    await pg.evaluate(async () => { const p = ZS.schema.newProject({ engine: 'hologram', workType: 'scene', title: '未来の作品', payload: { a: [1, { b: 2 }] } }); await ZS.app.store.put('projects', p); });
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); const row = pg.locator('.zs-item', { hasText: '未来の作品' });
    assert.ok(await row.locator('button:text-is("開く")').isDisabled()); const bk = await pg.evaluate(async () => (await ZS.app.svc.exportBackup()).projects.find(p => p.engine === 'hologram').engineData.payload);
    assert.deepStrictEqual(bk, { a: [1, { b: 2 }] }); await pg.ctx.close();
  });
  await test('12. モバイル幅(390px): 横スクロールが出ず、ナビ・一覧・エンジン画面が使える', async () => {
    const pg = await page(env, { context: { viewport: { width: 390, height: 844 }, hasTouch: true } }); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    await pg.evaluate(async () => { for (let i = 0; i < 3; i++) await ZS.app.svc.create({ engine: 'code', workType: 'web', title: 'とても長いタイトルのプロジェクトその' + i + 'とても長いタイトル' }); });
    for (const r of ['home', 'projects', 'library', 'io', 'settings']) { await pg.goto(env.base + '/#/' + r); await pg.waitForTimeout(500); assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), r + ' が横にはみ出す'); }
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); await pg.locator('.zs-item').first().locator('button:text-is("開く")').tap(); await pg.waitForSelector('.zs-frame');
    const box = await pg.locator('.zs-frame').boundingBox(); assert.ok(box.height > 400 && box.width >= 380, 'エンジン領域が十分に確保される: ' + JSON.stringify(box));
    await pg.locator('#zs-menu').tap(); await pg.waitForSelector('#zs-nav.open'); await pg.waitForTimeout(350); await pg.locator('#zs-nav a:text-is("設定")').tap(); await pg.waitForSelector('.zs-page h1'); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('13. IndexedDB が使えない環境: localStorage に切り替わり、警告を出しつつ、保存・復元・Zero の作成まで動く', async () => {
    const pg = await page(env); await pg.ctx.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    await pg.goto(env.base + '/'); await pg.waitForSelector('h1'); assert.ok(/不安定/.test(await pg.textContent('#zs-storage'))); await waitFor(async () => /localStorage|不安定|消えたり/.test(await pg.locator('#zs-main').innerText()));
    assert.strictEqual(await pg.evaluate(() => ZS.app.store.kind), 'localstorage');
    await openEngine(pg, env, 'code'); const f = fr(pg, 'code'); await f.fill('#projectName', 'LS保存'); await f.fill('#codeInput', '<p>ls</p>'); await waitFor(async () => (await list(pg)).some(p => p.title === 'LS保存'));
    assert.ok(await pg.evaluate(() => !!localStorage.getItem('zs1:projects')), 'localStorage に書かれている'); await pg.reload(); await openEngine(pg, env, 'code'); assert.strictEqual(await fr(pg, 'code').inputValue('#projectName'), 'LS保存');
    await openEngine(pg, env, 'zero'); const id = await fr(pg, 'zero').evaluate(async () => { const p = await PZ.projects.create('LSのZero'); return [PZ.projects.kind(), p.id]; }); assert.strictEqual(id[0], 'localstorage');
    assert.ok((await list(pg, { engine: 'zero' })).some(p => p.id === id[1])); assert.deepStrictEqual(pg.errors.filter(e => !/IndexedDB/.test(e)), []); await pg.ctx.close();
  });
  await env.close(); summary('shell');
})();
