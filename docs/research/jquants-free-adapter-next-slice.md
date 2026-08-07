# J-Quants Free `PriceProvider` Adapter — v1

Status: `IMPLEMENTED_AND_CI_GREEN_REAL_EDGE_CASE_MEASUREMENT_PENDING`
Updated: 2026-08-07 JST
Depends on: [PIT Price Store v1](pit-price-store.md)

J-QuantsはEdgeを発見する主役ではなく、価格反応と予想結果をpoint-in-timeで検証する基盤として扱う。

## Completed implementation chain

```text
#103 J-Quants Free PIT PriceProvider adapter
#104 J-Quants V2 JST / delayed-date-cap hardening
#105 canonical Price Store schema conformance + default raw-value redaction
#108 private local price-store 0700/0600 + symlink boundary
#140 private price-store hard-link boundary
#142 Price Store orphan revision-root rejection
#143 Gregorian calendar + query range validation
#144 retrievedAt <= firstExecutableAt PIT enforcement
#147 strict lexical date-shape validation
#148 pre-network CLI first-executable timing preflight
#150 actual retrieval-completion timestamp preservation
```

Applicable Draft/Ready checks for this chain were green before merge. This means the software boundary is implemented and tested. It does **not** mean real Free edge cases, real benchmark availability or the real Foundation pilot are complete.

## Current verified Free-plan boundary

2026-08-07時点でリポジトリに記録済みのJPX/J-Quants公式確認を基準に、Free adapterは次へ固定する。

- plan: `free`
- stock OHLC: available
- rolling history: 2 years
- reporting delay: 12 weeks = 84 calendar days
- TOPIX: Freeでは提供対象外（Light以上）
- broader index datasets: Freeでは提供対象外
- raw data redistribution: authorized扱いにしない
- Alpha Pon license classification: `local_only`

Free entitlementはrolling windowなので、固定日付の`historyFrom`をcapabilitiesへ保存しない。取得日の2年前という状態を恒久的な開始日と誤認しないためである。

## Existing assets reused

新しいHTTP clientは作らない。

`src/fetcher/jquants.ts`:

- `isJQuantsConfigured()`
- `fetchDailyQuotes(...)`
- V2 Free date cap
- retry / interval / timeout

`src/research/price-store.ts`:

- `PriceProvider`
- `PitPriceRecordInput`
- provider-batch validation
- append-only local price store

`src/research/price-record-timeline.ts`:

- reusable upper-layer four-timestamp validation

## Provider boundary

`src/research/providers/jquants-free.ts`

- exactly one security code per fetch;
- `seriesKind=benchmark`をfail-closedで拒否;
- `plan != free`を拒否;
- 4桁codeとJ-Quants 5桁code末尾0を同一securityとして照合;
- returned quote code / date range / duplicate dateを検証;
- `providerPlan=free`;
- `delayDays=84`;
- `license=local_only`;
- `supportsBenchmarks=false`;
- `supportsSectorBenchmarks=false`;
- `supportsCorporateActions=false`。

## Date boundary

Accepted input shapes are exactly:

```text
YYYYMMDD
YYYY-MM-DD
```

PR #143:

- Gregorian leap-year ruleを明示;
- impossible day/monthをreject;
- query `from > to`をfetch前にreject;
- query datesをcanonical `YYYY-MM-DD`へnormalizeしてfetcherへ渡す。

PR #147:

- `2026--05-14`, `2026-0514`, `202605-14`等のmalformed lexical shapeをreject;
- malformed queryはfetcher呼出し0回;
- quote側のmalformed dateもreject。

JavaScript `Date`の自動繰り上がりや、全ハイフン削除による偶然の正常化には依存しない。

## PIT time boundaries

Canonical order:

```text
dataAsOf <= observedAt <= retrievedAt <= firstExecutableAt
```

### `dataAsOf`

当該TSE立会日のclose:

- 2024-11-04以前: 15:00 JST
- 2024-11-05以降: 15:30 JST

### `observedAt`

trading date + 84 calendar days の23:59:59 JST。

Free案内は12週間遅延を明示する一方、このadapterが依拠できる精密な日中release timestampは未確定なので、日付境界を早めにbackdateしない。

### `retrievedAt`

Alpha Ponが実際に取得を完了した時刻。

PR #150以降、local CLIの`retrievalStartedAt`とrecordの`retrievedAt`を明確に分離する。

