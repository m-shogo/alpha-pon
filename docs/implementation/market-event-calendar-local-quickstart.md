# Market Event Calendar — local quickstart

Status: `IMPLEMENTED_PENDING_CI_AND_CLOUDFLARE_REGISTRATION`
Updated: 2026-08-03 JST

この手順はCloudflare、Google Calendar、LINE、Web Pushへ何も送信しない。
ローカルSQLiteへ重要イベントを登録し、Web表示用JSON、ICS、Cloudflare Pages用静的exportを生成する。

## 最短の検証

依存関係を導入後、production相当のbuildを1コマンドで実行する。

```bash
pnpm install --frozen-lockfile
bash scripts/build-cloudflare-pages.sh
```

このscriptは次を実行する。

1. Event contract検証
2. SQLite/D1 schema検証
3. Local DB end-to-end検証
4. Pages Functions認証・ICS検証
5. Cloudflare readiness監査
6. seedを隔離された一時SQLiteへ登録
7. DB audit
8. JSON/ICS生成
9. 既存Alpha Pon Webデータ生成
10. Web typecheck / lint
11. Next.js static export
12. Pages成果物検証

期待結果:

```text
cloudflare-pages-build: ok
```

## 個別検証

```bash
node --import tsx/esm scripts/verify-market-event-foundation.ts
node --import tsx/esm scripts/verify-market-event-schema.ts
node --import tsx/esm scripts/verify-market-event-end-to-end.ts
node --import tsx/esm scripts/verify-pages-market-event-function.ts
node --import tsx/esm scripts/verify-cloudflare-calendar-readiness.ts
```

## ローカルDB初期化

既定DB:

```text
data/market-events.db
```

このDB、WAL、SHMはruntime dataでありGit管理しない。

書き込み前にdry-runする。

```bash
node --import tsx/esm scripts/market-events.ts init
```

問題なければ初期化する。

```bash
node --import tsx/esm scripts/market-events.ts init --write
```

## イベントseed登録

`config/market-events/*.json`は、一次情報で確認できる外部イベントまたは、明示されたAlpha Pon内部review checkpointだけを置く。

登録前dry-run:

```bash
node --import tsx/esm scripts/market-events.ts add \
  --file config/market-events/jpx-remediation-review-checkpoints-2026.json
```

確認項目:

- stable event ID
- revision番号
- source件数
- delivery件数
- 内部reviewが公式予定のように書かれていない
- 未来時刻や架空日時がない

問題なければwriteする。

```bash
node --import tsx/esm scripts/market-events.ts add \
  --file config/market-events/jpx-remediation-review-checkpoints-2026.json \
  --write
```

同じbundleを再投入しても、Event/Revision/Source/Deliveryはidempotentに重複しない。
内容を変更する場合は同じoccurrenceKeyの次revisionとして登録する。

## 監査

```bash
node --import tsx/esm scripts/market-events.ts audit
node --import tsx/esm scripts/market-events.ts list --priority S0,S1
```

監査が`ok`でない場合、JSON/ICS生成やD1 bootstrapを行わない。

監査対象:

- foreign key
- eventにrevisionがあるか
- current revision参照
- JSON列の破損
- 件数
- pending delivery

## JSON / ICS生成

最初にdry-runする。

```bash
node --import tsx/esm scripts/market-events.ts generate
```

問題がなければ生成する。

```bash
node --import tsx/esm scripts/market-events.ts generate --write
```

生成先:

```text
apps/web/public/generated/alpha-pon-events.json
apps/web/public/generated/alpha-pon-events.ics
```

- JSON: Webのlast-known-good SNAPSHOT
- ICS: Cloudflare未接続時のcalendar SNAPSHOT
- D1接続後: WebはLIVE APIを優先し、障害時だけJSONへfallback
- tokenized LIVE ICS: Pages FunctionsがD1から生成

`UNKNOWN`日時はUIには残すがICSから除外する。

## Web確認

```bash
pnpm web:typecheck
pnpm --filter @alpha-pon/web lint
pnpm web:build
pnpm web:dev
```

確認URL:

```text
http://localhost:3000/
http://localhost:3000/calendar/
```

確認項目:

- スマホではカレンダー1列
- PCではカレンダー2列・横幅拡張
- ホームに次の重要イベント
- LIVE/SNAPSHOT状態
- 今日 / 7日以内 / 日程未確定 / 結果待ち
- BUY_WATCH / WAIT / BLOCK / ABSTAIN / INFO
- 一次情報・事前確認・通過後確認
- 内部review checkpointが公式発表に見えない
- static exportで`apps/web/out/calendar/index.html`が生成される
- PWA manifest / service worker

## D1 bootstrapのdry-run

Cloudflare登録前でも、D1へ投入するSQLを安全に確認できる。

```bash
bash scripts/bootstrap-cloudflare-d1.sh \
  --database alpha-pon-market-events \
  --keep-export
```

この段階ではremoteへ書かない。

出力:

```text
data/exports/market-events-d1-bootstrap.sql
```

SQLは`INSERT OR IGNORE`のみで、既存D1行の削除・上書きをしない。

## Cloudflare登録後

次を参照する。

```text
docs/implementation/cloudflare-pages-registration-runbook.md
```

登録後の主要コマンド:

```bash
bash scripts/bootstrap-cloudflare-d1.sh \
  --database alpha-pon-market-events \
  --apply \
  --keep-export
```

## 現時点で行わないこと

- Cloudflare account/project/D1の自動作成
- billing設定
- Access policyの自動変更
- secretのGit保存
- Google OAuth token作成
- Google Calendar APIへの書き込み
- LINE/Web Push実送信
- production score/threshold変更
- Edge研究スケジュール停止

外部状態の変更以外はrepo内に実装済み。最終greenはdraft PRのCI成功後にのみ宣言する。
