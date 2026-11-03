# ZERO V1.0.3 変更点（品質修正のみ・新機能なし）
既存の機能・デザイン・ZeroStudio・Supabase認証・作品データ形式・投稿/Remix の仕組みは維持。

1. **WebGL シェーダー** `js/universe.js`: 縁の `smoothstep(1.,.8,d)`（edge0>=edge1 は GLSL 仕様上未定義）を `1.-smoothstep(.8,1.,d)` に修正。端末の最大ポイントサイズ（`ALIASED_POINT_SIZE_RANGE`）を超えない。属性位置を固定、uniform/attribute をキャッシュ。シェーダー失敗・WebGL 非対応・描画例外・コンテキスト復旧失敗は **2Dギャラリー**（検索つき）へフォールバック。
2. **Universe への導線**: ナビに Universe を追加。Supabase 未設定時は `#/universe` が `#/universe/sample` に切り替わる（セットアップ画面からも開ける）。サンプルは枠・透かし・「SAMPLE DATA」、実作品は「LIVE」で明確に区別。
3. **Creator Space**: 作者未選択なら案内つきの作者選択UI。選んだ作者の作品だけを渦状に配置（他は非表示）。作者変更・Universe へ戻る・作品を選んでから入る場合の自動選択。
4. **Remix 連携**: 作品パネルの Remix を、最新の作品情報の取得→ライセンス検証→SHA-256 検証→既存の Remix 処理に接続（入口は `startRemix` の1か所。作品ページも共通化）。判定は `zero-core.js` の `remixCheck`/`remixLicenses`（SQL トリガーと同じ規則）。不可の場合は実行しない。公開画面でも再検証し、ShareAlike の派生は CC-BY-SA-4.0 に限定。
5. **SQL**: SECURITY DEFINER 関数 10 本すべてを `search_path=''` にし、テーブル・関数・ポリシー・トリガーを `public.` 等で修飾。`0001_zero.sql` を最終形に更新、既存DB用に冪等・1トランザクションの `0002_search_path_hardening.sql` を追加。`rls.test.sql` に監査と「空の search_path での実行」テストを追加。RLS の条件・投稿・Storage の制限は不変。
6. **ライフサイクル**: 破棄時に rAF・window/document リスナー・Observer・バッファ・プログラム・WebGL コンテキストを解放（冪等）。読み込み中の離脱で後から Universe が割り込まない。30回開閉してもリスナー・コンテキストが増えないことを実ブラウザで検査。低性能端末向けの品質レベル（DPR・ダスト・30fps・ミニマップ間引き）と自動軽量化、モバイルのピンチ誤選択の修正。
7. **整理**: README・バージョンを V1.0.3 に、古い3D説明を修正。ZIP 内の空フォルダ（ブレース展開の残骸 `{js,css,supabase…`）を削除。

## 実ブラウザで見つけて直した不具合（V1.0.2 から）
- ミニマップの canvas にサイズ属性が無く、描画が左上に小さく潰れていた。
- 高DPI（DPR>1）でノードの大きさに DPR が二重に掛かっていた（クリック判定とも不一致）。
- 狭い画面でモード/カテゴリの行が画面外にはみ出し、スクロールできなかった（Related Works 等が押せない）。ツールバーが画面の約半分を占めていたため、狭い画面では検索・カテゴリを折りたたみ式に。
- `style` 属性を `setAttribute` で設定していたため、CSP（`style-src 'self'`）に拒否されカードのグラデーション等が効かなかった（`el.style.cssText` に変更）。
- 自動回転中は毎フレーム再描画していた（回転だけの間は最大30fps に）。
