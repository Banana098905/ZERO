const { start, page, test, summary } = require('./lib'); const assert = require('assert');
(async () => {
  const env = await start(); console.log('# bridge smoke (engines opened directly with ?zs=1)');
  await test('Code: 単体で起動しエラー0・フック経由で ZSBridge が公開される', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/code/index.html?zs=1'); await pg.waitForTimeout(800);
    assert.deepStrictEqual(pg.errors, []); assert.strictEqual(await pg.evaluate(() => !!(window.ZSBridge && ZSBridge.ready)), true);
    const w = await pg.evaluate(() => ZSBridge.getWeb()); assert.ok(w.payload.html.includes('welcome-card'));
    await pg.evaluate(() => ZSBridge.setWeb('差し替え', { html: '<h1 id="x">こんにちは</h1>', css: 'h1{color:red}', js: 'console.log("hi")' }));
    assert.strictEqual(await pg.inputValue('#projectName'), '差し替え'); assert.strictEqual(await pg.inputValue('#codeInput'), '<h1 id="x">こんにちは</h1>');
    await pg.waitForTimeout(500); const fr = pg.frameLocator('#previewFrame'); assert.strictEqual(await fr.locator('#x').textContent(), 'こんにちは');
    assert.strictEqual(await pg.getAttribute('#previewFrame', 'sandbox'), 'allow-scripts allow-modals'); // ユーザーコードの隔離が維持されている
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('Code: ドット絵の読み書き往復、不正な色を含むJSON読込は拒否される', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/code/index.html?zs=1'); await pg.waitForTimeout(500);
    const frames = [new Array(256).fill(null)]; frames[0][0] = '#ff0000'; frames[0][17] = '#00ff00';
    await pg.evaluate(f => ZSBridge.setPixel('ハート', { version: 1, size: 16, frames: f, palette: ['#112233'], saved: [], transparent: true, bg: '#171a2b', fps: 4 }), frames);
    const back = await pg.evaluate(() => ZSBridge.getPixel()); assert.strictEqual(back.title, 'ハート'); assert.deepStrictEqual(back.payload.frames, frames); assert.strictEqual(await pg.evaluate(() => ZSBridge.getMode()), 'pixel');
    const evil = JSON.stringify({ version: 1, size: 16, frames: [Object.assign(new Array(256).fill(null), { 0: '#fff"><img src=x onerror="window.__pwn=1">' })], palette: [], saved: [], transparent: true, bg: '#000', fps: 4, tool: '<b>' });
    await pg.setInputFiles('#pixelImportInput', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(evil) }); await pg.waitForTimeout(400);
    assert.strictEqual(await pg.evaluate(() => window.__pwn), undefined); assert.strictEqual(await pg.locator('#pixelCanvas img').count(), 0);
    assert.ok((await pg.textContent('#toast')).includes('有効なPIXEL LAB JSONではありません'));
    const ok = JSON.stringify({ version: 1, size: 16, frames: [Object.assign(new Array(256).fill(null), { 5: '#abcdef' })], palette: ['#123456'], saved: [], transparent: true, bg: '#000', fps: 4, name: '正常' });
    await pg.setInputFiles('#pixelImportInput', { name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(ok) }); await pg.waitForTimeout(400);
    assert.strictEqual((await pg.evaluate(() => ZSBridge.getPixel())).title, '正常'); await pg.ctx.close();
  });
  await test('Code: 編集すると change が親へ通知される', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/code/index.html?zs=1');
    await pg.evaluate(() => { window.__msgs = []; window.addEventListener('message', e => window.__msgs.push(e.data)); window.parent.postMessage = (d) => window.__msgs.push(d); }); await pg.waitForTimeout(900);
    await pg.fill('#codeInput', '<p>編集</p>'); await pg.waitForTimeout(1500);
    assert.ok((await pg.evaluate(() => window.__msgs)).some(m => m && m.zs === 1 && m.type === 'change' && m.slot === 'web')); await pg.ctx.close();
  });
  await test('Logic: 起動エラー0・回路の読み書き往復・元アプリの検証で不正データを拒否', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/logic/index.html?zs=1'); await pg.waitForTimeout(800);
    assert.deepStrictEqual(pg.errors, []); assert.strictEqual(await pg.evaluate(() => !!(window.ZSBridge && ZSBridge.ready)), true);
    const c = { v: 1, name: '試験回路', nodes: [{ id: 1, t: 'sw', x: 60, y: 50, p: { on: 1 }, lb: 'A' }, { id: 2, t: 'lamp', x: 300, y: 50, p: {}, lb: '' }], wires: [{ id: 1, from: 1, fo: 0, to: 2, ti: 0 }] };
    await pg.evaluate(c2 => ZSBridge.setCircuit('試験回路', c2), c); const back = await pg.evaluate(() => ZSBridge.getCircuit());
    const norm = JSON.parse(JSON.stringify(c)); norm.nodes[1].p = { col: '#22d3ee' }; // 元アプリの clean() が欠けた既定値を補う（仕様どおり）
    assert.deepStrictEqual(back.payload, norm);
    const again = await pg.evaluate(p => { ZSBridge.setCircuit('試験回路', p); return ZSBridge.getCircuit().payload; }, back.payload); assert.deepStrictEqual(again, norm, '正規化後のデータは往復で不変');
    const bad = await pg.evaluate(() => ZSBridge.validateCircuit({ v: 1, nodes: [{ id: 1, t: 'nonexistent', x: 0, y: 0 }], wires: [] })); assert.strictEqual(bad.ok, false);
    await assert.rejects(() => pg.evaluate(() => ZSBridge.setCircuit('x', { v: 1, nodes: [{ id: 1, t: 'zzz', x: 0, y: 0 }], wires: [] })), /不正|invalid|部品/);
    assert.deepStrictEqual((await pg.evaluate(() => ZSBridge.getCircuit())).payload, norm, '失敗した読込で現在の回路が壊れない'); await pg.ctx.close();
  });
  await test('Logic: CPUプログラム・機械の読み書き往復と機械の回路参照チェック', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/logic/index.html?zs=1'); await pg.waitForTimeout(600);
    await pg.evaluate(() => ZSBridge.setCpu(null, { asm: 'LDI A, 9\nOUT A\nHLT', input: 5 })); const cpu = await pg.evaluate(() => ZSBridge.getCpu()); assert.deepStrictEqual(cpu.payload, { asm: 'LDI A, 9\nOUT A\nHLT', input: 5 });
    const m = { v: 1, kind: 'machine', name: '機械', parts: [{ id: 1, t: 'belt', x: 100, y: 200, p: { len: 300, spd: 90, dir: 1, on: 1, src: '3:0' } }, { id: 2, t: 'bin', x: 200, y: 300, p: { w: 110, acc: 'any' } }], balls: [{ id: 1, x: 120, y: 180, c: 'r' }] };
    await pg.evaluate(x => ZSBridge.setMachine('機械', x), m); const mb = await pg.evaluate(() => ZSBridge.getMachine()); assert.deepStrictEqual(mb.payload.parts.map(p => p.t), ['belt', 'bin']); assert.strictEqual(mb.payload.balls.length, 1);
    assert.deepStrictEqual(await pg.evaluate(() => ZSBridge.missingRefs(['3:0'])), ['3:0']);
    await pg.evaluate(() => ZSBridge.setCircuit('c', { v: 1, name: 'c', nodes: [{ id: 3, t: 'sw', x: 0, y: 0, p: { on: 0 }, lb: '' }], wires: [] }));
    assert.deepStrictEqual(await pg.evaluate(() => ZSBridge.missingRefs(['3:0', '3:9', '7:0'])), ['3:9', '7:0']); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('Zero: ?zs=1 で共通ストアに保存され、Zero の元コードのまま作品が作れる', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/zero/index.html?zs=1'); await pg.waitForFunction(() => window.ZSBridge && ZSBridge.ready, null, { timeout: 8000 });
    assert.strictEqual(await pg.evaluate(() => PZ.projects.kind()), 'indexeddb'); assert.strictEqual(await pg.evaluate(() => PZ.projects.health().ok), true);
    const id = await pg.evaluate(async () => { const p = await PZ.projects.create('共通ストア作品'); return p.id; });
    const env2 = await pg.evaluate(async (id) => { const s = await ZS.store.open(); const r = await s.get('projects', id); return r && { engine: r.engine, workType: r.workType, title: r.title, fmt: r.format, payloadId: r.engineData.payload.id, ver: r.projectVersion }; }, id);
    assert.deepStrictEqual(env2, { engine: 'zero', workType: 'studio', title: '共通ストア作品', fmt: 'zerostudio.project', payloadId: id, ver: 1 });
    assert.strictEqual(await pg.evaluate(async () => { const l = await PZ.projects.list(); return l.length; }), 1);
    await pg.evaluate(async (id) => { await PZ.projects.rename(id, '改名済み'); }, id); assert.strictEqual((await pg.evaluate(async (id) => (await ZS.store.open().then(s => s.get('projects', id))).title, id)), '改名済み');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('Zero: 単体（?zs=1 なし）では従来どおり Zero 自身の IndexedDB を使い、共通ストアに書かない', async () => {
    const pg = await page(env); await pg.goto(env.base + '/engines/zero/index.html'); await pg.waitForTimeout(1200);
    assert.strictEqual(await pg.evaluate(() => PZ.projects.kind()), 'indexeddb'); await pg.evaluate(async () => { await PZ.projects.create('単体作品'); });
    const dbs = await pg.evaluate(async () => (await indexedDB.databases()).map(d => d.name).sort()); assert.ok(dbs.includes('playground-zero')); assert.ok(!dbs.includes('zerostudio-v1'), '単体動作で共通DBが作られた');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await env.close(); summary('bridge-smoke');
})();
