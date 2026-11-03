# ZERO V1.0.4

ZeroStudio で作った作品を公開・発見・実行・Remix する創作コミュニティ。静的フロントエンド（GitHub Pages）+ Supabase。
`zerostudio/` は ZeroStudio V1.1 に「Zeroに公開」を追加した版（制作エンジンは未変更）。V1.0.3 は品質修正版（Universe の描画・導線・ライフサイクル、Remix のライセンス検証、SQL の search_path。変更点は `CHANGES-v1.0.3.md`、V1.0.1 の変更点は `CHANGES-v1.0.1.md`）。

## セットアップ
1. **Supabase**: プロジェクトを作成し、`supabase/migrations/0001_zero.sql` → `0002_search_path_hardening.sql` の順に適用（下記「Supabase への適用手順」）。
2. Authentication > Providers > Email を有効化（メール確認ON推奨）。Authentication > URL Configuration の Site URL に Zero の公開URLを設定。
3. **`js/config.js`** に `supabaseUrl` と **Publishable(anon) Key のみ**を記入（service_role 等の秘密鍵は絶対に置かない）。
4. GitHub に push → Settings > Pages > Source を **GitHub Actions** に。`.github/workflows/pages.yml` が `node tests.js` と `cd zerostudio && node scripts/test-all.js --unit` の**両方が成功したときだけ**公開する。
5. 管理者: SQL Editor で `insert into admins values ('<ユーザーUUID>');`。不適切な作品は `works.hidden = true`、通報は `reports` テーブルで確認。
6. ローカル確認: `python3 -m http.server 8080` → http://localhost:8080/ （ZeroStudio は /zerostudio/）。

## 公開URLの設定（ZeroStudio と Zero を別々の GitHub Pages に置く場合）
2か所を設定する。どちらも**秘密情報ではない**（公開URL/オリジンのみ）。

**① ZeroStudio 側 — `zerostudio/js/zs-config.js`**
```js
window.ZS_ZERO_URL = 'https://<zero-user>.github.io/zero/';   // Zero の公開URL（https のみ。localhost は http 可）
```
**② Zero 側 — `js/config.js`**
```js
studioOrigins: ['https://<studio-user>.github.io']   // ZeroStudio のオリジン。パス付きでも可（オリジンに正規化される）
```
| 構成 | `ZS_ZERO_URL` | `studioOrigins` |
|---|---|---|
| 同梱（Zero の配信内に `/zerostudio/` がある。既定） | `''`（未設定）→ `../index.html#/publish` を開く | `[]`（空）→ Zero と同一オリジンのみ許可 |
| 別 Pages（別ユーザー/Organization） | 必須: Zero の絶対URL | 必須: ZeroStudio のオリジン |
| 別リポジトリだが同じ `https://<user>.github.io` | 必須: Zero の絶対URL（例 `.../zero/`） | 空でも可（同一オリジン）。明示を推奨 |

- **未設定時の動作**: `ZS_ZERO_URL` が空なら上表の同梱構成として動く。別 Pages なのに未設定だと Zero が見つからず、Studio は 10 秒後に「Zero から応答がありません。ZS_ZERO_URL … を確認してください」と表示する（作品は送られない）。
- `studioOrigins` の `*`・http（localhost 以外）・認証情報つきURLは無効として無視（ブラウザのコンソールに警告）。許可外オリジンからの投稿は拒否され、Zero に通知が出る。
- 設定を変えたら再デプロイ。Zero と ZeroStudio の両方に反映すること。

## 使い方（ZeroStudio からの直接投稿）
ZeroStudio で作品を開く → 書き出し → **Zeroに公開** → Zero が新しいタブで開く。**未ログインでも作品は受信**され、このタブのメモリに保持される → ログイン（または登録）すると投稿確認画面に戻る → SHA-256 検証OKの作品だけ投稿できる。
- 受信データはメモリのみ（保存しない）。タブを閉じる/再読み込みすると失われるので、その場合は ZeroStudio からもう一度送る。メール確認つき新規登録は別タブで認証が走るため、**認証後は元のタブでログイン**する。
- 認証情報は ZeroStudio に一切渡さない（Studio→Zero は作品データのみ、Zero→Studio は `zero:ready` / 受領確認のみ）。
- 手動: Zero の「公開」から `.zspublish.json` を選択。作品ページの **Remix** で派生作品を作成（ライセンス検証つき）。

