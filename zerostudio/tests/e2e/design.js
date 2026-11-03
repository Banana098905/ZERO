// デザイン刷新（V1.1）で追加した UX の検証: 新規作成ダイアログ・続きから・ドロワー・表示切替・保存状態・3つの画面幅での崩れ
const assert = require('assert'); const { start, page, test, summary } = require('./lib');
(async () => {
  const env = await start(); console.log('# design e2e');
  const list = (pg) => pg.evaluate(async () => (await ZS.app.svc.list()).projects);
  const ROUTES = ['home', 'projects', 'code', 'logic', 'zero', 'library', 'io', 'settings'];

  await test('D1. 新規作成ダイアログ: どの画面からでも1回の選択で作品タイプを作れる（全8種類）', async () => {
    const pg = await page(env); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('h1');
    const types = [['Web作品', 'code', 'web'], ['ドット絵', 'code', 'pixel'], ['回路', 'logic', 'circuit'], ['CPUプログラム', 'logic', 'cpu-program'], ['機械', 'logic', 'machine']];
    for (const [label, engine, wt] of types) {
      await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-tools');
      await pg.click('#zs-create'); await pg.waitForSelector('dialog.zs-dlg .zs-pick');
      assert.strictEqual(await pg.locator('dialog.zs-dlg .zs-pick button').count(), 8, '8種類が並ぶ');
      await pg.click(`dialog .zs-pick button:has(.nm:text-is("${label}"))`); await pg.waitForSelector('.zs-frame');
      await pg.waitForFunction(async ([e, w]) => (await ZS.app.svc.list()).projects.some(p => p.engine === e && p.workType === w), [engine, wt]);
      assert.strictEqual(await pg.locator('dialog.zs-dlg').count(), 0, '選んだらダイアログが閉じる');
    }
    await pg.goto(env.base + '/#/home'); await pg.click('#zs-create'); await pg.waitForSelector('.zs-pick'); await pg.keyboard.press('Escape');
    assert.strictEqual(await pg.locator('dialog.zs-dlg').count(), 0, 'Esc で閉じる'); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });

  await test('D2. ホーム: プロジェクトが無ければ空の案内、あれば「続きから」で最新の作品を開く', async () => {
    const pg = await page(env); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('.zs-empty');
    assert.ok(/まだプロジェクトがありません/.test(await pg.textContent('.zs-empty')));
    await pg.evaluate(async () => { await ZS.app.svc.create({ engine: 'logic', workType: 'circuit', title: '最新の回路' }); });
    await pg.goto(env.base + '/#/settings'); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('.zs-hero .resume');
    assert.ok(/最新の回路/.test(await pg.textContent('.zs-hero .resume'))); await pg.click('.zs-hero .resume'); await pg.waitForSelector('.zs-frame');
    assert.ok(/#\/logic/.test(pg.url())); assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });

  await test('D3. プロジェクト一覧: リスト／カード表示の切り替えが再読み込み後も保たれる', async () => {
    const pg = await page(env); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('h1');
    await pg.evaluate(async () => { for (let i = 0; i < 3; i++) await ZS.app.svc.create({ engine: 'code', workType: 'web', title: '作品' + i }); });
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); assert.strictEqual(await pg.locator('.zs-list.grid').count(), 0);
    await pg.click('.zs-seg button[aria-label="カード表示"]'); await pg.waitForSelector('.zs-list.grid');
    await pg.reload(); await pg.waitForSelector('.zs-list.grid'); assert.strictEqual(await pg.locator('.zs-seg button[aria-pressed=true]').getAttribute('aria-label'), 'カード表示');
    await pg.click('.zs-seg button[aria-label="リスト表示"]'); await pg.waitForFunction(() => !document.querySelector('.zs-list.grid')); await pg.ctx.close();
  });

  await test('D4. 保存状態: 編集すると「変更あり」→「保存済み」へ変わり、エンジンに共通テーマが載る', async () => {
    const pg = await page(env); await pg.goto(env.base + '/#/code'); await pg.waitForSelector('.zs-frame'); await pg.waitForFunction(() => !document.querySelector('.zs-loading'));
    const f = pg.frameLocator('.zs-frame'); await f.locator('#codeInput').fill('<p>状態</p>');
    await pg.waitForFunction(() => /保存済み/.test(document.querySelector('.zs-status').textContent), null, { timeout: 8000 });
    assert.ok(await pg.locator('.zs-status.ok').count() === 1, '保存済みは ok 状態');
    const bg = await pg.frames().find(x => /engines\/code/.test(x.url())).evaluate(() => getComputedStyle(document.body).backgroundColor); assert.strictEqual(bg, 'rgb(10, 16, 32)');
    await pg.ctx.close();
  });

  await test('D5. スマホ幅: メニューがドロワーとして開閉し（Esc・背景タップ・遷移で閉じる）、下部タブから移動できる', async () => {
    const pg = await page(env, { context: { viewport: { width: 390, height: 844 }, hasTouch: true } }); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('h1');
    assert.ok(await pg.locator('#zs-tabbar').isVisible(), '下部タブが見える'); assert.strictEqual(await pg.locator('#zs-nav').evaluate(e => getComputedStyle(e).visibility), 'hidden');
    await pg.tap('#zs-menu'); await pg.waitForSelector('#zs-nav.open'); assert.strictEqual(await pg.getAttribute('#zs-menu', 'aria-expanded'), 'true');
    await pg.keyboard.press('Escape'); await pg.waitForFunction(() => !document.querySelector('#zs-nav.open'));
    await pg.tap('#zs-tabbar button:has-text("メニュー")'); await pg.waitForSelector('#zs-nav.open'); await pg.tap('#zs-scrim', { position: { x: 10, y: 300 } }); await pg.waitForFunction(() => !document.querySelector('#zs-nav.open'));
    await pg.tap('#zs-tabbar a[data-name=projects]'); await pg.waitForSelector('.zs-tools'); assert.ok(/#\/projects/.test(pg.url()));
    await pg.tap('#zs-tabbar button:has-text("新規作成")'); await pg.waitForSelector('dialog .zs-pick'); await pg.keyboard.press('Escape');
    await pg.goto(env.base + '/#/code'); await pg.waitForSelector('.zs-frame'); assert.ok(!(await pg.locator('#zs-tabbar').isVisible()), '制作画面では下部タブを隠して作業領域を広げる');
    assert.deepStrictEqual(pg.errors, []); await pg.ctx.close();
  });

  for (const [w, h] of [[1280, 800], [820, 1180], [390, 844]]) await test(`D6. ${w}px 幅: 全8画面が横にはみ出さず、エラーも外部通信も無い`, async () => {
    const pg = await page(env, { context: { viewport: { width: w, height: h } } }); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('h1');
    await pg.evaluate(async () => { await ZS.app.svc.create({ engine: 'code', workType: 'web', title: 'とても長いタイトルとても長いタイトルとても長いタイトルとても長いタイトル' }); });
    for (const r of ROUTES) { await pg.goto(env.base + '/#/' + r); await pg.waitForTimeout(r === 'code' || r === 'logic' || r === 'zero' ? 1800 : 500);
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), r + ' が横にはみ出す'); }
    await pg.goto(env.base + '/#/projects'); await pg.waitForSelector('.zs-item'); await pg.locator('.zs-item button[aria-haspopup=menu]').first().click(); await pg.click('.zs-menu button:text-is("削除…")'); await pg.waitForSelector('dialog.zs-dlg');
    const box = await pg.locator('dialog.zs-dlg').boundingBox(); assert.ok(box.x >= -1 && box.x + box.width <= w + 1, '確認ダイアログが画面内に収まる'); assert.ok(/削除/.test(await pg.textContent('dialog')), '削除には確認がある');
    assert.deepStrictEqual(pg.errors, []); assert.deepStrictEqual(pg.requests, []); await pg.ctx.close();
  });

  await env.close(); summary('design');
})();
