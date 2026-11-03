/*
 * Logic Studio ブリッジ（LOGIC PLAYGROUND ↔ ZeroStudio）
 * script.js の「後」に読み込む。script.js のトップレベルの宣言（S, data, clean, setData, push, fit, stop, N, D, $）を
 * そのまま呼び、Machine Lab は script.js 末尾のフック（MLAB.zs）経由で呼ぶ。
 * 作品タイプとタブの対応: Circuit Studio / Signal Analyzer → circuit、CPU Lab → cpu-program、Machine Lab → machine
 */
(function () {
  'use strict';
  if (typeof setData !== 'function' || typeof data !== 'function' || !window.MLAB || !MLAB.zs) return; // 想定外の構成なら何もしない

  // 元アプリのヘッダーにある example.com 宛のプレースホルダーリンクを、ZeroStudio 内の導線に置き換える（?zs=1 のときだけ）
  if (new URLSearchParams(location.search).get('zs') === '1') {
    var l1 = $('#l1'), l2 = $('#l2');
    if (l1) { l1.removeAttribute('target'); l1.removeAttribute('rel'); l1.href = '#'; l1.textContent = 'Code Studio へ'; l1.addEventListener('click', function (e) { e.preventDefault(); try { window.parent.location.hash = '#/code'; } catch (x) { /* noop */ } }); }
    if (l2) l2.hidden = true;
  }
  var last = { circuit: null, 'cpu-program': null, machine: null }, mode = null, machineSeen = false;
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function send(type, data2) { try { window.parent.postMessage(Object.assign({ zs: 1, engine: 'logic', type: type }, data2 || {}), location.origin); } catch (e) { /* 単体表示 */ } }
  function tab() { var t = document.querySelector('header').dataset.tab || 'circuit'; return t === 'sa' ? 'circuit' : t === 'cpu' ? 'cpu-program' : t; }
  var cpuSig = function () { return $('#asm').value + '\u0001' + $('#cin').value; };
  var circSig = function () { return JSON.stringify(data()); };
  var machSig = function () { return JSON.stringify(MLAB.zs.exp()); };
  function ensureMachineInit() { try { MLAB.tab(true); } catch (e) { /* 初期化に失敗しても読み込みは試す */ } }

  var api = {
    engine: 'logic', version: 1, ready: true,
    getMode: tab,
    /* ---- 回路 ---- */
    getCircuit: function () { return { title: S.name, payload: clone(data()) }; },
    setCircuit: function (title, d) {
      var c = clean(d);                         // 元アプリの検証。不正なら例外（現在の回路は変更されない）
      stop(1); push(); setData(c); fit();
      if (title && title !== S.name) { S.name = String(title).slice(0, 40); $('#pname').value = S.name; }
      last.circuit = circSig();
    },
    validateCircuit: function (d) { try { clean(d); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } },
    /* ---- CPUプログラム ---- */
    getCpu: function () { return { title: null, payload: { asm: $('#asm').value, input: Math.max(0, Math.min(255, +$('#cin').value | 0)) } }; },
    setCpu: function (title, p) {
      $('#asm').value = String(p.asm); $('#cin').value = Math.max(0, Math.min(255, p.input | 0));
      $('#asm').oninput && $('#asm').oninput();   // 元アプリの自動保存（lp.asm）と同じ経路
      var b = $('#asmload'); if (b) b.click();    // アセンブル＆ロード
      last['cpu-program'] = cpuSig();
    },
    /* ---- 機械 ---- */
    getMachine: function () { ensureMachineInit(); var m = MLAB.zs.exp(); return { title: m.name, payload: clone(m) }; },
    setMachine: function (title, d) {
      ensureMachineInit();                      // 初回表示までは自動保存／サンプルで上書きされるため、先に初期化しておく
      var m = MLAB.zs.mclean(d);
      if (title) m.name = String(title).slice(0, 40);
      MLAB.zs.load(m);
      last.machine = machSig(); machineSeen = true;
    },
    validateMachine: function (d) { try { MLAB.zs.mclean(d); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } },
    /** 機械が参照する回路の信号 "ノードID:出力番号" のうち、現在の回路に存在しないもの */
    missingRefs: function (refs) {
      return (refs || []).filter(function (r) {
        var m = /^(\d+):(\d+)$/.exec(r); if (!m) return true;
        var n = N(+m[1]); return !n || !(+m[2] < D[n.t].o.length);
      });
    },
    setName: function (slot, name) {
      name = String(name || '').slice(0, 40);
      if (slot === 'circuit') { S.name = name || '無題の回路'; $('#pname').value = S.name; if (typeof sv === 'function') sv(); }
      else if (slot === 'machine') { ensureMachineInit(); var m = MLAB.zs.exp(); m.name = name || '無題の機械'; MLAB.zs.load(MLAB.zs.mclean(m), true); }
    },
    show: function (slot) { var t = slot === 'machine' ? 'machine' : slot === 'cpu-program' ? 'cpu' : 'circuit'; var b = document.querySelector('.tab[data-tab="' + t + '"]'); if (b) b.click(); },
    /** 実行中のシミュレーションを止める（ZeroStudio の別画面へ移るとき） */
    suspend: function () {
      try { stop(1); } catch (e) { /* noop */ }
      try { MLAB.zs.pause(); } catch (e) { /* noop */ }
      var cs = $('#cstop'); if (cs && window.LPCPU && LPCPU.running()) cs.click();
    }
  };
  window.ZSBridge = api;

  // 変更検知。回路・CPU の基準は起動直後に確定する（Machine Lab は遅延初期化のため、初めて表示されてから）
  setTimeout(function () { try { if (last.circuit === null) last.circuit = circSig(); if (last['cpu-program'] === null) last['cpu-program'] = cpuSig(); } catch (e) { /* 次のポーリングで確定 */ } }, 0);
  setInterval(function () {
    var m = tab();
    if (m !== mode) { mode = m; send('mode', { mode: m }); }
    try {
      var c = circSig(); if (last.circuit === null) last.circuit = c; else if (c !== last.circuit) { last.circuit = c; send('change', { slot: 'circuit' }); }
      var p = cpuSig(); if (last['cpu-program'] === null) last['cpu-program'] = p; else if (p !== last['cpu-program']) { last['cpu-program'] = p; send('change', { slot: 'cpu-program' }); }
      if (m === 'machine') machineSeen = true;
      if (machineSeen) { var x = machSig(); if (last.machine === null) last.machine = x; else if (x !== last.machine) { last.machine = x; send('change', { slot: 'machine' }); } }
    } catch (e) { /* 読み取り中の一時的な状態は次回に回す */ }
  }, 700);

  // 元の保存ボタン・Ctrl/⌘+S は ZeroStudio の保存（版の確定）としても扱う
  [['#save', 'circuit'], ['#mlsave', 'machine']].forEach(function (x) { var b = $(x[0]); if (b) b.addEventListener('click', function () { send('save-request', { slot: x[1] }); }); });
  window.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 's') send('save-request', { slot: tab() }); });
  send('ready', {});
})();
