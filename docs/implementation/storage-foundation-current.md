# Storage Foundation Current State

Status: `MARKET_EVENT_SLICE_OPERATIONAL_RESEARCH_STORAGE_PENDING`
Updated: 2026-08-05 JST

## 結論

Storage Foundation全体は未完成だが、最初の実利用sliceであるMarket Event / Calendarは、GitHub canonical knowledge、append-only ledger、D1 current projection、Workers read-only deliveryまで接続され、運用可能になった。

過去の`PLANNING_COMPLETE_IMPLEMENTATION_NOT_STARTED`は現在の正本ではない。

一方で、R2 evidence storage、Mac DuckDB research warehouse、PIT価格ストア、Signal Store、large backtest、full transactional deliveryは未実装。Market Event sliceの完了をStorage Foundation全体の完了として扱わない。

## Adopted authority

- GitHub = validated knowledge / contracts / small auditable canonical data
- D1 = operational append-only ledger + current projection
- Workers Static Assets = public static shell
- Worker API = public GET-only market event projection
- generated JSON / ICS = last-known-good snapshot fallback
- R2 = private evidence / export / backup（未接続）
- Mac DuckDB / SQLite = heavy research warehouse / licensed data / raw cache（PIT価格ストア未実装）
- KV = disposable cache / dedupe only（未接続）
- Google Calendar = optional one-way delivery projection（API同期未実装）

Cloudflare Access / Zero Trustは現在のpublic read-only Calendar runtimeでは使用しない。

## Operational Market Event slice

実装済み:

- deterministic event / revision / source / decision / delivery IDs
- append-only JSONL contract
- local transactional SQLite adapter
- D1-compatible event/revision/source/decision/outbox schema
- current projection reconstruction
- source checkpoint / review task / calendar sync state
- generated JSON / ICS fallback
- Workers Static Assets UI
- public read-only Worker API
- tokenized LIVE ICS
- manual D1 sync workflow
- D1 read-only/no-trigger audit
- production verification

Current production state:

- Worker: `https://alpha-pon.m-shogo-0409.workers.dev`
- Calendar: `https://alpha-pon.m-shogo-0409.workers.dev/calendar/`
- D1: `alpha-pon-market-events`
- canonical rows: 12
- remote rows: 12
- remote triggers: 0
- legacy marker: 0

GitHub Actions Run `30970892738`はdry-runでsuccessし、added / updated / removed candidates / collisionsはすべて0。applyは不要だった。

## Security / operating boundary

- public write APIなし
- D1 destructive deleteなし
- D1 bootstrap / migration再実行なし
- Access / Zero Trust追加なし
- billing / credit card変更なし
- schedule未追加
- Secret値をrepo / log / artifactへ保存しない
- licensed market dataは明示許諾までMac local only
- generated outputを手編集しない

Repository Secret names:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_READ_API_TOKEN`

`production` Environment Secret name:

- `CLOUDFLARE_D1_EDIT_API_TOKEN`

## Implemented foundations

### Contracts

- event/status/priority/time precision enums
- append-only revision model
- deterministic identity
- freshness/staleness fields
- delivery outbox model
- current projection reconstruction
- fail-closed validation

### Storage adapters

- repo-local JSONL
- local SQLite
- D1-compatible schema
- deterministic export / diff

### Delivery projection

- Worker GET API
- LIVE ICS
- SNAPSHOT JSON / ICS
- Web/PWA display

## Not implemented yet

### Research storage

- PIT-safe price store
- benchmark store
- corporate action revision handling
- Signal Store
- Event Study datasets
- actual Net Alpha records
- Mac DuckDB warehouse integration
- licensed data ingestion boundary implementation

### Evidence / backup

- R2 evidence object store
- D1 scheduled export
- restore drill
- retention policy automation

### Notification / delivery

- full outbox sender
- LINE consolidated delivery integration
- failure retry / delivery receipt audit across all channels

### Calendar collection

- official-source collector
- deterministic schedule ingestion from TDnet / EDINET / JPX / IR
- repeated dry-run and idempotency evidence
- approved schedule activation

## Next safe slices

1. ローカル未コミットLINE通知統合を保護し、test / dry-run付きで完成させる
2. Research OSへ最初のEdge、Research Log、Checkpointを登録する
3. PIT価格ストアのprovider interface / schema / validator / append-only writer / deterministic fixturesを実装する

外部credentialがなくても、schema、tests、fixtures、runbook、local-only boundaryは先に完成させる。
