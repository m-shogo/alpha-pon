# Alpha Pon データ保存アーキテクチャ

Status: `PLANNING_APPROVED_FOR_PROTOTYPE`
Last updated: 2026-08-03 JST
Scope: 無料運用から始め、Edge監視・重要イベント・判断履歴・研究データを安全に蓄積する

## 0. 結論

Alpha Ponのデータは1か所へ集約しない。

- **GitHub private repo**: 知識・ルール・契約・人がレビューする小さな正本
- **Macローカル**: 大容量研究用warehouse、ライセンス付き市場データ、raw cache、重いbacktest
- **Cloudflare D1**: Web/通知/カレンダーが現在使う運用状態
- **Cloudflare R2**: 大きな原資料、raw snapshot、export、backup
- **Cloudflare KV**: 再生成可能なcacheと短期dedupeだけ
- **Google Calendar**: 予定と通知の投影先。正本にはしない

最初は無料枠で開始する。GitHubやMacだけを唯一の正本にせず、用途ごとに責任を分ける。

---

## 1. 保存対象を6種類に分ける

### A. Knowledge / Contract

例:

- Edge定義
- 不祥事score定義
- hard blocker
- event schema
- notification rule
- Source policy
- Historical Analogの要約
- 仮説、反証条件、昇格条件
- migration、validator、tests

保存先: **GitHub**

理由:

- diffで変更理由を追える
- review可能
- 古いルールへ戻せる
- AIや自動処理が勝手にproduction ruleを変更しにくい

### B. Curated Research Records

例:

- 事件ID
- 企業コード
- 発生日
- source URL / publishedAt / retrievedAt
- 当時知り得た事実
- score snapshot
- decision state
- outcome review
- Historical Analog relation

保存先:

- 小規模・人が読めるappend-only JSONL: **GitHub**
- 件数・更新頻度が増えたら: **D1**
- 定期的にD1からGitHubへ監査snapshotをexport

### C. Operational Current State

例:

- 現在のwatchlist
- BUY WATCH / WAIT / BLOCK / ABSTAIN
- 次の重要イベント
- 通知済み状態
- source dedupe key
- last checked timestamp
- Google Calendar sync ID
- user acknowledgement
- Web UI filter / preference

保存先: **Cloudflare D1**

これはWeb、通知、Calendar syncが高速に読む現在状態。GitHub commitを毎回作る対象にはしない。

### D. Raw / Large Objects

例:

- 公式PDF
- TDnet/EDINET/JPX response snapshot
- API raw response
- generated reports
- chart image
- large JSON export
- Parquet / compressed dataset
- D1 backup export

保存先:

- 主保存: **Cloudflare R2 private bucket**
- 作業cache: **Macローカル**

GitHubには大きなPDF、DB、raw market dataを入れない。

### E. Research Warehouse

例:

- 日次株価
- benchmark / sector return
- event study table
- 候補企業全履歴
- backtest result
- counterfactual twin候補
- bulk joins
- feature dataset

保存先: **MacローカルのDuckDBまたはSQLite**

推奨初期構成:

```text
~/Library/Application Support/alpha-pon/
  research.duckdb
  raw-cache/
  exports/
  backups/
```

このディレクトリはGit管理しない。

Macは重い分析に向くが、唯一の正本にはしない。重要な研究結論・schema・小さな監査snapshotはGitHubへ戻し、raw/export backupはR2へ保存する。

### F. Cache / Delivery Projection

例:

- homepage latest card JSON
- event feed cache
- short-lived source result
- notification dedupe cache

保存先: **Cloudflare KV** または静的generated JSON

KVはeventual consistencyのため、判断状態、position、通知履歴、Calendar syncの唯一の正本にはしない。

---

## 2. Source of Truth hierarchy

### 2.1 Rule authority

1. GitHub schema / config / docs / tests
2. versioned migration
3. D1 runtime representation

D1の値がGitHub contractに反する場合、fail-closedにする。

### 2.2 Event authority

1. Alpha Pon event ledger
2. D1 current projection
3. generated JSON / ICS
4. Google Calendar

Google Calendar上の手動編集を自動で正本へ逆流させない。

### 2.3 Research authority

1. contemporaneous source metadata and raw snapshot
2. frozen research definition
3. local warehouse calculation
4. GitHub audit snapshot / conclusion

結果を見た後に当時のscoreや仮説を書き換えない。

---

## 3. GitHubに入れるもの / 入れないもの

### 入れる

- code
- tests
- schema
- migrations
- edge registry
- notification rules
- source metadata
- manually curated case summaries
- small JSONL / YAML / CSV
- research conclusions
- failure / rejection logs
- reproducibility scripts
- small frozen fixtures

### 入れない

- secrets / OAuth token
- full database file
- large price history
- high-frequency logs
- raw licensed market data
- copied full news articles
- large official PDF collections
- temporary cache
- generated file that changes every few minutes

GitHubは知識と契約のversion controlであり、runtime databaseやdata lakeではない。

