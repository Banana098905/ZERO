// sandbox="allow-scripts"（opaque origin）の iframe 内でのみ動く。Zero のDOM・Cookie・ストレージ・ネットワークには触れない。
addEventListener('message', function (e) {
  if (e.source !== parent) return;
  var d = e.data; if (!d || typeof d.html !== 'string') return;
  document.open();
  document.write('<!doctype html><meta charset="utf-8"><style>' + String(d.css || '') + '</style>' + d.html + '<script>' + String(d.js || '') + '<\/script>');
  document.close();
}, { once: true });
parent.postMessage('zero-run-ready', '*');
