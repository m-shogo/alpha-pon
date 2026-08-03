# Alpha Pon Storage Architecture v1 — Final Decision

Status: `ADOPTED_FOR_INCREMENTAL_IMPLEMENTATION`
Date: 2026-08-03 JST
Supersedes for implementation details: `docs/alpha-pon-data-storage-architecture.md`
Related: `docs/market-event-calendar-implementation-plan.md`, Issue #2

## 1. Decision

Alpha Ponは、1つの保存先へ全データを集約しない。次の責務分離を正式採用する。

| 層 | 正式な役割 | 正本にするもの |
|---|---|---|
| GitHub private repo | Knowledge / Contract | schema、migration、Edge定義、判定ルール、検証済み研究結論、失敗記録、再現script、small fixture |
| Cloudflare D1 | Operational Ledger / Current Projection | event revision、decision snapshot、watch state、notification outbox/delivery、calendar sync、source checkpoint |
| Cloudflare R2 private | Evidence / Export / Backup | 許諾範囲内の公式資料snapshot、D1 export、生成物、圧縮backup、大きな監査証跡 |
| Mac local DuckDB | Research Warehouse | 株価・benchmark・event study・backtest・bulk joins・licensed market data・重い計算 |
| Cloudflare KV | Disposable Cache | 再生成可能な短期cacheのみ |
| Google Calendar | Delivery Projection | 未来イベントとreminder。正本にはしない |

この構成は無料枠から開始し、実測で制約に達するまで有料DBや自前VPSへ移行しない。

## 2. Reviewで修正した重要点

### 2.1 D1を「現在値だけ」のDBにしない

D1にはcurrent stateだけでなく、運用上のappend-only ledgerも保持する。

最低限:

- `market_events`
- `event_revisions`
- `event_sources`
- `decision_snapshots`
- `watchlist_states`
- `source_checkpoints`
- `delivery_outbox`
- `alert_deliveries`
- `calendar_sync_state`
- `review_tasks`

`market_events`や`watchlist_states`はcurrent projectionであり、`event_revisions`と`decision_snapshots`から再構築可能にする。更新で過去判断を上書きしない。

### 2.2 GitHubへ毎時のraw研究を無制限に積まない

GitHubへ昇格するのは次だけ。

- 人が読み返す価値があるcurated case
- 検証可能なEdge hypothesis
- reject/failure reason
- schema / tests / migration
- frozen research definition
- periodic audit snapshot
- production ruleへ昇格した知識

高頻度polling結果、重複source、巨大JSON、DB、PDF、market dataはGitHubへ置かない。

Knowledge promotion lifecycle:

`OBSERVED -> CURATED -> VALIDATED -> PRODUCTION_RULE`

自動収集やAI生成だけで`PRODUCTION_RULE`へ昇格させない。

### 2.3 Pagesをイベント更新ごとに再ビルドしない

Webは次の二層にする。

1. Cloudflare Pages / Static Assets: UI shell、icons、static code
2. Worker API + D1: 最新イベント、判断状態、通知状態

既存の`apps/web/public/generated/alpha-pon-data.json`は廃止せず、次の役割へ変更する。

- last-known-good fallback
- offline/PWA cache
- release checkpoint
- disaster recovery snapshot

通常のイベント更新はD1とAPIだけで反映し、Git commitやPages buildを発生させない。

### 2.4 無料Workerに重い処理を載せない

Workers Freeでは、次の軽い処理だけを担当する。

- 公式feed/indexの差分確認
- conditional request
- small JSON/XML normalization
- source hash / dedupe
- D1 transaction
- notification/calendar outbox dispatch
- lightweight API response

次はMac local、既存scheduled research、または必要に応じてGitHub Actionsへ残す。

- PDF全文解析
- OCR
- 大規模HTML解析
- 全銘柄一括backtest
- 大きなParquet生成
- LLMによる深い分析
- 大量の価格join

無料Workerの役割は「高速な見張り番」であり、「研究所」ではない。

## 3. Source of Truth

### 3.1 Rules

1. GitHub schema/config/tests
2. versioned migration
3. D1 runtime representation

D1の値がGitHub contractに反する場合はfail-closed。

### 3.2 Operational events and decisions

1. D1 append-only ledger (`event_revisions`, `decision_snapshots`)
2. D1 current projection
3. R2 periodic immutable export
4. generated JSON/ICS
5. Google Calendar

Google Calendarの手動変更をAlpha Ponへ自動逆流させない。

### 3.3 Research

1. contemporaneous source metadata + permitted raw snapshot
2. frozen research definition
3. Mac DuckDB calculation
4. GitHub validated conclusion/audit snapshot

結果を見た後にpre-event score、仮説、entry条件を書き換えない。

## 4. Privacy, licensing, and access

Alpha Pon Webは個人用private applicationを初期状態とする。

- Cloudflare Accessを前段に置く
- allow対象はユーザー本人のemailのみから開始
- deny-by-default
- R2 bucketはprivate
- presigned URLまたはauthenticated Worker経由だけで資料を読む
- API token、OAuth token、Calendar credentialはCloudflare Secretsまたはlocal secret store
- repo、generated JSON、browser bundleへcredentialを置かない

Licensed market dataは、利用条件を明示確認するまでMac localのみを既定とする。R2、D1、Webへ複製・再配布しない。許諾が確認できたデータだけ`license_class`に従って保存先を拡張する。

`license_class`候補:

- `PUBLIC_METADATA`
- `PUBLIC_OFFICIAL_DOCUMENT_PRIVATE_COPY`
- `LICENSED_LOCAL_ONLY`
- `LICENSED_CLOUD_PRIVATE_ALLOWED`
- `NO_PERSISTENCE`

