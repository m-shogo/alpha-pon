# Alpha Pon Workers Static Assets deployment runbook

Status: `PUBLIC_READ_ONLY_D1_PRODUCTION_VERIFICATION_PENDING`
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
- D1 database ID: `7b90faf4-9834-4393-a921-275e0a68b398`
- D1 binding: `DB`
- D1 mode: `READ_ONLY_NO_TRIGGERS`
- seed counts: events 3 / revisions 3 / sources 3 / decisions 3
- remote triggers: 0
- legacy guard marker: 0
- Cloudflare Access: 使用しない
- Zero Trustおよびクレジットカード登録: 不要
- public browser write API: 作成しない

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
以前登録した`OWNER_EMAIL`は現在のpublic read-only runtimeでは使用しない。公開読み取り専用版の本番確認後に削除してよい。

## 4. 公開範囲とエラー契約

### 公開するもの

- 静的サイト
- `/calendar/`
- `/healthz`
- `/api/market-events`
- `/api/market-events/<eventId>`

market-events APIはGET専用で、D1を読み取るだけである。書き込みAPIは作らない。GET以外は405を返し、`Allow: GET`を付ける。

D1 bindingがない場合:

```json
{
  "error": "database unavailable"
}
```

- HTTP 503
- 500を正常扱いしない
- static assetへfall throughしない

### 公開しないもの

`/api/calendar-feed-url`は常に404を返す。Accessヘッダーを偽装しても404のままにし、公開サイトからSecretを含む購読URLを取得できないようにする。

### tokenで保護するもの

`/calendar.ics?token=...`だけは`CALENDAR_FEED_TOKEN`一致時に返す。

- tokenなし: 404
- 誤token: 404
- 正しいtoken + DBあり: 200 `text/calendar`
- 正しいtoken + DBなし: 503 `database unavailable`

Token判定はDB確認より先に行う。tokenなし・誤token時にDB bindingの有無を外部へ明かさない。

## 5. デプロイ後の確認

本番deploy完了はCloudflare Buildsの成功記録または実測で確認し、推測で断定しない。

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
- `summary.total: 3`
- 認証画面なし
- `forbidden`なし
- token、メールアドレス、API key、非公開メモなし

個別event:

```text
GET /api/market-events/<eventId>
```

- 存在するevent: 200
- 存在しないevent: 404

method制限:

```text
POST /api/market-events
```

- HTTP 405
- `Allow: GET`

### Calendar page

```text
GET /calendar/
```

期待値:

- 画面表示データはLIVE D1
- fallback / snapshotをLIVEと表示しない
- event 3件を取得
- source、日程、状態、一次情報URLが正常
- PC幅とスマホ幅で破綻なし
- browser console errorなし

### Feed secret protection

```text
GET /api/calendar-feed-url
```

期待値: 404。レスポンスへtokenを含めない。`Cf-Access-Authenticated-User-Email`を付けても404。

### ICS invalid token

```text
GET /calendar.ics
GET /calendar.ics?token=wrong
```

期待値: どちらも404。

### ICS valid token

正しいtokenはパスワード管理アプリからローカル入力し、標準出力やshell historyへ出さない。

```bash
read -s "CALENDAR_FEED_TOKEN?Token: "
curl -sS -D /tmp/alpha-pon-ics-headers.txt \
  -o /tmp/alpha-pon-events.ics \
  "https://alpha-pon.m-shogo-0409.workers.dev/calendar.ics?token=${CALENDAR_FEED_TOKEN}"
unset CALENDAR_FEED_TOKEN
```

確認項目:

- HTTP 200
- `content-type: text/calendar`
- `BEGIN:VCALENDAR`
- event件数が期待どおり
- token値を記録しない

## 6. 本番確認記録

確認後、Secretを含めず次だけを記録する。

- deploy commit SHA
- 確認日時（JST）
- healthz結果
- market event件数
- 個別event 200 / missing 404
- POST 405
- hidden feed URL 404
- ICS invalid token 404
- ICS valid token 200
- calendar UI LIVE D1
- remote trigger 0
- legacy marker 0

## 7. Rollback

移行版に問題がある場合:

1. Cloudflare DashboardのDeploymentsで直前の成功Versionへrollback
2. `main`を直接巻き戻さず、専用fix PRを作成
3. 静的snapshotが利用できることを確認
4. D1 schemaやデータを破壊的に戻さない
5. rollback後にhealthz、API、calendar UIを再実測する

## 8. 外部操作の境界

repo内で自動化してよい:

- Worker entry、config、tests、CI、docs
- Wrangler dry-run
- local D1 export/audit
- dry-run-firstの管理用D1 sync CLI

本番確認後に行ってよい:

- 使用されない`OWNER_EMAIL`の削除

行わない:

- Cloudflare Access / Zero Trust導入
- クレジットカード登録
- public POST / PUT / PATCH / DELETE API追加
- Secretの表示・記録
- D1 bootstrapの再実行
- scheduleの無断追加
