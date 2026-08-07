# PIT Price Store v1

Status: `IMPLEMENTED_AND_CI_GREEN_REAL_MARKET_PILOT_PENDING`
Updated: 2026-08-07 JST

## Purpose

Research OSのEvent Study / Recommendation / Quantitative Outcome / Backtestへ、銘柄価格・TOPIX・業種指数をpoint-in-time安全に供給するappend-only基盤です。

現在の実装はcontract / schema / validator / writer / selector / local-only filesystem boundary / J-Quants Free adapter / upper-layer PIT revalidationまでCIで固定済みです。

ただし、**software implementation green != real-market pilot green**です。実J-Quants価格、別sourceのTOPIX・sector benchmark、Corporate Action Evidenceは引き続きlocal-onlyで取得・検証する必要があります。

## Canonical record

1 JSONL line = 1 immutable observation.

必須境界:

- `seriesKind`: `security` / `benchmark`
- `code`, `market`, `tradingDate`
- `dataAsOf`: OHLCVが表す市場時点
- `observedAt`: provider上で契約上利用可能になった時刻
- `retrievedAt`: Alpha Ponが実際に取得した時刻
- `firstExecutableAt`: このrecordを使った判断が最初に約定可能な時刻
- `source`, `sourceVersion`, `providerPlan`, `ingestionRunId`
- `delayDays`, `isDelayed`
- `status`, `missingReason`, `ohlcv`
- `adjusted`, `adjustmentFactor`, `corporateActions`
- `benchmarkCode`, `sectorBenchmarkCode`
- `license`, `contentHash`, `supersedesHash`

Schema authority:

```text
research/schemas/price-record.schema.json
```

Runtime authority:

```text
src/research/price-store.ts
```

Reusable upper-layer timestamp authority:

```text
src/research/price-record-timeline.ts
```

## Four timestamp contract

Canonical order:

```text
dataAsOf
  <= observedAt
  <= retrievedAt
  <= firstExecutableAt
```

Equal timestamps are allowed where reality permits them. What is prohibited is backdating:

- market data cannot be observed before the represented market state exists;
- Alpha Pon cannot retrieve data before provider availability;
- a decision using a price cannot become executable before the price was actually retrieved.

PR #144 made `retrievedAt <= firstExecutableAt` an executable runtime invariant rather than documentation-only intent.

`validatePriceRecord(...)` now rejects:

- `dataAsOf > observedAt`;
- `retrievedAt < observedAt`;
- `firstExecutableAt < observedAt`;
- `firstExecutableAt < retrievedAt`;
- future observation/retrieval relative to validation time;
- trading-date / JST mismatch.

`validateProviderBatch(...)` also rejects a record whose `firstExecutableAt` precedes the batch `retrievedAt`.

Backtest selection remains conservative:

```text
firstExecutableAt <= asOf
```

A record can therefore be publicly observable but still excluded from executable backtest state until its execution boundary is reached.

## Provider plans

J-Quants Free / Standard等を別の業務ロジックへ分岐させず、同じ`PriceProvider` interfaceを使います。差分はcapability / provenanceとして保存します。

- plan
- delay days
- adjusted / unadjusted
- corporate actions
- benchmark / sector benchmark
- history range
- license

Provider batchは各recordと少なくとも次が一致する必要があります。

- `providerPlan`
- `delayDays`
- `retrievedAt`
- `sourceVersion`
- `license`
- supported capabilities
- execution is not before retrieval

## Revision model

同じ`seriesKind + market + code + tradingDate + source + providerPlan`に訂正値が出た場合:

1. 既存行を変更しない;
2. 新しい`observedAt`で行を追加;
3. `supersedesHash`で**直前revision**を参照;
4. `contentHash`を再計算する。

PR #142以降、系列先頭recordに`supersedesHash`を付けた孤児revisionもfail-closedです。

```text
root.supersedesHash        -> prohibited
revision.supersedesHash    -> exact previous contentHash required
```

Revision順序はISO文字列の辞書順ではなくepoch timestampで比較します。

## Missing and non-traded rows

`status`:

- `traded`
- `suspended`
- `no_trade`
- `missing`

`traded`だけがOHLCVを持ちます。それ以外は`missingReason`が必須です。Price Storeはforward fillを行いません。

J-Quants Freeの実missing / no_trade / suspension patternはまだreal measurement待ちなので、実測前に原因を推測して分類しません。

## Corporate actions

Split、reverse split、dividend、rights、merger、spinoff等を参照できます。

- actionの`observedAt`がprice recordより後ならPIT漏れ;
- split/reverse splitは正のfactor必須;
- adjusted/unadjustedとfactorを明示;
- Provider調整済み価格へ二重調整しない;
- raw unadjusted Quantitative Outcomeは別途Corporate Action Clearanceを必要とする。

## Provider ambiguity

複数sourceまたは複数planが同一日付に存在する場合、Backtest adapterは黙って混ぜません。

```text
selector.source
selector.providerPlan
```

を指定し、一意のseriesへ固定します。

## Local-only storage boundary

実価格はlocal-onlyが既定です。

- `research/prices/**/*.jsonl` / JSONはGit ignore;
- Git管理する価格はsynthetic fixtureのみ;
- `license=unknown`は取込エラー;
- credentialはrecordへ保存しない;
- raw price valuesをpublic dashboard/APIへ流さない。

Private writerは:

```text
provider root: 0700
price JSONL:   0600
```

を強制します。

Filesystem boundary:

