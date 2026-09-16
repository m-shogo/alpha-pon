# alpha-pon

## 🚨 監視通知で最初に確認すること

Alpha Pon には **iPhone の Slack プッシュ通知を出すための専用 Slack Bot 経路**がある。

監視・定期チェック・条件成立通知を新しく実装するときは、ChatGPT 接続ユーザー本人として Slack に投稿しないこと。本人投稿は Slack 上で自分自身のメッセージとして扱われ、iPhone の受信プッシュ通知が出ない。

### 株監視 Bot

- Slack App / Bot: `Alpha Pon Stock Watch`
- GitHub Actions Secret: `SLACK_BOT_TOKEN_STOCK_WATCH`
- Slack user: `U0BSZ2X7BKQ`
- 動作確認 Workflow: `.github/workflows/slack-bot-test.yml`
- 送信方式: Slack Bot Token (`xoxb-...`) + `chat.postMessage`
- Token 本体は GitHub Secrets のみに保存し、コード・Issue・PR・ログへ書かない

### 監視機能を追加するときのルール

1. 株監視の通知は原則 `Alpha Pon Stock Watch` を使う。
2. 別用途の監視 Bot を増やす場合は Slack App/Bot と Secret を用途別に分離する。
3. Secret 名は `SLACK_BOT_TOKEN_<PURPOSE>_WATCH` 形式を基本とする。
4. 「通知済み」は Slack API が成功を返した場合だけ記録する。
5. 同一条件の繰り返し通知を避け、重要な状態変化だけ通知する。
6. 新しい監視処理を作る前に、この README と既存の通知 Workflow を確認する。

例:

| 用途 | Bot | Secret |
|---|---|---|
| 株監視 | `Alpha Pon Stock Watch` | `SLACK_BOT_TOKEN_STOCK_WATCH` |
| 決算監視（将来） | `Alpha Pon Earnings Watch` | `SLACK_BOT_TOKEN_EARNINGS_WATCH` |
| IPO監視（将来） | `Alpha Pon IPO Watch` | `SLACK_BOT_TOKEN_IPO_WATCH` |

> **重要:** ChatGPT の Slack コネクタから本人として送る DM は、監視の iPhone プッシュ通知経路として使用しない。

---

長期投資向けの調査候補・監視候補を見つけ、仮説検証するアプリ。

> 自動売買しない。株価予想しない。買い推奨しない。  
> **調査候補を見逃さず、見落とし・上がらない理由・下がる理由を減らすためのツール。**

## 目的

毎日株価や開示を見に行かなくても、条件を満たした銘柄を調査候補として記録・通知してくれる。  
ただし、**買うかどうかは必ず自分で判断する。**

既存の詳細な運用・セットアップ・ProプレイブックはこのREADMEの後続セクションを正本として維持する。
