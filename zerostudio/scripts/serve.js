#!/usr/bin/env node
/* ZeroStudio ローカルサーバー（依存なし）。使い方: node scripts/serve.js [ポート]  → http://localhost:8080/ */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
function createServer() {
  return http.createServer((req, res) => {
    let rel; try { rel = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
    let f = path.join(root, rel); if (rel.endsWith('/')) f = path.join(f, 'index.html');
    if (!f.startsWith(root + path.sep) && f !== root) { res.writeHead(403); return res.end('forbidden'); }
    fs.stat(f, (e, st) => {
      if (!e && st.isDirectory()) { res.writeHead(301, { Location: rel.replace(/\/?$/, '/') }); return res.end(); }
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('not found'); }
        res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(buf);
      });
    });
  });
}
module.exports = { createServer, root };
if (require.main === module) {
  const port = +process.argv[2] || 8080;
  createServer().listen(port, () => console.log('ZeroStudio: http://localhost:' + port + '/  (Ctrl+C で停止)'));
}
