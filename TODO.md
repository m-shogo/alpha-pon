# alpha-pon TODO

## 必須 / すぐやるべき（ユーザー操作が必要）

| # | 内容 | 状態 |
|---|------|------|
| A | `.env` に `JQUANTS_EMAIL` / `JQUANTS_PASSWORD` を設定 → `pnpm daily` でリアルデータ確認 | .env 作成済み・値未入力 |
| B | `cloudflared` インストール後 `pnpm setup:line` で LINE User ID 取得 → `.env` に追記 | webhook サーバー実装済み |
| C | `pnpm launchd:install` を実行（A・B 完了後） | plist・ラッパー準備済み |

## 機能追加

| # | 内容 | 状態 |
|---|------|------|
| D | バックテスト（通知後 30日/90日/180日の株価追跡） | ✅ `pnpm backtest` 実装済み |
| E | watchlist.yml への IPO 自動追加（JPX スクレイプ） | ✅ `pnpm sync:ipo` 実装済み |
| F | TDnet キーワード検出から candidate 自動追加 | ✅ `pnpm sync:tdnet` 実装済み |
| G | EDINET 有報の自動取得・要約レポート生成 | ✅ `pnpm scan:edinet:annual` 実装済み |
| H | 米国株テーマ監視 | 後回し (v0.4) |

## 後回し（仕様書に明記）

- Claude API 自動要約
- Codex CLI 連携ボタン
- TradingView 自動登録
- SBI 自動登録
