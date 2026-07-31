# 企業固有ショック — Threshold Calibration Shadow Policy

## 目的

現在のproduction通知thresholdは **12/20**。

ただし、過去検証で `score >= 12` を先にhard gateとして適用し、その通過案件だけで「12点以上は成績が良い」と検証すると循環論法になる。

> 12点未満を最初から除外 → 12点以上だけの成績を見る → 12点が正しいと結論する

これを禁止するため、productionとthreshold研究を完全に分離する。

## 2つのeligibility

### Production eligibility

`strategyEligibilityAtCheckpoint`

現行運用をそのまま再現する。

- score >= 12
- accountingIntegrity > 0
- macroPrimaryCause = false
- investigation sufficiently complete
- critical license / delisting riskなし
- confounderがmajorではない
- checkpointまでに利用可能なtrusted primary source またはmajor media複数
- information leak / recurrence / remediation / liquidity / incident cluster等のhard blockerなし

score < 12 はproductionでは必ずBLOCK。

### Threshold-calibration eligibility

`calibrationEligibilityAtCheckpoint`

**score thresholdだけを外す**。

それ以外のhard gateはproductionと同じ。

重要:

- score < 12を自動PASSにしない
- production BLOCKを自動でshadow PASSへ読み替えない
- 低scoreケースは一次情報で別途レビューし、明示的に `confirmed_pass / confirmed_block` を記録する
- score >= 12の構造上有効なproduction PASSだけshadow研究へ再利用できる
- score < 12なのにraw `strategyEligibilityAtCheckpoint: confirmed_pass` と誤記されてもshadow PASSへ継承しない
- score >= 12でproduction BLOCKならthreshold由来ではないためshadowでもBLOCK

## PIT source gate

後から見つけた一次情報で過去checkpointをPASSへ書き換えない。

### case本体のlegacy source

- `publishedAt` が無い古いsourceは後方互換の技術負債として暫定許可
- `publishedAt` がある場合は `publishedAt <= decisionCheckpoint` の資料だけeligibilityへ使用
- future / malformed dateは除外

### 後付けsidecar evidence

`strategyEligibilityEvidenceSources` はさらに厳格にする。

- valid `publishedAt` 必須
- `publishedAt <= decisionCheckpoint` 必須
- undated / future evidenceはfail-closed

Production / Shadowのresolver本体で同じruleを使う。

## 2つのFirst Eligible Signal

### Production signal

- `firstEligibleSignalDate`
- `signalReturn*`
- `signalBenchmarkRelative*`

現行threshold=12を含む本番parity。

### Calibration shadow signal

- `calibrationFirstEligibleSignalDate`
- `calibrationSignalReturn*`
- `calibrationSignalBenchmarkRelative*`

score thresholdだけを外した比較研究用。

production通知には絶対に使わない。

どちらも **replay-ready reaction anchor** が必須。

## Reaction anchor

shadow研究でも未来情報・休場日誤差・provider欠損を許可しない。

証拠側replay-ready条件:

1. `announcementTiming` がknown
2. `priceReactionStartDate` が `YYYY-MM-DD`
3. `reactionAnchorEvidenceSources` に有効URL
4. `reactionAnchorNotes` に時刻/session/休場日の根拠

quantitative outcome生成時にさらに:

5. stockに `priceReactionStartDate` の実日足が存在
6. benchmarkにも同日の実日足が存在

片方でも無ければ `reactionAnchorStatus=unverified` へ降格し、Production / Shadow signalを生成しない。signal率の分母にも入れない。

## below-threshold shadow controls

### PASS

**Ootoya 2019 — 11/20**

production:

- score 11 → BLOCK

threshold calibration:

- checkpoint-safeな会社一次情報で調査・関係者処分・remediationを確認
- accounting / macro / critical listing risk / major confounder等の非score hard gateを通過
- score thresholdだけがproductionとの差

このケースは **production signalを生成しない** が、shadow signalは生成可能。

ただしOotoya 1件は研究開始点であり、threshold変更根拠ではない。

### BLOCK

低score controlを増やすためにhard gateを緩めてはいけない。

