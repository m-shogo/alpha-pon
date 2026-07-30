# 企業固有ショック / 不祥事ディップ・インテリジェンス

## 目的

世界情勢・金利・為替・関税・食糧不足・戦争・災害などのマクロ要因ではなく、**個別企業だけに発生した不祥事・炎上・ガバナンス事件による株価下落**を収集し、過去の類似事例と比較して「調査候補」を作る。

これは売買推奨ではない。狙うのは不祥事そのものではなく、**企業価値への実害より市場の短期反応が大きい可能性があるケース**を、後から検証できる形で蓄積すること。

事件構造の評価は世界共通とし、価格・benchmark・一次情報経路だけ市場別に扱う。

## 対象

### 優先して拾う

- CEO / 役員の社内恋愛・不倫・性的 misconduct
- 役員の個人的な不適切報酬・経費・私的利益
- 役員個人の暴言・差別発言・SNS炎上
- 役員・従業員個人の逮捕・贈収賄・私的犯罪
- 従業員1人〜少人数による不適切動画・バイトテロ
- 顧客による迷惑動画など、会社の本業に直接起因しないブランドショック
- 店舗単位の異物混入・オペレーション事故
- 個人を切り離すことで事業が継続できる可能性があるガバナンス事件

### 負例として必ず拾う

成功寄り事例だけを学習すると判定が楽観側へ歪むため、次も過去事例DBへ入れる。

- 粉飾・売上架空計上・循環取引・財務報告の虚偽
- 組織ぐるみの不正
- 規制当局から長期間事業制限を受ける事件
- 製品安全・品質偽装が事業そのものを傷つける事件
- 創業者・CEOがブランド/競争力そのもので切り離せない事件
- 少人数起因でも過年度訂正まで発生した会計事件
- 個人犯罪でも、金融・保険など顧客資産と信頼の中核を直接傷つける事件

KDDI/BIGLOBE 2026のように行為者が少人数でも、架空取引が財務諸表訂正へ到達した場合は個人切除型として扱わない。

### このレイヤーでは対象外

- 戦争・地政学
- 関税・輸出規制・制裁
- 金利・為替・インフレ
- 食糧不足・原材料不足
- 景気後退
- 地震・台風など自然災害
- 市況サイクル

これらは既存の world-impact / special-situation で扱う。

為替は企業固有shockの価格ゲートには混ぜない。現地通貨建て株価と同じ市場のbenchmarkを比較し、JPY換算損益は別レイヤーで扱う。

## 市場別設計

事件カテゴリ、actor type、10項目score、evidence / investigation、類似距離は共通。

価格providerとbenchmarkは市場ごとに分離する。

| market | benchmark | price provider | live自動価格判定 |
|---|---|---|---|
| JP | TOPIX（既定proxy 1306） | J-Quants | 実装済み。設定時のみ |
| US | S&P 500（既定proxy SPY） | Twelve Data | 実装済み。API key設定時のみ |
| UK | FTSE 100 | 未実装 | fail-closed |
| EUROPE | STOXX Europe 600 | 未実装 | fail-closed |
| AU | S&P/ASX 200 | 未実装 | fail-closed |
| CA | S&P/TSX Composite | 未実装 | fail-closed |
| OTHER | 未解決 | 未実装 | fail-closed |

`market` がUS等なら、4桁風の値が入っていてもJ-Quantsへ誤送信しない。英字tickerだけを見てUSとも決め打ちせず、active候補では `market` を明示する。

市場別readiness:

```text
pnpm report:shock-markets
```

詳細は `docs/idiosyncratic-shock-overseas.md` を参照する。

## 発見経路

`pnpm scan:shocks` はGoogle News RSSを市場別に収集する。

- JP: `JP/ja`
- US: `US/en`

US側ではCEO misconduct / relationship、executive conflict、accounting restatement、internal investigation、quality falsification、SEC investigation等を探索する。

