# 企業固有ショック — 共通コアと国別キャリブレーション

## 結論

Alpha Ponでは、国ごとに最初から別の「不祥事20点モデル」を作らない。

- **Global Structural Score**: 10項目・20点。事件の事実と企業への実害を世界共通の物差しで測る。
- **Context / Jurisdiction**: 本社国、事件国、上場市場、業種、被害者、支配構造、規制、流動性などを別レイヤーで確認する。
- **Local Opportunity Score**: 十分なoutcomeが貯まり、out-of-sample検証を通った国/地域/カテゴリだけ、10項目の重みと通知閾値を独立させる。

「日本では不倫が重い」「米国では軽い」のような文化ステレオタイプを直接係数化しない。差分は実際の市場反応・業績・規制結果から学習する。

## 共通化するもの / 分けるもの

### 世界共通

- event facts
- 10項目の意味
- 0/1/2の事実評価
- 会計不正・免許取消等のhard gate
- event / decision checkpoint / outcomeの分離
- 将来情報を過去scoreへ混ぜない原則

### 国・地域・カテゴリで差分化可能

- 各10項目の重要度 (`dimensionWeights`)
- 実効通知threshold
- 類似事例のローカル/地域/世界weight
- 追加確認すべき制度・規制軸

ただし差分を有効化できるのは、時系列holdoutで再現し、registryへ証跡付きで登録した場合だけ。

## なぜ完全分離しないか

完全に国別へ分けると、少数標本で偽の精度が出る。

例:

- JP 100件
- US 250件
- KR 12件
- FR 7件

この状態でKR専用係数を12件だけから最適化すると、偶然に強く適合する危険が高い。

そのため階層は次の順で使う。

```text
country × category
        ↓ 未検証なら
country
        ↓ 未検証なら
jurisdiction group
        ↓ 未検証なら
global default
```

重要: **子モデルがholdout-readyになっただけでは親モデルを捨てない。** 子がregistryへvalidatedとして登録されるまでは、検証済みの親モデルを使い続ける。

## 現在の昇格条件

初期の保守的な条件。将来、十分なデータが貯まった後に条件自体を再検証する。

- country: 3か月benchmark相対outcomeが **30件以上**
- country × category: **20件以上**
- jurisdiction group: **40件以上**
- chronological train: **18件以上**
- chronological validation: **8件以上**

単純な件数だけでなく、後ろの時系列をvalidationとして残せることを必須にする。

## validated registry

正本:

```text
config/idiosyncratic-shock-calibration.yml
```

初期状態は `validatedLocalThresholds: []`。つまり現在は全市場でGlobal scoreとdefault threshold 12を使用する。

local modelを有効化するには、最低でも次を登録する。

- modelLevel
- country / jurisdictionGroup / category
- scoreMethod
- optional validated dimensionWeights
- threshold
- train period / validation period
- trainCases / validationCases
- benchmarkMetric
- evidenceNote

### scoreMethod

`global_structural`
: 10項目の重みは共通のまま、検証済みlocal thresholdだけを使う。

`weighted_dimensions`
: 検証済み国/地域/カテゴリweightsでLocal Opportunity Scoreを計算し、そのlocal thresholdと比較する。

重みは0.25〜4の範囲に制限し、10項目すべてを明示する。計算結果は0〜20へ正規化する。

registryが空、不一致、現在のdataでholdout条件を満たさない、またはより深いモデルが未承認の場合は、検証済み親モデルまたはGlobal defaultへfail-closedで戻る。

## 大事な安全ルール

### 1. Global Structural Scoreは結果で書き換えない

事件当時に分かっていた事実で20点を付ける。後日株価が上がったから過去scoreを上げることは禁止。

### 2. 閾値・重み候補を全期間で最適化しない

train期間で候補を作り、後ろのvalidation期間で確認する。

validation + registry登録前は12点/共通weightを維持する。

### 3. 子モデルが未承認なら検証済み親モデルへ戻る

US全体のvalidated modelがあって、US × executive_relationshipが十分な母数へ育っても、その子モデルがvalidation未承認ならUS全体モデルを継続利用する。

### 4. 観測できない事例を成功扱いしない

