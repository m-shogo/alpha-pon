# 企業固有ショック / 不祥事ディップ・インテリジェンス

## 目的

世界情勢・金利・為替・関税・食糧不足・戦争・災害などのマクロ要因ではなく、**個別企業だけに発生した不祥事・炎上・ガバナンス事件による株価下落**を収集し、過去の類似事例と比較して「調査候補」を作る。

これは売買推奨ではない。狙うのは「不祥事そのもの」ではなく、**企業価値への実害より市場の短期反応が大きい可能性があるケース**を、後から検証できる形で蓄積すること。

## 対象

### 優先して拾う

- CEO / 役員の社内恋愛・不倫・性的 misconduct
- 役員の個人的な不適切報酬・経費・私的利益
- 役員個人の暴言・差別発言・SNS炎上
- 役員個人の逮捕・贈収賄・私的犯罪
- 従業員1人〜少人数による不適切動画・バイトテロ
- 顧客による迷惑動画など、会社の本業に直接起因しないブランドショック
- 店舗単位の異物混入・オペレーション事故
- 個人を切り離すことで事業が継続できる可能性があるガバナンス事件

### 負例として必ず拾う

成功例だけを学習すると「不祥事 = 買い」と誤学習するため、以下も過去事例DBに入れる。

- 粉飾・売上架空計上・財務報告の虚偽
- 組織ぐるみの不正
- 規制当局から長期間事業制限を受ける事件
- 製品安全・品質偽装が事業そのものを傷つける事件
- 創業者・CEOがブランド/競争力そのもので切り離せない事件
- **少人数起因でも過年度訂正まで発生した会計事件**

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

## バイトテロは対象か

**対象。** ただし CEO 不倫などと同じ扱いにはしない。

バイトテロは `employee_sabotage` として分類し、主な論点を次に置く。

- 行為者が1人/少人数で切り離せるか
- 店舗単位か全社的な教育・衛生問題か
- SNS拡散によるブランド毀損が売上に波及したか
- 再発防止策に実効性があるか
- 本部/FCの管理不全まで広がっていないか
- 商品が実際に顧客へ提供されたか
- 1店舗休業か全店休業か

顧客の迷惑動画は `customer_sabotage` として分ける。会社の責任が相対的に小さいため、従業員起因より高得点になりやすいが、オペレーション変更コストや来店客数への影響は確認する。

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
- **0〜7**: `avoid` — 原則として不祥事ディップ仮説には使わない

## 12点通知のハードゲート

**12点以上だけでは通知しない。** 次をすべて満たす場合のみ通知対象。

1. score >= 12
2. `evidenceStatus = confirmed`
3. `investigationStatus` が `substantially_complete` / `closed` / `not_applicable` のいずれか
4. マクロ要因が主因ではない
5. `priceState = stabilized_after_drop`
6. `accountingIntegrity > 0`
7. 重大な未解決の上場廃止/免許取消リスクがない
8. 一次情報または複数の信頼できる報道で事件の範囲を確認済み

`investigationStatus = open / unknown` は fail-closed。事件自体が事実でも、第三者委員会・当局・会社調査が継続中なら、後から組織問題・会計問題へ広がる可能性があるため通知しない。

通知文には必ず「調査候補 / 売買推奨ではない」を入れる。

## 「落ち着いた」の定義

単純に反発しただけでは買い場とみなさない。J-Quantsが利用可能な日本株では次を観察する。

- イベント後の安値から数営業日、新安値を更新していない
- 5日リターンが極端なマイナスではない
- 日次の値幅がまだ極端に大きくない
- 20日線回復はプラス材料だが必須ではない
- 急反発しすぎた場合は `rebounded_too_fast` として通知を抑制

サンリオのように「問題確認後に既に大きく戻った」ケースは、スコアが高くても追いかけない。

## 過去事例DBの使い方

過去事例は以下に保存する。

- `data/idiosyncratic_shock_cases.yml`
- `data/idiosyncratic_shock_cases_expansion_*.yml`

loader は expansion ファイルを自動検出する。各ケースに以下を持たせる。

- event category / actor type
- event date
- score checkpoint date
- 10項目スコア
- 合計点
- その時点で確認できた情報
- 後から分かった outcome（別フィールド）
- 類似事例から得た lesson
- source URL / confidence