## 5. Environment separation

無料枠でも最初から環境を分ける。

- `alpha-pon-prod`: 通知・Calendar・本人用Webが読む
- `alpha-pon-shadow`: 新Edge、新score、migration rehearsal
- local/test DB: unit/integration test

ProductionとShadowのデータを同じtableのflagだけで混在させない。Production判定はShadow結果を自動採用しない。

## 6. Reliability contract

### 6.1 Idempotency

- deterministic `event_id`
- unique `source_fingerprint`
- unique delivery key: `channel + event_id + revision + notification_type`
- Calendar event IDをD1管理
- retryで二重通知・二重予定を作らない

### 6.2 Transactional outbox

D1更新と外部通知を直接一処理で完了扱いしない。

1. event/decision revisionをtransactionで保存
2. `delivery_outbox`へ配送要求追加
3. dispatcherがLINE/Web Push/Google Calendarへ送る
4. success/failure/retryを`alert_deliveries`へ保存
5. retry上限後はdead-letter状態へ

これにより、DB更新だけ成功して通知が消える事故を防ぐ。

### 6.3 Staleness

全projection/API responseへ次を付ける。

- `generated_at`
- `last_successful_source_check_at`
- `source_checkpoint`
- `is_stale`
- `stale_reason`

古いデータを最新として表示しない。

## 7. Backup and recovery

- D1 Time Travelは補助。唯一のbackupとは扱わない
- daily D1 logical exportをR2へ保存
- weekly Mac DuckDB compressed snapshotをR2へ保存
- exportにschema version、row counts、SHA-256 manifestを付ける
- monthly restore drill
- restore後にprojection rebuild、Calendar reconcile、notification dedupe auditを実行

D1 exportはWorker cron内ではなく、Mac launchdまたはscheduled CIの低優先jobで実行する。正確な時刻は不要だが失敗通知とreadbackを必須にする。

## 8. R2 retention

R2はprivate evidence storeとして使うが、無制限保存しない。

- high-priority misconduct / formal report: long-term
- ordinary source snapshots: compressed + retention
- transient API response: 7–30 days
- operational logs: 30–90 days
- DB exports: daily 14、weekly 12、monthly 24を初期目安
- duplicate objects: content hashで排除

公式資料でも著作権・利用条件を確認し、private evidence purposeを超えて公開配布しない。

## 9. Existing Alpha Pon migration

現在の資産を捨てずに移行する。

対象例:

- `data/alpha-pon-jobs.db`
- `data/hypothesis_outcomes.db`
- existing JSONL/YAML research records
- generated `alpha-pon-data.json`
- notification dedupe files
- run cursors

移行方針:

1. current files/DB inventoryを生成
2. data classとownerを付与
3. local adapterを作る
4.同じinterfaceのD1 adapterを作る
5. dual-read audit
6. shadow dual-write
7. row count/hash/semantic comparison
8. production readをD1へ切替
9. local artifactsをrollback用に一定期間保持

一括置換しない。

## 10. Cost and quota guard

無料枠を安全に使うため、使用量を監視する。

- D1 rows read/write
- D1 database size
- Worker requests/CPU failures/subrequests
- R2 storage/Class A/Class B operations
- Pages builds

初期threshold:

- 70%: warning
- 90%: non-critical pollingを抑制
- 100%近傍: fail-closed、重要watchlistだけ継続

無料枠超過を避けるため、自動で有料契約へ変更しない。

## 11. Implementation order

### Phase 0 — Contract first

- storage classification types
- source/license classification
- D1 schema v1
- migration policy
- secret policy
- local path contract
- adapter interface
- tests

### Phase 1 — Local compatibility

- existing SQLite/JSONL inventory
- local operational repository adapter
- event/decision append-only ledger
- outbox contract
- generated snapshot v2

### Phase 2 — Cloudflare prototype

- D1 prod/shadow
- Worker health endpoint
- one official low-volume source
- D1 write/readback
- outbox dry-run
- quota metrics

### Phase 3 — Evidence and recovery

- R2 private bucket
- permitted snapshot writer
- D1 export
- manifest/hash validation
- restore rehearsal

### Phase 4 — Delivery

- Pages static shell
- authenticated Worker API
- existing mobile UI adaptation
- `/calendar`
- homepage decision queue
- Google Calendar one-way sync

### Phase 5 — Monitoring expansion

- TDnet/EDINET/JPX/issuer IR source adapters
- earnings/calendar feeds
- Personal Shock same-day detection
- event follow-up scheduler
- D+1/D+5/1m/3m review tasks

## 12. Definition of Done for the free prototype

- Mac停止中でも既知イベントと現在判断をprivate Webで読める
- 1つ以上の公式sourceをWorkerが差分監視できる
- event revisionがD1へappend-only保存される
-同じsourceを再取得してもduplicateにならない
- notification outboxがdry-run/readback可能
- Google Calendarへ同一予定を重複なくupsertできる
- R2またはlocal exportからD1を復旧できる
- generated JSON fallbackで最低限の画面が開く
- private access、secret scan、license guardが通る
- ProductionとShadowが分離している
- SNSをsource・score・notification triggerに使用しない

## 13. Final assessment

この構成は「完璧」ではなく、現在のAlpha Ponに対して最も壊れにくく、無料で始めやすく、将来の有料化・PostgreSQL移行にも逃げ道がある構成として採用する。

今はDB製品を増やすことより、append-only ledger、PIT、outbox、license boundary、backup/restoreを先に実装することが重要。