RSSの `marketHint` は発見経路のヒントであって上場市場の確定値ではない。一次情報で会社・市場・symbolを確定するまでactiveへ昇格しない。

JPはTDnet / JPX disclosure scannerも使用する。

USはSEC EDGARを一次情報reviewへ使う。

```text
pnpm review:shock-sec
```

`SEC_USER_AGENT` を設定した場合のみ、active US候補や `SHOCK_SEC_SYMBOLS` の8-K / 6-K / 10-Q / 10-K等を取得する。提出書類が存在するだけでscoreを上げず、辞任理由、会計訂正、内部統制、規制・捜査、業績影響を確認する。

## バイトテロは対象か

**対象。** ただしCEO個人問題などと同じ扱いにはしない。

`employee_sabotage` として主に次を見る。

- 行為者が1人/少人数で切り離せるか
- 店舗単位か全社的な教育・衛生問題か
- SNS拡散によるブランド毀損が売上に波及したか
- 再発防止策に実効性があるか
- 本部/FCの管理不全まで広がっていないか
- 商品が実際に顧客へ提供されたか
- 1店舗休業か全店休業か

顧客の迷惑動画は `customer_sabotage` として分ける。会社の責任が相対的に小さい場合でも、オペレーション変更コストや来店客数への影響は確認する。

## 20点スコア

各項目 0 / 1 / 2 点。**高いほど「企業価値への実害が限定的で、下落後の調査候補として扱いやすい」**。

| key | 2点 | 1点 | 0点 |
|---|---|---|---|
| `businessImpactContainment` | 本業売上/供給に直接影響しない | 影響不明・限定的 | 営業停止/顧客離れ等が大きい |
| `accountingIntegrity` | 財務報告への影響なし | 訂正/監査影響が限定・未確定 | 粉飾/架空売上/重大虚偽 |
| `actorSeparability` | 問題人物/少人数を切り離せる | キーパーソン性あり | 組織/経営そのものと不可分 |
| `organizationalContainment` | 局所的 | 範囲調査中 | 組織ぐるみ/文化・統制問題 |
| `regulatoryContainment` | 規制・免許への影響小 | 訴訟/捜査はあるが限定 | 長期事業制限/免許リスク |
| `brandResilience` | 商品/IP/ブランド需要は概ね無傷 | 一時的ブランド毀損 | 顧客信頼が本質的に毀損 |
| `managementContinuity` | 後継/組織で継続可能 | 移行リスクあり | 創業者/CEO依存が極めて高い |
| `fundamentalResilience` | 業績/CFが維持 | 未確認 | 業績悪化が同時進行 |
| `discountMagnitude` | 実害に比べ株価下落が大きい | 中程度/判断保留 | 下落小・割安感なし |
| `priceStabilization` | 急落後に安値更新が止まった | 底固め途中 | まだ下落/乱高下中 |

合計: 0〜20点。

### 判定

- **16〜20**: `research_priority` — 強い調査候補
- **12〜15**: `watch` — 暫定通知閾値。落ち着き確認後の調査対象
- **8〜11**: `caution` — 罠の可能性が高い
- **0〜7**: `avoid` — 原則としてこの仮説には使わない

## 12点通知のハードゲート

**12点以上だけでは通知しない。** 次をすべて満たす場合のみ通知対象。

1. score >= 12
2. `evidenceStatus = confirmed`
3. `investigationStatus` が `substantially_complete` / `closed` / `not_applicable`
4. マクロ要因が主因ではない
5. **発覚後20日以内に事件前終値から5%以上下落 (`shockDrawdownPct <= -5`)**
6. **対象株がevent窓で安値を付けた同じ取引日に、現地benchmarkより3%以上余計に下落 (`relativeShockDrawdownPct <= -3`)**
7. `priceState = stabilized_after_drop`
8. `accountingIntegrity > 0`
9. 重大な未解決の上場廃止/免許取消リスクがない
10. 一次情報または複数の信頼できる報道で事件の範囲を確認済み

