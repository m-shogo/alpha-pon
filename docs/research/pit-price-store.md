# PIT Price Store v1

Status: `CONTRACT_IMPLEMENTED_ACTIONS_STARTUP_BLOCKED`

## Purpose

Research OSのEvent StudyとBacktestへ、銘柄価格・TOPIX・業種指数をpoint-in-time安全に供給するためのappend-only基盤です。

このPRでは契約、schema、validator、writer、selector、synthetic fixtureを実装します。J-Quants等への実接続、実価格のGit保存、Net Alphaの実測は行いません。

## Canonical record

1 JSONL line = 1 immutable observation.

必須境界:

- `seriesKind`: `security` / `benchmark`
- `code`, `market`, `tradingDate`
- `dataAsOf`: OHLCVが表す市場時点
- `observedAt`: provider上で契約上利用可能になった時刻
- `retrievedAt`: Alpha Ponが実際に取得した時刻
- `firstExecutableAt`: このrecordを使った注文が最初に約定可能な時刻
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

## Four timestamps

```text
dataAsOf
  <= observedAt
  <= retrievedAt
  <= firstExecutableAt（通常）
```

現実には取得直後に同時刻で実行可能となる場合もありますが、少なくとも公開前・取得前の約定を許可しません。

Backtest adapterは`firstExecutableAt <= asOf`のみを使用します。公開済みでも、まだ執行不能なrecordは除外します。

## Provider plans

J-Quants Free／Standard等は、別の業務ロジックへ分岐させません。同じ`PriceProvider` interfaceを使い、差分をcapabilityとして保存します。

- plan
- delay days
- adjusted / unadjusted
- corporate actions
- benchmark / sector benchmark
- history range
- license

Provider batchは各recordと次が一致する必要があります。

- `providerPlan`
- `delayDays`
- `retrievedAt`
- `sourceVersion`
- `license`
- supported capabilities

## Revision model

同じ`seriesKind + market + code + tradingDate + source + providerPlan`に訂正値が出た場合:

1. 既存行を変更しない
2. 新しい`observedAt`で行を追加
3. `supersedesHash`で直前revisionを参照
4. `contentHash`を再計算

Revision順序はISO文字列の辞書順ではなく、epoch timestampで比較します。

## Missing and non-traded rows

`status`:

- `traded`
- `suspended`
- `no_trade`
- `missing`

`traded`だけがOHLCVを持ちます。それ以外は`missingReason`が必須です。Price Storeはforward fillを行いません。

## Corporate actions

Split、reverse split、dividend、rights、merger、spinoff等を参照できます。

- actionの`observedAt`がprice recordより後ならPIT漏れ
- split/reverse splitは正のfactor必須
- adjusted/unadjustedとfactorを明示
- Provider調整済み価格へ二重調整しない

## Provider ambiguity

複数sourceまたは複数planが同一日付に存在する場合、Backtest adapterは黙って混ぜません。

```text
selector.source
selector.providerPlan
```

を指定し、一意のseriesへ固定します。

## License boundary

- 実価格はlocal-onlyが既定
- `research/prices/**/*.jsonl`とJSONはGit ignore
- Git管理する価格はsynthetic fixtureのみ
- `license=unknown`は取込エラー
- credentialはrecordへ保存しない

## Commands

```bash
node --import tsx/esm src/research/cli/validate-prices.ts
pnpm research:test
pnpm research:check
```

別local store:

```bash
node --import tsx/esm src/research/cli/validate-prices.ts --root=/absolute/path/to/prices
```

## Definition of done

- [x] schema
- [x] TypeScript contract
- [x] four timestamp boundary
- [x] provider plan/capability boundary
- [x] deterministic content hash
- [x] append-only writer + fsync
- [x] duplicate/revision validation
- [x] observed/executable selector
- [x] Backtest adapter
- [x] provider ambiguity guard
- [x] missing/no-forward-fill contract
- [x] synthetic fixture
- [x] tests
- [x] local-only license boundary
- [ ] GitHub Actions green
- [ ] real J-Quants adapter
- [ ] first real security series
- [ ] TOPIX / sector benchmark ingestion
- [ ] trading calendar integration
- [ ] provider data-gap report

## Current external blocker

2026-08-05のPR実行では、GitHub ActionsのCI／Check／Research OSがjob step開始前にfailureとなり、`steps: []` / job logなしで数秒以内に終了します。

根本原因を特定しました。failed jobのcheck-run annotationは以下を返しています。

```text
The job was not started because recent account payments have failed or
your spending limit needs to be increased. Please check the
'Billing & plans' section in your settings
```

- これはコード・workflow YAML・runner labelの問題ではなく、**アカウントのGitHub Actions課金／spending limit**によるstartup blockです。runnerが割り当てられる前に停止するため`steps`が空になります。
- 該当run: `31006034441` (Check), `31006039600` (Check/PR), `31006040121` (CI), `31006039702` (Research OS)。すべてhead `1309e49`。
- **人間の対応が必要**: GitHub Settings → Billing & plans で支払い失敗の解消またはspending limitの引き上げ。エージェントは課金設定を変更しません。
- Cloudflare Workers Buildsのfail (`alpha-pon`) はこのActions課金blockerとは別事象であり、切り分けて扱います。

課金blockが解消しActionsが実際にstepを実行してgreenになるまでは、PR #37をmergeしません。ローカル検証(下記)はすべてgreenです。

## Local verification (Actions代替)

課金blockの間、worktree上で以下をローカル実行し、すべてgreenを確認済み (2026-08-05 JST):

```text
tsc --noEmit                     PASS
tsc --noEmit -p tsconfig.test.json   PASS
tsc --noEmit -p tsconfig.scripts.json PASS
research:validate                PASS
research:generate:check          PASS
research:check:history           PASS
research:check:docs              PASS
research:backtest:fixtures       PASS
research:test (8 suites)         PASS
tests/research/price-store.test  PASS
validate-prices (fixtures root)  files=1 records=1 errors=0
```

## Next slice

Actionsが復旧しcontract greenを確認後、既存J-Quants clientを`PriceProvider` adapterへ接続します。Free／Standardはcapability flagsだけを切り替え、実市場データはlocal storeへ保存します。

具体的な手順は [J-Quants Free adapter next slice](jquants-free-adapter-next-slice.md) を参照。答え合わせと推奨保存の契約は [Recommendation & Outcome contract](recommendation-outcome-contract.md)。
