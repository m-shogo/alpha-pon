# Workers Static Assets migration — current status

Updated: 2026-08-05 JST
Status: `CALENDAR_V1_OPERATIONAL`
Production base: `https://alpha-pon.m-shogo-0409.workers.dev`
Calendar: `https://alpha-pon.m-shogo-0409.workers.dev/calendar/`
D1 database: `alpha-pon-market-events`
D1 database ID: `7b90faf4-9834-4393-a921-275e0a68b398`

## 結論

Alpha Ponの重要イベントカレンダーは、Cloudflare Workers Static Assets + Worker script + D1の公開読み取り専用構成で運用可能な状態まで到達した。

現在の運用方針は次で固定する。

- Cloudflare Accessを使用しない
- Zero Trustを作成しない
- クレジットカード登録やCloudflare billing変更を行わない
- `/api/market-events*`は公開GET専用
- public browser write APIを作らない
- `/api/calendar-feed-url`は常に404
- `/calendar.ics`は`CALENDAR_FEED_TOKEN`必須
- D1は`READ_ONLY_NO_TRIGGERS`
- D1 bootstrapやmigrationを再実行しない
- GitHub Actions scheduleはまだ追加しない

## 確定済みの外部状態

- Worker: `alpha-pon`
- Production URL: `https://alpha-pon.m-shogo-0409.workers.dev`
- Calendar URL: `https://alpha-pon.m-shogo-0409.workers.dev/calendar/`
- D1 binding: `DB`
- canonical / remote rows:
  - market events: 3
  - event sources: 3
  - event revisions: 3
  - decision snapshots: 3
  - total: 12
- remote trigger: 0
- legacy guard marker: 0
- `PUBLIC_ORIGIN`: configured
- `CALENDAR_FEED_TOKEN`: configured
- repository secret names:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_D1_READ_API_TOKEN`
- `production` environment secret name:
  - `CLOUDFLARE_D1_EDIT_API_TOKEN`

Secret values are not recorded in this repository.

## 実装・修正の証拠

PR #14〜#28で、公開read-only化、DB guard、production verifier、Workers Static Assets移行、月間カレンダー、mobile bottom sheet、LIVE/SNAPSHOT表示の分離、runtime hardening、manual D1 sync、input/token境界の強化を段階的に実装した。

主要な確定事項:

- PR #14: market event APIを公開GET専用へ変更し、Access / `OWNER_EMAIL`依存をruntimeから削除
- PR #15: D1 unavailable時の503契約を実装
- PR #16〜#17: canonical production verifierと本番PASS証拠を追加
- PR #18: Research OS v1を追加（Calendar runtimeとは独立）
- PR #19〜#20: 実月間カレンダーとmobile bottom sheetを追加
- PR #21〜#22: protected manual D1 syncと入力・権限境界を追加
- PR #23〜#24: LIVE表示とSNAPSHOT購読の分離、runtime security hardening
- PR #25〜#28: D1 Token設定経路を安全化し、最終Token import方式へ確定

## D1 dry-run evidence

GitHub Actions Run `30970892738`:

- `Build and review D1 diff`: success
- `Apply reviewed D1 diff`: skipped
- mode: dry-run
- canonical count: 12
- remote count: 12
- added: 0
- updated: 0
- unchanged: 12
- removed candidates: 0
- collisions: 0
- validation errors: 0
- blockers: 0
- apply: 不要

artifact: `cloudflare-d1-market-event-plan-30970892738`

この結果により、canonicalとremote D1は完全一致している。D1 bootstrapやmigrationの再実行は不要。

## Current route authority

| Route | Authority | Contract |
|---|---|---|
| `/`, `/calendar/`, `/_next/*` | Workers Static Assets | public static |
| `/api/generated/*` | Workers Static Assets | generated snapshot |
| `/api/market-events*` | Worker | public GET / D1 read-only |
| `/api/calendar-feed-url*` | Worker | always 404 |
| `/calendar.ics*` | Worker | token required |
| `/healthz*` | Worker | safe runtime readiness |

Broad `/api*` Worker-first routingは禁止。静的`/api/generated/*`をshadowしてはいけない。

## `OWNER_EMAIL` status

`OWNER_EMAIL`はpublic read-only runtime contractには不要で、コードとlocal runtime exampleから除外済み。

残存参照は主に次の用途に限る。

- 「runtimeで不要である」ことを検証するnegative assertion
- 過去のPages / Access設計からの移行記録
- Cloudflare Dashboard上の旧変数を削除可能であることの運用メモ

Cloudflare Dashboardに旧`OWNER_EMAIL`変数が残っている場合、削除は外部作業。削除しても現在のpublic read-only runtimeには影響しない。Secret値や個人メールアドレスはrepoへ記録しない。

## 完了済み

- Workers Static Assets production deploy
- public read-only market event API
- tokenized LIVE ICS
- public SNAPSHOT ICS
- LIVE D1 → SNAPSHOT fallback
- production contract verification
- remote trigger 0 / legacy marker 0
- manual D1 dry-run sync
- canonical 12件とremote 12件の一致確認
- no public write API
- no Access / Zero Trust
- no billing change

## 未完了・後続

Calendar v1の運用開始を妨げない後続作業:

- 公式日程collector
- Google Calendar API同期（必要性を再評価してから）
- D1 export / restore drill
- delivery outboxの実配送接続
- repeated dry-run後のschedule候補提示
- PC / smartphoneの継続visual QA

## Completion states

### `CALENDAR_V1_OPERATIONAL`

LIVE API、tokenized ICS、snapshot fallback、公開read-only境界、監査、manual D1 dry-run一致を実環境で確認済み。

### 将来状態

collector、delivery、restore drill、scheduleは別workstream。Calendar v1 operationalを未完了へ戻す条件にはしない。
