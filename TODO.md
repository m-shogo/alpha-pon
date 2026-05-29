# alpha-pon TODO

## 必須 / すぐやるべき（ユーザー操作が必要）

| # | 内容 | 状態 |
|---|------|------|
| A | `.env` に `JQUANTS_EMAIL` / `JQUANTS_PASSWORD` を設定 → `pnpm daily` でリアルデータ確認 | .env 作成済み・値未入力 |
| B | `cloudflared` インストール後 `pnpm setup:line` で LINE User ID 取得 → `.env` に追記 | webhook サーバー実装済み |
| C | `pnpm launchd:install` を実行（A・B 完了後） | plist・ラッパー準備済み |

## 機能追加

| # | 内容 | 仕様書の位置づけ |
|---|------|----------------|
| D | バックテスト（通知後 1ヶ月/3ヶ月/6ヶ月の株価追跡） | 「検証方法」 |
| E | watchlist.yml への IPO 自動追加（JPX スクレイプ） | v0.2 相当 |
| F | TDnet キーワード検出から candidate 自動追加 | v0.3 相当 |
| G | EDINET 有報の自動取得・要約レポート生成 | S ランク機能 5 番 |
| H | 米国株テーマ監視 | v0.4 相当 |

## 後回し（仕様書に明記）

- Claude API 自動要約
- Codex CLI 連携ボタン
- TradingView 自動登録
- SBI 自動登録