- **Papa John's 2018 — 11/20**: checkpoint時点で影響範囲調査未完 / open investigation
- **CBS 2018 — 11/20**: 独立law-firm調査継続中
- **Super Retail 2025 — 10/20**: Board自身が影響を未確定と開示
- **Wynn Resorts 2018 — 9/20**: open investigation + gaming license/suitability risk
- **KADOKAWA 2022 — 9/20**: 会長起訴・複数関係者へ波及、刑事手続継続
- **Sukiya 2025 — 8/20**: 別の害虫混入、原因調査中、全店規模一時閉店 → open investigation + major confounder + incident cascade
- **Activision Blizzard 2021 — 8/20**: regulator/workplace issue継続、systemic recurrence、remediation未完
- **Kobayashi Pharma 2024 — 8/20**: 健康被害原因・影響範囲未確定、全製造番号回収継続 → open investigation

これらはscoreが低いからBLOCKなのではなく、**score gateを外しても残る非score hard blocker**がある。

## Stable blocker taxonomy

resolverの自由文だけを研究集計軸にしない。

例:

- `investigation_open`
- `critical_listing_or_license_risk`
- `major_confounder`
- `systemic_recurrence`
- `incident_cascade`
- `source_gate_missing`
- `eligibility_unverified`

これにより「score不足」と「研究未完 / hard blocker」を分離する。

## Threshold変更最低gate

threshold変更を検討する最低条件:

- score < 12 のreplay-ready shadow controls: **8件以上**
- score 10–11: **4件以上**
- score 8–9: **2件以上**
- distinct categories: **3以上**
- JP: **2件以上**
- US: **2件以上**
- score < 12 のusable 3m shadow outcomes: **8件以上**
- score >= 12側にも十分な比較標本

件数を満たすためBLOCKをPASSへ変えてはいけない。

target未達なら:

```text
thresholdComparisonReady = false
```

**production threshold=12を変更しない。**

## Research queue priority

score 8–11のUNKNOWNを人間の印象で選ばない。

`idiosyncratic-shock-threshold-research-plan` はfuture returnを入力に使わず、以下の構造的不足だけで優先順位を決める。

- score8–9不足
- score10–11不足
- JP不足
- US不足
- 新カテゴリ候補
- reaction anchor replay-ready

confirmed BLOCKはqueueへ戻さない。結果が良さそうな銘柄から調べるselection biasを避ける。

## Signal率とリターンを分離する

shadow PASS + replay-readyでも、価格条件が成立しないケースがある。

その場合:

- return = 0% として扱わない
- calibration return統計の分母には入れない
- ただし `signalRate` の分母には残す

各score bucketで:

- `eligibleCases`
- `cases` = signal件数
- `signalRate`
- signal後1m / 3m / 1y return
- benchmark relative
- median
- positive rate

を別々に比較する。

例えばeligible 2件中signal 1件なら:

- signalRate = 50%
- return統計 n = 1

no-signalを0%リターンへ変換しない。

## Research definitionをoutcome前にfreezeする

`idiosyncratic-shock-research-snapshot-contract` で以下をSHA256固定する。

- case facts
- score
- decision checkpoint
- sources
- context / eligibility evidence
- reaction anchor
- case-selection provenance

realized future outcomeはhash対象外。

したがって:

- outcomeを後から追加 → research hashは変わらない
- score / source / context / selection provenanceを変更 → hashが変わる

正式outcome datasetには `researchSnapshotSha256` を保存する。

## Case selection / prospective validation

既存historical事例をretrospectiveに収集した場合、それを「未見holdout」と呼ばない。

selection provenance:

- `retrospective_research`
- `prospective_pre_outcome`
- `matched_negative_control`

prospective holdout eligibleになる条件:

- `selectionMode = prospective_pre_outcome`
- `outcomeVisibilityAtSelection = not_observed`

provenance不明のlegacy caseはresearch-only。

### Retrospective temporal validation

retrospective research pool内で古い75% / 新しい25%のようにchronological splitし、temporal robustnessを確認する。

これは有効な検査だが、真のprospective holdoutではない。

### Prospective holdout

固定した候補threshold / weightsを、outcome観測前登録caseで独立検証する。

対象model levelでusable prospective outcomeが **8件以上** 必須。