## Universe（3D探索）
- **開き方**: 上部ナビの **Universe**（`#/universe`）。公開作品を3D空間に配置し、Universe / Categories / Evolution / Creator Space / Related Works の5モード、検索、カテゴリ絞り込み、ミニマップ、キーボード（矢印・+/-・Esc）、モバイル（ドラッグ回転・ピンチ・タップ）に対応。
- **実作品とサンプルの区別**: `#/universe` は Supabase の公開作品（画面に緑の **LIVE** 表示）。`#/universe/sample` は動作確認用のサンプル90件で、琥珀色の枠・「SAMPLE」透かし・「SAMPLE DATA」表示が常に出る（作品ページへの遷移・Remix は不可）。**Supabase 未設定のときは `#/universe` がサンプルへ自動で切り替わり**、その旨を表示する。セットアップ画面からもサンプルを開ける。
- **Creator Space**: 作者が未選択なら作者選択UI（作品数つき）を出す。作者を選ぶと、その作者の作品だけが中心から渦状に並ぶ。作者の変更・Universe へ戻るも可。作品を選んでから入ると、その作者が自動で選ばれる。
- **Remix**: 作品パネルの「⑂ Remix」は、実行時に最新の作品情報を取得 → ライセンス検証 → SHA-256 検証 → 既存の Remix 処理（公開画面）へ進む。`all-rights-reserved`（作者以外）・ライセンス不明・非公開/削除・SHA-256 不一致・サンプルは実行不可（ボタンを出さない、または理由を表示して遷移しない）。ShareAlike の作品を Remix した派生作品は CC-BY-SA-4.0 に限られる。判定は `js/zero-core.js` の `remixCheck` / `remixLicenses` で、SQL トリガー `works_before` と同じ規則（DB 側でも必ず再検証される）。
- **WebGL が使えない/失敗したとき**: WebGL 非対応・シェーダーのコンパイル失敗・描画中の例外・コンテキスト復旧失敗の場合は、同じ画面に **2Dギャラリー**（検索つき）を表示する。コンテキスト喪失は自動復旧を試みる。
- **ライフサイクル**: 画面を離れるたびに描画ループ・`window`/`document` リスナー・Observer・WebGL リソース（バッファ・プログラム・コンテキスト）を解放する。何度開閉しても重複しない。低性能端末（コア4以下/メモリ4GB以下）は最初から軽量モード、フレームが遅ければ自動でさらに軽量化する。
- **Orbit 3D**（`#/orbit`）は従来どおりの簡易版（2D Canvas による擬似3D球面）で、WebGL は使わない。

## セキュリティ
- **Storage**: 保存先は `{author_id}/{work_id}.json` のみ。DBの CHECK 制約とトリガーで固定（INSERT時に検証、UPDATEで変更不可）。Storage の INSERT/DELETE も自分の `{自分のID}/{UUID}.json` に限定、UPDATEポリシー無し（上書き不可）、作品行が参照中のファイルは削除不可、読み取りは作品の公開設定に準拠。
- **SHA-256 検証**: `integrity.algorithm === 'SHA-256'`、hash は小文字16進64桁、`library` 配列、再計算値との完全一致を必須とし、満たさないパッケージは投稿フォームを出さず、投稿直前にも再検証する。
- **postMessage**: 受信は `event.source`（開いた window / opener）と `event.origin` を厳密に照合。`targetOrigin` は常に明示（`*` を使わない）。
- **投稿失敗時**: アップロード後にDB登録が失敗したら、作品行が無いことを確認した上でファイルを削除（3回再試行）。確認できない/削除できない場合は `localStorage`（`zero.orphans`）に記録し、次回起動・ログイン時に自動で再回収。作品行が実は存在する場合は削除しない。管理者は `select * from list_orphan_payloads();` で作品行の無い残骸を確認できる（削除は Storage ダッシュボード/API）。
- Web作品は `run.html` を `sandbox="allow-scripts"` の iframe + CSP で実行。ブラウザに置く鍵は Publishable Key のみ。

## Supabase への適用手順
**新規プロジェクト**
1. SQL Editor に `supabase/migrations/0001_zero.sql` を貼って実行し、続けて `0002_search_path_hardening.sql` を実行（または `supabase db push`）。0001 は V1.0.3 で最終形（SECURITY DEFINER 関数は `search_path=''`・スキーマ修飾済み）に更新済みで、0002 は同じ定義を `create or replace` で入れ直すだけの冪等な移行なので、続けて実行して問題ない。
2. **使い捨ての**別プロジェクトで `supabase/tests/rls.test.sql` を実行（0001・0002 適用後。全体が `rollback` で終わる。assert 失敗＝エラーで停止）。本番DBでは実行しないこと。V1.0.3 では「SECURITY DEFINER 関数がすべて search_path 空」の監査と、「呼び出し側の search_path が空でも関数・トリガー・RLS・Storage ポリシーが動く」テストを追加している。
3. `js/config.js` を設定して公開。