3か月benchmark相対returnが欠損しているケースは、country calibrationの母数に入れない。

### 5. 生存者バイアスを監査する

有名な「戻った会社」だけを収集しない。

- 上場廃止
- 長期低迷
- 買収で消滅
- 売買停止
- 事件後に追加不正が発覚
- 判断時点では魅力的に見えたが失敗

も同じDBへ入れる。

## 国の切り方

「日本 vs 海外」にはしない。一方、少ないデータを無理に一国モデル化もしない。

現在のjurisdiction group:

- JP
- US
- UK
- EUROPE
- COMMONWEALTH (AU/CA)
- KR
- CN
- HK
- SG
- TW
- OTHER

KR / CN / HK / SG / TWを「東アジア文化」として自動で一括りにしない。文化依存度の高いrelationship / harassment / statements / sabotage等で誤った相互学習を避けるため、まず別jurisdictionとしてデータを蓄積する。

EUROPEなども、DE/FR等の国別データが十分に貯まればcountry modelへ分裂できる。

## 追加した盲点

国/文化だけでは不十分なので、次をContext Risk Mapへ保持する。

- listing structure: single / ADR / dual / secondary
- ownership control: dispersed / founder-family / state-controlled / parent-controlled / concentrated
- liquidity: normal / thin / halted / limit-locked
- incident cluster: single / related multiple / cascade
- disclosure observability: high / medium / low
- issuer country と incident country
- sector risk class
- stakeholder
- incident scope
- simultaneous confounders
- information leak / event-date uncertainty
- recurrence
- remediation quality
- incident-region revenue exposure
- direct cost / market cap
- industry-relative shock

### 売買停止・値幅制限

価格発見が終わっていないため `stabilized_after_drop` と判定しない。

### ADR / 二重上場

ADRだけの値動きではなくprimary listingを同日比較する。取引時間差と為替も確認する。

### 創業家・国有・親会社支配

人物が辞任しても支配権が残る可能性がある。`actorSeparability` を見かけだけで高くしない。

### 連鎖不祥事

短期間に関連事件が複数出ている場合、最初の1件だけを「局所的な個人事件」として買い場判定しない。

### 開示観測性

国によってIR・規制当局・報道の観測可能性が違う。ニュースが少ないことを「問題が軽い証拠」にしない。

## Local Opportunity Score

実装済み。ただしvalidated registryが空の現在は自動的にGlobal Structural Scoreと同じ値になる。

将来の表示例:

```text
Global Structural Score: 17/20
US Local Opportunity: 14.6/20
US effective threshold: 13.8
method: weighted_dimensions
calibration source: US / validated 78 cases
```

Local Opportunityの重みは人間が文化イメージで設定せず、out-of-sampleで再現した差分のみ採用する。

## ロードマップ

### Phase A — 共通データ品質

- 過去事例を増やす
- 負例・上場廃止・長期低迷も収集
- source confidenceを上げる
- event / checkpoint / outcomeを分離
- dataset bias / disclosure observabilityを監査

### Phase B — JP / US outcome充足

- 1w / 1m / 3m / 1y
- broad benchmark relative
- peer/industry relative
- EPS/guidance等の事業結果
- missing outcome監査

### Phase C — JP / US country calibration

- readiness条件達成
- chronological train/validation
- threshold候補を比較
- dimension weight候補を比較
- validationで再現した場合だけregistryへ昇格

### Phase D — country × category

十分な母数があるカテゴリだけ分裂させる。

文化依存度が高いrelationship / statements / sabotageは特に同国データを重視する。

### Phase E — UK / Korea / China / Hong Kong / Europe / Singapore / Taiwan

まずresearch-onlyで収集し、検証済み親モデルを使う。母数と価格providerが揃った地域から昇格する。

### Phase F — 継続検証

閾値・重みは固定の真理にしない。walk-forwardで劣化を検知し、再現しなければ親モデルへ降格できるようにする。

## コマンド

```text
pnpm report:shock-calibration
```

出力:

- `reports/idiosyncratic_shock_calibration_latest.json`
- `reports/idiosyncratic_shock_calibration_latest.md`

このレポートはネットワーク不要。outcome DBが無い場合も0件として安全にreadinessを出す。
