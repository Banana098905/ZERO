# 設計

## 全体像

```
┌──────────────── シェル（index.html / js/*.js） ────────────────┐
│ ナビゲーション ─ ルーター(#/home …) ─ 画面（ホーム・一覧・ライブラリ…）│
│            │                                                     │
│   サービス層 zs-service ── 保存層 zs-store ── IndexedDB `zerostudio-v1`│
│   (プロジェクト管理/版/取り込み/ライブラリ/依存関係)  (→ localStorage → メモリ)│
│            │  エンジン登録 zs-engines（定義・検証・変換）            │
│   ホスト層 zs-host（Frame / Session=自動保存）                       │
└───────────────┬──────────────────────────────────────────────┘
        同一オリジンの iframe ＋ ブリッジ（window.ZSBridge）＋ postMessage(変更通知)
   ┌────────────┼────────────┐
 engines/code   engines/logic   engines/zero
 (CODE LAB)     (LOGIC PLAYGROUND) (PLAYGROUND ZERO)
```

## なぜ iframe か（衝突の回避）

3つのアプリは `.view` `.panel` `#toast` `#log` `PZ` などの CSS クラス・要素 ID・グローバル変数が重なり得ます（調査で確認）。1ページに混ぜると衝突するため、**各エンジンを独立した iframe（同一オリジン）で動かし**、CSS・JS・DOM を完全に分離しています。
埋め込みだけで統合とは見なさず、次の3点を設計しています。

1. **保存データの受け渡し** — ブリッジ経由で、共通プロジェクトを画面へ読み込み／画面から読み出す（下記）。
2. **エラー処理** — 呼び出しは JSON 複製・15秒タイムアウト・日本語エラー。エンジンが起動しない／応答しない場合は画面に理由と再読み込みを表示。
3. **保存の一貫性** — 保存は共通ストアが唯一の正本。画面を離れるときと非表示になるときに未保存分をフラッシュ。

保存キーの衝突: ZeroStudio は `zs1:*` と IndexedDB `zerostudio-v1` のみ。エンジンの旧保存（`codelab.*` `lp.*` `pz:*` と IndexedDB `playground-zero`）とは名前が異なり、**触りません**。

## 共通メタデータとエンジン固有データの分離

共通形式は `docs/DATA-FORMAT.md`。エンジン固有データは `engineData.payload` に**中身を解釈せずに**保持します（共通層は「ただのデータ」への洗浄と大きさの確認だけ）。中身の検証は各エンジンのアダプター（`validatePayload`）が行います。既存のデータ構造を共通形式に無理に変換せず、そのまま入れています。

| エンジン | 作品タイプ | payload の中身 |
|---|---|---|
| code | web / pixel | `{html,css,js}` ／ Pixel Lab の JSON（`size,frames,palette…`） |
| logic | circuit / cpu-program / machine | `data()` の回路JSON ／ `{asm,input}` ／ Machine Lab の `exp()` JSON |
| zero | studio / experiment / creation | Zero の作品レコード（schema 2）そのもの |

## エンジンごとの接続方式（アダプター層）

エンジンの内部を大きく書き換えず、**アダプター＋ブリッジ**で共通基盤へつなぎます。

- **Code Studio**: `app.js` 末尾の1行フックで、IIFE 内部の状態（`state`, `px`, `editor()` など）を `zs-bridge.js` が受け取り、`ZSBridge.getWeb/setWeb/getPixel/setPixel/insert…` を提供。
- **Logic Studio**: `script.js` のトップレベル宣言（`data()`, `clean()`, `setData()`…）を `zs-bridge.js` が直接使用。Machine Lab は IIFE の戻り値に `zs:{exp,mclean,load,pause}` を足す1行だけ変更。タブ（回路／CPU／機械）ごとに別の作品として扱います。
- **Zero Engine**: Zero は保存層が Repo インターフェースで差し替え可能な設計。`engines/zero/zs-bridge-main.js` が **`PZ.storage.open` だけを差し替え**、Zero の作品を共通プロジェクト（`engine:'zero'`）として共通ストアに保存する Repo（`ZSRepo`）を用意。Zero の JS は**1行も変更していません**。`?zs=1` が無いとき（Zero 単体で開いたとき）は従来どおり Zero 自身の IndexedDB を使います。

変更通知は、ブリッジが画面の状態を 600〜700ms ごとに比較し、変わったら `postMessage({zs:1, type:'change', slot})` をシェルへ送ります。シェルは同一オリジン・自分の iframe からのメッセージだけを受け付けます。

