# 企業固有ショック Event Study Methodology

## 目的

不祥事が起きたという事実と、その不祥事が株価へ与えた企業固有ショックを分離する。

単純な「発表日の終値差」では測らない。

## 日付は3種類に分ける

### `eventDate` / `detectedAt`

事件・開示・報道の歴史的な日付。事件タイムラインの正本。

### `announcementTiming`

- `before_open`
- `during_session`
- `after_close`
- `non_trading_day`
- `unknown`

### `priceReactionStartDate`

市場がその情報へ最初に反応できた取引日。

例:

- 月曜寄り前発表 → 月曜
- 月曜場中発表 → 月曜
- 月曜引け後発表 → 火曜
- 土曜発表 → 次の取引日

`eventDate` を `priceReactionStartDate` へ上書きしない。事件史と価格event-studyを別管理する。

## 現在のshock計測

- `priceReactionStartDate` 前の直近取引価格をbaselineにする
- reaction start後20日以内のstock lowを初期shock lowとする
- 絶対drawdownを計算
- stockがshock lowを付けた同じ取引日のbroad-market benchmarkと比較
- 可能ならindustry / peer benchmarkとも比較
- 数か月後の別材料による安値を初期shockへ混ぜない

最低通知条件:

- absolute shock <= -5%
- broad benchmark relative <= -3%
- industry relativeが取得できる場合は企業固有shockが残る
- price stateが `stabilized_after_drop`

## 発表前リーク

公式開示より前に異常下落している場合、`priceReactionStartDate` が遅すぎる可能性がある。

`informationLeakStatus=likely` はevent windowを再設定するまでBLOCK。

## ADR / dual listing

ADRや二重上場では、片方のカレンダー日だけを見ない。

確認するもの:

- primary listing
- どちらが先に取引可能だったか
- タイムゾーン
- 休日差
- 為替
- liquidity

## 売買停止 / 値幅制限

`halted` / `limit_locked` は価格発見が未完了。

見かけの終値を「下落一巡」と判定しない。

## 同時材料

同日に次がある場合、不祥事へ全下落を帰属しない。

- earnings miss
- guidance cut
- 増資 / buyback / dividend
- M&A
- 製品事故
- 訴訟判決
- sector-wide regulation

`confounderStatus=major/unknown` は通知BLOCK。

## Historical outcome

過去ケースも、sidecarで検証済み `priceReactionStartDate` があればそれをshock計測起点として使う。

sidecar未確認時はeventDateへfallbackするが、Local Opportunity calibrationではreaction-anchor coverageを別途監査する。

## 残る定量的な改善候補

### 1. Beta-adjusted abnormal return

現在のbroad benchmark relativeは `stock return - benchmark return`。

高beta株では市場-5%時に株-8%程度が通常かもしれないため、将来はpre-event 60〜120 sessionからbetaを推定し、market-model abnormal returnを補助指標として追加する。

これは推定誤差があるため、十分な検証前に新hard gateへしない。

### 2. Industry / peer portfolio

単一sector ETFだけでなく、類似企業portfolioでpeer abnormal returnを測れるとより良い。

### 3. Total-return consistency

長期1y outcomeではsplit/dividend調整方法をprovider間で統一する。

### 4. Corporate-action outcome tagging

事件後の回復が、

- organic recovery
- takeover / merger
- delisting
- restructuring
- bankruptcy

のどれかを分離する。買収プレミアムを「不祥事ディップ戦略の自然回復」と誤学習しない。

### 5. Discovery / selection bias

大きく下がった有名事件だけを収集しない。

同じスキャン条件で、

- 小反応
- 無反応
- 一時上昇

だった不祥事も保存し、事件発生→市場反応の母集団を近づける。

`src/idiosyncratic-shock-research-gaps.ts` で不足を可視化する。
