# 共通プロジェクト形式（formatVersion 1）

## プロジェクト（`zerostudio.project`）

| フィールド | 内容 |
|---|---|
| `format` / `formatVersion` | `"zerostudio.project"` / `1`（共通形式の版） |
| `id` | 一意のプロジェクトID。`^[A-Za-z0-9_-]{1,64}$`。乱数130bit（`zsp_…`、Zero 作品は Zero の `p_…` をそのまま使用）。**タイトルとは無関係**なので同名でも衝突しない |
| `title` / `description` | 80 / 500 文字まで |
| `createdAt` / `updatedAt` | ISO 8601 |
| `engine` / `workType` | `code`:`web`,`pixel` ／ `logic`:`circuit`,`cpu-program`,`machine` ／ `zero`:`studio`,`experiment`,`creation`。未知の値も保持される |
| `projectVersion` / `versionHash` | 作品の版（内容が変わった確定ごとに +1）／ 直近の版の内容ハッシュ |
| `engineData` | `{ schemaVersion, payload }` — エンジン固有データ（共通層は中身を解釈しない）。8MB まで |
| `assets` | 使用した共通ライブラリの素材 `[{id, version}]` |
| `dependencies` | `{type:'library'|'project'|'ref', id?, version?, note?, detail?}` |
| `derivedFrom` | `null` または `{projectId, projectVersion?, title?}` |
| `license` | `{id, holder?, url?}`（既定 `all-rights-reserved`） |
| `visibility` | `private` ／ `export-ready`（公開用データの書き出しを許可。**ローカルの印であり、オンライン公開ではない**） |
| `author`, `tags`, `thumb?`, `ext` | 作者名／タグ（10個）／サムネイル（data URL, 90KB まで）／拡張情報（20KB まで。取り込み元・旧データの由来を記録） |

## 素材（`zerostudio.library-item`）
`{ id(zsl_…), kind, name, description, tags, createdAt, updatedAt, version, origin:{engine?, projectId?}, license, mime?, data }`。`data` の変更時だけ `version` が +1。

## ファイル
- `zerostudio.file`: `{app:'zerostudio', format, formatVersion, appVersion, exportedAt, kind:'project'|'bundle'|'backup', projects[], library[], meta?, quarantine?}`。`backup` は Zero の付随データ（`zero:*`）と設定、**読み込めなかったレコードも `quarantine` に同梱**（黙って欠落させない）。
- `zerostudio.publish`: `{…, online:false, note, integrity:{algorithm:'SHA-256', hash}, project, library[]}`。

## 互換性ルール
- 新しい `formatVersion` のデータは、警告つきで**読める項目だけ**取り込む。`S.migrations[旧版]` に移行関数を登録すれば旧データを新形式へ変換（テスト済み）。
- 未知の `engine`/`workType` は保持・書き出しとも欠落しない。`ext` に自由な拡張情報を置ける。
- エンジンの元アプリ形式での書き出しも可能: Code → CODE LAB JSON、Logic → 回路/機械 JSON・`.asm`、Zero → `playground-zero` バックアップ（元アプリで読める）。
