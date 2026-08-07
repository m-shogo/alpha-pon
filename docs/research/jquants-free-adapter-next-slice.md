# J-Quants Free `PriceProvider` Adapter — v1

Status: `IMPLEMENTED_CONTRACT_REAL_EDGE_CASE_MEASUREMENT_PENDING`
Updated: 2026-08-07 JST
Depends on: [PIT Price Store v1](pit-price-store.md)

J-Quants は Edge を発見する主役ではなく、価格反応と予想結果を検証する基盤として扱う。

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

永続化はさらに`--append-local`が必要。保存先はgitignoredのlocal-only領域:

```text
research/prices/jquants-free/<code>.jsonl
```

runnerは`umask 077`を使用する。

## Fixture validation

`tests/research/jquants-free-provider.test.ts`で実APIなしに以下を固定する。

- Free entitlement contract
- 84-day observation boundary
- TSE 15:00 / 15:30 close transition
- 4桁/5桁code matching
- unadjusted OHLC mapping
- unknown missing-pattern fail-closed
- retrievedAt / source code boundary
- provider batch consistency
- benchmark/multi-code rejection

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
- 複数provider/planの同日データをsource/providerPlan指定なしに黙って1件選ばない。
- credentials不足・J-Quants障害をLINE/daily本体へ伝播させない。
- adjusted seriesをrevision-awareでないPIT storeへ混ぜない。
- benchmark entitlementを推測しない。
- 実LINE送信・自動発注・課金設定変更は行わない。

## Definition of done

- [x] `PriceProvider`適合adapter
- [x] Free capabilities / entitlement boundary
- [x] `DailyQuote` → `PitPriceRecordInput` fixture mapping test
- [x] explicit-network / dry-run-by-default local CLI
- [x] credentials-missing non-fatal behavior
- [x] local-only append path
- [x] Free delay / rolling history / TOPIX entitlementを公式案内に合わせて固定
- [ ] missing/no_trade/suspensionのreal row pattern実測
- [ ] exact delayed intraday availabilityのreal measurement
