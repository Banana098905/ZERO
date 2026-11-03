// 性能の実測（合否判定ではなく、報告用の数値）。N 件のプロジェクトを作り、一覧の取得と描画の時間を測る
const { start, page, summary } = require('./lib');
(async () => {
  const env = await start(); const pg = await page(env); await pg.goto(env.base + '/'); await pg.waitForSelector('h1');
  for (const N of [100, 500, 1000]) {
    const r = await pg.evaluate(async (N) => {
      const s = ZS.app.svc; const have = (await s.list()).projects.length; const t0 = performance.now();
      for (let i = have; i < N; i++) await s.create({ engine: i % 2 ? 'code' : 'logic', workType: i % 2 ? 'web' : 'circuit', title: 'プロジェクト ' + i });
      const create = performance.now() - t0; const t1 = performance.now(); const l = await s.list({ q: 'プロジェクト 9' }); const search = performance.now() - t1;
      const t2 = performance.now(); await s.list(); const list = performance.now() - t2; return { have, create: Math.round(create), list: Math.round(list), search: Math.round(search), found: l.projects.length };
    }, N);
    const t = Date.now(); await pg.goto(env.base + '/#/projects'); await pg.waitForFunction(n => document.querySelectorAll('.zs-item').length >= n, N, { timeout: 30000 }); const render = Date.now() - t;
    console.log(`N=${N}: 作成(追加分) ${r.create}ms / 一覧取得 ${r.list}ms / 検索 ${r.search}ms / 画面描画 ${render}ms`); await pg.goto(env.base + '/#/home'); await pg.waitForSelector('h1');
  }
  console.log('errors', pg.errors); await env.close(); summary('perf');
})();
