# ZeroStudio V1

CODE LAB・LOGIC PLAYGROUND 2.2・PLAYGROUND ZERO Phase 4 の3つの制作アプリを、**共通のプロジェクト管理を持つ1つの制作エンジン**に統合したものです。
バックエンド不要の静的サイトで、作品データはすべて**このブラウザの中**に保存されます。**オンライン共有・アカウント・サーバーは実装されていません**（V1 の範囲外。将来 Zero に接続できる構造だけ用意してあります）。

| 画面 | 中身 |
|---|---|
| ホーム | エンジンの入口、最近のプロジェクト、バックアップ／旧データ取り込みのお知らせ |
| プロジェクト | 全エンジンの作品を一覧・検索・絞り込み・並べ替え・名前変更・複製・削除・詳細（依存関係） |
| Code Studio | CODE LAB（Web作品エディター、Pixel Lab、テンプレート）をそのまま搭載 |
| Logic Studio | LOGIC PLAYGROUND（Circuit Studio、CPU Lab、Signal Analyzer、Machine Lab）をそのまま搭載 |
| Zero Engine | PLAYGROUND ZERO（Studio / Experiment / Creation / Remix / Lab / Daily / Discover / My Space）をそのまま搭載 |
| 共通ライブラリ | 素材・部品の登録、再利用、使用プロジェクトの追跡、版の管理 |
| インポート／エクスポート | JSON の書き出し・取り込み、バックアップ・復元、旧アプリのデータ移行、公開用データ |
| 設定 | 作者名・既定ライセンス、保存先の状態、登録済みエンジン |

## ローカルで起動する

Node.js 18 以上が必要です（依存パッケージはありません）。

```bash
node scripts/serve.js        # → http://localhost:8080/
node scripts/serve.js 3000   # ポート指定
```

Node が無い場合は、このフォルダを任意の静的サーバーで配信してください（例: `python3 -m http.server 8080`）。
**`file://` で index.html を直接開く方法には対応していません**（IndexedDB と iframe 間通信は http(s) のオリジンを前提にしています。未検証）。

## GitHub Pages で公開する

1. このフォルダの中身を GitHub リポジトリのルートに置いて `main` にプッシュします（`.nojekyll` と `.github/workflows/pages.yml` を含めてください）。
2. GitHub の **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
3. プッシュのたびに、ブラウザ不要のテストが走り、成功すれば公開されます。
4. 公開先は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。**サブパス配信で動作することを確認済み**です（相対パスのみ使用）。

> ⚠ 同じ `<ユーザー名>.github.io` 上の別リポジトリ（旧 CODE LAB など）とは**ブラウザの保存領域を共有**します。ZeroStudio の保存キーは `zs1:` と IndexedDB `zerostudio-v1` に限定しているので衝突しませんが、旧アプリが同じオリジンにあれば、旧データが「移行」画面で検出されます（詳細は docs/MIGRATION.md）。
> 独自の HTTP ヘッダー（CSP など）は GitHub Pages では設定できません。シェルには `<meta>` の CSP を入れています。

## テスト

```bash
node scripts/test-all.js --unit     # ブラウザ不要（共通層・サービス層・元ソース照合・Zero付属テスト）
npm i -D playwright && npx playwright install chromium
node scripts/test-all.js            # 実ブラウザ(Chromium)の E2E も実行
ORIGINALS=<元ソースの親フォルダ> node scripts/test-all.js   # 元アプリ単体との見た目比較も実行
```
結果は docs/TEST-REPORT.md を参照してください。

## フォルダ構成

```
index.html              シェル（共通ナビゲーション）
css/zs.css              シェルのスタイル（クラスは zs- 始まり）
js/zs-util.js           ID生成・安全なJSON処理・ハッシュ・DOMヘルパー
js/zs-schema.js         共通プロジェクト形式（検証・正規化・移行・ファイル形式）
js/zs-store.js          保存層（IndexedDB → localStorage → メモリ、容量不足・破損対策、タブ間通知）
js/zs-engines.js        エンジン登録 + 3エンジンのアダプター + 素材の形式変換
js/zs-service.js        サービス層（プロジェクト管理・版・競合・取り込み・バックアップ・ライブラリ・依存関係・旧データ移行）
js/zs-host.js           iframe 管理・自動保存セッション・旧データの読み取り
js/ui.js, pages.js, shell.js   画面
engines/code/           CODE LAB（元ファイル＋ zs-bridge.js、app.js に1行のフック）
engines/logic/          LOGIC PLAYGROUND（元ファイル＋ zs-bridge.js、script.js に1行のフック）
engines/zero/           PLAYGROUND ZERO 一式（元ファイル＋ zs-bridge*.js、index.html に1行追加）
tests/                  ユニット・E2E テスト
scripts/serve.js        ローカルサーバー、scripts/test-all.js  一括テスト
docs/                   設計・データ形式・変更点・維持状況・移行・既知の問題・テスト結果
```

## ドキュメント

[ARCHITECTURE](docs/ARCHITECTURE.md)（設計・新しいエンジンの追加方法）／[DATA-FORMAT](docs/DATA-FORMAT.md)（共通プロジェクト形式）／[CHANGES](docs/CHANGES.md)（元プロジェクトからの変更点）／[FEATURE-PARITY](docs/FEATURE-PARITY.md)（既存機能の維持状況）／[MIGRATION](docs/MIGRATION.md)（元データからの移行手順）／[KNOWN-ISSUES](docs/KNOWN-ISSUES.md)（既知の不具合・未実装・未検証）／[TEST-REPORT](docs/TEST-REPORT.md)（テスト結果）