- parent/root/fileはregular non-symlinkであること;
- dangling symlinkを`lstat`で拒否;
- nested pathを拒否;
- PR #140以降は`nlink === 1`を要求し、hard-linked fileもchmod/append前に拒否;
- append後にもfile type / permission boundaryを再確認。

## Upper-layer PIT revalidation

Price Storeへ保存した時だけ正しくても、上位層がre-hash済みの不正PriceRecordを直接受ければPIT保証が壊れます。この迂回路を閉じるため、timestamp contractは上位でも再検証します。

### Recommendation — PR #145

Issuer / TOPIX / sector benchmarkのpin全てで:

- pinned content hash;
- immutable content hash recomputation;
- canonical four-timestamp order

を再検証します。

時系列だけ改ざんして新しい正しい`contentHash`を作ったrecordでも`invalid_pinned_price_timeline`で拒否します。

### Quantitative Outcome — PR #146

- issuer / TOPIX / sector baseline pinを再検証;
- reviewedAtまでの実measurement候補rowを再検証;
- unrelated future rowは過去Outcomeを不必要にblockしない;
- measurementへ使われるre-hash済み不正timelineは拒否。

これにより、ROI / benchmark excess return / sector excess returnをPIT不正価格から生成できません。

## J-Quants hardening that feeds this store

Current merged chain includes:

```text
#103 J-Quants Free PriceProvider adapter
#104 JST / delayed-date-cap hardening
#105 canonical Price Store conformance + raw-value redaction
#108 private 0700/0600 + symlink boundary
#140 hard-link filesystem boundary
#142 orphan revision root rejection
#143 Gregorian calendar / query range validation
#144 execution-after-retrieval PIT invariant
#147 strict J-Quants lexical date shapes
#148 pre-network CLI execution-time preflight
```

Details: [J-Quants Free adapter](jquants-free-adapter-next-slice.md)

## Commands

Canonical validation:

```bash
node --import tsx/esm src/research/cli/validate-prices.ts
pnpm research:test
pnpm research:check
```

別local store:

```bash
node --import tsx/esm src/research/cli/validate-prices.ts --root=/absolute/path/to/prices
```

J-Quants Free local runner:

```bash
bash scripts/run-jquants-free-price-provider-local.sh
```

Network fetchは明示`--execute-fetch`時だけです。

## Definition of done

### Software / contract

- [x] schema
- [x] TypeScript contract
- [x] four timestamp boundary
- [x] `retrievedAt <= firstExecutableAt` runtime enforcement — #144
- [x] provider plan/capability boundary
- [x] deterministic content hash
- [x] append-only writer + fsync
- [x] duplicate/revision validation
- [x] orphan revision root rejection — #142
- [x] observed/executable selector
- [x] Backtest adapter
- [x] provider ambiguity guard
- [x] missing/no-forward-fill contract
- [x] synthetic fixtures
- [x] local-only license boundary
- [x] private symlink + hard-link boundary — #108 / #140
- [x] real J-Quants Free adapter implementation — #103
- [x] Recommendation pinned-price timeline revalidation — #145
- [x] Quantitative Outcome price timeline revalidation — #146
- [x] GitHub Actions executes real validation steps and current hardening PRs are green

### Real-market / local-only evidence

- [ ] first governed real issuer security series accepted into local Price Store
- [ ] licensed PIT TOPIX source for the real pilot
- [ ] licensed PIT sector benchmark source for the real pilot
- [ ] real Corporate Action Evidence / Clearance for the measured horizon
- [ ] real J-Quants missing/no_trade/suspension pattern measurement
- [ ] exact Free delayed intraday availability measurement
- [ ] rolling two-year edge behavior measurement
- [ ] trading-calendar/execution integration only where the real pilot proves a gap
- [ ] provider data-gap report from real observations

## Current external boundary

There is **no current GitHub Actions startup/billing blocker in this roadmap**. The 2026-08-05 startup failure was a historical incident; subsequent PRs including #140-#148 executed applicable GitHub-hosted checks successfully. Do not revive that old incident as a current blocker unless a new measured run proves it.

The current blockers are real-data / rights / local-executor boundaries:

1. real issuer price rows remain local-only;
2. J-Quants Free does not provide the required TOPIX / sector benchmark path for the Foundation pilot;
3. another rights-verified benchmark source is required;
4. raw unadjusted Outcome requires Corporate Action Clearance;
5. real J-Quants edge cases must be measured with local credentials rather than inferred in CI;
6. real Sanrio EDINET/Foundation Evidence remains a separate local human gate.

Do not solve these by copying licensed data into Git, fabricating CI fixtures, guessing entitlement behavior or weakening PIT validators.

## Historical note: 2026-08-05 Actions startup incident

On 2026-08-05 some runs failed before job steps because of an account billing/spending-limit condition. That diagnosis was valid for those historical run IDs, but it is no longer the current state. Current roadmap decisions must use current workflow evidence, not the stale incident.

## Next slice

The highest-value next progress is **not another synthetic price architecture layer**. It is:

1. finish the real local Sanrio Evidence/parity path;
2. obtain one rights-verified local issuer + TOPIX + sector benchmark path;
3. measure real J-Quants Free edge cases when local credentials are available;
4. run one real governed Recommendation / Quantitative Outcome cycle only after Foundation Evidence genuinely supports it.

Synthetic work should remain limited to concrete defects, read-only operability and regression coverage discovered while those real gates are human/local-blocked.
