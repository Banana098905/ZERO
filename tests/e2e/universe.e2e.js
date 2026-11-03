// 実ブラウザ（Chromium + Playwright）での Universe の検証。`node tests/e2e/universe.e2e.js` / `node tests.js --e2e`
// WebGL は SwiftShader（ソフトウェア描画）。Playwright / Chromium が無い環境では「SKIPPED」と表示して終了コード0（= 検証していない）。
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
let pw; for (const m of ['playwright', process.env.PLAYWRIGHT_PATH, '/home/claude/.npm-global/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) { if (!m) continue; try { pw = require(m); break; } catch (e) {} }
let sharp; try { sharp = require('sharp'); } catch (e) { try { sharp = require('/home/claude/.npm-global/lib/node_modules/sharp'); } catch (e2) {} }
if (!pw) { console.log('SKIPPED: Playwright が見つかりません（E2E は未検証）'); process.exit(0); }
const { serve } = require('./server');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const logs = [];
async function t(name, fn) { try { await fn(); results.push([name, true]); console.log('  ok   ' + name); } catch (e) { results.push([name, false]); console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 5).join('\n       ')); } }

/* ---- ページに仕込む計測（rAF の生存数・window/document のリスナー・WebGL コンテキスト）。アプリのコードは一切変えない ---- */
const INSTRUMENT = `(() => {
  const T = window.__t = { raf: new Set(), listeners: new Map(), ctx: [], errors: [] };
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => { const id = raf(t => { T.raf.delete(id); cb(t); }); T.raf.add(id); return id; };
  window.cancelAnimationFrame = id => { T.raf.delete(id); caf(id); };
  const ids = new WeakMap(); let n = 0; const idOf = f => ids.get(f) || (ids.set(f, ++n), n);
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const tn = t => t === window ? 'window' : t === document ? 'document' : null, key = (t, type, fn, o) => tn(t) + ':' + type + ':' + idOf(fn) + ':' + (typeof o === 'object' && o ? !!o.capture : !!o);
  EventTarget.prototype.addEventListener = function (type, fn, o) { if (tn(this) && fn) T.listeners.set(key(this, type, fn, o), 1); return add.call(this, type, fn, o); };
  EventTarget.prototype.removeEventListener = function (type, fn, o) { if (tn(this) && fn) T.listeners.delete(key(this, type, fn, o)); return rem.call(this, type, fn, o); };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) { const g = gc.apply(this, arguments); if (g && /webgl/.test(type)) T.ctx.push(g); return g; };
  window.addEventListener('error', e => T.errors.push(String(e.message)));
  let _v; Object.defineProperty(window, 'ZeroUniverse', { configurable: true, get() { return _v; }, set(v) { const m = v.mount; v.mount = function () { const c = m.apply(this, arguments); window.__uv = c; return c; }; _v = v; } });
})();`;
const FAILS = {
  nogl: `HTMLCanvasElement.prototype.getContext = function () { return null; };`,
  shader: `{ const o = WebGLRenderingContext.prototype.getShaderParameter; WebGLRenderingContext.prototype.getShaderParameter = function (s, p) { return p === this.COMPILE_STATUS ? false : o.call(this, s, p); }; }`,
  draw: `WebGLRenderingContext.prototype.drawArrays = function () { throw new Error('boom'); };`,
  lowend: `Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }); Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });`,
  highend: `Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 16 }); Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });`
};

async function brightPixels(buf) { const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }); let n = 0; for (let i = 0; i < data.length; i += info.channels) if (Math.max(data[i], data[i + 1], data[i + 2]) > 140) n++; return n; }

