# ZERO V1.0.1 変更点（新機能なし・公開前の安全性とZeroStudio連携）
1. **Storageアクセス制御** `0001_zero.sql`: `payload_path = author_id/id.json` をCHECK制約+INSERTトリガーで強制、UPDATEで `payload_path`/`id` 変更不可、Storage INSERT/DELETEは `{自分のID}/{UUID}.json` 限定・UPDATEポリシー無し・参照中ファイルは削除不可、読み取りは `can_read_payload` と整合。管理者用 `list_orphan_payloads()` 追加。`rls.test.sql` に不正INSERT/UPDATE・Storage の拒否テストを追加。
2. **直接投稿**: Studio は `window.open` より前に受信登録、Zero は `zero:ready` を受領まで繰り返し送信（取りこぼし防止）、`source`/`origin` 厳密検証、`targetOrigin` 明示、認証情報は渡さない。Zero は未ログインでも受信→メモリ保持→ログイン後に確認画面へ。`js/zero-core.js` 新設。
3. **公開URL**: `zerostudio/js/zs-config.js`（`ZS_ZERO_URL`）追加、`studioOrigins` は空=同一オリジン・パス付きOK・不正値は無視。READMEに手順。
4. **SHA-256**: algorithm/hash形式/library/再計算値を厳密検証、未検証・不一致は投稿不可（投稿直前に再検証）。
5. **投稿失敗**: DB登録失敗時に保存済みファイルを（作品行なしを確認して）削除、失敗は `zero.orphans` に記録し自動再回収。
6. **Actions**: ルートの公開ワークフローで `node tests.js` と `zerostudio ... --unit` を実行、失敗時は deploy しない。
変更しないもの: ZeroStudioの制作エンジン（engines/）、作品・ユーザーデータ形式、デザイン。ZeroStudio側の変更は `js/zs-zero.js`、新規 `js/zs-config.js`、`index.html` のscript1行、テスト追加のみ。