`investigationStatus = open / unknown` はfail-closed。事件自体が事実でも、第三者委員会・当局・会社調査が継続中なら、後から組織問題・会計問題へ広がる可能性があるため通知しない。

絶対下落だけでなく市場相対下落も要求する。全面安と同程度しか下げていない場合は、このレイヤーでは企業固有shockと判定しない。

発覚後20日を超えた安値は、別材料や地合いが混ざるため初期shock判定へ混ぜない。

通知文には必ず「調査候補 / 売買推奨ではない」を入れる。

## 「落ち着いた」の定義

単純に反発しただけでは条件通過とみなさない。**事件による実下落 / 市場超過下落 / その後の沈静化**を別々に確認する。

- event前営業日の終値を基準に、event後20日以内の安値までを絶対shockとして計測
- 対象株のshock lowと同じ取引日のbenchmark returnを差し引く
- benchmark自身の別日の安値は差し引かない
- 絶対 -5%以上、benchmark比 -3%以上を最低条件とする
- event後の安値から数営業日、新安値を更新していない
- 5日リターンが極端なマイナスではない
- 日次の値幅がまだ極端に大きくない
- 急反発しすぎた場合は `rebounded_too_fast` として通知を抑制

サンリオのように問題確認後に既に大きく戻ったケースは、スコアが高くても追いかけない。

provider未設定・価格データ遅延・benchmark同日値欠損は `unknown` として通知しない。

手動overrideは、次をすべて同じ確認時点で記録した場合のみ使用できる。

- `priceStateOverride`
- `priceStateCheckedAt`
- `shockDrawdownPctOverride`
- `relativeShockDrawdownPctOverride`

相対下落が欠ければfail-closed。

## 過去事例DBの使い方

正本:

- `data/idiosyncratic_shock_cases.yml`
- `data/idiosyncratic_shock_cases_expansion_*.yml`

loader は expansion ファイルを自動検出する。現在の全件一覧は以下で生成する。

```text
pnpm report:shock-casebook
```

各ケースに event category / actor type / event date / decision checkpoint / 10項目score / source / confidence / outcome を持たせる。

重要: **未来情報を decision checkpoint の score に混ぜない。** outcome は後知恵として別管理する。

## 類似事例距離

現在案件と過去案件の比較では次を重視する。

1. category が同じ
2. actor type が同じ
3. accountingIntegrity が近い
4. organizationalContainment が近い
5. regulatoryContainment が近い
6. managementContinuity が近い
7. 10項目の Manhattan distance が小さい
8. 過去事例の `researchConfidence` が高い

`accountingIntegrity` と `organizationalContainment` は距離計算で重くする。medium/low confidence seedにはペナルティを加え、高品質な一次情報事例を上位に出しやすくする。

市場が違っても事件構造の類似比較には使える。ただし価格outcomeの閾値検証は市場別に分離する。

## 代表的な型

### A. 個人切除型
CEO/役員の個人的問題。後継がいて財務/顧客需要が無傷。

例: McDonald's、Intel、Texas Instruments、Keurig Dr Pepper、lululemon。

### B. ブランド人物依存型
創業者や看板CEOが問題人物。人物を切るとブランド/戦略も揺れる。

例: Wynn Resorts、Papa John's。

### C. SNS局所炎上型
従業員/顧客の動画が拡散。本業よりも信頼・衛生・オペレーションコストが論点。

例: バーミヤン、すき家2019、大戸屋2019、くら寿司、スシロー。

### D. 組織ガバナンス型
複数部署・取締役会・文化まで広がる。個人切除型に見えても危険。

例: CBS、フジ、Activision、eBay、関西電力。

### E. 会計/組織不正型（負例）
財務数値・内部統制・規制まで壊れる。原則としてこの調査仮説の対象外。

