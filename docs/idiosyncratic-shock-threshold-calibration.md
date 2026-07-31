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
- trusted primary source またはmajor media複数
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
- score >= 12の有効なproduction PASSはshadow研究へ再利用できる
- score >= 12でproduction BLOCKならthreshold由来ではないためshadowでもBLOCK

## 低score raw production PASSの禁止

score < 12なのに誤って

```yaml
strategyEligibilityAtCheckpoint: confirmed_pass
```

と書かれていても、shadow PASSへ継承しない。

低scoreをthreshold研究へ入れるには必ず:

```yaml
calibrationEligibilityAtCheckpoint: confirmed_pass
calibrationEligibilityNotes: "..."
```

が必要。

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

shadow研究でも未来情報・休場日誤差を許可しない。

replay-ready条件:

1. `announcementTiming` がknown
2. `priceReactionStartDate` が `YYYY-MM-DD`
3. `reactionAnchorEvidenceSources` に有効URL
4. `reactionAnchorNotes` に時刻/session/休場日の根拠

## 最初のbelow-threshold shadow control

### Ootoya 2019 — 11/20

production:

- score 11 → BLOCK

threshold calibration:

- 2019-02-18会社一次情報で社内調査結果・関係従業員3名の退職処分を確認
- 2019-03-04までに再発防止策・全店休業/再教育方針を公表
- accounting / macro / critical listing risk / major confounderを確認せず
- score threshold以外のhard gateはPASS

したがって:

```yaml
calibrationEligibilityAtCheckpoint: confirmed_pass
```

reaction anchor:

- 2019-02-16（土）会社公表
- 東証休場
- 最初の通常取引反応日 = 2019-02-18

このケースは **production signalを生成しない** が、shadow signalは生成可能。

## 低scoreでもBLOCKの例

低score controlを増やすためにhard gateを緩めてはいけない。

### Papa John's 2018 — 11/20

checkpoint 2018-07-13時点ではSpecial Committee / external auditが未完。

→ shadowでも `investigationStatus=open` BLOCK。

### CBS 2018 — 11/20

checkpoint 2018-09-10時点で独立law-firm調査が継続中。
最終結論は12月。

→ shadowでもBLOCK。

### Super Retail 2025 — 10/20

CEO解任時点でBoard自身が新情報のimplicationsを今後検討すると明示。

→ shadowでも影響範囲未確定としてBLOCK。

## Selection-bias gate

`audit:shock-threshold-calibration`

threshold変更を検討する最低条件:

- score < 12 のreplay-ready shadow controls: **8件以上**
- score < 12 のusable 3m shadow outcomes: **8件以上**
- score >= 12側にも十分な比較標本

target未達なら:

```text
thresholdComparisonReady = false
```

**production threshold=12を変更しない。**

Ootoya 1件は研究開始点であり、閾値変更の根拠ではない。

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

## Local calibrationの正本metric

validated registryが使用できるmetricは:

```text
calibrationSignalBenchmarkRelative3m
```

のみ。

旧production metric:

```text
signalBenchmarkRelative3m
```

をregistryへ登録するとvalidation errorにする。

## 昇格までの流れ

1. historical caseを収集
2. production eligibilityを再現
3. score < 12 はthreshold-calibration eligibilityを別途調査
4. reaction anchorをreplay-ready化
5. quantitative backfill
6. production signalとshadow signalを別保存
7. score bucketごとにsignal率 + shadow 3m benchmark-relativeを計測
8. chronological train / validation
9. 十分なsample・holdoutがあるlocal modelだけvalidated registryへ登録
10. validation不成立ならthreshold=12へ縮退

## 禁止事項

- score < 12を自動shadow PASSにする
- production BLOCKをscoreだけ見てshadow PASSへ変える
- open investigationを低score control確保のためPASSにする
- no-signalを0% returnとして混ぜる
- production signalをthreshold検証metricへ戻す
- future outcomeをcheckpoint score/eligibilityへ逆流させる
- 少数標本でthresholdを変更する

## 関連ファイル

- `src/idiosyncratic-shock-case-context.ts`
- `src/idiosyncratic-shock-outcomes.ts`
- `src/idiosyncratic-shock-calibration.ts`
- `src/idiosyncratic-shock-calibration-config.ts`
- `src/idiosyncratic-shock-backfill-plan.ts`
- `src/idiosyncratic-shock-threshold-calibration-audit.ts`
- `tests/idiosyncratic-shock-threshold-calibration.test.ts`
- `tests/idiosyncratic-shock-outcomes.test.ts`
- `config/idiosyncratic-shock-calibration.yml`
