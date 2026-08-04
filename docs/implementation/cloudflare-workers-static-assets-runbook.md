# Alpha Pon Workers Static Assets deployment runbook

Status: `PUBLIC_READ_ONLY_D1_READY_PENDING_DEPLOYMENT`
Updated: 2026-08-04 JST
Scope: Next.js static export、Worker API、D1、tokenized ICSを単一のCloudflare Workerへ配置する

## 0. 採用構成

```text
Cloudflare Worker: alpha-pon
├─ Static Assets: apps/web/out
├─ Worker entry: worker/index.ts
├─ Public read-only routes
│  ├─ /healthz
│  ├─ /api/market-events*
│  └─ /calendar.ics?token=...
├─ Disabled secret-disclosure route
│  └─ /api/calendar-feed-url → 404
├─ Static API exports
│  └─ /api/generated/*
└─ D1 binding: DB
```

Pages projectは新規作成しない。既存Worker `alpha-pon`を利用する。
`/api*`全体をWorker-firstにしてはいけない。Next.jsが静的生成する`/api/generated/*`までWorkerが奪うため、動的routeだけを明示する。

## 1. 確定済みの本番構成

- Worker URL: `https://alpha-pon.m-shogo-0409.workers.dev`
- D1 database: `alpha-pon-market-events`
- D1 binding: `DB`
- D1 mode: `READ_ONLY_NO_TRIGGERS`
- seed counts: events 3 / revisions 3 / sources 3 / decisions 3
- remote triggers: 0
- legacy guard marker: 0
- Cloudflare Access: 使用しない
- Zero Trustおよびクレジットカード登録: 不要

D1 bootstrapは再実行不要。schema変更またはseed更新を明示的に行う場合だけ、専用手順で実行する。

## 2. Cloudflare Builds設定

| 項目 | 値 |
|---|---|
| Repository | `m-shogo/alpha-pon` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `bash scripts/build-cloudflare-workers.sh` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy command | `npx wrangler versions upload` |

Build variables:

```text
PNPM_VERSION=9
```

Node.jsはrepo rootの`.node-version`で22系へ固定する。

## 3. Runtime variablesとsecret

Workerの`Settings > Variables and Secrets`で次を維持する。

Plain variable:

```text
PUBLIC_ORIGIN=https://alpha-pon.m-shogo-0409.workers.dev
```

Encrypted secret:

```text
CALENDAR_FEED_TOKEN=<32bytes以上のランダム値>
```

生成例:

```bash
openssl rand -hex 32
```

実tokenをGitHub、Issue、ログ、スクリーンショット、チャットへ保存しない。
以前登録した`OWNER_EMAIL`は現在のpublic read-only runtimeでは使用しない。残っていても動作へ影響しないが、後で削除してよい。

## 4. 公開範囲

### 公開するもの

- 静的サイト
- `/calendar/`
- `/healthz`
- `/api/market-events`
- `/api/market-events/<eventId>`

market-events APIはGET専用で、D1を読み取るだけである。書き込みAPIは作らない。GET以外は405を返す。

### 公開しないもの

`/api/calendar-feed-url`は常に404を返す。公開サイトからSecretを含む購読URLを取得できないようにする。

### tokenで保護するもの

`/calendar.ics?token=...`だけは`CALENDAR_FEED_TOKEN`一致時に返す。

- tokenなし: 404
- 誤token: 404
- 正しいtoken: 200 `text/calendar`

## 5. デプロイ後の確認

### Health

```text
GET /healthz
```

期待値:

```json
{
  "ok": true,
  "accessConfigured": false,
  "apiAccessMode": "public-read-only",
  "calendarFeedConfigured": true,
  "databaseBound": true
}
```

### Public D1 API

```text
GET /api/market-events
```

期待値:

- HTTP 200
- `source: "cloudflare-d1"`
- events 3件
- 認証画面なし
- `forbidden`なし

### Calendar page

```text
GET /calendar/
```

期待値:

- LIVE D1表示
- fallbackではない
- event 3件を取得
- unknown dateは画面に表示可能だがICSから除外

### Feed secret protection

```text
GET /api/calendar-feed-url
```

期待値: 404。レスポンスへtokenを含めない。

### ICS

正しいtokenを自分のパスワード管理アプリから取り出し、次の形式で登録する。

```text
https://alpha-pon.m-shogo-0409.workers.dev/calendar.ics?token=<CALENDAR_FEED_TOKEN>
```

token文字列をGitHubやチャットへ貼らない。

## 6. Rollback

移行版に問題がある場合:

1. Cloudflare DashboardのDeploymentsで直前の成功Versionへrollback
2. `main`を直接巻き戻さず、専用fix PRを作成
3. 静的snapshotが利用できることを確認
4. D1 schemaやデータを破壊的に戻さない

## 7. 外部操作の境界

repo内で自動化してよい:

- Worker entry、config、tests、CI、docs
- Wrangler dry-run
- local D1 export/audit

ユーザー確認後だけ行う:

- Cloudflare本番deploy
- runtime variable/secret変更
- custom domain変更
- 課金が発生する設定
