// E2E 共通: 静的サーバーと Playwright（実 Chromium）
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright')); }
const { createServer } = require('../../scripts/serve.js');
let passed = 0, failed = 0; const failures = [];
async function start() {
  const srv = createServer(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port; const browser = await chromium.launch();
  return { srv, base, browser, async close() { await browser.close(); srv.close(); } };
}
async function page(env, opts = {}) {
  const ctx = await env.browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }, opts.context));
  const pg = await ctx.newPage(); pg.errors = []; pg.requests = [];
  pg.userCodeErrors = [];
  // Code Studio のプレビューは data: ドキュメント。そこで起きる例外は「利用者が書いたコードのエラー」であり、プラットフォームのエラーではない
  pg.on('pageerror', e => (/data:text\/html/.test(String(e.stack)) ? pg.userCodeErrors : pg.errors).push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') pg.errors.push('console.error: ' + m.text()); });
  pg.on('dialog', d => d.accept());
  pg.on('request', r => { const u = r.url(); if (!u.startsWith(env.base) && !/^(data|blob|about):/.test(u)) pg.requests.push(u); });
  pg.ctx = ctx; return pg;
}
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 5).join('\n       ')); } }
function summary(label) { console.log(`\n${label}: ${passed} passed, ${failed} failed`); if (failed) { console.log('failed:', failures.join(', ')); process.exit(1); } process.exit(0); }
module.exports = { start, page, test, summary };
