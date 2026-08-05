# 企業固有ショック Context / Jurisdiction Model

## 目的

不祥事の「道徳的な重さ」を日本人感覚で世界へ適用しない。

Alpha Pon が知りたいのは、

- その事件が企業価値へどこまで実害を与えるか
- 市場が企業固有要因としてどこまで売ったか
- 過去の本当に近い事例では、その後どうなったか

である。

**国ごとの善悪点数は作らない。**

代わりに、世界共通score + jurisdiction/context + 実際のoutcomeを分離する。

---

## 1. 3層モデル

### Layer A — Global Damage Score

既存20点。

企業価値への実害だけを評価する。

- business impact
- accounting integrity
- actor separability
- organizational containment
- regulatory containment
- brand resilience
- management continuity
- fundamental resilience
- discount magnitude
- price stabilization

ここへ「日本では不倫が重い」等の文化評価を混ぜない。

### Layer B — Jurisdiction / Context

同じ事実が、その会社・市場で何へ波及するかを確認する。

- issuer country（本社・主要法制度）
- incident country（事件発生国）
- listing market（値付けされる市場）
- sector / license dependency
- stakeholder harmed
- incident scope
- recurrence
- remediation
- event confounders
- information leak / event-date uncertainty
- incident-region revenue exposure
- direct cost / market cap
- industry / peer relative shock

### Layer C — Outcome Calibration

最終的には感覚ではなく実績で学習する。

- 1w / 1m / 3m / 1y return
- local broad-market relative return
- industry / peer relative return
- earnings/guidance/customer impact
- regulatory/legal outcome

future outcome は当時scoreへ逆流させない。

---

## 2. 「国」は1個ではない

多国籍企業では最低でも次を分離する。

1. `country`: issuer / headquarters jurisdiction
2. `incidentCountry`: misconduct occurred here
3. `market`: stock is priced here

将来は必要に応じて revenue geography も追加する。

例: 日本上場・日本本社の会社でも、米国子会社で事件が起きた場合、

- 日本の開示/取締役会責任
- 米国現地の雇用・規制・訴訟
- 日本市場の価格反応

を別々に見る。

海外事件を本社国の文化だけで評価しない。

---

## 3. Jurisdiction-sensitive category

国差・制度差・時代差が大きいカテゴリ:

- executive relationship
- sexual / harassment
- personal statements
- employee sabotage / viral misconduct
- consumer outrage型

このカテゴリは同国事例を強く優先する。

同国・同カテゴリ過去例が2件未満なら、自動通知はlocal review待ちにする。

### Structural category

国差より構造が重要:

- accounting fraud
- restatement
- organized fraud
- quality falsification
- product safety

これらは国を越えた負例を強く利用できる。

ただし法制度差をゼロとはみなさない。

---

## 4. 階層型の類似事例利用

国ごとに完全分離するとサンプル不足になる。

したがって、次の順で証拠を借りる。

1. same country + same category
2. same jurisdiction group + same category
3. global + same category
4. global + structurally similar score vector

同国サンプルが増えるほど上位層の重みを上げる。

少数サンプルから「USは14点以上」「日本は12点以上」のような固定閾値を作らない。

将来はoutcome件数が十分に増えた段階で、hierarchical / shrinkage calibrationを導入する。

---

## 5. 法制度より先に見るべき別軸

### Sector criticality

同じ個人犯罪でも業種により実害が変わる。

- financial / insurance: trust critical
- food / healthcare / transport: safety critical
- casino / utility / telecom / defense等: license critical

銀行員1人の犯罪でも顧客資産・監督当局へ波及する場合がある。

### Stakeholder

被害対象を分ける。

- employee
- customer
- investor
- supplier
- regulator/public

「CEOの私生活」と「顧客資産被害」を同じpersonal misconductでまとめない。

### Incident scope

- individual
- site
- subsidiary
- multi-unit
- group-wide

人数ではなく、統制不全がどこまで広がったかを確認する。

---

## 6. 再犯 / 是正

### recurrenceStatus

- `first_known`
- `repeat`
- `systemic`
- `unknown`

`systemic` は isolated dip thesis をBLOCK。

`repeat` は単発より厳しく扱う。

### remediationStatus

- `credible`
- `partial`
- `weak`
- `unknown`

`weak` は自動通知BLOCK。

単なる辞任・謝罪だけでなく、

- 権限変更
- 報酬プロセス
- 監査
- reporting line
- board oversight
- 実施期限

まで確認する。

---

