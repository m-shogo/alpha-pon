# J-Quants Free `PriceProvider` Adapter — v1

Status: `IMPLEMENTED_AND_CI_GREEN_REAL_EDGE_CASE_MEASUREMENT_PENDING`
Updated: 2026-08-07 JST
Depends on: [PIT Price Store v1](pit-price-store.md)

J-Quants は Edge を発見する主役ではなく、価格反応と予想結果を検証する基盤として扱う。

## Completed implementation chain

```text
#103 J-Quants Free PIT PriceProvider adapter
#104 J-Quants V2 JST / delayed-date-cap hardening
#105 canonical Price Store schema conformance + default raw-value redaction
```

All three PRs passed their applicable Draft checks and Ready/full CI before merge.

Important boundary: **implementation complete** does not mean the real-price Foundation pilot is complete. Real J-Quants rows remain local-only and the remaining real edge cases below have not been measured yet.

## Current verified Free-plan boundary

2026-08-07時点のJPX/J-Quants公式案内を基準に、Free adapterは次の境界へ固定する。

- plan: `free`
- stock OHLC: available
- rolling history: 2 years
- reporting delay: 12 weeks = 84 calendar days
- TOPIX: Freeでは提供対象外（Light以上）
- broader index datasets: Freeでは提供対象外
- raw data redistribution: authorized扱いにしない
- Alpha Pon license classification: `local_only`

Free entitlementはrolling windowなので、固定日付の`historyFrom`をcapabilitiesへ書かない。取得日の2年前という情報を、永続的な固定開始日と誤認しないためである。

## Existing assets reused

- `src/fetcher/jquants.ts`
  - `isJQuantsConfigured()`
  - `fetchDailyQuotes(...)`
  - V2 Free date capの既定遅延は84日
  - retry / interval / timeout
- `src/research/price-store.ts`
  - `PriceProvider`
  - `PitPriceRecordInput`
  - provider-batch validation
  - append-only local price store

新しいHTTP clientは作らない。

## Implemented v1

### Provider

`src/research/providers/jquants-free.ts`

- `PriceProvider`へ薄く適合
- exactly one security code per fetch
- `seriesKind=benchmark`をfail-closedで拒否
- `plan != free`を拒否
- 4桁codeとJ-Quants 5桁code末尾0を同一securityとして照合
- returned quote code / date range / duplicate dateを検証
- `providerPlan=free`
- `delayDays=84`
- `license=local_only`
- `supportsBenchmarks=false`
- `supportsSectorBenchmarks=false`
- `supportsCorporateActions=false`

### PIT time boundaries

- `dataAsOf`: 当該TSE立会日のclose
  - 2024-11-04以前: 15:00 JST
  - 2024-11-05以降: 15:30 JST
- `observedAt`: trading date + 84 calendar days の23:59:59 JST
  - Free案内は12週間遅延を明示する一方、このadapterが依拠できる精密な日中release timestampは未確定のため、日付境界を早めにbackdateしない
- `retrievedAt`: Alpha Ponの実取得時刻
- `firstExecutableAt`: adapter内部で週末・祝日を推測しない。呼び出し側が明示resolverで供給し、`observedAt`以降であることを強制

### V2 delayed-date cap hardening

PR #104で既存fetcherの危険な境界を修正した。

- cap dateはrunnerのlocal timezoneではなく`Asia/Tokyo`基準
- `from > to`を拒否
- requested `to`だけがcap超過なら`to`のみtruncate
- requested `from`がcapより新しい場合は**別の古い日へ巻き戻さず空結果**
- future-only ineligible requestはV2 network requestを0回にする

これにより「まだ取得できない日を要求したのに84日前の別日の価格が返る」誤対応を防ぐ。

### Price representation

v1は**未調整OHLCだけ**を正本化する。

```text
adjusted: false
adjustmentFactor: 1
corporateActions: []
```

J-Quantsの調整後価格は後日のcorporate actionにより過去系列が再計算され得るため、revision lineageなしにPIT価格として採用しない。

V2 fetcherはnull OHLCを0へnormalizeするため、zero/invalid rowを現段階で`suspended`や`no_trade`へ勝手に分類しない。

```text
status: missing
missingReason: unknown
```

実Freeデータでmissing patternを測定した後だけ分類を細分化する。

