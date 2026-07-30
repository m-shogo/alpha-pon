# 企業固有ショック — First Eligible Signal Policy

## なぜ必要か

`decisionCheckpoint` は「一次情報・調査範囲などを確認して判断可能になった日」であり、実際の投資方針である「非価格hard gateを通過し、下落して落ち着いたら調査候補として通知する日」とは一致しない。

過去検証をdecision checkpointの価格だけで測ると、次の誤差が入る。

- 調査完了時点ではまだ急落途中だった
- 反対に、調査完了時点では既に急反発していた
- 後から見た底値を無意識に基準へ使う
- 非価格hard gate未確認のケースまで戦略成績へ混ぜる
- 実際の通知hard gateを再現していない

そのため、今後の戦略成績は **verified non-price eligibility + First Eligible Signal** を正本にする。

## 3つの日付を分離する

1. `eventDate / detectedAt`
   - 事件史の正本
2. `decisionCheckpoint`
   - 当時の一次情報・調査範囲を評価するcheckpoint
3. `firstEligibleSignalDate`
   - checkpoint時点の非価格hard gateがconfirmed_passであることを確認したうえで、価格hard gateまで初めて成立した取引日

## 非価格eligibilityを先に確定する

Historical replayでは `strategyEligibilityAtCheckpoint` をsidecarへ記録する。

- `confirmed_pass`
  - checkpoint時点でscore/evidence/investigation/macro/accounting/critical-risk/source等の非価格hard gateを再現できた
  - この場合だけ価格signal探索へ進む
- `confirmed_block`
  - checkpoint時点で非価格hard gateのどれかが明確にBLOCK
  - 後日の株価が上がっても戦略成績へ入れない
- `unknown`
  - 証拠不足でpass/blockを再現できない
  - no-trade扱いせずresearch gapへ戻す

**unknown ≠ no-trade**。true no-tradeは `confirmed_pass` なのに価格hard gateが90日探索内で一度も成立しなかったケースだけ。

## First Eligible Signal の価格条件

候補日ごとに、その日までに観測できた情報だけで判定する。

- candidate date >= decisionCheckpoint
- candidate date >= priceReactionStartDate
- reaction-start後の観測済み範囲で absolute shock <= -5%
- stock shock-low日のbroad benchmark relative <= -3%
- `priceState = stabilized_after_drop`
- 未来の安値・未来の反発を使わない

初期shock windowはreaction start後20日。signal探索は90日を上限とする。

## 重要な禁止事項

- 非価格eligibility unknownをpass扱いしない
- unknownをno-tradeとして0%リターンへ変換しない
- confirmed_blockを後日の価格上昇で救済しない
- 後日判明した底値へsignalを遡及しない
- decisionCheckpointより前へsignalを戻さない
- 20日後の安値を初期shockとして使わない
- 市場全体と同程度の下落を企業固有signalにしない
- falling / volatile / rebound-too-fastをentry signalにしない

## 現在の実装

価格signal純粋関数:

`src/idiosyncratic-shock-entry-signal.ts`

Historical non-price eligibility:

`data/idiosyncratic_shock_case_context.yml`

Historical outcome / replay:

`src/idiosyncratic-shock-outcomes.ts`

Backfill:

`src/backfill-idiosyncratic-shock-outcomes.ts`

Calibration:

`src/idiosyncratic-shock-calibration.ts`

Research gap:

`src/idiosyncratic-shock-research-gaps.ts`

回帰テスト:

- `tests/idiosyncratic-shock-entry-signal.test.ts`
- `tests/idiosyncratic-shock-outcomes.test.ts`
- `tests/idiosyncratic-shock-calibration.test.ts`
- `tests/idiosyncratic-shock-calibration-config.test.ts`

## 実装済みmigration

### Stage 1 — Historical signal outcome

保存済み:

- strategyEligibilityAtCheckpoint
- firstEligibleSignalDate
- firstEligibleSignalPrice
- signalShockDrawdownPct
- signalRelativeShockDrawdownPct
- signalReturn1w/1m/3m/1y
- signalBenchmarkRelative1w/1m/3m/1y

checkpoint returnは診断用として別保持する。

### Stage 2 — Calibration metric

Local Opportunity calibrationの主要metricは **signalBenchmarkRelative3m**。

非価格eligibilityがconfirmed_passで、First Eligible Signalが存在し、signal後3m benchmark-relativeが取得できたケースだけreadiness母数へ入る。

### Stage 3 — Validated registry

`config/idiosyncratic-shock-calibration.yml` は `benchmarkMetric: signalBenchmarkRelative3m` のみ許可する。

threshold/weightsはsignal-based chronological train/validationを通したものだけ昇格できる。registryは現在空で、全市場threshold=12を維持する。

### Stage 4 — 本番とのparity

本番watchは既存の全hard gateを使用し、historical replayは非価格gateをsidecarで明示確認した後、同じ価格thresholdとstabilization定義でsignalを再現する。

完全な単一resolver化は将来の整理候補だが、少なくとも **未確認非価格gateを価格だけでpassさせない** fail-closed invariant は実装済み。

## 取得期間

signalはcheckpoint/reaction start後最大90日まで遅れる可能性があるため、outcome backfillはsignal後1年リターンまで欠損しないよう、checkpointから `90 + 380日` を上限に価格履歴を取得する。

## 最終的に比較するもの

- `checkpoint outcome`: 情報を確認したcheckpointからの企業価値変化。診断用。
- `signal outcome`: confirmed non-price eligibility後、実際の「下落一巡待ち」戦略を再現した成績。
- `confirmed_block`: 当時の戦略対象外。
- `unknown`: 証拠不足。研究キューへ戻す。
- `true no-trade`: 非価格gateは通ったが価格signalが出なかったケース。

国別threshold/weightsの学習ではsignal outcomeのみを使い、checkpoint outcomeを補助診断にする。
