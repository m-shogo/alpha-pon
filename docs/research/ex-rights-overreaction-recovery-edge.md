# Ex-Rights Overreaction Recovery Edge

Issue: #1280

## 目的

配当・株主優待の権利落ち日に発生する下落のうち、権利価値の機械的調整と市場要因では説明しきれない「余計な下げ」を分離し、支配的な新規悪材料がないケースでその後の回復に再現可能なEdgeがあるか検証する。

ユーザーが実際に使いたい判断は「人気株などが権利落ち後に必要以上に下がったが、会社自体は悪くなっていないなら買い候補にしたい」である。ただしResearch OSでは結論を先に置かず、戻った事例と戻らなかった事例を同一基準で蓄積する。

## 一番重要な比較

権利前に買った人は株価だけでなく配当・優待を受け取る。したがって単純に `権利前終値 - 権利落ち価格` を「安くなった」と解釈してはいけない。

まず次を計算する。

```text
rightsValuePerShare = dividendValuePerShare + benefitCashEquivalentPerShare

effectivePreRightsCost = preExClose - rightsValuePerShare
postExDiscountJpy = effectivePreRightsCost - entryPrice
```

`postExDiscountJpy > 0` なら、権利を取った投資家の実質取得コストと比べても、権利落ち後の買い手が安く入れる状態である。

さらに市場・業種要因を除く。

```text
grossDropBps = (preExClose - entryPrice) / preExClose * 10000
mechanicalDropBps = rightsValuePerShare / preExClose * 10000
benchmarkExpectedDropBps = PIT beta * benchmarkDropBps
residualDropBps = grossDropBps - mechanicalDropBps - benchmarkExpectedDropBps
```

下落を正のbpsで統一する。benchmarkが上昇した場合は `benchmarkExpectedDropBps` が負になり、個別株の余計な弱さをより大きく評価する。

## 「元通り以上」を複数定義する

単一の回復判定だけではEdgeの性質を誤るので、以下を別々に記録する。

1. **Raw reclaim**: 株価が権利前終値へ戻ったか
2. **Economic reclaim**: 権利価値控除後の実質価格を回復したか
3. **Overshoot**: 権利前終値を何bps上回ったか
4. **Time to reclaim**: 初回回復まで何営業日か
5. **Horizon return**: D+1 / D+3 / D+5 / D+10 / D+20 / D+60
6. **Abnormal return**: TOPIX・業種・matched controlを控除した回復
7. **MAE/MFE**: entry後さらにどこまで下がったか / どこまで上がったか

「最終的に戻った」だけでは途中の-15%を無視するため、MAEを必ず併記する。

## 悪情報の扱い

最重要の分離。後から知った情報でentry時点の判断を書き換えない。

### badNewsAtEntry

entry時点までに公開されていた情報だけで分類する。

- `none`: 企業価値を変える新規悪材料を確認できない
- `minor`: 小さい悪材料はあるが権利落ち下落の主因とは考えにくい
- `ambiguous`: 判断不能または複数材料が競合
- `dominant`: 決算失敗、下方修正、事故、不祥事、増資、行政処分等が下落を十分説明し得る

core Edgeは原則 `none` を主検証にする。`minor/ambiguous/dominant` は捨てずにcontrol cohortとして保存する。

### postEntryReveal

entry後D+3までに新しく出た悪材料は別管理する。後日判明した悪材料を使って「entry時点でも悪材料ありだった」と後知恵で書き換えない。

## 優待価値の測り方

優待の額面をそのまま現金と同じ価値にしない。

### 1. Fixed cash-like

デジタルギフト、QUOカード等。

- 額面を上限
- 交換手数料を控除
- 交換先制限が強い場合はhaircut

### 2. Ticket / coupon

テーマパーク券、映画券、食事券等。

- 公式通常料金を上限
- 利用期限、本人利用性、地域制約をhaircut
- 転売価格を主評価に使わない

### 3. Percentage rebate / discount

イオン型。

```text
benefitValue = expectedEligibleSpend * rebateRate
```

利用額を low / base / high の3シナリオで持ち、公式上限を超えない。利用しない投資家には価値0になり得る点を残す。

### 4. Long-holding requirement

長期継続保有が必要な優待は、新規買いで即取得できる価値と既存株主だけの価値を分離する。

### 5. One-off special benefit

Jトラスト型の今回限定優待はrecurring優待と絶対に混ぜない。権利落ち後に次回優待期待がないため、回復挙動が別物になる可能性が高い。

## 人気株を主観で決めない

「人気」は銘柄名の知名度ではなく、権利日前に確認可能な数値でスコア化する。

候補proxy:

- 株主数 percentile
- 優待利回り
- D-20〜D-1 turnover
- 権利前の異常出来高
- D-20 / D-10 / D-5 abnormal momentum
- 信用買残と信用倍率
- 権利月の出来高増加率
- 時価総額・流動性

これにより「イオンだから人気」ではなく、同じ定義で全銘柄を比較する。

## 重要な追加アイデア

### A. Pre-rights run-up tax

