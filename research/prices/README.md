# PIT Price Store

`research/prices/` は、Research OS が実価格・TOPIX・業種ベンチマークをpoint-in-time安全に読むための**ローカル専用保存先**です。

## 保存しないもの

- API token、account ID、credential
- 再配布権を確認していない実市場データ
- SNS・掲示板・第三者投稿から作った価格
- 後日取得した値を、過去に取得済みだったように見せる行
- 欠損日のforward fill

Git管理するのはschema、validator、synthetic fixture、runbookだけです。実価格JSONLは`.gitignore`で除外します。

## 4つの時刻

各recordは次を混同しません。

| Field | Meaning |
| --- | --- |
| `dataAsOf` | OHLCVが表す市場時点。通常は取引日の引け |
| `observedAt` | provider上で契約上利用可能になった時刻。PITの正本 |
| `retrievedAt` | Alpha Ponが実際に取得した時刻 |
| `firstExecutableAt` | このrecordを利用した注文が最初に約定可能な時刻 |

Backtestへ渡せるのは、原則として`firstExecutableAt <= asOf`の行だけです。

## 想定配置

```text
research/prices/
  securities/<market>/<code>.jsonl
  benchmarks/<market>/<benchmark>.jsonl
```

1行が1件のimmutable recordです。既存行の変更・削除・並べ替えは禁止します。
訂正値は新しい行として追加し、`supersedesHash`で直前revisionを参照します。

## Provider plan

J-Quants Free／Standard等は別の業務ロジックへ分岐させず、同じ`PriceProvider`境界を使います。

差分はcapabilityとして記録します。

- `providerPlan`
- `delayDays` / `isDelayed`
- adjusted / unadjusted対応
- corporate action対応
- benchmark / sector benchmark対応
- 利用可能な履歴範囲
- license

複数providerまたは複数planの同日価格が候補になる場合、Backtest adapterは黙って混ぜません。`selector.source`と`selector.providerPlan`で明示的に一意化します。

## Statusと欠損

`status`:

- `traded`
- `suspended`
- `no_trade`
- `missing`

非取引行には`missingReason`が必要です。OHLCVは持たせません。

- `exchange_suspension`
- `market_holiday`
- `no_execution`
- `provider_gap`
- `outside_entitlement`
- `not_yet_available`
- `unknown`

Price Store自身はforward fillを行いません。

## 検証

```bash
node --import tsx/esm src/research/cli/validate-prices.ts
node --import tsx/esm src/research/cli/validate-prices.ts --root=/path/to/local/price-store
```

検査内容:

- JSON Schema
- 4時刻の順序
- JST取引日
- planとdelayの整合
- OHLCVとstatus/missingReason
- adjustment factor
- corporate actionのPIT
- SHA-256 content hash
- 重複・revision chain
- license
- provider capabilityとbatchの一致

## Backtestへの接続

```text
toBacktestPriceSeries(records, asOf, {
  seriesKind,
  code,
  market,
  source,
  providerPlan
})
```

後日訂正された価格、取得前の価格、実行可能時刻前の価格、異なるproviderの混在をBacktestへ入れないことが目的です。