```text
retrievalStartedAt = networkへ出る直前のpreflight / query cutoff
retrievedAt        = fetchQuotes完了後にprovider clockで採時する実取得完了時刻
```

network開始前の時刻を`retrievedAt`として固定・backdateしない。provider regressionでは採時順を次で固定する。

```text
fetch-start -> fetch-complete -> retrieved-at-sampled
```

### `firstExecutableAt`

adapter内部で週末・祝日を推測しない。呼び出し側が明示resolverで供給する。

PR #144以降、単に`observedAt`以降では足りず:

```text
firstExecutableAt >= retrievedAt
```

をprovider mapperとcanonical Price Storeの両方で強制する。

PR #148ではlocal CLIも、指定した`--first-executable-at`がretrieval startより前なら**provider/network fetchより前**に拒否する。

PR #150ではfetch完了後のactual `retrievedAt`をresolverへ渡し、次も再確認する。

```text
firstExecutableAt >= actual retrievedAt
```

したがって、fetch開始直後なら成立していたexecution timestampが、network完了時には過去になっていた場合もfail-closedになる。mapper側の最終防御も残す。

## V2 delayed-date cap hardening

PR #104:

- cap dateはrunner local timezoneではなく`Asia/Tokyo`基準;
- `from > to`をreject;
- requested `to`だけがcap超過なら`to`のみtruncate;
- requested `from`がcapより新しい場合は別の古い日へ巻き戻さず空結果;
- future-only ineligible requestはV2 network request 0回。

「まだ取得できない日を要求したのに84日前の別日の価格が返る」誤対応を防ぐ。

## Price representation

v1は**未調整OHLCだけ**を正本化する。

```text
adjusted: false
adjustmentFactor: 1
corporateActions: []
```

J-Quantsの調整後価格は後日のcorporate actionにより過去系列が再計算され得るため、revision lineageなしにPIT価格として採用しない。

V2 fetcherはnull OHLCを0へnormalizeするため、zero/invalid rowを現段階で`suspended` / `no_trade`へ勝手に分類しない。

```text
status: missing
missingReason: unknown
```

実Freeデータでpatternを測定した後だけ分類を細分化する。

## Canonical store conformance

PR #105以降、fixture recordを実`research/schemas/price-record.schema.json`と`validatePriceRecord(...)`へ通す。

- traded row: schema error 0;
- unknown missing row: schema error 0;
- securityにbenchmarkが未設定なら既存設計どおりwarning;
- content hashを付与したappend形まで検証;
- raw OHLCVはdefault console outputからredact。

PR #142以降、revision series rootに任意`supersedesHash`を付けた孤児recordも拒否する。

## Private filesystem boundary

`src/research/private-price-store.ts`:

```text
provider root: 0700
price JSONL:   0600
```

さらに:

- provider root直下fileだけを許可;
- parent/root/fileをregular non-symlinkとして検証;
- permissive既存0777/0666を0700/0600へ矯正;
- dangling symlinkを`lstat`で検出;
- symlink file/rootをappend前に拒否;
- nested pathを拒否;
- append後もfile type / permissionを再検証;
- PR #140以降、existing/new fileで`nlink === 1`を要求しhard linkをreject。

hard-link rejectは`chmod`/append前に行うため、provider root外の同一inodeへpermission/content変更を波及させない。

## Local CLI

Runner:

```bash
bash scripts/run-jquants-free-price-provider-local.sh
```

flagなしではnetworkを使わず、entitlement/capabilitiesだけを表示する。

実取得は明示flagが必要:

```bash
bash scripts/run-jquants-free-price-provider-local.sh \
  --execute-fetch \
  --code 8136 \
  --from 2026-05-14 \
  --to 2026-05-14 \
  --first-executable-at "$FIRST_EXECUTABLE_AT"
```

`FIRST_EXECUTABLE_AT`は最低でも実取得開始時刻以上である必要があり、さらにfetch完了後のactual `retrievedAt`以上でなければrecord mappingを拒否する。過去の固定サンプル時刻をそのままコピーして実行しない。

CLIのquery `asOf`はretrieval start cutoffを表すが、PriceRecordの`retrievedAt`とは別概念である。local append validation clockもfetch後に再採時する。

credentials不足は`credentials_missing_nonfatal`でexit 0。LINE/daily本体へ失敗を伝播させない。

### Output safety

