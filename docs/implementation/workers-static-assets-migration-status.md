# Workers Static Assets migration — current status

Updated: 2026-08-04 JST
Status: `READY_PENDING_PR_MERGE_AND_WORKER_REDEPLOY`
Branch: `agent/workers-static-assets-migration`
Draft PR: `#6`
Verified implementation commit: `2747d7fbd0b63b28feb853ba220e86f69b153fd2`

## 結論

Alpha Ponの重要イベントカレンダーは、repo内ではCloudflare Pages / Pages Functions前提から、Cloudflare Workers Static Assets + Worker scriptへ移行済み。

Cloudflare本番環境、D1、Access、runtime variables、secretは変更していない。残る外部作業はPR #6のマージ後、既存Worker `alpha-pon`を再デプロイし、段階的にD1と認証設定を接続すること。

## 実装済み

- repo rootの正式`wrangler.jsonc`
- Worker entry `worker/index.ts`
- Static Assets directory `apps/web/out`
- ASSETS binding
- trailing-slash / custom 404設定
- Worker-first routeの最小化
  - `/api/market-events*`
  - `/api/calendar-feed-url*`
  - `/calendar.ics*`
  - `/healthz*`
- `/api/generated/*`を静的assetとして維持
- 既存Pages handlerの段階的再利用
- Worker/Assets routing回帰テスト
- Workers専用production build contract
- Node 22固定
- Wrangler 4.118.0 dry-run bundle検証
- Workers登録・D1・Access・rollback runbook
- 旧Pages登録runbookのdeprecated化

## CI evidence

Implementation commit `2747d7fbd0b63b28feb853ba220e86f69b153fd2`:

- `Check` run `30874725348`: success
- `CI` run `30874725349`: success

CIで確認した主な項目:

- existing Alpha Pon core checks and tests
- market-event contracts / schema / append-only guards
- deterministic D1 bootstrap
- auth / API / tokenized ICS handler contract
- Workers readiness audit
- Next.js static export 55 pages
- static output and 404 artifact
- Worker route parity
- static `/api/generated/*` preservation
- `cloudflare-workers-build: ok`
- Wrangler dry-run
- 244 static assets detected
- Worker bundle generated
- `env.ASSETS` binding detected
- no external deploy performed

## Current route authority

| Route | Authority |
|---|---|
| `/`, `/calendar/`, `/_next/*` | Static Assets |
| `/api/generated/*` | Static Assets |
| `/api/market-events*` | Worker |
| `/api/calendar-feed-url*` | Worker |
| `/calendar.ics*` | Worker |
| `/healthz*` | Worker |

Broad `/api*` Worker-first routing is prohibited because it shadows the existing static generated API exports.

## 残る外部作業

1. PR #6をmainへマージ
2. Cloudflare BuildsのBuild commandを`bash scripts/build-cloudflare-workers.sh`へ更新
3. 既存Worker `alpha-pon`をmainから再デプロイ
4. static UI / generated API / healthzを確認
5. D1 `alpha-pon-market-events`を作成して`DB` bindingを追加
6. migrations/bootstrapをdry-run後に適用
7. `OWNER_EMAIL` / `PUBLIC_ORIGIN`をruntime variablesへ設定
8. `CALENDAR_FEED_TOKEN`をencrypted secretとして設定
9. Cloudflare Accessをdeny-by-defaultにし、`/calendar.ics`だけspecific bypass
10. live API / tokenized ICS / snapshot fallback / rollbackを実環境確認

## Completion states

### `READY_PENDING_PR_MERGE_AND_WORKER_REDEPLOY`

repo実装、テスト、bundle dry-runが成功。mainへのマージと外部再デプロイが未実施。

### `WORKER_STATIC_ASSETS_CONNECTED_SHADOW`

Worker static UI、dynamic routes、D1、Access、tokenized ICSをShadow環境で確認。実売買判断には未使用。

### `CALENDAR_V1_OPERATIONAL`

live API、snapshot fallback、calendar subscription、監査、rollbackを実環境で確認。