権利落ち日の下げだけでなく、権利前にどれだけ先回り上昇したかを見る。

権利前に+10%上昇していれば、権利落ち後-5%は単純な過剰下落ではなく、事前premiumの剥落かもしれない。

`preRunupBps` を必須交絡因子にする。

### B. Recovery quality score

単に戻った/戻らないではなく、

```text
RecoveryQuality = fastReclaim + lowMAE + positiveAbnormalReturn + persistence
```

のように、早く・深掘りせず・市場より強く・戻った後も維持する回復を高品質とする。

### C. False bargain detector

「優待分以上に下がった」だけでは買わない。

以下がある場合はfalse bargain候補:

- 決算失敗 / 下方修正
- 優待廃止・縮小
- 配当減額
- 増資・希薄化
- 不祥事・事故・行政処分
- 信用買い極端集中 + 権利前急騰
- 特別優待の終了で次回の支えがない

### D. Entry timing ladder

同じEdgeでもentry時刻で結果が変わるので別routeにする。

- ex-day open
- open + 30m
- ex-day close
- D+1 open
- D+1 close

寄り付きの一瞬の安値を後知恵で使わない。

### E. Ex-date drift

権利落ち日に買うのが最適とは限らない。D+1〜D+3まで売りが続く銘柄もあるため、

- immediate reversal
- 2-3 day drift then reversal
- no recovery

を分類する。

### F. Same-company repeated events

毎年同じ銘柄を大量に数えると1社の癖だけでEdgeが見える。統計ではcompany clusterを考慮し、同一銘柄の反復を独立サンプル扱いしすぎない。

### G. Survivorship bias guard

現在も優待を続けている人気銘柄だけを遡ると成功企業に偏る。

- 過去に優待廃止した企業
- 改悪した企業
- 上場廃止した企業
- 回復しなかった企業

も当時の権利制度から復元する。

## Cohort

最低でも以下を分ける。

- recurring benefit + dividend
- recurring benefit only
- dividend only
- one-off special benefit
- fixed cash-like benefit
- ticket/coupon benefit
- percentage rebate/discount benefit
- high popularity/crowding
- matched low-popularity control
- badNewsAtEntry none / minor / ambiguous / dominant
- pre-rights run-up high / low

## Matched control

同じ権利月の別銘柄から、

- 業種
- 時価総額
- 過去60日volatility
- liquidity
- benefit yield / dividend yield
- pre-rights momentum

が近い銘柄を比較対象にする。

さらに `dividend-only` を別controlにし、株主優待特有の個人投資家需給が存在するかを見る。

## 研究閾値

最初から「-3%以上なら買い」などと固定しない。

探索sample内で以下の候補を比較し、confirmatory/holdoutへ固定する。

- residual drop >= 50 bps
- >= 100 bps
- >= 200 bps
- >= 300 bps

閾値をholdoutを見ながら変えない。

## 成功条件

Edge候補として強いのは、以下が同時に成立する場合。

1. residual dropが大きいほど、その後のabnormal recoveryが単調に強くなる
2. `badNewsAtEntry=none` で特に強い
3. matched controlよりreclaim率が高い
4. open+30m等の現実的entryでも残る
5. spread/slippage控除後も正
6. one-off特別優待を除いても残る
7. recent sampleでも消えていない
8. untouched holdoutで再現する

## 反証されるパターン

- 権利価値を正しく引くと過剰下落自体がほぼ存在しない
- pre-rights run-upを控除すると回復優位性が消える
- 一般的な短期反転と差がない
- 人気株より非人気株でも同じ
- 寄り付きの瞬間安値を使わないと利益が出ない
- 戻るまでのMAEが大きすぎ実運用不能
- fixed-value one-off優待だけで成立
- 悪材料なし判定の再現性が低い

## 初期live observation

### AEON 8267 / 2026-08

通常の継続優待 + 配当の観測候補。権利前・権利落ち・その後D+60までを固定ルールで記録する。会話中の価格は正本にせず、一次/market data確認後にhistorical analogへ登録する。

### J Trust 8508 / 2026-08

今回限定の高額デジタルギフトというstress case。通常優待と混ぜず、one-off特別優待の権利premiumがどの程度剥落するかを見る。

## 将来のOwner Dashboard候補

研究で有効性が出た場合のみ、以下のような表示を検討する。

```text
権利落ち過剰下落候補
8267 AEON
実下落        -2.8%
推定権利価値  -0.9% (0.5-1.4%)
市場要因      -0.4%
Residual      -1.5%
悪材料        none (high confidence)
過去同型      D+20 reclaim 68%
人気/crowding high
状態           RESEARCH CANDIDATE
```

これはBUY表示ではなく、調査候補を理由付きで発掘する表示に留める。

## Safety / boundary

- Research Edgeであり自動売買に接続しない
- BUY推奨へ昇格させない
- 実サンプルはPIT一次資料と価格確認後にのみ追加
- 成功例だけを選ばない
- generated index/dashboardを手編集しない
- SNS・掲示板・匿名投稿を研究根拠にしない
