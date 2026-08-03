# Market Event Calendar — local quickstart

Status: `LOCAL_ONLY_NO_EXTERNAL_DELIVERY`

この手順はCloudflare、Google Calendar、LINE、Web Pushへ何も送信しない。ローカルSQLiteへ重要イベントを登録し、Web表示用JSONとICSを生成する。

## 1. 基盤検証

```bash
node --import tsx/esm scripts/verify-market-event-foundation.ts
node --import tsx/esm scripts/verify-market-event-schema.ts
node --import tsx/esm scripts/verify-market-event-end-to-end.ts
```

## 2. ローカルDB初期化

書き込み前にdry-runする。

```bash
node --import tsx/esm scripts/market-events.ts init
node --import tsx/esm scripts/market-events.ts init --write
```

既定DB:

```text
data/market-events.db
```

このDBはruntime dataでありGit管理しない。

## 3. 初期review checkpointを確認

次のseedは、公式の未来日程を断定するものではない。JPX改善報告書の提出日から約6か月後に、Alpha Ponが一次情報を再確認するための内部review checkpoint。

```bash
node --import tsx/esm scripts/market-events.ts add \
  --file config/market-events/jpx-remediation-review-checkpoints-2026.json
```

出力されるevent ID、revision番号、previous revision IDを確認してから書き込む。

```bash
node --import tsx/esm scripts/market-events.ts add \
  --file config/market-events/jpx-remediation-review-checkpoints-2026.json \
  --write
```

## 4. 監査

```bash
node --import tsx/esm scripts/market-events.ts audit
node --import tsx/esm scripts/market-events.ts list --priority S0,S1
```

監査が`ok`でない場合、JSON/ICSを公開用に生成しない。

## 5. Web JSON / ICS生成

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

JSONはWebのlast-known-good snapshot。ICSはApple/Google Calendarへ読み込める配信用snapshotであり、Alpha Ponの正本ではない。

## 6. Web確認

```bash
pnpm web:typecheck
pnpm web:build
pnpm web:dev
```

確認URL:

```text
http://localhost:3000/
http://localhost:3000/calendar
```

確認項目:

- スマホ幅で次の重要イベントが読める
- PCではカレンダー幅が拡張される
- `今日 / 7日以内 / 日程未確定 / 結果待ち`が正しく分かれる
- `BUY_WATCH / WAIT / BLOCK / ABSTAIN / INFO`が表示される
- 一次情報なしの内部review checkpointが、公式発表のように見えない
- ICSに`UNKNOWN`日時のイベントが混入しない
- 静的build後もブラウザ上の「今日」が現在日に更新される

## 7. 現時点で行わないこと

- Cloudflare D1/R2/Workers/Pagesの作成
- Cloudflare billing設定
- Google OAuth token作成
- Google Calendarへの実同期
- LINE/Web Pushの実送信
- production score/threshold変更
- Edge研究スケジュールの停止

外部状態の変更は、ローカル検証・CI・dry-run・rollback条件が揃った後の別Phaseで行う。
