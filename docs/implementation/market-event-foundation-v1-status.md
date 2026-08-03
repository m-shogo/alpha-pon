# Market Event Foundation v1 — current status

Updated: 2026-08-03 JST
Status: `READY_PENDING_CLOUDFLARE_REGISTRATION`
Branch: `agent/market-event-calendar-foundation`
Draft PR: `#4`
CI evidence: workflow `CI` run `30796420646` — `success`

## 結論

Cloudflareアカウント上の外部登録・binding・secret・Access設定を除き、Market Event Calendar v1のrepo内実装とproduction-equivalent CI検証は完了した。

次の段階はCloudflare Pages / D1 / Access / tokenized ICSをShadow接続すること。現時点ではCloudflare resource、billing、Google Calendar、LINE、Web Push、production score/thresholdを変更していない。

## CIで成功した範囲

- 既存Alpha Pon core CLI / research contracts
- core / tests / scripts TypeScript typecheck
- 既存test suite
- market event contract verification
- D1-compatible SQLite migration verification
- event registration → append-only revision → SQLite → JSON / ICS end-to-end
- deterministic D1 bootstrap export
- Pages Functions auth / API / tokenized ICS verification
- pre-Cloudflare readiness audit
- isolated JPX review-checkpoint seed import
- database foreign-key / JSON / current-revision audit
- Web typecheck
- Web lint（warning/errorなし）
- Next.js static export
- Cloudflare Pages output verification

## 実装済み

### Contract / identity

- event / revision / source / decision / delivery contract
- exact / date-only / window / unknown time precision
- unknown-date anti-fabrication guard
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
- event revisions / decision snapshots
- transactional delivery outbox / alert delivery ledger
- calendar sync state / source checkpoints / review tasks
- foreign-key / JSON / current-revision audit
- safe deterministic D1 bootstrap export using `INSERT OR IGNORE`

### Calendar delivery

- generated JSON snapshot
- RFC5545-style ICS snapshot
- exact/date/window event output
- unknown date exclusion
- stable UID / revision sequence
- tokenized LIVE ICS from D1
- Apple/Google Calendar URL subscription path
- Google OAuth不要のv1構成

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
- static `robots.txt` with deny-all indexing policy
- security headers
- browser current-day refresh; build時刻を「今日」として固定しない
- browser-safe shared data moduleとserver-only filesystem loaderの分離

### Cloudflare Pages preparation

- Next.js static export
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

- JPX remediation internal review checkpoints 3件
- KDDI / nmsホールディングス / イーエムネットジャパン
- dates explicitly labelled as Alpha Pon internal review dates
- official future filing dateとして断定しない
- no external delivery queued by internal review seeds

## Reviewで発見・修正した主要問題

1. Scheduled dateをevent IDへ含めると延期時に重複する
   - stable occurrenceKeyへ変更
2. Source authorityをevent IDへ含めるとIR/TDnet/JPXで重複する
   - source identityへ分離
3. issuer display nameをIDへ含めると名称変更で重複する
   - code優先identityへ変更
4. Type contractとSQL schemaの不一致
   - occurrence、decision、outbox payload、freshnessを同期
5. dry-run内の同一event複数revisionが同じrevision numberになる
   - input順に仮想contextを更新
6. Next.js server/client境界から`node:fs`がclient bundleへ混入する
   - browser-safe data moduleとserver-only loaderへ分離
7. static exportでmanifest / robots metadata routeが失敗する
   - manifestをforce-static、robotsをpublic static fileへ変更
8. D1 bootstrap親子順テストがcurrent revision参照を誤検知する
   - `event_revisions` INSERT行だけを検査
9. PWA precacheが1件失敗すると全件空になる
   - per-item `Promise.allSettled`へ変更
10. Service workerがtokenized calendar feedをcacheし得る
    - APIと`/calendar.ics`をcache対象外へ変更
11. 内部review seedが公式予定に見え得る
    - `[内部レビュー]`と公式予定ではない説明を追加
12. 空のCI環境で既存`--env-file=.env`コマンドが失敗する
    - offline CI用empty `.env`を明示生成
13. 並行変更中の古いSHA update
    - GitHubの409を尊重し、最新を再取得して差分を再適用

## 自動検証契約

```bash
bash scripts/build-cloudflare-pages.sh
```

この1コマンドに次を集約している。

- contract / schema / local end-to-end
- deterministic D1 bootstrap
- Pages Functions verification
- Cloudflare readiness audit
- isolated seed import / DB audit
- JSON / ICS generation
- existing UI data generation
- web typecheck / lint / Next.js static export
- Pages output verification

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

## 後段へ送るもの

- R2 evidence storage / backup
- Google Calendar API OAuth同期
- Web Push / LINE delivery worker
- full official-source collection adapters
- D1 daily export / restore drill

これらはv1のCloudflare登録ブロッカーではない。

## Completion rule

### `READY_PENDING_CLOUDFLARE_REGISTRATION`

repo実装とCI成功。外部Cloudflare resource未登録。

### `CLOUDFLARE_CONNECTED_SHADOW`

Pages / D1 / Access / tokenized ICSが接続され、実売買判断には未使用。

### `CALENDAR_V1_OPERATIONAL`

LIVE API、SNAPSHOT fallback、calendar subscription、監査、rollbackを実環境で確認。