**V1.0.1 までの 0001 を適用済みの既存プロジェクト（V1.0.3 へ更新）** — `supabase/migrations/0002_search_path_hardening.sql` を SQL Editor に貼って実行するだけ（または `supabase db push`）。全体が1トランザクションで、失敗すれば何も変わらない。内容: ① SECURITY DEFINER 関数 10 本の `search_path` を空にし、関数・テーブルを `public.` で修飾（`works_before` / `bump` / `comments_rate` / `get_work` / `can_read_payload` / `payload_in_use` は従来 `search_path='public'`）② トリガーの関数参照を修飾して作り直し ③ RLS・Storage ポリシーを同じ条件のまま修飾して作り直し。テーブル・データ・制約・索引は変更しない。実行後、使い捨てDBで `rls.test.sql` を確認すること。0002 は V1.0.1 の変更（`is_own_payload_name` 等）が適用済みであることが前提（下の V1.0 向け差分を先に適用）。

**V1.0（旧 0001）を適用済みのプロジェクト** — 0001 は作り直さずに以下の差分だけ SQL Editor で実行する。実行前に、既存の `works.payload_path` が正規形式であることを確認する（V1.0 のアプリが作る形式はすでに正規）:
```sql
select id, payload_path from works where payload_path <> author_id::text || '/' || id::text || '.json';  -- 0件であること
```
0件なら、`0001_zero.sql` から次を抜き出して順に実行: ① `works_payload_path_canonical` 制約と `works_payload_path_key` 索引（`alter table works add constraint ... check (...); create unique index ...;`）② `works_before()` の `create or replace function`（`create function` を `create or replace function` に読み替え）③ `is_own_payload_name` / `payload_in_use` / `list_orphan_payloads` の作成 ④ Storage ポリシーの差し替え（`drop policy s_read/s_ins/s_del on storage.objects;` の後に新しい3つを作成）。1件でも出た場合は先に該当行とファイルを手動で整合させる。

## テスト
- `node tests.js`（Zero側: SHA-256検証・ハンドシェイク結合・投稿ロールバック・SQL静的検査（search_path・スキーマ修飾・0002 の整合）・Remix のライセンス判定・Universe の静的検査・ワークフロー検査。結果: `test-result.txt`）
- `node tests.js --e2e`（上に加えて、Chromium + Playwright による実ブラウザ検証 `tests/e2e/universe.e2e.js`。WebGL シェーダーの実コンパイル・描画、30回開閉のリーク検査、フォールバック、モバイル操作、低性能、Supabase をモックした実作品・Creator Space・Remix。Playwright が無ければ SKIPPED と表示して実行しない）
- `cd zerostudio && node scripts/test-all.js --unit`（ZeroStudio側。Playwright があれば `--unit` なしでE2Eも）
- RLSテスト: `supabase/tests/rls.test.sql`（上記）

## 未検証・未実装（正直な一覧）
- **実Supabase での動作は未検証**。SQL（0001・0002・`rls.test.sql`）はこの環境に PostgreSQL が無く**実行していない**（静的検査と、JS での正規表現・定義の突き合わせのみ）。0002 の適用と `rls.test.sql` の実行は、必ず使い捨てDBで先に確認すること。`rls.test.sql` が `proconfig` の表記（`search_path=""`）を前提にしている点も未確認。
- **ブラウザ検証の範囲**: Chromium（ヘッドレス）+ SwiftShader（ソフトウェアWebGL）のみ。**実GPU・Safari/iOS・Firefox・実機のスマホ**は未検証（モバイルは Chromium のタッチ/DPR エミュレーション）。旧シェーダー式 `smoothstep(1.,.8,d)` は、この環境では偶然まともな値を返したため「実害の再現」はできていない（GLSL 仕様上は未定義なので式を修正した）。低性能端末は CPU 4倍遅延のエミュレーションで確認した範囲。
- Supabase は E2E ではモック（HTTP レベル）。実際の REST/Storage/Auth の応答形式との差は未確認。postMessage は疑似ウィンドウでの結合テストで、実ポップアップは未確認。
- 未実装: 管理者用審査画面、通報の一覧UI、作品の新バージョン更新、アバター画像、Circuit/CPU/Machine/Creation の実行（安全な詳細表示のみ）。
- アカウント削除でStorage上のファイルは自動削除されない（`list_orphan_payloads()` で検出可能）。
- Universe は公開作品を最新500件まで読み込む。
