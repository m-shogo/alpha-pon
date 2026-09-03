# Storage Foundation Current State

Status: `OPERATIONAL_SLICES_GREEN_REAL_MARKET_AND_RECOVERY_PENDING`
Updated: 2026-09-03 JST
Authority: `docs/decisions/2026-08-03-alpha-pon-storage-architecture-v1.md`

## 結論

Storage Foundation全体は未完成です。ただし、2026-08-05時点の「Market Event sliceだけが運用可能」「PIT価格ストアは未実装」という状態は現在の実装を表していません。

現在は大きく次の3段階です。

1. **Market Event / Calendar operational slice** — production運用可能
2. **Research / PIT Price software foundation** — contract・validator・local-only境界までCI固定済み
3. **Real-market / recovery / large research storage** — まだ完了していない

特にPIT Price Storeは `software implementation green` ですが、実issuer・TOPIX・sector benchmark・Corporate Action Evidenceを同じPIT契約で通した `real-market pilot green` ではありません。この2つを混同しません。

## Adopted authority

- GitHub = validated knowledge / contracts / small auditable canonical data
- Cloudflare D1 = operational append-only ledger + current projection
- Workers Static Assets = public static shell
- Worker API = public GET-only operational projection
- generated JSON / ICS = last-known-good snapshot fallback
- R2 = private evidence / export / backup（未接続）
- Mac local DuckDB / SQLite = heavy research warehouse / licensed data / raw cache
- KV = disposable cache / dedupe only（未接続）
- Google Calendar = optional one-way delivery projection（API同期未完了）

### Public read-only runtime boundary

現在のOwner Web / Market Event APIは **public read-only** を採用しています。

- Cloudflare Access / Zero Trustは現在のpublic read-only runtimeでは使用しない
- browser向けpublic write APIを作らない
- D1 write token、calendar feed token、licensed/raw/private evidenceをbrowserへ出さない
- private/write/admin/evidence surfaceを将来追加する場合はdeny-by-defaultにする

この境界は `docs/implementation/cloudflare-workers-static-assets-runbook.md` をruntime正本とします。

## Operational Market Event / Calendar slice

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
- Calendar V2 responsive/accessibility contract

Production boundary:

- Worker: `https://alpha-pon.m-shogo-0409.workers.dev`
- D1: `alpha-pon-market-events`
- public dynamic APIはGET専用
- public browser write APIなし
- Cloudflare Accessなし
- tokenized ICSだけsecret tokenで保護

Cloudflare Buildsは2026-09-03時点で再びproduction deployment成功まで到達しており、旧build-token blockerは #1500 で完了扱いになっています。

## Research / PIT foundations implemented

### Research OS

- Edge registry / queue / checkpoint / immutable research log
- Historical Analog / Study / lineage projection
- owner-safe generated Research projection
- malformed / future / integrity不整合のfail-closed境界
- generatedAt と latestResearchAt の分離
- Owner Research Dashboard production delivery

ResearchのUI/visual polishはStorage Foundationの完了条件とは分離し、#1734で追跡します。

### PIT Price Store v1

Software foundationは実装済みです。

- provider contract / schema / validator
- append-only writer / immutable revision chain
- deterministic content hash / supersedes boundary
- selector / provider ambiguity guard
- four-timestamp PIT contract
- local-only filesystem / symlink / hard-link boundary
- J-Quants Free adapter
- issuer / TOPIX / sector pinの上位層PIT再検証
- recommendation / quantitative outcome等のrevalidation
- synthetic fixture / CI regression coverage

Canonical detail: `docs/research/pit-price-store.md`

ただし次は未完了です。

- first governed **real issuer** security series accepted into local Price Store
- licensed/allowed PIT **TOPIX** source for the real pilot
- licensed/allowed PIT **sector benchmark** source for the real pilot
- measured horizonを覆う **Corporate Action Evidence / Clearance**
- real-market pilotのreadback / replay / provenance evidence

したがって、PIT Price Storeを「未実装」とも「実データ検証まで完了」とも扱いません。

## Still incomplete

### Research execution storage

- Signal Store（Edge / Market EventからBacktest入力signalを自動生成）
- executable Event Studyのreal-market接続
- actual Net Alphaのreal-market records
- Mac DuckDB warehouse integration
- large backtest / bulk joinsのwarehouse運用

これらはreal-market PIT pilotより先にProduction扱いしません。

### Evidence / backup / recovery

- R2 private evidence object store
- D1 scheduled logical export
- hash manifestを伴うbackup retention
- restore rehearsal
- restore後のprojection rebuild / Calendar reconciliation / notification dedupe audit

### Delivery

Market Event outbox schema / ledgerは実装済みですが、全channelを横断する最終的なtransactional dispatcher / retry / receipt / dead-letter運用はStorage Foundation全体として未完了です。

LINE側に既存のconsolidated delivery foundationがあっても、「全channel transactional delivery完成」とは扱いません。

### Official-source collection

個別source adapter / scannerは存在しますが、TDnet / EDINET / JPX / IR等をStorage Foundationの統一checkpoint・license・PIT・outbox境界で反復運用するcollector層は、sourceごとにacceptance evidenceが必要です。存在するscannerを一括して「collection完成」とは扱いません。

## Security / operating boundary

- public write APIなし
- production / shadow / local testを混同しない
- D1 destructive deleteを通常運用にしない
- Secret値をrepo / log / artifact / generated JSONへ保存しない
- licensed market dataは許諾確認までMac local only
- generated outputを手編集しない
- Cloudflare resource / billing / Accessを「昔の計画に書いてあるから」という理由だけで追加しない

## Next safe slices

優先順は次です。

1. **Real-market PIT pilot**
   - issuer / TOPIX / sector / corporate actionを同一PIT契約でlocal-onlyに検証
   - licenseとprovenanceを先に固定
   - future reference / revision / double-adjustmentをfail-closedで再確認
2. **Signal Store contract**
   - real-market pilotで確定したPIT price/evidence境界を入力にする
   - Edge / Market EventからdeterministicなBacktest inputを生成
3. **Executable Event Study / actual Net Alpha**
   - real signal + real price + benchmark + corporate action clearanceが揃ってから測る
4. **Recovery foundation**
   - R2 / D1 export / manifest / restore drillは外部resource判断と分離し、schema・manifest・dry-run contractを先に実装できる

外部credentialや利用許諾が無い状態で、実市場データをfixtureへ偽装したり、real-market pilot完了扱いにしてはいけません。
