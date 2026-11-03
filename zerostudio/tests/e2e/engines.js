const { start, page, test, summary } = require('./lib'); const assert = require('assert'); const http = require('http'), fs = require('fs'), path = require('path');
const fr = (pg, n) => pg.frames().find(f => f.url().includes('/engines/' + n + '/'));
const list = (pg, q) => pg.evaluate(async (q) => (await ZS.app.svc.list(q || {})).projects, q);
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout waiting'); await new Promise(r => setTimeout(r, 120)); } };
async function openEngine(pg, env, name, q) { await pg.goto(env.base + '/#/' + name + (q || '')); await pg.waitForSelector('.zs-frame'); await waitFor(async () => { const f = fr(pg, name); return f && await f.evaluate(() => !!(window.ZSBridge && ZSBridge.ready)).catch(() => false); }, 15000); await pg.waitForTimeout(700); }
const PX = (c, c2) => { const f = new Array(256).fill(null); f[0] = c; f[17] = c2 || c; f[34] = c; return { version: 1, name: 'ハート', size: 16, frames: [f], palette: ['#ff0000', '#00ff00'], saved: [], transparent: true, bg: '#171a2b', fps: 4 }; };

(async () => {
  const env = await start(); console.log('# engine parity / isolation / shared library e2e');
  /* ---------------- Logic Studio: 既存機能 ---------------- */
  await test('L1. Logic: 元アプリのセルフテスト（CPU・Signal Analyzer・Machine Lab）が統合版でもすべて合格', async () => {
    const pg = await page(env); await openEngine(pg, env, 'logic'); const f = fr(pg, 'logic');
    await f.evaluate(() => ZSBridge.show('cpu-program')); await f.click('#ctest'); await pg.waitForTimeout(500);
    const logs = await f.locator('#log div').allTextContents(); const ok = logs.filter(l => /合格:/.test(l)), ng = logs.filter(l => /不合格/.test(l)); assert.ok(ok.length >= 5, 'CPU 合格数 ' + ok.length); assert.deepStrictEqual(ng, []);
    await f.click('.tab[data-tab="sa"]'); await f.click('#stest'); await pg.waitForTimeout(800); const t = await f.textContent('#toast'); assert.ok(/すべて合格|合格/.test(t) && !/不合格/.test(t), 'SA: ' + t);
    const m = await f.evaluate(() => { const r = MLAB.test(); return { n: r.length, ng: r.filter(x => !x[1]).map(x => x[0]) }; }); assert.ok(m.n >= 8 && m.ng.length === 0, JSON.stringify(m));
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('L2. Logic: 回路が実際にシミュレーションできる（スイッチ→NOT→ランプ）・CPU のアセンブル実行・JSON出力', async () => {
    const pg = await page(env); await openEngine(pg, env, 'logic'); const f = fr(pg, 'logic');
    await f.evaluate(() => ZSBridge.setCircuit('t', { v: 1, name: 't', nodes: [{ id: 1, t: 'sw', x: 60, y: 60, p: { on: 1 }, lb: '' }, { id: 2, t: 'not', x: 200, y: 60, p: {}, lb: '' }, { id: 3, t: 'lamp', x: 340, y: 60, p: { col: '#22d3ee' }, lb: '' }], wires: [{ id: 1, from: 1, fo: 0, to: 2, ti: 0 }, { id: 2, from: 2, fo: 0, to: 3, ti: 0 }] }));
    await f.click('#run'); await pg.waitForTimeout(600); assert.deepStrictEqual(await f.evaluate(() => S.nodes.map(n => n.o[0])), [1, 0, undefined]); assert.ok(/実行中/.test(await f.textContent('#info')));
    await f.evaluate(() => { S.nodes[0].p.on = 0; }); await pg.waitForTimeout(500); assert.deepStrictEqual(await f.evaluate(() => S.nodes.slice(0, 2).map(n => n.o[0])), [0, 1]); await f.click('#stop');
    await f.evaluate(() => ZSBridge.show('cpu-program')); await f.fill('#asm', 'LDI A, 6\nLDI B, 7\nADD A, B\nOUT A\nHLT'); await f.evaluate(() => $('#asm').oninput()); await f.click('#asmload'); await f.click('#crun'); await pg.waitForTimeout(800);
    assert.strictEqual((await f.locator('#cout').innerText()).trim(), 'OUT: 13', 'CPU が 6+7 を実行して OUT に 13 を出す'); assert.ok(/A\s+0D13/.test(await f.locator('#regs').innerText()), 'レジスタ A = 0x0D(13)'); assert.ok(/HLT/.test(await f.locator('#cstat').innerText() + await f.locator('#cout').innerText() + await f.locator('#cpu').innerText()));
    await f.evaluate(() => ZSBridge.show('circuit')); assert.ok(await f.locator('#exp').count() || await f.locator('#jexp, button:has-text("JSON出力")').count()); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  /* ---------------- Code Studio: 既存機能 ---------------- */
  await test('C1. Code: タブ・実行・コンソール・元の保存／My Projects・Pixel Lab のコード生成が動く', async () => {
    const pg = await page(env); await openEngine(pg, env, 'code'); const f = fr(pg, 'code');
    await f.click('.code-tab[data-lang="js"]'); await f.fill('#codeInput', 'console.log("統合テスト");document.body.insertAdjacentHTML("beforeend","<b id=ok>実行OK</b>")'); await f.click('#runBtn, [data-action="run"], button:has-text("実行する")'); await pg.waitForTimeout(900);
    assert.strictEqual(await f.frameLocator('#previewFrame').locator('#ok').textContent(), '実行OK'); assert.ok((await f.locator('#console, .console-output, #consoleOutput').first().innerText().catch(() => '')).includes('統合テスト') || (await f.locator('body').innerText()).includes('統合テスト'));
    await f.fill('#projectName', '元の保存テスト'); await f.click('#saveBtn'); await pg.waitForTimeout(400); assert.ok(await f.evaluate(() => (JSON.parse(localStorage.getItem('codelab.projects.v2') || '[]')).some(p => p.name === '元の保存テスト')), '元アプリの保存が機能する');
    await f.click('.nav-link[data-view="projects"]'); assert.ok((await f.locator('#projects').innerText()).includes('元の保存テスト')); await f.click('.nav-link[data-view="templates"]'); assert.ok((await f.locator('#templates').innerText()).length > 50);
    await f.evaluate(p => ZSBridge.setPixel('絵', p), PX('#ff0000', '#00ff00')); await f.selectOption('#pixelOutputType', { index: 0 }); const code = await f.textContent('#pixelGeneratedCode'); assert.ok(code.length > 20 && /#ff0000/i.test(code), 'ピクセルアートからコードが生成される');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('C2. Code: ドット絵→CSS の変換が、元の Pixel Lab の生成コードと一致する（共通ライブラリの変換の正しさ）', async () => {
    const pg = await page(env); await openEngine(pg, env, 'code'); const f = fr(pg, 'code'); const px = PX('#ff0000', '#00ff00');
    await f.evaluate(p => ZSBridge.setPixel('絵', p), px); const opts = await f.locator('#pixelOutputType option').allTextContents(); let css = null;
    for (let i = 0; i < opts.length; i++) { await f.selectOption('#pixelOutputType', { index: i }); const c = await f.textContent('#pixelGeneratedCode'); if (/box-shadow/i.test(c)) { css = c; break; } }
    assert.ok(css, 'CSS 出力が見つからない: ' + opts.join('/')); const mine = await pg.evaluate(p => ZS.convert.pixelToShadow(p, 0), px); const norm = s => s.replace(/\s+/g, '');
    const m = /box-shadow:([^;]+);/i.exec(css); assert.ok(m, css.slice(0, 200)); assert.strictEqual(norm(m[1]), norm(mine), '元アプリ: ' + m[1].slice(0, 80) + ' / 変換: ' + mine.slice(0, 80)); await pg.ctx.close();
  });
  /* ---------------- Zero Engine: 既存機能 ---------------- */
  await test('Z1. Zero: 主要な全画面が開け、Lab の描画が動き、作品を作ると共通プロジェクトに入る', async () => {
    const pg = await page(env); await openEngine(pg, env, 'zero'); const f = fr(pg, 'zero');
    const routes = ['/home', '/studio', '/create', '/remix', '/lab', '/discover', '/daily', '/space']; for (const r of routes) { await f.evaluate(r => { location.hash = '#' + r; }, r); await pg.waitForTimeout(500); assert.ok((await f.locator('#main').innerText()).length > 20, r + ' が空'); }
    await f.evaluate(() => { location.hash = '#/lab/flow'; }); await pg.waitForTimeout(1500); const colors = await f.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return s.size; });
    assert.ok(colors > 3, 'Lab の canvas が描画されている: 色数 ' + colors);
    const id = await f.evaluate(async () => { const p = await PZ.projects.create('UI作品'); return p.id; }); await f.evaluate(id => { location.hash = '#/studio/' + id; }, id); await pg.waitForTimeout(1200);
    assert.ok(await f.locator('canvas').count(), 'Studio の canvas'); assert.ok((await list(pg, { engine: 'zero' })).some(p => p.id === id)); assert.ok(/UI作品/.test(await pg.inputValue('.zs-bar input')), 'シェルのバーに作品名が出る');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('Z2. Zero: シェルの「開く」から共通プロジェクトの Zero 作品を開ける', async () => {
    const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
    const mk = async () => { await openEngine(pg, env, 'zero'); return fr(pg, 'zero').evaluate(async () => (await PZ.projects.create('開く対象')).id); }; const id = await mk();
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); await pg.locator('.zs-item', { hasText: '開く対象' }).locator('button:text-is("開く")').click(); await pg.waitForSelector('.zs-frame');
    await waitFor(async () => { const f = fr(pg, 'zero'); return f && (await f.evaluate(() => location.hash).catch(() => '')).includes(id); }, 12000); assert.ok(/開く対象/.test(await waitFor(async () => { const v = await pg.inputValue('.zs-bar input'); return v; }))); await pg.ctx.close();
  });
  /* ---------------- 分離（CSS / JavaScript の非衝突） ---------------- */
  await test('I1. JavaScript の非衝突: 各 iframe は独立したグローバルを持ち、シェルにも漏れない', async () => {
    const pg = await page(env); for (const n of ['code', 'logic', 'zero']) await openEngine(pg, env, n);
    const g = async (n) => fr(pg, n).evaluate(() => ({ PZ: typeof PZ, ZS: typeof ZS, S: typeof S, D: typeof D, MLAB: typeof MLAB })); // 各エンジンの固有グローバル
    const code = await (async () => { await openEngine(pg, env, 'code'); return g('code'); })(), logic = await (async () => { await openEngine(pg, env, 'logic'); return g('logic'); })(), zero = await (async () => { await openEngine(pg, env, 'zero'); return g('zero'); })();
    assert.deepStrictEqual(code, { PZ: 'undefined', ZS: 'undefined', S: 'undefined', D: 'undefined', MLAB: 'undefined' }); assert.strictEqual(logic.S, 'object'); assert.strictEqual(logic.MLAB, 'object'); assert.strictEqual(logic.PZ, 'undefined'); assert.strictEqual(logic.ZS, 'undefined');
    assert.strictEqual(zero.PZ, 'object'); assert.strictEqual(zero.S, 'undefined'); assert.strictEqual(zero.MLAB, 'undefined');
    const shell = await pg.evaluate(() => ({ PZ: typeof PZ, S: typeof S, D: typeof D, MLAB: typeof MLAB, state: typeof state })); assert.deepStrictEqual(shell, { PZ: 'undefined', S: 'undefined', D: 'undefined', MLAB: 'undefined', state: 'undefined' }); await pg.ctx.close();
  });
  await test('I2. CSS の非衝突: シェルの CSS はエンジン内に影響せず、エンジン単体は元の見た目のまま、統合時だけ共通テーマが載る', async () => {
    const sig = (fn) => fn.evaluate(() => { const q = ['body', 'header', 'button', 'textarea', 'h1', 'nav', 'a', 'select', 'input', '.panel', '.view', '.toast', '#toast'], out = {}; q.forEach(s => { const e = document.querySelector(s); if (e) { const c = getComputedStyle(e); out[s] = [c.backgroundColor, c.color, c.fontFamily, c.fontSize, c.display, c.borderRadius, c.padding].join('|'); } }); return out; });
    const pg = await page(env); const alone = await pg.ctx.newPage(); const ORIG_BG = { code: 'rgb(9, 11, 21)', logic: 'rgb(10, 17, 40)', zero: 'rgb(21, 23, 27)' };
    for (const n of ['code', 'logic', 'zero']) {
      await openEngine(pg, env, n); await pg.waitForTimeout(500); await alone.setViewportSize({ width: 1280, height: 800 });
      // (1) 単体表示（?zs=1 なし）は、共通テーマが載らず元の配色のまま
      await alone.goto(env.base + '/engines/' + n + '/index.html'); await alone.waitForTimeout(1000);
      assert.strictEqual(await alone.evaluate(() => getComputedStyle(document.body).backgroundColor), ORIG_BG[n], n + ' の単体表示が元の配色と違う');
      // (2) 統合時は共通テーマの背景（#0a1020）になる
      assert.strictEqual(await fr(pg, n).evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(10, 16, 32)', n + ' に共通テーマが適用されていない');
      // (3) 同じテーマを単体ページに手で足した状態と、統合時の見た目が一致 ＝ シェルの CSS が漏れていない
      await alone.goto(env.base + '/engines/' + n + '/index.html' + (n === 'zero' ? '?zs=1' : '')); await alone.waitForTimeout(800);
      await alone.evaluate(async (id) => { await Promise.all(['zs-tokens', 'zs-engine-' + id].map(x => new Promise(r => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../../css/' + x + '.css'; l.onload = l.onerror = r; document.head.appendChild(l); }))); }, n);
      await alone.waitForTimeout(500);
      const a = await sig(alone), e = await sig(fr(pg, n)); assert.ok(Object.keys(a).length >= 4, n + ' 比較対象が少ない'); assert.deepStrictEqual(e, a, n + ' にシェルの CSS が漏れている');
    }
    const shellBtn = await pg.evaluate(() => getComputedStyle(document.querySelector('.zs-btn') || document.body).fontFamily); assert.ok(/Hiragino|Yu Gothic|Noto|system-ui/.test(shellBtn)); await pg.ctx.close();
  });
  await test('I3. （元ソースが手元にある場合）元アプリを単体表示したときと、統合版内の見た目が一致する', async () => {
    const root = process.env.ORIGINALS; if (!root) { console.log('       skip: ORIGINALS 未指定'); return; }
    const dirs = { code: path.join(root, 'codelab/Code'), logic: path.join(root, 'logic'), zero: path.join(root, 'zero/playground-zero') }; const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
    const srv = http.createServer((q, s) => { const [, n, ...rest] = q.url.split('?')[0].split('/'); const d = dirs[n]; let f = path.join(d || '/nonexistent', rest.join('/') || 'index.html'); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const ob = 'http://127.0.0.1:' + srv.address().port;
    const sig = (fn) => fn.evaluate(() => { const q = ['body', 'header', 'button', 'textarea', 'h1', 'nav', 'a', 'select', 'input', '.panel', '.view'], out = {}; q.forEach(s => { const e = document.querySelector(s); if (e) { const c = getComputedStyle(e); out[s] = [c.backgroundColor, c.color, c.fontFamily, c.fontSize, c.display, c.borderRadius].join('|'); } }); return out; });
    const pg = await page(env); const orig = await pg.ctx.newPage(); await orig.setViewportSize({ width: 1280, height: 800 });
    for (const n of ['code', 'logic', 'zero']) { await openEngine(pg, env, n); await orig.goto(ob + '/' + n + '/'); await orig.waitForTimeout(1200); assert.deepStrictEqual(await sig(fr(pg, n)), await sig(orig), n); } srv.close(); await pg.ctx.close();
  });
  /* ---------------- 共通ライブラリ（素材・部品の登録／再利用／追跡／版） ---------------- */
  await test('B1. ドット絵を素材登録 → Web作品へ挿入（CSS／PNG）→ 使用追跡 → 更新で版が上がり「古い版を使用中」と分かる', async () => {
    const pg = await page(env); await openEngine(pg, env, 'code'); const f = fr(pg, 'code');
    await f.evaluate(p => ZSBridge.setPixel('ハート', p), PX('#ff0000')); await f.fill('#pixelName', 'ハート素材'); await waitFor(async () => (await list(pg, { workType: 'pixel' })).length === 1); await pg.waitForTimeout(900);
    await pg.click('.zs-bar button:text-is("素材として登録")'); const it = await waitFor(async () => (await pg.evaluate(async () => (await ZS.app.svc.libList()).items))[0]); assert.strictEqual(it.kind, 'pixel-art'); assert.strictEqual(it.version, 1); assert.ok(it.origin.projectId);
    await pg.goto(env.base + '/#/library'); await pg.waitForSelector('.zs-item'); assert.ok(/ハート素材/.test(await pg.locator('.zs-item').first().innerText())); assert.ok(/未使用/.test(await pg.locator('.zs-item').first().innerText()));
    await pg.locator('.zs-item').first().locator('button:has-text("使う")').click(); await pg.click('.zs-menu button:text-is("CSS（box-shadow）で挿入")'); await pg.waitForSelector('.zs-frame'); await waitFor(async () => { const f2 = fr(pg, 'code'); return f2 && await f2.evaluate(() => ZSBridge.getWeb().payload.css.includes('zs-asset:')).catch(() => false); }, 15000);
    const web = await waitFor(async () => (await list(pg, { workType: 'web' }))[0]); assert.deepStrictEqual(web.assets, [{ id: it.id, version: 1 }]); assert.ok(web.engineData.payload.html.includes('zs-px-') && web.engineData.payload.css.includes('box-shadow'));
    await pg.waitForTimeout(900); const f3 = fr(pg, 'code'); assert.strictEqual(await f3.frameLocator('#previewFrame').locator('div[class^="zs-px-"]').count(), 1);
    await pg.goto(env.base + '/#/library'); await pg.waitForSelector('.zs-item'); assert.ok(/1 件のプロジェクトで使用中/.test(await pg.locator('.zs-item').first().innerText()));
    await pg.locator('.zs-item').first().locator('button:has-text("使う")').click(); await pg.click('.zs-menu button:text-is("PNG 画像（img）で挿入")'); await waitFor(async () => { const f2 = fr(pg, 'code'); return f2 && await f2.evaluate(() => ZSBridge.getWeb().payload.html.includes('data:image/png')).catch(() => false); }, 15000); await pg.waitForTimeout(1200);
    const f4 = fr(pg, 'code'); assert.ok(await f4.frameLocator('#previewFrame').locator('img').evaluate(i => i.complete && i.naturalWidth > 0), 'PNG が表示される');
    // 素材を更新（v2）
    await f4.evaluate(() => ZSBridge.show('pixel')); await pg.waitForTimeout(900); await f4.evaluate(p => ZSBridge.setPixel('ハート素材', p), PX('#0000ff')); await f4.fill('#pixelName', 'ハート素材2'); await pg.waitForTimeout(1500);
    await pg.click('.zs-bar button:text-is("素材として登録")'); await pg.click('dialog button:has-text("に更新")'); const it2 = await waitFor(async () => { const x = (await pg.evaluate(async () => (await ZS.app.svc.libList()).items))[0]; return x.version === 2 && x; }); assert.strictEqual(it2.id, it.id);
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); const webTitle = (await list(pg, { workType: 'web' }))[0].title; await pg.locator('.zs-item', { hasText: webTitle }).locator('button[aria-haspopup=menu]').click();
    await pg.click('.zs-menu button:has-text("詳細")'); await pg.waitForSelector('dialog'); const txt = await pg.locator('dialog').innerText(); assert.ok(/ハート素材/.test(txt) && /最新は v2/.test(txt), txt.slice(-400)); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('B2. Logic の回路をテンプレート登録 → 新規プロジェクトとして再利用（由来が自動保存後も残る）', async () => {
    const pg = await page(env); await openEngine(pg, env, 'logic'); const f = fr(pg, 'logic');
    await f.evaluate(() => ZSBridge.setCircuit('部品', { v: 1, name: '部品', nodes: [{ id: 1, t: 'sw', x: 60, y: 60, p: { on: 1 }, lb: '' }], wires: [] })); await f.fill('#pname', 'テンプレ回路'); await f.press('#pname', 'Enter'); await waitFor(async () => (await list(pg, { workType: 'circuit' })).length === 1); await pg.waitForTimeout(900);
    await pg.click('.zs-bar button:text-is("テンプレートとして登録")'); await waitFor(async () => (await pg.evaluate(async () => (await ZS.app.svc.libList()).items)).length === 1);
    await pg.goto(env.base + '/#/library'); await pg.waitForSelector('.zs-item'); await pg.locator('.zs-item').first().locator('button:has-text("使う")').click(); await pg.click('.zs-menu button:has-text("Logic Studio で新規プロジェクト")'); await pg.waitForSelector('.zs-frame'); await pg.waitForTimeout(1500);
    const f2 = fr(pg, 'logic'); await waitFor(async () => f2.evaluate(() => ZSBridge.ready).catch(() => false)); await f2.fill('#pname', 'テンプレ回路 改'); await f2.press('#pname', 'Enter'); await pg.waitForTimeout(1500);
    const all = await list(pg, { workType: 'circuit' }); assert.strictEqual(all.length, 2); const child = all.find(p => p.title === 'テンプレ回路 改' || p.dependencies.some(d => d.type === 'library')); assert.ok(child.dependencies.some(d => d.type === 'library' && d.version === 1), '素材由来が残る');
    assert.strictEqual(await pg.evaluate(async () => { const it = (await ZS.app.svc.libList()).items[0]; return (await ZS.app.svc.libUsage(it.id)).length; }), 1); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await test('B3. 画像の追加・不正な画像の拒否、素材のJSON往復', async () => {
    const pg = await page(env); await pg.goto(env.base + '/#/library'); await pg.waitForSelector('.zs-page');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await pg.setInputFiles('input[type=file][accept^="image"]', { name: 'dot.png', mimeType: 'image/png', buffer: png }); await waitFor(async () => (await pg.evaluate(async () => (await ZS.app.svc.libList()).items)).length === 1);
    await pg.setInputFiles('input[type=file][accept^="image"]', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>') }); await pg.waitForTimeout(500); assert.strictEqual((await pg.evaluate(async () => (await ZS.app.svc.libList()).items)).length, 1, 'SVG は受け付けない');
    await pg.setInputFiles('input[type=file][accept^="image"]', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') }); await pg.waitForTimeout(500); const items = await pg.evaluate(async () => (await ZS.app.svc.libList()).items);
    assert.ok(items.every(i => /^data:image\/png;base64,/.test(i.data.dataUrl))); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });
  await env.close(); summary('engines');
})();