### Canonical store conformance

PR #105でfixture recordを実`research/schemas/price-record.schema.json`と`validatePriceRecord(...)`へ通す回帰テストを追加した。

- traded row: schema error 0
- unknown missing row: schema error 0
- securityにbenchmarkが未設定であることは既存設計どおりwarningで保持
- content hashを付与した実append形のrecordまで検証

`PriceProviderBatch`が正しいだけではなく、実際にPIT Price Storeへ入るrecord形までCIで固定する。

## Local CLI

Runner:

```bash
bash scripts/run-jquants-free-price-provider-local.sh
```

flagなしではネットワークを使わず、entitlement/capabilitiesだけを表示する。

実取得は明示flagが必要:

```bash
bash scripts/run-jquants-free-price-provider-local.sh \
  --execute-fetch \
  --code 8136 \
  --from 2026-05-14 \
  --to 2026-05-14 \
  --first-executable-at 2026-08-07T09:00:00+09:00
```

credentials不足は`credentials_missing_nonfatal`でexit 0。LINE/daily本体へ失敗を伝播させない。

### Output safety

PR #105以降、実取得してもconsoleのdefault outputにはraw OHLCVを含めない。

```text
rawValuesIncluded: false
valuesIncluded: false
```

表示対象はcode/date/PIT timestamps/status/source/plan/license/contentHash等のmetadata中心。

raw OHLCVをlocal terminalで明示確認する時だけ追加flagを使う:

```bash
--show-values-local
```

永続化はさらに`--append-local`が必要。保存先はgitignoredのlocal-only領域:

```text
research/prices/jquants-free/<code>.jsonl
```

consoleへ表示する保存先はrepo-relative pathのみで、absolute local filesystem pathを出さない。runnerは`umask 077`を使用する。

## Fixture validation

実APIなしで以下を固定済み。

- Free entitlement contract
- 84-day observation boundary
- TSE 15:00 / 15:30 close transition
- 4桁/5桁code matching
- unadjusted OHLC mapping
- unknown missing-pattern fail-closed
- retrievedAt / source code boundary
- provider batch consistency
- benchmark/multi-code rejection
- JST midnight date-cap transition
- partial eligible range truncation
- future-only range = no network
- canonical Price Store schema conformance
- default raw-value redaction

## Remaining real measurement — non-blocking

コード実装を止めない。実Free credentialsを使えるlocal executorがある時だけ測定する。

- 12週間遅延データが実際に取得可能になる日中時刻
- rolling 2-year boundaryのAPI実挙動
- missing / no_trade / suspensionの実row pattern
- code表現の実例外
- Free entitlement変更の有無

TOPIX / sector benchmarkはFreeで無理に代替せず、Foundation pilot側で別の権利確認済みsourceを選ぶ。

## Guardrails

- 実価格・secret・token・account IDをGitへcommitしない。
- raw J-Quants dataをpublic dashboard/APIへ流さない。
- default console outputにもraw OHLCVを出さない。
- 複数provider/planの同日データをsource/providerPlan指定なしに黙って1件選ばない。
- credentials不足・J-Quants障害をLINE/daily本体へ伝播させない。
- adjusted seriesをrevision-awareでないPIT storeへ混ぜない。
- benchmark entitlementを推測しない。
- delay capより新しいrequestを別日の古い価格へ自動変換しない。
- 実LINE送信・自動発注・課金設定変更は行わない。

## Definition of done

- [x] `PriceProvider`適合adapter — PR #103
- [x] Free capabilities / entitlement boundary — PR #103
- [x] `DailyQuote` → `PitPriceRecordInput` fixture mapping test — PR #103
- [x] explicit-network / dry-run-by-default local CLI — PR #103
- [x] credentials-missing non-fatal behavior — PR #103
- [x] local-only append path — PR #103
- [x] Free delay / rolling history / TOPIX entitlementを公式案内に合わせて固定 — PR #103
- [x] V2 delay capをJST/PIT安全化 — PR #104
- [x] future-only requestの別日巻き戻し防止 — PR #104
- [x] canonical Price Store schema conformance — PR #105
- [x] default console raw-value redaction — PR #105
- [ ] missing/no_trade/suspensionのreal row pattern実測
- [ ] exact delayed intraday availabilityのreal measurement