/* ---- Supabase モック（実Supabaseではない）: 作品40件・作者4人・パッケージ（SHA-256 付き） ---- */
function makeMock() {
  const authors = [['u1', 'alice'], ['u2', 'bob'], ['u3', 'carol'], ['u4', 'dave']], lic = ['CC-BY-4.0', 'MIT', 'all-rights-reserved', 'CC-BY-SA-4.0', 'CC0-1.0'], works = [], pk = {};
  const sha = x => crypto.createHash('sha256').update(x).digest('hex');
  function pkg(id, title, license) { const project = { id: 'zr_' + id, engine: 'code', workType: 'web', title, description: '', tags: [], license: { id: license }, visibility: 'export-ready', projectVersion: 1, engineData: { payload: { html: '<h1>' + title + '</h1>', css: '', js: '' } } }; const h = sha(JSON.stringify({ project, library: [] }));
    return { hash: h, pkg: { app: 'zerostudio', format: 'zerostudio.publish', formatVersion: 1, exportedAt: '2026-01-01T00:00:00Z', online: true, integrity: { algorithm: 'SHA-256', hash: h, of: 'JSON.stringify({project, library})' }, project, library: [] } }; }
  for (let i = 0; i < 40; i++) { const a = authors[i % 4], id = 'w' + String(i).padStart(2, '0'), l = lic[i % 5], p = pkg(id, 'Work ' + i, l);
    works.push({ id, title: 'Work ' + i, description: 'mock', engine: 'code', work_type: i % 2 ? 'pixel' : 'web', tags: ['t' + (i % 3)], license: l, visibility: 'public', version: 1, thumb: null, likes: i % 7, comments: 0, remixes: 0, created_at: '2026-01-' + String(1 + i % 28).padStart(2, '0') + 'T00:00:00Z', derived_from: i > 5 && i % 3 === 0 ? 'w' + String(i - 4).padStart(2, '0') : null, derived_version: null, author_id: a[0], author: { username: a[1], display_name: a[1] }, sha256: p.hash, payload_path: a[0] + '/' + id + '.json', hidden: false }); pk[id] = p.pkg; }
  return { authors, works, pk, pkg, sha, byId: id => works.find(w => w.id === id) };
}
async function setupReal(browser, mock, o) {
  o = o || {}; const ctx = await browser.newContext(Object.assign({ viewport: { width: 1100, height: 700 } }, o.ctx)); await ctx.addInitScript(INSTRUMENT);
  if (o.session) await ctx.addInitScript('try { localStorage.setItem("zero.s", ' + JSON.stringify(JSON.stringify({ access_token: 't', refresh_token: 'r', user: { id: o.session } })) + '); } catch (e) {}');
  const state = { req: [], getWork: {}, tamper: {}, delay: o.delay || 0 }; mock.state = state;
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.ZERO_CONFIG={supabaseUrl:"https://mock.supabase.co",supabaseKey:"anon-key",studioOrigins:[]};' }));
  await ctx.route('https://mock.supabase.co/**', async r => {
    const q = r.request(), u = new URL(q.url()), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    state.req.push(q.method() + ' ' + u.pathname + u.search.slice(0, 80));
    const json = (b, s) => r.fulfill({ status: s || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/rest/v1/works' && u.search.includes('limit=500')) { if (state.delay) await sleep(state.delay); return json(mock.works); }
    if (u.pathname === '/rest/v1/rpc/get_work') { const id = JSON.parse(q.postData()).p_id; if (state.getWork[id] !== undefined) return json(state.getWork[id] ? [state.getWork[id]] : []); const w = mock.byId(id); return json(w ? [w] : []); }
    if (u.pathname.startsWith('/storage/v1/object/authenticated/works/')) { const id = decodeURIComponent(u.pathname.split('/').pop()).replace('.json', ''); const p = state.tamper[id] || mock.pk[id]; return p ? r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(p) }) : r.fulfill({ status: 404, headers: cors, body: '{}' }); }
    return json([]);
  });
  const page = await ctx.newPage(); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push('console.error ' + m.text()); });
  return { ctx, page, state };
}
const uvInfo = page => page.evaluate(() => window.__uv && window.__uv.info());
// Playwright の waitForFunction は window にリスナーや rAF を足すため、計測に影響しない自前のポーリングを使う
async function until(page, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { if (await page.evaluate(fn, arg).catch(() => false)) return; await sleep(30); } throw new Error('timeout: ' + String(fn).slice(0, 80)); }
const waitUv = (page, extra) => until(page, () => window.__uv && window.__uv.info().gl && !window.__uv.info().destroyed, null, 15000).then(() => sleep(extra || 300));
const waitLive = (page, extra) => until(page, () => window.__uv && window.__uv.info().gl && !window.__uv.info().sample && !window.__uv.info().destroyed, null, 15000).then(() => sleep(extra || 300));

