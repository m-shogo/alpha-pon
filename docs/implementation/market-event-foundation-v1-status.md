# Market Event Foundation v1 — current status

Updated: 2026-08-03 JST
Status: `PRE_CLOUDFLARE_IMPLEMENTED_PENDING_PR_CI`
Branch: `agent/market-event-calendar-foundation`

## 結論

Cloudflareアカウント上の外部登録・binding・secret・Access設定を除き、Market Event Calendar v1のrepo内実装は完了候補まで進んだ。

ただし、GitHub Actionsによる実checkout上のtypecheck、lint、全検証、Next.js static exportが成功するまでは`GREEN`としない。

## 実装済み

### Contract / identity

- event / revision / source / decision / delivery contract
- exact / date-only / window / unknown time precision
- unknown-date anti-fabrication guard
- event type / status / priority / decision / confidence enums
- stable deterministic event ID
  - 延期で変わらない
  - 証券コードがある場合は会社表示名変更で変わらない
  - IR / TDnet / JPXの取得経路で変わらない
- source / revision / decision / delivery / review task ID
- unsupported non-JSON value fail-closed

### Operational ledger

- append-only JSONL ledger
- transactional local SQLite store
- D1-compatible migration
- event revisions
- decision snapshots
- transactional delivery outbox
- alert delivery ledger
- calendar sync state
- source checkpoints
- review tasks
- foreign-key / JSON / current-revision audit
- safe D1 bootstrap export using `INSERT OR IGNORE`

### Calendar delivery

- generated JSON snapshot
- RFC5545-style ICS snapshot
- exact/date/window event output
- unknown date exclusion
- stable UID / revision sequence
- tokenized LIVE ICS from D1
- Apple/Google Calendar URL subscription path
- Google OAuth not required for v1

### Web / PWA

- `/calendar/`
- mobile one-column agenda
- PC two-column decision cockpit
- category/search/status filters
- today / 7 days / overdue / unknown / completed grouping
- priority / decision / stale visibility
- primary-source links
- checks-before / checks-after
- home next-event card
- LIVE D1 API first, static SNAPSHOT fallback
- responsive AppShell
- PWA manifest / icon / service worker
- API/token feed excluded from service-worker cache
- robots noindex
- security headers

### Cloudflare Pages preparation

- Next.js static export
- generated Route Handlers converted to static output
- legacy company redirect made static-export safe
- Pages catch-all Function
- `_routes.json` limiting Function invocations
- D1 binding name `DB`
- owner-email Access header verification
- encrypted calendar bearer token contract
- health endpoint
- registration runbook
- wrangler/dev vars templates
- production-equivalent Pages build script

### Seed integration

- JPX remediation internal review checkpoints
- dates explicitly labelled as Alpha Pon internal review dates
- JPX primary-source metadata attached
- no external delivery queued by internal review seeds

## Reviewで発見・修正した問題

1. Scheduled dateをevent IDへ含めると延期時に重複する
   - stable occurrenceKeyへ変更
2. Source authorityをevent IDへ含めるとIR/TDnet/JPXで重複する
   - source identityへ分離
3. issuer display nameをIDへ含めると名称変更で重複する
   - code優先identityへ変更
4. Type contractとSQL schemaが一致していなかった
   - occurrence、decision、outbox payload、freshnessを同期
5. `nextEventAt`がpriority順に依存していた
   - chronological minimumへ修正
6. Next.js server redirect / dynamic route handlersがstatic exportを阻害する
   - static generation / client redirectへ変更
7. PWA precacheが1件失敗すると全件空になる
   - per-item `Promise.allSettled`へ変更
8. Service workerがtokenized calendar feedをcacheし得る
   - APIと`/calendar.ics`をcache対象外へ変更
9. 内部review seedが公式予定に見え得る
   - `[内部レビュー]`と公式予定ではない説明を追加
10. seedのretrievedAtが現在時刻より未来だった
    - 2026-08-03 15:45 JSTへ修正
11. CI fileに並行変更があり古いSHA updateが409
    - 最新を再取得し相手変更を保持して更新
12. 別WorkerとPages Functionsが二重実装になった
    - Pages Functionsへ統一して重複を削除

## 自動検証契約

```bash
bash scripts/build-cloudflare-pages.sh
```

この1コマンドに次を集約した。

- contract verification
- schema verification
- local end-to-end
- Pages Functions auth / API / tokenized ICS verification
- Cloudflare readiness audit
- isolated seed import
- database audit
- JSON / ICS generation
- existing UI data generation
- web typecheck
- lint
- Next.js static export
- Pages output verification

CIはこのproduction-equivalent commandを使用する。

## 未完了 — 外部登録以外

- draft PR作成
- GitHub Actions実行
- failing checkがあれば修正
- final diff review

## 未完了 — Cloudflare登録が必要

- Pages project作成 / GitHub接続
- D1 database作成
- Pages projectへD1 `DB` binding
- migration / bootstrap remote適用
- `OWNER_EMAIL` / `PUBLIC_ORIGIN`設定
- encrypted `CALENDAR_FEED_TOKEN`設定
- Cloudflare Access全体保護
- `/calendar.ics`だけspecific bypass + token guard
- production deploy / live verification
- Apple / Google Calendarでtokenized ICS購読

## 明示的に後段へ送るもの

- R2 evidence storage / backup
- Google Calendar API OAuth同期
- Web Push / LINE delivery worker
- full official-source collection adapters
- D1 daily export / restore drill

これらはv1のCloudflare登録ブロッカーではない。

## Completion rule

### `PRE_CLOUDFLARE_IMPLEMENTED_PENDING_PR_CI`

repo実装済み、CI未完了。

### `READY_PENDING_CLOUDFLARE_REGISTRATION`

draft PR CI成功、レビュー上のblocking issueなし。

### `CLOUDFLARE_CONNECTED_SHADOW`

Pages / D1 / Access / tokenized ICSが接続され、実売買判断には未使用。

### `CALENDAR_V1_OPERATIONAL`

LIVE API、SNAPSHOT fallback、calendar subscription、監査、rollbackを実環境で確認。
