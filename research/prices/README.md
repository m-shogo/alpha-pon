# PIT Price Store

`research/prices/` は Research OS が実価格・ベンチマーク系列を point-in-time 安全に読むためのローカル保存先です。

## 重要な境界

- 実市場データは **local-only が既定** です。
- 再配布権を確認できない価格データを GitHub へ commit しません。
- Git 管理するのは schema、validator、synthetic fixture、runbook だけです。
- 実データの JSONL は `.gitignore` で除外します。
- Provider が `license=redistributable` と明示し、人間が再配布権を確認した場合だけ別途 fixture 化を検討します。

## 想定配置

```text
research/prices/
  securities/<market>/<code>.jsonl
  benchmarks/<market>/<benchmark>.jsonl
```

1行が1件の `PIT Price Record` です。既存行の変更・削除・並べ替えは禁止です。
改訂値は新しい行として追加し、`supersedesHash` で直前行を参照します。

## 検証

```bash
pnpm research:prices:validate
pnpm research:prices:validate -- --root=/path/to/local/price-store
```

検証内容:

- JSON Schema
- `observedAt` と `tradingDate` のPIT順序
- `firstExecutableAt >= observedAt`
- OHLCVの整合性
- adjustment factor
- SHA-256 content hash
- 重複行
- revision chain

## Backtestへの接続

`toBacktestPriceSeries(records, asOf, selector)` は、`asOf` 時点までに観測済みの最新revisionだけを選び、既存の決定論的Backtest `PriceSeries` へ変換します。

これにより、後日訂正された終値を過去時点の検証へ混ぜる future leakage を防ぎます。