(async () => {
  const srv = await serve(ROOT), base = srv.url, browser = await pw.chromium.launch({ args: ARGS });
  async function plain(o) { const ctx = await browser.newContext(Object.assign({ viewport: { width: 1100, height: 700 } }, o && o.ctx)); await ctx.addInitScript(INSTRUMENT); if (o && o.init) await ctx.addInitScript(o.init); const page = await ctx.newPage(); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !(o && o.expectErrors)) logs.push('console.error ' + m.text()); }); return { ctx, page }; }

  /* ===== 1. WebGL シェーダーの検証（実ブラウザの GLSL コンパイラで、本番と同じソースをコンパイル・描画） ===== */
  await t('WebGL: 本番のシェーダー4本がコンパイル・リンクでき、縁のなめらかさが 1-smoothstep(.8,1,d) の値になる（中心は不透明・d>1 は破棄）', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/universe.js'), 'utf8'), grab = n => src.match(new RegExp("var " + n + " = '([^']*)'"))[1];
    const { ctx, page } = await plain(); await page.goto('about:blank');
    const run = async (fs1) => page.evaluate(({ VS1, FS1, VS2, FS2 }) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const gl = c.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false }); const out = { logs: [] };
      function prog(v, f) { const p = gl.createProgram(); [[gl.VERTEX_SHADER, v], [gl.FRAGMENT_SHADER, f]].forEach(([t, s]) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('compile: ' + gl.getShaderInfoLog(o)); gl.attachShader(p, o); }); gl.bindAttribLocation(p, 0, 'p'); gl.bindAttribLocation(p, 1, 'c'); gl.bindAttribLocation(p, 2, 's'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); return p; }
      prog(VS2, FS2); const P = prog(VS1, FS1); gl.useProgram(P);
      const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); gl.uniformMatrix4fv(gl.getUniformLocation(P, 'm'), false, I); gl.uniform1f(gl.getUniformLocation(P, 'k'), 1); gl.uniform1f(gl.getUniformLocation(P, 'mp'), 64);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 1, 1, 1, 40, 0]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28); [0, 1, 2].forEach(i => gl.enableVertexAttribArray(i));
      gl.viewport(0, 0, 64, 64); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.POINTS, 0, 1); out.err = gl.getError();
      const px = new Uint8Array(4 * 64); gl.readPixels(0, 32, 64, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.row = Array.from({ length: 64 }, (_, i) => px[i * 4 + 3] / 255); return out; },
      { VS1: grab('VS1'), FS1: fs1, VS2: grab('VS2'), FS2: grab('FS2') });
    const fixed = await run(grab('FS1')); assert.strictEqual(fixed.err, 0, 'GL エラーなし');
    const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    let maxErr = 0, inner = 0, outer = 0; for (let x = 32; x < 64; x++) { const d = (x + .5 - 32) / 20, a = fixed.row[x]; if (d < .74) { inner++; assert.ok(a > .97, `中心付近は不透明 d=${d.toFixed(2)} a=${a}`); } else if (d <= .98) maxErr = Math.max(maxErr, Math.abs(a - Math.max(1 - ss(.8, 1, d), .14 * (1 - d)))); if (d > 1.04) { outer++; assert.strictEqual(a, 0, '半径の外は破棄 d=' + d.toFixed(2)); } }
    assert.ok(inner > 10 && outer > 5); assert.ok(maxErr < .08, '縁の値が式と一致 maxErr=' + maxErr.toFixed(3));
    const mid = fixed.row[32 + 18]; assert.ok(mid > .25 && mid < .75, '縁の中間(d≈.9)は半透明 ' + mid);
    const old = await run(grab('FS1').replace('1.-smoothstep(.8,1.,d)', 'smoothstep(1.,.8,d)')); logs.push('INFO 旧式 smoothstep(1.,.8,d) の縁の値(d=.9付近): ' + old.row[32 + 18].toFixed(3) + ' / 新式: ' + mid.toFixed(3) + '（旧式は GLSL 仕様上 未定義で、実装により結果が変わる）');
    await ctx.close(); });

  /* ===== 2. サンプル Universe（Supabase 未設定）: 導線・区別・描画 ===== */
  await t('導線: ナビに Universe があり、Supabase 未設定でも開ける（#/universe → サンプルへ）。実作品と明確に区別され、WebGL が描画される', async () => {
    const { ctx, page } = await plain(); await page.goto(base); await sleep(300);
    assert.ok(await page.locator('nav a[href="#/universe"]').count() === 1, 'ナビに Universe');
    await page.locator('nav a[href="#/universe"]').click(); await waitUv(page, 1200); assert.strictEqual(await page.evaluate(() => location.hash), '#/universe/sample');
    const i = await uvInfo(page); assert.ok(i.gl && !i.fallback && i.sample && i.n === 90, JSON.stringify(i));
    assert.ok(await page.locator('.uv.uv-is-sample').count() === 1); assert.ok((await page.locator('.uv-bar').innerText()).includes('SAMPLE DATA')); assert.ok((await page.locator('.uv-bar').innerText()).includes('Supabase 未設定'));
    assert.ok(/\bon\b/.test(await page.locator('nav a[href="#/universe"]').getAttribute('class')) && await page.locator('nav a[href="#/universe"]').getAttribute('aria-current') === 'page');
    const shot = await page.locator('canvas.uv-cv').screenshot(); fs.writeFileSync('/tmp/e2e-sample.png', await page.screenshot());
    if (sharp) { const n = await brightPixels(shot); assert.ok(n > 1500, '描画されたノードのピクセル数 ' + n); }
    const mm = await page.locator('canvas.uv-mini').evaluate(c => [c.width, c.height]); assert.deepStrictEqual(mm, [110, 110], 'ミニマップのサイズ');
    await page.locator('.uv-bar').getByRole('button', { name: 'Universe', exact: true }).click(); await ctx.close(); });
  await t('導線: 通常ナビの Universe はセットアップ画面にならず、セットアップ画面からもサンプルへ行ける', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/'); await sleep(300); assert.ok((await page.locator('main').innerText()).includes('セットアップが必要です'));
    await page.locator('main a[href="#/universe/sample"]').click(); await waitUv(page); assert.ok((await uvInfo(page)).sample); await ctx.close(); });

  /* ===== 3. Creator Space（サンプル） ===== */
  await t('Creator Space: 作者未選択なら案内と作者選択UIを表示し、選ぶとその作者の作品だけが表示される。変更・戻るも動く', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/universe/sample'); await waitUv(page);
    await page.getByRole('button', { name: 'Creator Space' }).click(); await sleep(300);
    const pick = page.locator('.uv-pick'); assert.ok(await pick.isVisible()); const txt = await pick.innerText(); assert.ok(txt.includes('作者を選んでください') && txt.includes('作品だけが'), txt); assert.strictEqual(await pick.locator('.uv-pick-list button').count(), 4);
    let i = await uvInfo(page); assert.strictEqual(i.mode, 'creator'); assert.strictEqual(i.author, null); assert.strictEqual(i.shown, 0, '未選択時は背景として薄く（主表示なし）');
    await pick.locator('.uv-pick-list button').first().click(); await sleep(500); i = await uvInfo(page); assert.ok(i.author); assert.ok(!(await pick.isVisible())); assert.ok(i.shown >= 22 && i.shown <= 23, '90作品/4作者 → ' + i.shown);
    const bar = await page.locator('.uv-creator').innerText(); assert.ok(/Creator: @sample_[a-d]/.test(bar), bar); fs.writeFileSync('/tmp/e2e-creator.png', await page.screenshot());
    if (sharp) assert.ok(await brightPixels(await page.locator('canvas.uv-cv').screenshot()) > 300);
    await page.getByRole('button', { name: '作者を変更' }).click(); await sleep(300); assert.ok(await pick.isVisible()); assert.strictEqual((await uvInfo(page)).author, null);
    await pick.locator('.uv-pick-list button').nth(2).click(); await sleep(400); assert.ok((await uvInfo(page)).shown >= 22);
    await page.getByRole('button', { name: 'Related Works' }).click(); await sleep(200); assert.strictEqual((await uvInfo(page)).author, null); assert.ok(!(await pick.isVisible()));
    await page.getByRole('button', { name: 'Creator Space' }).click(); await sleep(200); assert.ok(await pick.isVisible()); await pick.getByRole('button', { name: 'Universe に戻る' }).click(); await sleep(200); assert.strictEqual((await uvInfo(page)).mode, 'universe'); assert.ok(!(await pick.isVisible()));
    await ctx.close(); });
  await t('Creator Space: 作品を選んだ状態で入ると、その作者が自動で選ばれる', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/universe/sample'); await waitUv(page); await page.evaluate(() => window.__uv.select(5, true)); await sleep(200);
    await page.getByRole('button', { name: 'Creator Space' }).click(); await sleep(400); const i = await uvInfo(page); assert.strictEqual(i.author, 'sa1'); assert.ok(i.shown >= 22); assert.ok(!(await page.locator('.uv-pick').isVisible())); await ctx.close(); });

  /* ===== 4. ライフサイクル ===== */
  await t('ライフサイクル: Universe を30回開閉しても rAF・window/document リスナー・WebGL コンテキストが増えない（閉じれば0）', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/'); await sleep(300);
    const snap = () => page.evaluate(() => ({ raf: window.__t.raf.size, lis: window.__t.listeners.size, ctx: window.__t.ctx.length, live: window.__t.ctx.filter(g => !g.isContextLost()).length }));
    const base0 = await snap(), seen = [];
    for (let k = 0; k < 30; k++) {
      await page.evaluate(() => { location.hash = '#/universe/sample'; }); await until(page, () => window.__uv && window.__uv.info().gl && !window.__uv.info().destroyed); await sleep(40);
      const open = await snap(); seen.push(open); assert.ok(open.live === 1, `開いている間の有効コンテキストは1つ (${k}) ${JSON.stringify(open)}`); assert.ok(open.raf <= 2, 'rAF が重複していない ' + open.raf);
      await page.evaluate(() => { location.hash = '#/'; }); await until(page, () => window.__uv.info().destroyed); await sleep(20);
      const closed = await snap(); assert.strictEqual(closed.raf, 0, `閉じたら rAF は0 (${k}) ${JSON.stringify(closed)}`); assert.strictEqual(closed.lis, base0.lis, `リスナーが増えていない (${k}) ${closed.lis} vs ${base0.lis}`); assert.strictEqual(closed.live, 0, `閉じたらコンテキストは解放 (${k})`); }
    const last = await snap(); assert.ok(last.ctx >= 30, '30回分のコンテキストを作って全て解放: ' + last.ctx); assert.ok(seen.every(s => s.lis === seen[0].lis), '開いている間のリスナー数が毎回同じ');
    await page.evaluate(() => { const c = window.__uv; c.destroy(); c.destroy(); }); await ctx.close(); });
  await t('ライフサイクル: 開閉を連打（待たずに切り替え）しても最終状態が正しく、重複しない', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/'); await sleep(200);
    await page.evaluate(async () => { for (let k = 0; k < 25; k++) { location.hash = k % 2 ? '#/' : '#/universe/sample'; await new Promise(r => setTimeout(r, 0)); } location.hash = '#/universe/sample'; await new Promise(r => setTimeout(r, 400)); });
    const s = await page.evaluate(() => ({ cv: document.querySelectorAll('canvas.uv-cv').length, raf: window.__t.raf.size, live: window.__t.ctx.filter(g => !g.isContextLost()).length, lis: window.__t.listeners.size }));
    assert.strictEqual(s.cv, 1); assert.ok(s.raf <= 2, 'raf ' + s.raf); assert.strictEqual(s.live, 1); await ctx.close(); });
  await t('ライフサイクル: タブが非表示の間はループが止まり、戻ると再開する', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/universe/sample'); await waitUv(page); assert.ok((await uvInfo(page)).running);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(150); assert.ok(!(await uvInfo(page)).running); assert.strictEqual(await page.evaluate(() => window.__t.raf.size), 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(200); assert.ok((await uvInfo(page)).running); await ctx.close(); });
  await t('ライフサイクル: WebGL コンテキストを失っても復旧する（lose → restore）', async () => {
    const { ctx, page } = await plain(); await page.goto(base + '#/universe/sample'); await waitUv(page, 600);
    await page.evaluate(() => { const g = window.__t.ctx[0]; window.__lc = g.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); }); await sleep(300); assert.ok(!(await uvInfo(page)).running, '喪失中は停止');
    await page.evaluate(() => window.__lc.restoreContext()); await sleep(900); const i = await uvInfo(page); assert.ok(i.gl && !i.fallback && i.running, JSON.stringify(i));
    if (sharp) assert.ok(await brightPixels(await page.locator('canvas.uv-cv').screenshot()) > 1000, '復旧後に再描画'); await ctx.close(); });

  /* ===== 5. WebGL 失敗 → 2D ギャラリー ===== */
  for (const [k, label, msg] of [['nogl', 'WebGL が使えない', 'WebGL を利用できません'], ['shader', 'シェーダーのコンパイルが失敗する', 'シェーダーのコンパイル'], ['draw', '描画中に例外が出る', '3D描画中にエラー']]) {
    await t(`フォールバック: ${label} → 2Dギャラリー（90作品・SAMPLE表示・検索可）。ループ・コンテキストは残らない`, async () => {
      const { ctx, page } = await plain({ init: FAILS[k], expectErrors: true }); await page.goto(base + '#/universe/sample'); await page.waitForSelector('.uv-2d', { timeout: 8000 }); await sleep(300);
      const txt = await page.locator('.uv-2d').innerText(); assert.ok(txt.includes(msg) && txt.includes('2Dギャラリー') && txt.includes('SAMPLE'), txt.slice(0, 200)); assert.strictEqual(await page.locator('.uv-2d .card').count(), 90); assert.strictEqual(await page.locator('canvas.uv-cv').count(), 0);
      await page.locator('.uv-2d input').fill('Circuit'); assert.strictEqual(await page.locator('.uv-2d .card').count(), 15);
      assert.strictEqual(await page.evaluate(() => window.__t.raf.size), 0); assert.strictEqual(await page.evaluate(() => window.__t.ctx.filter(g => !g.isContextLost()).length), 0); const i = await uvInfo(page); assert.ok(i.fallback && i.destroyed);
      if (k === 'shader') fs.writeFileSync('/tmp/e2e-fallback.png', await page.screenshot()); await ctx.close(); }); }

  /* ===== 6. モバイル・低性能 ===== */
  await t('モバイル(390×844・タッチ・DPR3): タップで選択、ドラッグで回転、ピンチでズーム、パネルは下部シート', async () => {
    const { ctx, page } = await plain({ ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, init: FAILS.highend }); await page.goto(base + '#/universe/sample'); await waitUv(page, 800);
    const cdp = await ctx.newCDPSession(page), box = await page.locator('canvas.uv-cv').boundingBox(); assert.ok(box.width <= 390 && box.height > 600);
    assert.ok((await uvInfo(page)).dpr <= 1.5, 'モバイルは DPR を抑える: ' + (await uvInfo(page)).dpr);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    // 選択: 画面の下半分（ツールバーと重ならない）にあるノードをタップ
    const cand = await page.evaluate(({ h }) => { for (let i = 0; i < 90; i++) { const p = window.__uv.screenPos(i); if (p && p.x > 30 && p.x < 360 && p.y > 330 && p.y < h - 150) return { i, p }; } return null; }, { h: 844 - 56 });
    assert.ok(cand, 'タップできるノードがある'); await page.touchscreen.tap(box.x + cand.p.x, box.y + cand.p.y); await sleep(500);
    assert.ok((await uvInfo(page)).sel >= 0, 'タップで選択 ' + JSON.stringify(cand)); const pb = await page.locator('.uv-panel').boundingBox(); assert.ok(pb && pb.y > 300 && pb.width >= 380, '下部シート ' + JSON.stringify(pb));
    await page.locator('.uv-x').tap(); await sleep(300); assert.strictEqual((await uvInfo(page)).sel, -1);
    // ドラッグ（1本指）で回転 → ノードの画面位置が変わる
    const p0 = await page.evaluate(() => window.__uv.screenPos(3)); await touch('touchStart', [[200, 500]]); for (let k = 1; k <= 8; k++) await touch('touchMove', [[200 + k * 12, 500]]); await touch('touchEnd', []); await sleep(300);
    const p1 = await page.evaluate(() => window.__uv.screenPos(3)); assert.ok(Math.hypot(p1.x - p0.x, p1.y - p0.y) > 10, 'ドラッグで回転');
    // ピンチアウト → 近づく（距離が減る）
    const d0 = (await uvInfo(page)).dist; await touch('touchStart', [[170, 500], [220, 500]]); for (let k = 1; k <= 8; k++) await touch('touchMove', [[170 - k * 10, 500], [220 + k * 10, 500]]); await touch('touchEnd', []); await sleep(300);
    const d1 = (await uvInfo(page)).dist; assert.ok(d1 < d0 - 3, `ピンチで拡大 ${d0}→${d1}`);
    const sel = (await uvInfo(page)).sel; assert.strictEqual(sel, -1, 'ピンチ後に誤選択しない'); fs.writeFileSync('/tmp/e2e-mobile.png', await page.screenshot()); await ctx.close(); });
  await t('モバイル: 狭い画面でも作者選択UIが画面内に収まり、操作できる', async () => {
    const { ctx, page } = await plain({ ctx: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } }); await page.goto(base + '#/universe/sample'); await waitUv(page);
    await page.getByRole('button', { name: 'Creator Space' }).tap(); await sleep(400); const b = await page.locator('.uv-pick').boundingBox(); assert.ok(b.x >= 0 && b.x + b.width <= 360 && b.y >= 0 && b.y + b.height <= 640, JSON.stringify(b)); assert.strictEqual(await page.locator('.uv').evaluate(e => e.scrollLeft), 0, '横にずれない'); const mr = await page.locator('.uv-modes').evaluate(e => ({ w: e.getBoundingClientRect().width, sw: e.scrollWidth })); assert.ok(mr.w <= 360, 'モード行は画面幅に収まり（はみ出す分は行内でスクロール） ' + JSON.stringify(mr));
    await page.locator('.uv-pick-list button').first().tap(); await sleep(400); assert.ok((await uvInfo(page)).shown >= 22); fs.writeFileSync('/tmp/e2e-mobile-creator.png', await page.screenshot()); await ctx.close(); });
  await t('高DPI: ノードの大きさが DPR に依存しない（旧版は DPR を二重に掛けていた）', async () => {
    if (!sharp) return; const counts = [];
    for (const dsf of [1, 2]) { const { ctx, page } = await plain({ ctx: { viewport: { width: 800, height: 600 }, deviceScaleFactor: dsf, reducedMotion: 'reduce' }, init: FAILS.highend }); await page.goto(base + '#/universe/sample'); await waitUv(page, 1200);
      assert.strictEqual((await uvInfo(page)).dpr, dsf); counts.push(await brightPixels(await page.locator('canvas.uv-cv').screenshot({ scale: 'css' }))); await ctx.close(); }
    const r = counts[1] / counts[0]; logs.push('INFO 高DPI 明部ピクセル数 dsf1=' + counts[0] + ' dsf2(css換算)=' + counts[1] + ' 比=' + r.toFixed(2)); assert.ok(r > .7 && r < 1.4, '比 ' + r.toFixed(2)); });
  await t('低性能端末（CPU 4倍遅延・コア2/メモリ2GB）: 軽量モードで動き、操作が通り、自動でさらに軽量化できる', async () => {
    const { ctx, page } = await plain({ init: FAILS.lowend }); const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await page.goto(base + '#/universe/sample'); await waitUv(page, 500);
    let i = await uvInfo(page); assert.ok(i.level >= 1 && i.dpr <= 1, '低性能端末は最初から軽量: ' + JSON.stringify(i)); await page.evaluate(() => window.__uv.select(7, true)); await sleep(300); assert.strictEqual((await uvInfo(page)).sel, 7);
    await page.mouse.move(400, 400); await page.mouse.down(); for (let k = 0; k < 20; k++) { await page.mouse.move(400 + k * 8, 400 + k * 3); } await page.mouse.up(); await sleep(8000); i = await uvInfo(page); logs.push('INFO 低性能: level=' + i.level + ' running=' + i.running); assert.ok(i.running && !i.fallback && i.gl && i.level >= 1);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await ctx.close(); });

  /* ===== 7. 実作品 Universe（Supabase はモック） ===== */
  const mock = makeMock();
  await t('実作品(モック): LIVE 表示・サンプルと区別、40作品を表示、サンプルへのリンクがあり、サンプル側から実作品へ戻れる', async () => {
    const { ctx, page } = await setupReal(browser, mock); await page.goto(base); await sleep(300); await page.locator('nav a[href="#/universe"]').click(); await waitUv(page, 800);
    const i = await uvInfo(page); assert.ok(!i.sample && i.n === 40 && i.gl, JSON.stringify(i)); assert.strictEqual(await page.locator('.uv.uv-is-sample').count(), 0); const bar = await page.locator('.uv-bar').innerText(); assert.ok(bar.includes('LIVE') && !bar.includes('SAMPLE DATA') && bar.includes('サンプルを見る'), bar);
    await page.getByRole('link', { name: 'サンプルを見る' }).click(); await until(page, () => window.__uv.info().sample && window.__uv.info().gl); await sleep(300); assert.ok((await uvInfo(page)).sample); assert.ok((await page.locator('.uv-bar').innerText()).includes('SAMPLE DATA')); assert.ok(!(await page.locator('.uv-bar').innerText()).includes('Supabase 未設定'), '設定済みなら未設定の注記は出さない');
    await page.getByRole('link', { name: '実作品のUniverseへ' }).click(); await waitLive(page); assert.ok(!(await uvInfo(page)).sample); await ctx.close(); });
  await t('Creator Space(実作品): 作者4人から選ぶと、その作者の10作品だけが表示される', async () => {
    const { ctx, page } = await setupReal(browser, mock); await page.goto(base + '#/universe'); await waitUv(page); await page.getByRole('button', { name: 'Creator Space' }).click(); await sleep(300);
    const items = await page.locator('.uv-pick-list button').allInnerTexts(); assert.strictEqual(items.length, 4); assert.ok(items.every(x => /@\w+ · 10 作品/.test(x)), items.join('|'));
    await page.locator('.uv-pick-list button', { hasText: '@carol' }).click(); await sleep(500); const i = await uvInfo(page); assert.strictEqual(i.author, 'u3'); assert.strictEqual(i.shown, 10); assert.ok((await page.locator('.uv-creator').innerText()).includes('@carol')); await ctx.close(); });

  const openPanel = async (page, id) => { await page.evaluate(id => { const c = window.__uv; for (let i = 0; i < 40; i++) { c.select(i, true); } }, id); };
  const selectWork = async (page, idx) => { await page.evaluate(i => window.__uv.select(i, true), idx); await sleep(250); };
  await t('Remix(Universe): 許可ライセンスの作品は、最新情報の再取得→ライセンス検証→SHA-256検証→公開画面へ。保持データは元作品のパッケージ', async () => {
    const { ctx, page, state } = await setupReal(browser, mock, { session: 'u2' }); await page.goto(base + '#/universe'); await waitUv(page); await selectWork(page, 0);   // w00: alice / CC-BY-4.0
    const btn = page.locator('.uv-panel button', { hasText: '⑂ Remix' }); assert.ok(await btn.isEnabled()); state.req.length = 0; await btn.click(); await until(page, () => location.hash === '#/publish'); await sleep(500);
    const order = state.req.filter(r => /get_work|storage/.test(r)).map(r => r.includes('get_work') ? 'get_work' : 'storage'); assert.deepStrictEqual(order, ['get_work', 'storage'], state.req.join(' | '));
    const main = await page.locator('main').innerText(); assert.ok(main.includes('Remix して公開') && main.includes('SHA-256 検証OK') && main.includes('Work 0'), main.slice(0, 300)); assert.ok(main.includes('派生元: Work 0'));
    assert.strictEqual(await page.locator('main input[maxlength="80"]').inputValue(), 'Work 0 (Remix)'); assert.ok((await page.locator('main select').first().locator('option').count()) === 6, 'CC-BY の元作品は全ライセンス可');
    assert.strictEqual(await page.evaluate(() => window.__uv.info().destroyed), true, 'Universe は破棄済み'); assert.strictEqual(await page.evaluate(() => window.__t.raf.size), 0); await ctx.close(); });
  await t('Remix(Universe): ShareAlike の元作品は派生作品のライセンスを CC-BY-SA-4.0 に限定する', async () => {
    const { ctx, page } = await setupReal(browser, mock, { session: 'u2' }); await page.goto(base + '#/universe'); await waitUv(page); await selectWork(page, 3);   // w03: dave / CC-BY-SA-4.0
    await page.locator('.uv-panel button', { hasText: '⑂ Remix' }).click(); await until(page, () => location.hash === '#/publish'); await sleep(500);
    const opts = await page.locator('main select').first().locator('option').allInnerTexts(); assert.deepStrictEqual(opts, ['CC-BY-SA-4.0']); await ctx.close(); });
  await t('Remix(Universe): all-rights-reserved（他人の作品）はボタン自体が出ず、ネットワークにも触れず、遷移もしない', async () => {
    const { ctx, page, state } = await setupReal(browser, mock, { session: 'u2' }); await page.goto(base + '#/universe'); await waitUv(page); await selectWork(page, 2);   // w02: carol / all-rights-reserved
    const panel = await page.locator('.uv-panel').innerText(); assert.ok(panel.includes('Remix不可') && panel.includes('All rights reserved'), panel); assert.strictEqual(await page.locator('.uv-panel button', { hasText: '⑂ Remix' }).count(), 0);
    assert.ok(!state.req.some(r => /get_work|storage/.test(r))); assert.strictEqual(await page.evaluate(() => location.hash), '#/universe'); await ctx.close(); });
  await t('Remix(Universe): 作者本人は自分の all-rights-reserved 作品を Remix できる', async () => {
    const { ctx, page } = await setupReal(browser, mock, { session: 'u3' }); await page.goto(base + '#/universe'); await waitUv(page); await selectWork(page, 2);
    await page.locator('.uv-panel button', { hasText: '⑂ Remix' }).click(); await until(page, () => location.hash === '#/publish'); await ctx.close(); });
  await t('Remix(Universe): 表示後にライセンスが変更された作品は、実行時の再検証で拒否される（遷移せず、データも取得しない）', async () => {
    const { ctx, page, state } = await setupReal(browser, mock, { session: 'u2' }); await page.goto(base + '#/universe'); await waitUv(page); await selectWork(page, 1);   // w01: bob? (u2) -> use w04 below
    await ctx.close();
    const r = await setupReal(browser, mock, { session: 'u2' }); await r.page.goto(base + '#/universe'); await waitUv(r.page); await selectWork(r.page, 4);   // w04: alice / CC0-1.0（一覧上は許可）
    r.state.getWork['w04'] = Object.assign({}, mock.byId('w04'), { license: 'all-rights-reserved' }); const before = r.state.req.length;
    await r.page.locator('.uv-panel button', { hasText: '⑂ Remix' }).click(); await sleep(800);
    assert.ok((await r.page.locator('.uv-panel').innerText()).includes('All rights reserved')); assert.strictEqual(await r.page.evaluate(() => location.hash), '#/universe'); assert.ok(!r.state.req.slice(before).some(x => /storage/.test(x)), 'パッケージを取得しない');
    assert.strictEqual(await r.page.locator('.uv-panel button', { hasText: 'Remix不可' }).count(), 1); await r.ctx.close();
    const q = await setupReal(browser, mock, { session: 'u2' }); await q.page.goto(base + '#/universe'); await waitUv(q.page); await selectWork(q.page, 4); q.state.getWork['w04'] = null;   // 削除/非表示
    await q.page.locator('.uv-panel button', { hasText: '⑂ Remix' }).click(); await sleep(600); assert.ok((await q.page.locator('.uv-panel').innerText()).includes('非表示')); assert.strictEqual(await q.page.evaluate(() => location.hash), '#/universe'); await q.ctx.close();
    const m = await setupReal(browser, mock, { session: 'u2' }); await m.page.goto(base + '#/universe'); await waitUv(m.page); await selectWork(m.page, 4); m.state.getWork['w04'] = Object.assign({}, mock.byId('w04'), { license: '' });
    await m.page.locator('.uv-panel button', { hasText: '⑂ Remix' }).click(); await sleep(600); assert.ok((await m.page.locator('.uv-panel').innerText()).includes('ライセンスが不明')); assert.strictEqual(await m.page.evaluate(() => location.hash), '#/universe'); await m.ctx.close(); });
  await t('Remix(Universe): 改ざんされたパッケージ（SHA-256 不一致）は Remix を開始しない', async () => {
    const { ctx, page, state } = await setupReal(browser, mock, { session: 'u2' }); const bad = JSON.parse(JSON.stringify(mock.pk.w04)); bad.project.engineData.payload.js = 'alert(1)'; state.tamper.w04 = bad;
    await page.goto(base + '#/universe'); await waitUv(page); await selectWork(page, 4); await page.locator('.uv-panel button', { hasText: '⑂ Remix' }).click(); await sleep(800);
    assert.ok((await page.locator('.uv-panel').innerText()).includes('SHA-256')); assert.strictEqual(await page.evaluate(() => location.hash), '#/universe'); await ctx.close(); });
  await t('Remix(作品ページ): 共通の入口を使い、許可作品は公開画面へ、不可作品はボタンが出ない', async () => {
    const { ctx, page } = await setupReal(browser, mock, { session: 'u2' }); await page.route('https://mock.supabase.co/rest/v1/profiles*', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify([{ id: 'u1', username: 'alice', display_name: 'alice', bio: '' }]) }));
    await page.goto(base + '#/work/w00'); await page.waitForSelector('button:has-text("⑂ Remix")', { timeout: 8000 }); await page.locator('button:has-text("⑂ Remix")').click(); await until(page, () => location.hash === '#/publish'); await ctx.close();
    const r = await setupReal(browser, mock, { session: 'u2' }); await r.page.route('https://mock.supabase.co/rest/v1/profiles*', x => x.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify([{ id: 'u3', username: 'carol', display_name: 'carol', bio: '' }]) }));
    await r.page.goto(base + '#/work/w02'); await r.page.waitForSelector('text=Remix不可', { timeout: 8000 }); assert.strictEqual(await r.page.locator('button:has-text("⑂ Remix")').count(), 0); await r.ctx.close(); });
  await t('ルーティング: 読み込み中に離脱しても Universe が後から割り込まない／連続遷移でも1つだけ', async () => {
    const { ctx, page, state } = await setupReal(browser, mock, { delay: 600 }); await page.goto(base + '#/'); await sleep(300);
    await page.evaluate(() => { location.hash = '#/universe'; }); await sleep(100); await page.evaluate(() => { location.hash = '#/orbit'; }); await sleep(1500);
    assert.strictEqual(await page.locator('canvas.uv-cv').count(), 0, 'Universe が割り込まない'); assert.strictEqual(await page.locator('.uv').count(), 0); assert.ok((await page.locator('h1').first().innerText()).includes('Orbit'));
    await page.evaluate(async () => { for (let k = 0; k < 4; k++) { location.hash = '#/universe'; await new Promise(r => setTimeout(r, 30)); location.hash = '#/orbit'; await new Promise(r => setTimeout(r, 30)); } location.hash = '#/universe'; }); await waitUv(page, 800);
    const s = await page.evaluate(() => ({ cv: document.querySelectorAll('canvas.uv-cv').length, live: window.__t.ctx.filter(g => !g.isContextLost()).length })); assert.strictEqual(s.cv, 1); assert.strictEqual(s.live, 1); await ctx.close(); });

  await browser.close(); srv.srv.close();
  console.log('\n' + logs.filter(l => l.startsWith('INFO')).join('\n'));
  const errs = logs.filter(l => !l.startsWith('INFO')); if (errs.length) console.log('--- ブラウザのコンソールエラー/例外 ---\n' + [...new Set(errs)].slice(0, 10).join('\n'));
  const fail = results.filter(r => !r[1]).length; console.log(fail ? `E2E FAIL: ${fail} failed, ${results.length - fail} passed` : `E2E OK: ${results.length} tests passed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