## 7. 一番危険な誤り: 原因帰属

株価が落ちても、不祥事が原因とは限らない。

同時期に、

- earnings miss
- guidance cut
- 増資
- M&A破談
- 配当変更
- 大型訴訟判決
- sector-wide regulation

があれば、不祥事ディップと誤認し得る。

### confounderStatus

- `clear`: 大きな同時材料なし
- `possible`: 分離分析必要
- `major`: 自動通知BLOCK
- `unknown`: 自動通知BLOCK

市場benchmarkだけでなくindustry/peer benchmarkを使う。

---

## 8. Event dateそのものを疑う

公式発表日が市場の最初の情報日とは限らない。

- rumor
- leak
- lawsuit filing
- local-language report
- after-hours disclosure

で先に価格へ織り込まれることがある。

`informationLeakStatus=likely` の場合、event windowを再設定するまで通知BLOCK。

短期event-studyでは正確なevent dateが重要。

---

## 9. 海外子会社事件の経済的重要度

見出しの大きさと企業価値への寄与を分ける。

`incidentRevenueExposurePct` を任意で記録する。

例:

- 事件国売上2%: headlineは大きくても直接経済影響は限定的かもしれない
- 事件国売上35%: local incidentでも本業への影響が大きい

同様に、罰金・返金・閉店費用等は絶対額だけでなく、

`estimatedDirectCostPctMarketCap`

で規模調整する。

---

## 10. Market benchmarkだけでは足りない

TOPIX / S&P 500で地合いは除けるが、業界共通ショックは残る。

例:

- 対象銀行 -8%
- S&P 500 -1%
- 銀行ETF -7%

なら、S&P比では-7%だが銀行業界比では-1%。

企業固有不祥事shockとは言い切れない。

`industryRelativeShockDrawdownPct > -2%` が確認された場合、現行context gateでは通知をBLOCKする。

将来:

- JP: 業種指数 / peer basket
- US: sector ETF / peer basket

を自動化する。

---

## 11. 古い事例の陳腐化

2010年のCEOスキャンダルと2026年の同事件を完全同価値にしない。

SNS、ガバナンス、雇用規範、開示ルールが変わるため。

### temporal penalty

jurisdiction-sensitive category:

- 3年以上: +1
- 6年以上: +2
- 10年以上: +3

medium categoryは緩く、accounting/quality等はさらに緩くする。

古い事例を捨てるのではなく、順位を下げる。

---

## 12. Dataset biasも監査する

モデルだけでなく教材を疑う。

`audit:shock-history` で以下を可視化する。

- country concentration
- era distribution
- outcome balance
- company concentration
- category x country coverage
- source confidence / source host

成功例が失敗例の4倍以上ならsurvivorship bias warning。

1国が60%以上ならcountry concentration warning。

5年以内の事例が40%未満ならera staleness warning。

これらは即NGではなく、confidenceを下げるためのwarning。

---

## 13. 研究上の裏付け

設計の方向性に関係する参考研究。

- Groen-Xu & Zeume, *The Geography of Corporate Misconduct: An Event Study of Domestic and Foreign Incidents* — 97か国・多数のincidentを用い、foreign incidentとdomestic incidentで市場反応差があることを報告。
  - https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3938925
- *Stock market reactions to corporate misconduct: The moderating role of legal origin*, Economic Modelling (2023) — legal regimeでmisconductへの株価反応差があることを報告。
  - https://www.sciencedirect.com/science/article/pii/S0264999323000093
- *How to apply the event study methodology in STATA*, Industrial Marketing Management (2021) — event studyで企業/国レベルのevent impactをabnormal returnとして測る方法論。
  - https://www.sciencedirect.com/science/article/pii/S0019850121000328

これらを「国ごとに固定点を足す根拠」とは解釈しない。

むしろ、country / legal regime / incident geography / event windowを分離して検証する根拠として使う。

---

## 14. 現在の通知哲学

通知は「12点だから」では出さない。

最低でも、

- score >= 12
- confirmed evidence
- investigation scope resolved
- accounting integrity not zero
- actual shock >= 5%
- local-market relative shock >= 3%
- stabilized after drop
- jurisdiction-sensitive案件のlocal analogue不足なし
- major/unknown confounderなし
- likely information leakなし
- systemic recurrenceなし
- weak remediationなし
- industry-relative evidenceがある場合は企業固有shockが残る

を確認する。

**分からないものを無理に0/1/2へ変換しない。unknownはunknownのまま残し、必要なら通知を止める。**