Default output:

```text
rawValuesIncluded: false
valuesIncluded: false
```

表示はcode/date/PIT timestamps/status/source/plan/license/contentHash等のmetadata中心。

raw OHLCVをlocal terminalで明示確認する時だけ:

```bash
--show-values-local
```

永続化はさらに`--append-local`が必要。保存先:

```text
research/prices/jquants-free/<code>.jsonl
```

この領域はgitignored/local-only。consoleにはrepo-relative pathだけを出し、absolute local pathを公開しない。

## Fixture / CI validation

実APIなしで現在固定済み:

- Free entitlement contract;
- 84-day observation boundary;
- TSE 15:00 / 15:30 close transition;
- 4桁/5桁code matching;
- strict lexical + Gregorian date validation;
- unadjusted OHLC mapping;
- unknown missing-pattern fail-closed;
- `observedAt <= retrievedAt <= firstExecutableAt`;
- provider batch consistency;
- benchmark/multi-code rejection;
- JST midnight date-cap transition;
- partial eligible range truncation;
- future-only range = no network;
- malformed query = no network;
- CLI impossible execution timing = pre-network reject;
- actual `retrievedAt` is sampled after fetch completion;
- resolver rechecks execution against actual retrieval completion;
- append validation clock is sampled after fetch;
- canonical Price Store schema conformance;
- default raw-value redaction;
- private root/file permission tightening;
- symlink / dangling symlink / hard-link rejection;
- provider-root direct-child enforcement;
- orphan revision-root rejection。

## Remaining real measurement — non-blocking

コード実装を止めない。実Free credentialsを使えるlocal executorがある時だけ測定する。

- 12週間遅延データが実際に取得可能になる日中時刻;
- rolling 2-year boundaryのAPI実挙動;
- missing / no_trade / suspensionの実row pattern;
- code表現の実例外;
- Free entitlement変更の有無。

TOPIX / sector benchmarkはFreeで無理に代替せず、Foundation pilot側で別の権利確認済みsourceを選ぶ。

## Guardrails

- 実価格・secret・token・account IDをGitへcommitしない;
- raw J-Quants dataをpublic dashboard/APIへ流さない;
- default console outputにもraw OHLCVを出さない;
- local-only price fileはprovider root 0700 / file 0600;
- symlink/dangling symlink/hard-link経由のprivate price writeを許可しない;
- 複数provider/planの同日データをsource/providerPlan指定なしに黙って1件選ばない;
- credentials不足・J-Quants障害をLINE/daily本体へ伝播させない;
- adjusted seriesをrevision-awareでないPIT storeへ混ぜない;
- benchmark entitlementを推測しない;
- delay capより新しいrequestを別日の古い価格へ自動変換しない;
- retrieval startをactual `retrievedAt`へbackdateしない;
- 取得前に価格を使えたことにしない;
- 実LINE送信・自動発注・課金設定変更は行わない。

## Definition of done

### Software

- [x] `PriceProvider` adapter — #103
- [x] Free capability / entitlement boundary — #103
- [x] `DailyQuote` -> `PitPriceRecordInput` mapping — #103
- [x] explicit-network / dry-run-by-default CLI — #103
- [x] credentials-missing non-fatal — #103
- [x] local-only append path — #103
- [x] JST delayed-date cap / future-only no-network — #104
- [x] canonical Price Store schema conformance — #105
- [x] default raw-value redaction — #105
- [x] private 0700/0600 + symlink boundary — #108
- [x] hard-link boundary — #140
- [x] orphan revision-root rejection — #142
- [x] Gregorian date/query range validation — #143
- [x] execution-after-retrieval boundary — #144
- [x] strict lexical date shapes — #147
- [x] pre-network local CLI execution timing — #148
- [x] actual retrieval-completion timestamp preservation — #150

### Real/local

- [ ] missing/no_trade/suspension real row pattern measurement
- [ ] exact delayed intraday availability measurement
- [ ] rolling two-year boundary measurement
- [ ] first governed real issuer series accepted locally
- [ ] rights-verified TOPIX / sector benchmark source selected for Foundation pilot

## Current next step

Do not add a second price architecture merely to keep moving. When local execution is available, use this adapter to measure the remaining Free edge cases and keep raw data local-only. For the real Foundation pilot, separately resolve rights-verified TOPIX / sector benchmark Evidence and Corporate Action Clearance.
