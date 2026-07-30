# 企業固有ショック — First Eligible Signal Policy

## なぜ必要か

`decisionCheckpoint` は「一次情報・調査範囲などを確認して判断可能になった日」であり、実際の投資方針である「非価格hard gateを通過し、下落して落ち着いたら調査候補として通知する日」とは一致しない。

過去検証をdecision checkpointの価格だけで測ると、次の誤差が入る。

- 調査完了時点ではまだ急落途中だった
- 反対に、調査完了時点では既に急反発していた
- 後から見た底値を無意識に基準へ使う
- 非価格hard gate未確認のケースまで戦略成績へ混ぜる
- sourceTypeの誤ラベルだけで一次情報確認済みに見せてしまう
- 実際の通知hard gateを再現していない

そのため、今後の戦略成績は **verified structured non-price eligibility + First Eligible Signal** を正本にする。

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
  - checkpoint時点でscore/evidence/investigation/macro/accounting/critical-risk/source/context blockerを再現できた
  - この場合だけ価格signal探索へ進む
- `confirmed_block`
  - checkpoint時点で非価格hard gateのどれかが明確にBLOCK
  - 後日の株価が上がっても戦略成績へ入れない
- `unknown`
  - 証拠不足でpass/blockを再現できない
  - no-trade扱いせずresearch gapへ戻す

**unknown ≠ no-trade**。true no-tradeは `confirmed_pass` なのに価格hard gateが90日探索内で一度も成立しなかったケースだけ。

## `confirmed_pass` は文字列だけでは成立しない

sidecarへ `strategyEligibilityAtCheckpoint: confirmed_pass` と書いても、それだけではPASSにならない。

共有resolver `resolveHistoricalStrategyEligibilityDetailed()` が最低限以下を再検証する。

- historical score >= 12
- `accountingIntegrity > 0`
- `macroPrimaryCause = false`
- `strategyInvestigationStatusAtCheckpoint` が `substantially_complete / closed / not_applicable`
- `strategyCriticalLicenseOrDelistingRiskAtCheckpoint = false`
- `confounderStatus` が `clear / possible`
- trusted primary source、またはmajor media 2件以上
- information leakが`likely`ではない
- recurrenceが`systemic`ではない
- remediationが`weak`ではない
- liquidityが`halted / limit_locked`ではない
- incident clusterが`cascade`ではない
- peer-relative shockが与えられている場合、企業固有性が弱すぎない
- `after_close / non_trading_day` 発表なら `priceReactionStartDate` が存在する

明確なblockerがあれば、手動で `confirmed_pass` と書いても `confirmed_block` が優先される。

必要証拠が欠けていればblockではなく `unknown` に落とす。これは「危険だから不採用」と「まだ調べていない」を分離するため。

### deterministic checkpoint block

PASSは一次情報を確認するまで絶対に自動推定しない。一方、checkpoint正本だけで現行hard gate違反が確定する場合はsidecar未記載でも `confirmed_block` を自動導出する。

現在の自動BLOCK:

- historical score < 12
- `accountingIntegrity = 0`
- `macroPrimaryCause = true`

これらは追加調査でPASSへ反転しない構造条件なので、unknown研究キューを水増ししない。

### eligibility専用 evidence

case本体のsourceは事件研究の正本として保持する。非価格eligibilityを後から追加検証した場合は、sidecarの `strategyEligibilityEvidenceSources` にSEC/会社IR/規制当局/取引所正本を保存する。

sourceTypeラベルだけは信用しない。`isTrustedHistoricalPrimarySource()` がURL hostも確認する。

- `regulator`: 政府・規制当局domainを要求
- `exchange`: JPX/TDnet/NYSE/Nasdaq/LSE/HKEX/ASX等の公式domainを要求
- `company`: issuer domainを許容するが、Minkabu/Yahoo Finance/Investing/Reuters/Kabutan等の既知aggregator/media hostをprimary扱いしない

したがって、Minkabu URLを誤って `sourceType: exchange` と記録してもprimary gateは通らない。

`audit:shock-history` とoutcome backfillは同じresolverを使う。レポートではPASSでもbackfillではunknown、という判定分裂を許さない。

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
- `sourceType` だけで一次情報と断定しない
- checkpoint後に判明した事実をcheckpoint eligibilityへ逆流させない
- 後日判明した底値へsignalを遡及しない
- decisionCheckpointより前へsignalを戻さない
- 20日後の安値を初期shockとして使わない
- 市場全体と同程度の下落を企業固有signalにしない
- falling / volatile / rebound-too-fastをentry signalにしない

## Event timing

開示日時と市場が反応可能な最初の取引日を分離する。

例: 2026-05-29 15:30のサンリオ適時開示は、その日の引け時刻に公表されたためhistorical replayでは `announcementTiming=after_close`、`priceReactionStartDate=2026-06-01` とする。

この場合、5/29終値を「調査報告を織り込んだ価格」として使わない。

## 現在の実装

価格signal純粋関数:

`src/idiosyncratic-shock-entry-signal.ts`

Historical non-price eligibility:

- `src/idiosyncratic-shock-case-context.ts`
- `data/idiosyncratic_shock_case_context.yml`

Historical outcome / replay:

`src/idiosyncratic-shock-outcomes.ts`

Backfill:

`src/backfill-idiosyncratic-shock-outcomes.ts`

Calibration:

`src/idiosyncratic-shock-calibration.ts`

Research gap:

`src/idiosyncratic-shock-research-gaps.ts`

Audit:

`src/idiosyncratic-shock-audit.ts`

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

本番watchは既存の全hard gateを使用する。historical replayは共有resolverで非価格/context blockerをfail-closed再現した後、同じ価格thresholdとstabilization定義でsignalを再現する。

PASSは一次情報 + structured fieldsで明示確認し、未確認非価格gateを価格だけでpassさせない。

## Provider-independent research queue

`report:shock-research-gaps` は価格providerなしでも全historical caseを `confirmed_pass / confirmed_block / unknown` へ分類し、JP/USのunknownをP0研究キューへ出す。

価格API未設定を理由に「次に何を調べるべきか」が見えなくなることを防ぐ。

## 取得期間

signalはcheckpoint/reaction start後最大90日まで遅れる可能性があるため、outcome backfillはsignal後1年リターンまで欠損しないよう、checkpointから `90 + 380日` を上限に価格履歴を取得する。

## 最終的に比較するもの

- `checkpoint outcome`: 情報を確認したcheckpointからの企業価値変化。診断用。
- `signal outcome`: confirmed non-price eligibility後、実際の「下落一巡待ち」戦略を再現した成績。
- `confirmed_block`: 当時の戦略対象外。明白なscore/accounting/macro/context blockerは自動導出可能。
- `unknown`: 証拠不足。研究キューへ戻す。
- `true no-trade`: 非価格gateは通ったが価格signalが出なかったケース。

国別threshold/weightsの学習ではsignal outcomeのみを使い、checkpoint outcomeを補助診断にする。