`calibrateShockThresholds()` はdefaultでresearch scopeだけを集計し、prospective holdoutを自動除外する。

- default: research fitting/calibration
- `scope: prospective`: holdout評価
- `scope: all`: 明示的descriptive用途のみ

prospective結果をthreshold fittingへ逆流させない。

## Local calibrationの正本metric

validated registryが使用できるmetricは:

```text
calibrationSignalBenchmarkRelative3m
```

のみ。

旧production metric `signalBenchmarkRelative3m` をregistryへ登録するとvalidation errorにする。

さらにregistry entryには:

```text
validationDesign: prospective_pre_outcome
```

を必須にする。

registry値が存在するだけではlocal thresholdを有効化しない。実outcome observations側でもprospective holdout最低件数を満たす必要がある。

## Matched negative control

「Shock Scoreが効いた」のか「単に大幅下落株が反発した」のかを分離する。

future returnを一切matching inputに使わず、reaction時点で分かる情報だけでcontrolを選ぶ。

- same market
- same sector
- same reaction date
- raw drawdownが近い
- benchmark-relative drawdownが近い
- known shockを除外
- earnings/guidance等material corporate eventを除外
- abnormal liquidityを除外

matchingはdeterministicにする。

## 現在地

- production threshold: **12のまま**
- below-threshold explicit shadow PASS: **Ootoya 2019（11点）**
- researched below-threshold shadow BLOCK: **Papa John's / CBS / Super Retail / Wynn / KADOKAWA / Sukiya / Activision Blizzard / Kobayashi Pharma**
- threshold comparison target: **未達**
- validated local registry: **空**
- prospective holdout: **まだ未充足**
- `data/idiosyncratic_shock_outcomes.json`: **まだ正式生成していない**
- empirical 1m/3m/1y performance: **まだ結論を出さない**

## 昇格までの流れ

1. historical caseを収集
2. production eligibilityをcheckpoint-safe evidenceで再現
3. score < 12 はthreshold-calibration eligibilityを別途調査
4. reaction anchorをevidence + price sessionでreplay-ready化
5. research definition / selection provenanceをfreeze
6. quantitative backfill
7. production signalとshadow signalを別保存
8. research scopeでscore bucketごとのeligible件数 / signal率 / shadow 3m benchmark-relativeを計測
9. matched-drawdown negative controlと比較
10. retrospective chronological train / temporal-validationで候補を固定
11. live caseをoutcome前にprospective登録
12. prospective holdoutで独立検証
13. 十分なsample・prospective再現があるlocal modelだけvalidated registryへ登録
14. validation不成立ならthreshold=12へ縮退

## 禁止事項

- score < 12を自動shadow PASSにする
- production BLOCKをscoreだけ見てshadow PASSへ変える
- open investigationを低score control確保のためPASSにする
- checkpoint後sourceで過去PASSを作る
- no-signalを0% returnとして混ぜる
- production signalをthreshold検証metricへ戻す
- retrospective chronological sliceをprospective OOSと呼ぶ
- prospective holdoutをthreshold fittingへ戻す
- registry値だけでvalidatedへ昇格する
- future outcomeをcheckpoint score/eligibilityへ逆流させる
- 少数標本でthresholdを変更する

## 関連ファイル

- `src/idiosyncratic-shock-case-context.ts`
- `src/idiosyncratic-shock-case-selection.ts`
- `src/idiosyncratic-shock-research-snapshot-contract.ts`
- `src/idiosyncratic-shock-outcomes.ts`
- `src/idiosyncratic-shock-outcome-contract.ts`
- `src/idiosyncratic-shock-calibration.ts`
- `src/idiosyncratic-shock-calibration-config.ts`
- `src/idiosyncratic-shock-negative-control.ts`
- `src/idiosyncratic-shock-threshold-research-plan.ts`
- `src/idiosyncratic-shock-threshold-calibration-audit.ts`
- `tests/idiosyncratic-shock-low-score-controls.test.ts`
- `tests/idiosyncratic-shock-prospective-calibration-isolation.test.ts`
- `config/idiosyncratic-shock-calibration.yml`
- `data/idiosyncratic_shock_case_selection.yml`