---

## 4. Cloudflare D1の役割

初期table候補:

- `companies`
- `market_events`
- `event_revisions`
- `event_sources`
- `watchlist_states`
- `decision_snapshots`
- `alert_deliveries`
- `source_checkpoints`
- `calendar_sync_state`
- `edge_candidate_states`
- `review_tasks`

設計原則:

- UUID / deterministic event ID
- `published_at`, `retrieved_at`, `effective_at`, `first_executable_at`を分離
- updateで履歴を消さずrevision tableへ追記
- current stateはprojectionとして再構築可能にする
- source hashでdedupe
- indexをticker、event date、status、priority、updatedAtへ付ける
- bulk raw本文はR2へ置きD1にはobject keyとhashだけ保存

無料運用では1 DBを運用current state、必要なら1 DBをshadow/testへ分ける。

---

## 5. Cloudflare R2の役割

private bucket例:

```text
alpha-pon-raw/
  official-sources/YYYY/MM/DD/
  event-snapshots/{eventId}/
  market-data/YYYY/MM/
  reports/YYYY/MM/DD/
  db-exports/YYYY/MM/DD/
  backtests/{edgeVersion}/
```

各objectにmetadataを付ける:

- source URL
- fetchedAt
- publishedAt
- content hash
- mime type
- issuer / ticker
- event ID
- license class
- retention class

ニュース本文は原則保存せず、URL・見出し・publishedAt・必要最小限の事実要約を保存する。会社・当局の公式資料も利用条件を確認し、公開Webへそのまま再配布しない。

---

## 6. Macローカルの役割

Macは次の作業場にする。

- bulk data import
- DuckDB joins
- event study
- backtest
- chart generation
- PDF inspection
- source normalization
- licensed data processing
- large report generation

ただしMac依存を避けるため:

- schema / scriptsはGitHub
- raw重要snapshotはR2
- weekly compressed warehouse backupはR2
- research conclusionはGitHub
- runtime current stateはD1

Macが停止していても、Cloudflare上の監視・通知・Web閲覧は最低限動く設計にする。

---

## 7. 無料枠での初期構成

### Cloudflare Workers Free

- official source polling
- event normalization
- D1 upsert
- alert candidate generation
- Google Calendar sync trigger
- generated feed API

Free plan CPUとsubrequest制約があるため、全市場を1回で走査せずsource別・ticker batch別に分割する。

### D1 Free

用途は運用current state中心。bulk market dataやPDFを保存しない。

### R2 Free

公式資料snapshot、export、backupへ使用。10GBを超える前にretention policyを導入する。

### Pages / Static Assets

Web UIを配信。公開用generated dataにはprivate source本文やcredentialを含めない。

---

## 8. Backup / Restore

最低限:

- D1: daily logical export to R2
- R2: object version naming + content hash
- GitHub: immutable history
- Mac warehouse: weekly compressed snapshot to R2
- restore drill: monthly

復旧順:

1. GitHubからschema/migration取得
2. D1 latest export復旧
3. R2 raw snapshotとのhash照合
4. projection再生成
5. Google Calendar再同期
6. notification dedupe state確認

---

## 9. Data retention

- Rule / hypothesis / decision history: 原則無期限
- Event source metadata: 原則無期限
- Official raw snapshot: 重要案件は無期限、通常案件は圧縮・期限設定
- Temporary API cache: 7〜30日
- High-frequency operational logs: 30〜90日
- Generated UI snapshots: latest +重要checkpoint
- Raw licensed market data: ライセンス条件に従いprivate storageのみ

---

## 10. Migration roadmap

### Phase 0

- storage classification enum
- data ownership document
- secret / license policy
- local ignored directories

### Phase 1

- D1 schema v1
- event/current state migration
- local adapterとD1 adapterを同じinterfaceで実装
- dry-run / audit

### Phase 2

- R2 private bucket
- official source snapshot writer
- D1 object reference
- hash verification

### Phase 3

- WebをD1 current stateまたはgenerated APIから読む
- Calendar sync stateをD1管理
- alert delivery ledger

### Phase 4

- local DuckDB research warehouse
- D1/R2 export-import
- PIT-safe backtest dataset
- regular backup/restore test

---

## 11. 採用判断

初期採用:

- GitHub: YES
- Mac DuckDB/SQLite: YES
- Cloudflare D1 Free: YES
- Cloudflare R2 Free: YES
- Cloudflare KV: CACHE ONLY
- Google Calendar: DELIVERY ONLY
- paid database: NOT YET
- self-managed VPS/PostgreSQL: NOT YET

有料化条件:

- D1 daily limitに継続的に達する
- 500MB/databaseを超える
- monitoring frequencyを上げる必要がある
- long-running source collectionがFree CPU内に収まらない
- Web/notification userが増える
- stronger backup retentionや30-day recoveryが必要

無料枠の制約が実測で問題になるまで、有料DBや自前サーバーを先に導入しない。