## 自動保存・版・競合

- 変更 → 800ms のデバウンス → 共通ストアへ保存（作品タイプごとに直列化）。まだ保存先のない画面は、最初の変更で新規プロジェクトを自動作成。
- **版（projectVersion）**: 「保存」ボタン・元アプリの保存ボタン・Ctrl/⌘+S・複製・書き出し・公開用書き出しの時点で、**内容が前回の版から変わっていれば +1**。内容は `versionHash` で判定（メタデータの変更、Zero の最終閲覧日時やお気に入りでは変わらない）。
- **競合**: 保存時に「読み込み時の更新日時」と保存先を比較。別タブが先に更新していたら**上書きせず**「（競合コピー）」として別プロジェクトに保存し通知。
- **削除**は確認ダイアログ付き。直後なら一覧の「直前の削除を取り消す」で復元。

## 共通ライブラリと依存関係

素材（`pixel-art` / `image` / `circuit` / `machine` / `cpu-program`）を `library` に登録。Web 作品に挿入するコード片には `zs-asset:<ID>@<版>` のマーカーを入れ、**保存のたびに内容から再計算**して `assets` に反映します（コードから消せば参照も外れる）。素材は作品に**コピー**されるため、ライブラリ側の更新は自動反映されず、「最新は v○」と通知されます。
依存関係の種類: `library`（素材・Zero 部品）／`project`（機械→回路など）／`ref`（機械が参照する回路の信号 `ノードID:出力番号`）、および `derivedFrom`（派生元の ID と版）。

実際に変換できるものだけ連携しています: ドット絵 → CSS(box-shadow) / PNG / Canvas 用 JS（Code Studio の Web 作品へ）、回路・機械・CPU プログラム → Logic Studio の新規プロジェクト、画像 → `<img>`。**Zero の部品は Zero 専用形式のまま**で、Code・Logic とは互換扱いにしていません（ライブラリでは使用状況の確認のみ）。

## 安全性

- 取り込みは「**検証 → 確認 → 適用**」の3段階。検証だけでは何も保存しません。既存のプロジェクトは**絶対に上書きせず**、内容が違えば別IDの別作品（派生元つき）として追加。
- JSON は BOM 除去・サイズ上限(50MB)・件数上限・深さ上限(40)・`__proto__`/`constructor`/`prototype` の除去・文字列の長さ／制御文字の整理。
- ユーザーコード: Code Studio のプレビューは元の設計どおり `sandbox="allow-scripts allow-modals"` の `data:` iframe（不透明オリジン）で実行され、ZeroStudio のストレージ・DOM に触れません（テストで属性を確認）。Zero の Creation は元から eval を使わない設計（付属テストで確認）。
- 元の Pixel Lab の JSON 読込には、色の値を `innerHTML` に入れる HTML 注入の経路がありました。統合版では入口（`#pixelImportInput`）をブリッジで検証し、`#RGB` 形式以外・許可キー以外を拒否しています（テストで確認。元コードの該当箇所は変更していません）。
- シェルの文字表示はすべて `textContent`。`<meta>` の CSP で `script-src 'self'` 等を設定。

## サービス層とオンライン接続の将来像

UI は `ZS.app.svc`（`createService`）だけを呼び、保存先の実装を知りません。将来の Zero 接続は、同じメソッド群を持つ RemoteProvider をこの層に差し込む想定です（V1 には実装なし。`svc.provider` は `'local'`、設定画面にも「オンライン共有は未実装」と表示）。
公開用データは `exportPublish`（`zerostudio.publish`）: 安定したプロジェクトID・作者・ライセンス・公開設定・派生元と版・使用素材の同梱・SHA-256 の完全性ハッシュ。インポート時にハッシュを検証します。**ローカルのファイルであり、オンライン公開ではありません。**

## 新しいエンジンの追加方法

1. `ZS.engines.register({...})` を1回呼ぶ（`id, label, workTypes, defaultPayload, validatePayload, scanAssets, scanDependencies` が必須。`fromLegacy / exportFile / importFile / hashPayload / prepareCopy` は任意）。
2. 画面を持つ場合は `engines/<id>/` に置き、`window.ZSBridge`（`ready, getMode, …`）と `postMessage` の `ready/change/mode` を実装、`zs-host.js` の `attach` に `slots / load / snapshot` を足す。
3. **既存の共通形式は変わりません**。登録のないエンジンのデータ（古いアプリ版で開いた場合など）も、保存・バックアップ・書き出しで**欠落しません**（テスト済み）。
