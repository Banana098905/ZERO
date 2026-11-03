/*
 * ZeroStudio 連携のローダー。?zs=1 のときだけ、共通モジュール（../../js/zs-*.js）とブリッジ本体を読み込む。
 * index.html が参照するのはこのフォルダ内のファイルだけにして、Zero 単体のビルド（dist/）が壊れないようにしている。
 * document.write は解析中に同期で実行されるため、Zero の boot（DOMContentLoaded）より前に PZ.storage.open を差し替えられる。
 */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('zs') !== '1') return;
  ['util', 'schema', 'store', 'engines'].forEach(function (n) { document.write('<script src="../../js/zs-' + n + '.js"><\/script>'); });
  document.write('<script src="zs-bridge-main.js"><\/script>');
})();
