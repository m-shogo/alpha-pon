# J-Quants Free `PriceProvider` Adapter — Next Slice

Status: `HANDOFF_NOT_STARTED`
Updated: 2026-08-05 JST
Depends on: [PIT Price Store v1](pit-price-store.md)
Blocked by: GitHub Actions billing/spending-limit startup block (see PIT doc)

This is the concrete next implementation slice after PIT Price Store v1 merges.
J-Quants は Edge を発見する主役ではなく、価格反応と予想結果を検証する基盤として扱う。

## Existing assets to reuse (do not rebuild)

- `src/fetcher/jquants.ts` — 既存 client。
  - `isJQuantsConfigured()`: `JQUANTS_API_KEY` または `JQUANTS_EMAIL`+`JQUANTS_PASSWORD`。
  - `fetchDailyQuotes(...)` → `DailyQuote[]` (`/prices/daily_quotes`)。
  - Free/V2 の既定遅延は `JQUANTS_V2_DATA_DELAY_DAYS`（既定 84 日）。
  - retry / interval は `JQUANTS_V2_RETRY_ATTEMPTS` / `JQUANTS_V2_REQUEST_INTERVAL_MS`。
- `src/research/price-store.ts` — `PriceProvider` interface と `PitPriceRecord`。

新規 client を書かず、既存 fetcher を `PriceProvider` へ薄く適合させる。

## Scope of the slice (fixture / dry-run 中心)

1. `src/research/providers/jquants-free.ts` を追加し、`PriceProvider` を実装。
   - `capabilities`: `plan: "free"`, `delayDays` = Free の実測遅延, `supportsAdjusted`,
     `supportsUnadjusted`, `supportsBenchmarks`, `supportsSectorBenchmarks`,
     `historyFrom` を明示。推測値ではなく実測後の値を入れる。
   - `fetchDaily(query)` は `DailyQuote` → `PitPriceRecordInput` へ写像:
     - `dataAsOf` = 取引日クローズ (JST)、`observedAt` = クローズ + Free 遅延、
       `retrievedAt` = 実取得時刻、`firstExecutableAt` = observedAt 後の翌立会寄付。
     - `delayDays` / `isDelayed` を capabilities と一致させる。
     - 無約定・停止・欠損は status=`no_trade`/`suspended`/`missing` + `missingReason`、
       forward fill しない。
     - `license`: 未確認なら `unknown` を返し、`unknown` は store が取り込み拒否する。
2. dry-run CLI（`--dry-run` 既定）で 1 銘柄だけ取得し record へ写像した結果を
   標準出力へ表示。実価格は `research/prices/`（local-only, gitignored）にのみ append。
3. deterministic な `DailyQuote` fixture を用いた mapping test を追加（実 API 不要）。

## Must measure with the real Free plan (実測してから確定)

- 遅延日数（`delayDays` の実値。既定 84 の妥当性）
- 取得可能な履歴開始日（`historyFrom`）
- missing / no_trade の実発生パターンと `missingReason` の対応
- TOPIX / 業種指数（benchmark / sector benchmark）の取得経路と系列コード

## Guardrails

- 実価格・secret・token・account ID を Git へ commit しない。
- 複数 provider/plan の同日データを source/providerPlan 指定なしに黙って 1 件選ばない
  （store 側の ambiguity guard を維持）。
- J-Quants 障害を LINE / daily 本体へ伝播させない。credentials 不足は非 fatal。
- 実 LINE 送信・自動発注・課金設定変更は行わない。

## Definition of done

- [ ] `PriceProvider` 適合 adapter（Free capabilities）
- [ ] `DailyQuote` → `PitPriceRecord` mapping test（fixture, 実API不要）
- [ ] dry-run CLI（1 銘柄、local-only append）
- [ ] Free 遅延 / 履歴 / missing / benchmark の実測メモ
- [ ] TOPIX / 業種指数 取得経路の確定
