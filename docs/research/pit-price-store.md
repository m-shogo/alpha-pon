# PIT Price Store v1 Foundation

Status: `FOUNDATION_IMPLEMENTED_PENDING_CI`

## Purpose

Research OS の Backtest は現在、外部から注入された `PriceSeries` だけを扱います。本契約は、実価格・TOPIX・業種指数を後日改訂による先読みなしで保存し、特定の `asOf` 時点で利用可能だった系列だけを再構築するための基盤です。

この段階では J-Quants や JPX への実接続、実価格の commit、Net Alpha の実測は行いません。

## Canonical record

1 JSONL line = 1 immutable observation.

主な項目:

- `seriesKind`: `security` / `benchmark`
- `code`, `market`, `tradingDate`
- `observedAt`: データが取得・利用可能になった時刻
- `firstExecutableAt`: その行を利用した判断が初めて約定可能になる時刻
- `source`, `sourceVersion`, `ingestionRunId`
- `status`: `traded`, `suspended`, `no_trade`, `missing`
- `ohlcv`
- `adjusted`, `adjustmentFactor`
- `corporateActions`
- `benchmarkCode`, `sectorBenchmarkCode`
- `license`
- `contentHash`
- `supersedesHash`

Schema authority:

```text
research/schemas/price-record.schema.json
```

Runtime authority:

```text
src/research/price-store.ts
```

## Append-only revision model

同じ `seriesKind + market + code + tradingDate + source` に訂正値が出た場合:

1. 既存行を変更しない
2. 新しい `observedAt` と `sourceVersion` で新規行を追加
3. `supersedesHash` に直前revisionの `contentHash` を指定
4. 新しい行の `contentHash` を再計算

`contentHash` は自身の `contentHash` フィールドを除くcanonical recordのSHA-256です。

## PIT semantics

- `observedAt` のJST日付は `tradingDate` より前にできない
- `firstExecutableAt` は `observedAt` より前にできない
- `observedAt` が現在時刻より未来の行は拒否
- Backtest変換時は `observedAt <= asOf` のrevisionだけを使用
- 同一営業日の後日訂正値を過去の `asOf` に混ぜない
- 休場・売買停止・欠損はforward fillせず、`status` として保持

## OHLCV semantics

`status=traded` のみOHLCVを持ちます。

- Open / High / Low / Close > 0
- HighはOpen/Close/Low以上
- LowはOpen/Close/High以下
- Volumeは0以上の整数
- `adjusted=false` の場合は `adjustmentFactor=1`

Provider調整済みOHLCVとunadjusted OHLCVを混同しないため、`adjusted` と `adjustmentFactor` を必須にしています。

## Corporate actions

Split、reverse split、dividend、rights、merger、spinoff等を行内で参照できます。ただし、価格調整の二重適用を避けるため、実Provider adapterでは次を記録します。

- Providerが返すOHLCVがadjustedか
- adjustment factorの由来
- corporate actionの公表時刻
- effective date
- source

## Provider boundary

`PriceProvider` はnetwork-freeなinterfaceです。Provider adapterは後続PRで実装します。

候補:

- J-Quants
- JPX一次データ
- Mac local historical DB / archive
- 利用許諾済み市場データ

Credentialや利用許諾がない場合も、fixtureとprovider contractはCIで検証できます。

## License boundary

実価格は `local_only` を既定とします。

- `research/prices/**/*.jsonl` はGit ignore
- Git管理する価格データはsynthetic fixtureだけ
- `unknown` licenseを再配布しない
- Secret、API token、account IDをrecordへ保存しない

## Commands

```bash
pnpm research:prices:validate
pnpm research:test
pnpm research:check
```

Local storeを別pathで検証:

```bash
pnpm research:prices:validate -- --root=/absolute/path/to/prices
```

## Definition of done for this foundation

- [x] schema
- [x] TypeScript contract
- [x] deterministic content hash
- [x] append-only writer
- [x] duplicate/revision validation
- [x] PIT/as-of selector
- [x] Backtest `PriceSeries` adapter
- [x] synthetic fixture
- [x] tests
- [x] local-only license boundary
- [ ] CI green
- [ ] real provider adapter
- [ ] real security series
- [ ] TOPIX / sector benchmark ingestion
- [ ] trading calendar integration
- [ ] data gap report from real provider

## Next slice

After CI green, implement one provider adapter in dry-run mode. No real market data is committed until the license classification is verified.