例: Olympus、東芝、Wells Fargo、Suruga Bank、Luckin Coffee、KDDI/BIGLOBE 2026、エア・ウォーター 2026、SMBC日興。

### F. 顧客接点の個人犯罪型
行為者は一人でも、金融・保険など信頼を売る事業ではオペレーション変更や顧客不安へ波及する。

例: 野村HD 2024、MUFG 2024。会計が無傷でも `businessImpactContainment` / `brandResilience` を満点にしない。

### G. 局所から全社へ拡大型
初報では一拠点・一人物でも、調査で多数事案・管理職・企業風土へ拡大する。

例: 三菱電機品質問題、第一生命2020。`investigationStatus` を待つ理由の代表例。

## 12点閾値の定量検証

12点は**運用開始時の仮説**であり、固定の真理ではない。

```text
pnpm backfill:shock-outcomes
pnpm backfill:shock-outcomes:write
```

現在のmarket別provider:

- JP: J-Quants + TOPIX proxy
- US: Twelve Data + S&P 500 proxy SPY

`decisionCheckpoint` の最初の取引価格を基準に次を保存する。

- 1週 / 1か月 / 3か月 / 1年リターン
- 現地benchmark相対リターン
- event前営業日 → event付近のshock lowまでの下落率
- market / benchmark

比較bucket:

- `score_16_20`
- `score_12_15`
- `score_ge_12`
- `score_8_11`
- `score_0_7`
- `score_lt_12`

平均だけでなく**中央値・プラス率・benchmark相対**を確認する。

全市場混合値は参考に留め、`calibrationByMarket` でJPとUSを別々に検証する。サンプルが少ないうちは閾値を自動変更しない。

**事件後の底値を買った前提で測らない。** 実際に十分な情報を確認できた `decisionCheckpoint` から測り、後知恵バイアスを減らす。

## 運用順序

1. JP/US Google News RSSから企業固有shockを収集
2. JPはTDnet/JPX、USはSEC/会社IRの一次情報候補を確認
3. macro exclusion を通す
4. market / symbol / category / actor type を確定
5. review queueへ入れる
6. 一次情報を確認し、調査範囲を `investigationStatus` で記録
7. 10項目を0/1/2で採点
8. 発覚後20日窓の `shockDrawdownPct` と同日benchmark `relativeShockDrawdownPct` を確認
9. 過去事例上位を類似表示
10. 株価急落中・調査継続中・provider未設定は待つ
11. `stabilized_after_drop` になった時点で再採点
12. 12点以上 + 全ハードゲート通過ならLINE通知
13. 過去ケースの将来リターンをmarket別にbackfillし、閾値自体を継続検証

### daily系コマンド

- `pnpm scan:shocks`
- `pnpm scan:shock-disclosures`
- `pnpm queue:shocks`
- `pnpm review:shock-sec`
- `pnpm report:shock-casebook`
- `pnpm report:shock-markets`
- `pnpm report:shocks`
- `pnpm notify:shocks`
- `pnpm audit:shock-history`

これらは `daily:full` に接続する。定量過去backfillはAPI負荷と歴史データ取得を伴うためdailyには入れず、明示実行する。

## 禁止事項

- 不祥事だけを理由に反発を決めつけない
- 会社発表前のSNSだけで12点通知しない
- 調査継続中に範囲を決め打ちしない
- marketHintだけで上場市場を確定しない
- 英字tickerだけでUSと決め打ちしない
- provider未設定なのに価格を推測しない
- そもそも下落していない株を下落一巡と判定しない
- 全面安だけの下落を企業固有shockと誤認しない
- benchmark自身の別日の安値を相対shock計算へ混ぜない
- 数か月後の別材料による安値を初期不祥事へ帰属しない
- 粉飾を個人スキャンダルと同列に扱わない
- 少人数起因という理由だけで会計訂正を軽視しない
- 急落初日に底値と断定しない
- 急反発した銘柄をFOMOで追わない
- outcome を過去時点の score に混ぜない