重要: **未来情報を score checkpoint に混ぜない。** outcome は後知恵として別管理する。

## 類似事例距離

現在案件と過去案件の比較では、次を重視する。

1. category が同じ
2. actor type が同じ（CEO / founder / executive / employee / customer / organization）
3. accountingIntegrity が近い
4. organizationalContainment が近い
5. regulatoryContainment が近い
6. managementContinuity が近い
7. 10項目の Manhattan distance が小さい
8. 過去事例の `researchConfidence` が高い

`accountingIntegrity` と `organizationalContainment` は距離計算で重くする。さらに medium/low confidence のseedにはペナルティを加え、高品質な一次情報事例を上位に出しやすくする。

「McDonald's型」「Wynn型」「Wells Fargo型」など、人名だけで決めず構造で比較する。

## 代表的な型

### A. 個人切除型
CEO/役員の個人的問題。後継がいて財務/顧客需要が無傷。

例: McDonald's Easterbrook、Intel Krzanich、TI Crutcher、Keurig Dr Pepper、lululemon。

### B. ブランド人物依存型
創業者や看板CEOが問題人物。人物を切るとブランド/戦略も揺れる。

例: Wynn Resorts、Papa John's。

### C. SNS局所炎上型
従業員/顧客の動画が拡散。本業よりも信頼・衛生・オペレーションコストが論点。

例: バーミヤン、すき家2019、大戸屋2019、くら寿司、スシロー。

### D. 組織ガバナンス型
複数部署・取締役会・文化まで広がる。個人切除型に見えても危険。

例: CBS、フジ、Activision、eBay。

### E. 会計/組織不正型（負例）
財務数値・内部統制・規制まで壊れる。原則「不祥事ディップ買い」対象外。

例: Olympus、東芝、Wells Fargo、Suruga Bank、Luckin Coffee、KDDI/BIGLOBE 2026、エア・ウォーター 2026。

## 12点閾値の定量検証

12点は**運用開始時の仮説**であり、固定の真理ではない。

日本の4桁上場コードを持つ過去ケースについて、J-Quantsを用いて以下をbackfillする。

```text
pnpm backfill:shock-outcomes
pnpm backfill:shock-outcomes:write
```

`decisionCheckpoint` の最初の取引価格を基準に、

- 1週 / 1か月 / 3か月 / 1年リターン
- TOPIX ETF 1306 相対リターン
- event前営業日 → event〜checkpoint付近のショック安値までの下落率

を保存する。

比較bucket:

- `score_16_20`
- `score_12_15`
- `score_ge_12`
- `score_8_11`
- `score_0_7`
- `score_lt_12`

平均だけでなく**中央値・プラス率・TOPIX相対**を確認する。サンプルが少ないうちは自動で12点を変更しない。

特に重要なのは、**事件後の底値を買った前提で測らない**こと。実際に十分な情報を確認できた `decisionCheckpoint` から測り、後知恵バイアスを減らす。

## 運用順序

1. Google News RSS等から企業固有ショックを収集
2. TDnet / JPXの一次情報候補も収集
3. macro exclusion を通す
4. category / actor type を分類
5. review queueへ入れる
6. 一次情報を確認し、調査範囲を `investigationStatus` で記録
7. 10項目を 0/1/2 で採点
8. 過去事例上位を類似表示
9. 株価急落中・調査継続中は待つ
10. `stabilized_after_drop` になった時点で再採点
11. 12点以上 + 全ハードゲート通過なら LINE 通知
12. 過去ケースの将来リターンをbackfillし、閾値自体を継続検証

### daily系コマンド

- `pnpm scan:shocks`
- `pnpm scan:shock-disclosures`
- `pnpm queue:shocks`
- `pnpm report:shocks`
- `pnpm notify:shocks`
- `pnpm audit:shock-history`

これらは `daily:full` に接続する。定量過去backfillはAPI負荷と歴史データ取得を伴うため、dailyには入れず明示実行する。

## 禁止事項

- 「不祥事だから反発する」と決めつけない
- 会社発表前のSNSだけで12点通知しない
- 調査継続中に範囲を決め打ちしない
- 粉飾を個人スキャンダルと同列に扱わない
- 少人数起因という理由だけで会計訂正を軽視しない
- 急落初日に底値と断定しない
- 急反発した銘柄をFOMOで追わない
- outcome を過去時点の score に混ぜない
