# Market Event Foundation v1 — current status

Updated: 2026-08-05 JST
Status: `CALENDAR_V1_OPERATIONAL`
Production base: `https://alpha-pon.m-shogo-0409.workers.dev`
Calendar: `https://alpha-pon.m-shogo-0409.workers.dev/calendar/`
D1 database: `alpha-pon-market-events`

## 結論

Market Event Foundation v1は、repo内contract・append-only ledger・D1 projection・Workers Static Assets UI・公開read-only API・tokenized ICS・snapshot fallback・manual D1 syncまで接続され、運用可能な状態に到達した。

過去の`READY_PENDING_CLOUDFLARE_REGISTRATION`、Pages / Access前提、Cloudflare未接続前提は現在の正本ではない。

現在の構成:

- Cloudflare Workers Static Assets
- Worker script
- D1 `alpha-pon-market-events`
- public GET-only market event API
- public write APIなし
- Cloudflare Access / Zero Trustなし
- billing / credit card変更なし
- tokenized LIVE ICS
- generated SNAPSHOT fallback
- manual D1 syncはworkflow_dispatchのみ
- scheduleは未追加

## 実装済み

### Contract / identity

- event / revision / source / decision / delivery contract
- exact / date-only / window / unknown time precision
- unknown-date anti-fabrication guard
- stable deterministic event ID
- source / revision / decision / delivery / review task ID
- unsupported non-JSON value fail-closed
- first executable timestampをevent observationから分離可能な契約

### Operational ledger

- append-only JSONL ledger
- transactional local SQLite store
- D1-compatible schema
- event revisions / decision snapshots
- transactional delivery outbox / alert delivery ledger
- calendar sync state / source checkpoints / review tasks
- foreign-key / JSON / current-revision audit
- deterministic canonical export
- remote D1 read-only/no-trigger mode

### Calendar delivery

- generated JSON snapshot
- RFC5545-style ICS snapshot
- tokenized LIVE ICS from D1
- exact/date/window event output
- unknown date exclusion
- stable UID / revision sequence
- Apple / Google Calendar URL subscription path

### Web / PWA

- `/calendar/`
- real monthly calendar
- mobile bottom sheet / desktop modal
- category/search/status filters
- priority / decision / stale visibility
- primary-source links
- checks-before / checks-after
- home next-event card
- LIVE D1 API first, static SNAPSHOT fallback
- responsive AppShell
- PWA manifest / icon / service worker
- API/token feed excluded from service-worker cache
- static `robots.txt` deny-all indexing policy
- security headers

### Cloudflare production runtime

- Workers Static Assetsへ移行
- D1 binding `DB`
- public read-only market event API
- GET以外は405
- D1 unavailable時は503
- `/api/calendar-feed-url`は常に404
- `/calendar.ics`は`CALENDAR_FEED_TOKEN`必須
- runtime security headers
- private field allowlist projection
- D1 query failureを503へ正規化
- Access identity headerをruntimeで使用しない

## Production evidence

PR #14〜#28で、public read-only化からD1 Token境界まで段階的に実装・修正した。

本番契約の主要証拠:

- PR #14〜#15: public read-only APIとDB guard
- PR #16〜#17: production verifierとPASS記録
- PR #19〜#20: monthly calendar / mobile UX
- PR #21〜#22: manual D1 sync / input hardening
- PR #23〜#24: LIVE/SNAPSHOT分離 / runtime hardening
- PR #25〜#28: D1 Token設定・検証経路の確定

GitHub Actions D1 dry-run Run `30970892738`:

- success
- canonical 12 rows
- remote 12 rows
- added 0
- updated 0
- unchanged 12
- removed candidates 0
- collisions 0
- validation errors 0
- blockers 0
- apply不要

D1 bootstrapやmigrationは再実行しない。

## Current data

Canonical / remote D1:

- market events: 3
- event sources: 3
- event revisions: 3
- decision snapshots: 3
- total: 12

現在の3 eventは、JPX一次情報をanchorにしたAlpha Pon内部review checkpointであり、公式提出予定日ではないことを明示している。

## Secrets / external configuration

記録するのはSecret名だけ。

Repository Secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_READ_API_TOKEN`

`production` Environment Secret:

- `CLOUDFLARE_D1_EDIT_API_TOKEN`

Runtime secret:

- `CALENDAR_FEED_TOKEN`

Secret値はrepo、ログ、artifact、例外へ出さない。

`OWNER_EMAIL`はruntime contractから除外済み。Cloudflare Dashboardに旧変数が残る場合の削除だけが外部作業。

## 完了済みPhase

### Phase 0 — Contract

- event schema v1
- enums
- PIT日時ルール
- dedupe / revision契約
- notification / delivery contract
- fixtures / validator / tests

### Phase 1 — Data authority / CLI

- append-only event ledger
- current projection
- audit
- register / revision path
- JSON / ICS generation
- local SQLite / D1 schema

### Phase 2 — Web UI

- generated-data integration
- monthly calendar
- next event card
- event detail
- mobile UX
- LIVE / SNAPSHOT / stale / unknown表示

### Phase 3 — Public delivery foundation

- tokenized LIVE ICS
- SNAPSHOT ICS
- deterministic UID / revision
- manual D1 sync
- production verification

Google Calendar API OAuth同期は未実装だが、v1 operationalの必須条件ではない。

### Phase 4 — Production runtime

- Workers Static Assets deploy
- D1 binding
- public read-only API
- fallback
- runtime hardening
- no Access / Zero Trust
- no public write API

## 未完了 — 次のworkstream

### Phase 5 — Official-source collection

- 決算発表日
- TDnet / EDINET / JPX日程
- 株主総会・継続会
- 会見・第三者委員会報告
- 行政処分・改善報告期限
- 訴訟・判決
- TOB / lock-up / restructuring
- D+1 / D+5 / 1m / 3m review

### Delivery / operations

- official collectorからevent ledgerへのappend-only registration
- outbox配送接続
- export / restore drill
- repeated dry-run / idempotency検証
- 明示承認後のschedule候補

## Completion rule

### `CALENDAR_V1_OPERATIONAL`

LIVE API、tokenized ICS、SNAPSHOT fallback、監査、public read-only境界、manual D1 dry-run一致を実環境で確認済み。

### 将来の拡張

collector、Google Calendar API、outbox delivery、scheduleは別workstreamで進める。未実装であることを明示し、v1完了を偽装しない。
