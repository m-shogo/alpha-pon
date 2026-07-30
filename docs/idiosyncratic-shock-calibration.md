# 企業固有ショック — 共通コアと国別キャリブレーション

## 結論

Alpha Ponでは、国ごとに最初から別の「不祥事20点モデル」を作らない。

- **Global Structural Score**: 10項目・20点。事件の事実と企業への実害を世界共通の物差しで測る。
- **Context / Jurisdiction**: 本社国、事件国、上場市場、業種、被害者、支配構造、規制、流動性などを別レイヤーで確認する。
- **Local Opportunity Calibration**: 実際の将来リターンが十分に貯まり、out-of-sample検証できた国/地域/カテゴリだけ、通知閾値や将来の重みを独立させる。

「日本では不倫が重い」「米国では軽い」のような文化ステレオタイプを直接係数化しない。差分は実際の市場反応・業績・規制結果から学習する。

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
        ↓ 足りなければ
country
        ↓ 足りなければ
jurisdiction group
        ↓ 足りなければ
global default
```

## 現在の昇格条件

初期の保守的な条件。将来、十分なデータが貯まった後に条件自体を再検証する。

- country: 3か月benchmark相対outcomeが **30件以上**
- country × category: **20件以上**
- jurisdiction group: **40件以上**
- chronological train: **18件以上**
- chronological validation: **8件以上**

単純な件数だけでなく、後ろの時系列をvalidationとして残せることを必須にする。

## 大事な安全ルール

### 1. Global Structural Scoreは結果で書き換えない

事件当時に分かっていた事実で20点を付ける。後日株価が上がったから過去scoreを上げることは禁止。

### 2. 閾値候補を全期間で最適化しない

train期間で候補を作り、後ろのvalidation期間で確認する。

validation前は12点を維持する。

### 3. 子モデルが薄ければ親モデルへ戻る

たとえばUS全体30件が十分でも、US × executive_relationshipが20件しかなくholdoutを作れないなら、USカテゴリ専用モデルを使わずUS全体へ戻る。

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

## 将来のLocal Opportunity Score

十分なoutcomeが貯まるまでは実装上も有効化しない。

将来は、例えば次を別表示する。

```text
Global Structural Score: 17/20
US Local Opportunity: 14.6/20
US effective threshold: 13.8
calibration source: US / validated 78 cases
```

ただしLocal Opportunityの重みは人間が文化イメージで設定せず、out-of-sampleで再現した差分のみ採用する。

## ロードマップ

### Phase A — 共通データ品質

- 過去事例を増やす
- 負例・上場廃止・長期低迷も収集
- source confidenceを上げる
- event / checkpoint / outcomeを分離

### Phase B — JP / US outcome充足

- 1w / 1m / 3m / 1y
- broad benchmark relative
- peer/industry relative
- EPS/guidance等の事業結果
- missing outcome監査

### Phase C — JP / US country calibration

- readiness条件達成
- chronological train/validation
- 12点閾値の候補比較
- validationで再現した場合だけlocal thresholdを昇格

### Phase D — country × category

十分な母数があるカテゴリだけ分裂させる。

文化依存度が高いrelationship / statements / sabotageは特に同国データを重視する。

### Phase E — UK / Korea / China-HK / Europe

まずresearch-onlyで収集し、親モデルを使う。母数と価格providerが揃った地域から昇格する。

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
