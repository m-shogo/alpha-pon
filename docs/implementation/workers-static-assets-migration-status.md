# Workers Static Assets migration — current status

Updated: 2026-08-04 JST
Status: `PUBLIC_READ_ONLY_D1_FIX_PR_CI_PENDING`
Current fix PR: `#15`
Base deployment merge: PR `#14`, merge commit `e72c96cd81c4a8f420b40fe78acd9ced66fd31bc`

## 結論

Alpha Ponの重要イベントカレンダーは、Cloudflare Workers Static Assets + Worker script + D1へ移行済み。

現在の方針は次で固定する。

- Cloudflare Accessを使用しない
- Zero Trustを作成しない
- クレジットカード登録を行わない
- `/api/market-events*`は公開GET専用
- public browser write APIを作らない
- `/api/calendar-feed-url`は常に404
- `/calendar.ics`は`CALENDAR_FEED_TOKEN`必須
- D1は`READ_ONLY_NO_TRIGGERS`
- D1 bootstrapを再実行しない

## 確定済みの外部状態

- Worker: `alpha-pon`
- Production URL: `https://alpha-pon.m-shogo-0409.workers.dev`
- D1 database: `alpha-pon-market-events`
- D1 database ID: `7b90faf4-9834-4393-a921-275e0a68b398`
- Worker binding: `DB`
- events: 3
- revisions: 3
- sources: 3
- decisions: 3
- remote trigger: 0
- legacy guard marker: 0
- `PUBLIC_ORIGIN`: 設定済み
- `CALENDAR_FEED_TOKEN`: 設定済み
- `OWNER_EMAIL`: runtimeでは未使用。公開版の本番確認後に削除可能

## PR #14で実装済み

- `/api/market-events`を認証不要の公開GETへ変更
- `/api/market-events/<eventId>`を認証不要の公開GETへ変更
- GET以外は405
- D1 read-only維持
- `/api/calendar-feed-url`を常時404へ変更
- tokenized ICSを維持
- `/healthz`へ`apiAccessMode: public-read-only`を追加
- Access / OWNER_EMAIL依存をruntime contractから削除

## PR #15の修正対象

PR #14後のCloudflare buildで、DB bindingなしの検証が次の回帰を検出した。

```text
Cannot read properties of undefined (reading 'prepare')
actual 500
expected 503
```

PR #15では次を修正する。

- `Env.DB`をoptionalにする
- D1依存routeでprojection前にDBを確認する
- DBなしは`503 {"error":"database unavailable"}`
- ICSはtokenなし・誤tokenの404をDB状態より優先する
- DBあり200 / DBなし503をWorkersとPages handlerの両方で検証する
- readiness出力をpublic read-only / Access不要 / OWNER_EMAIL不要へ更新する

500を正解に変更せず、503 contractを維持する。

## Current route authority

| Route | Authority | Contract |
|---|---|---|
| `/`, `/calendar/`, `/_next/*` | Static Assets | public static |
| `/api/generated/*` | Static Assets | generated snapshot |
| `/api/market-events*` | Worker | public GET / DB read-only |
| `/api/calendar-feed-url*` | Worker | always 404 |
| `/calendar.ics*` | Worker | token required |
| `/healthz*` | Worker | safe runtime readiness |

Broad `/api*` Worker-first routingは禁止。既存の静的`/api/generated/*`をshadowしてはいけない。

## 次の完了条件

1. PR #15のCheckとCIがgreen
2. PR #15をmainへmerge
3. Cloudflare Buildsのproduction deploy成功を確認
4. 本番でhealthzを実測
5. market event API 3件を実測
6. individual event 200 / missing 404を実測
7. POST 405を実測
8. hidden feed URL 404を実測
9. ICS invalid token 404を実測
10. 正しいtokenのICS 200をローカルで安全に確認
11. `/calendar/`がLIVE D1 3件表示であることをPC/スマホ幅で確認
12. remote trigger 0 / legacy marker 0を再確認
13. 実測結果をrunbookへ記録
14. その後、未使用の`OWNER_EMAIL`をCloudflareから削除可能

## 後続PR

本番安定後、公開Workerへ書き込みrouteを追加せず、次を別PRで進める。

- dry-run-first管理用D1 sync CLI
- workflow_dispatch限定のmanual GitHub Actions
- backup / diff / audit / idempotency
- destructive deleteなし
- production environment protection
- scheduleは追加しない

## Completion states

### `PUBLIC_READ_ONLY_D1_FIX_PR_CI_PENDING`

DB guard修正PRのCI待ち。

### `PUBLIC_READ_ONLY_D1_DEPLOYED_PENDING_VERIFICATION`

main mergeとCloudflare deployは完了したが、本番API・ICS・UIの全実測が未完了。

### `CALENDAR_V1_OPERATIONAL`

LIVE API、tokenized ICS、snapshot fallback、監査、rollbackを本番で確認済み。
