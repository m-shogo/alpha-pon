# 企業固有ショック — First Eligible Signal Policy

## なぜ必要か

`decisionCheckpoint` は「一次情報・調査範囲などを確認して判断可能になった日」であり、実際の投資方針である「下落して落ち着いたら調査候補として通知する日」とは一致しない。

過去検証をdecision checkpointの価格だけで測ると、次の誤差が入る。

- 調査完了時点ではまだ急落途中だった
- 反対に、調査完了時点では既に急反発していた
- 後から見た底値を無意識に基準へ使う
- 実際の通知hard gateを再現していない

そのため、今後の戦略成績は **First Eligible Signal** を正本にする。

## 3つの日付を分離する

1. `eventDate / detectedAt`
   - 事件史の正本
2. `decisionCheckpoint`
   - 当時の一次情報・調査範囲が判断可能になった最初の日
3. `firstEligibleSignalDate`
   - decision checkpoint以降、価格hard gateまで含めて初めて通知条件が成立した取引日

## First Eligible Signal の条件

候補日ごとに、その日までに観測できた情報だけで判定する。

- candidate date >= decisionCheckpoint
- candidate date >= priceReactionStartDate
- reaction-start後の観測済み範囲で absolute shock <= -5%
- stock shock-low日のbroad benchmark relative <= -3%
- `priceState = stabilized_after_drop`
- 未来の安値・未来の反発を使わない

初期shock windowはreaction start後20日。signal探索は初期実装では90日を上限とする。

## 重要な禁止事項

- 後日判明した底値へsignalを遡及しない
- decisionCheckpointより前へsignalを戻さない
- 20日後の安値を初期shockとして使わない
- 市場全体と同程度の下落を企業固有signalにしない
- falling / volatile / rebound-too-fastをentry signalにしない

## 現在の実装

純粋関数:

`src/idiosyncratic-shock-entry-signal.ts`

回帰テスト:

`tests/idiosyncratic-shock-entry-signal.test.ts`

この層は、各候補日の時点までに存在した株価/benchmarkだけを使って最初のeligible日を返す。

## 次のmigration

### Stage 1

Historical outcomeへ以下を追加する。

- firstEligibleSignalDate
- firstEligibleSignalPrice
- signalReturn1w
- signalReturn1m
- signalReturn3m
- signalReturn1y
- signalBenchmarkRelative1m/3m/1y

### Stage 2

Local Opportunity calibrationの主要metricを、decision-checkpoint起点から **signalBenchmarkRelative3m** へ移す。

checkpoint returnは研究用の比較値として残す。

### Stage 3

validated registryのthreshold/weightsはsignal-based chronological train/validationだけから昇格させる。

### Stage 4

実運用通知とhistorical replayの判定器を共通化し、過去backtestと本番でhard gateがずれないようにする。

## 最終的に比較するもの

- `checkpoint outcome`: 情報を確認できた時点からの企業価値変化
- `signal outcome`: 実際の「下落一巡待ち」戦略を再現した成績

国別threshold/weightsの学習ではsignal outcomeを主とし、checkpoint outcomeを補助診断にする。
