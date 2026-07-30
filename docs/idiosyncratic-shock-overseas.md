# 海外株の企業固有ショック監視

## 結論

海外株も積極的に対象にする。

ただし「日本 vs 海外」の2分割にはしない。

Alpha Ponでは次を分離する。

- `market`: どの市場で値付けされるか
- `country`: issuer / headquarters の主要jurisdiction
- `incidentCountry`: 実際に事件が起きた国
- categoryごとのjurisdiction sensitivity
- sector / stakeholder / incident scope
- event confounder / information leak
- recurrence / remediation
- incident-region revenue exposure
- direct cost / market cap
- local market / industry peer relative shock

詳細設計:

- `docs/idiosyncratic-shock-context-model.md`

## 世界共通にするもの

- 20点の企業ダメージscore
- evidenceStatus / investigationStatus
- accounting / organization / separability hard gate
- outcomeの分離
- 「急落中は買い候補通知しない」方針

20点へ国別の道徳点を足さない。

## 市場別に分離するもの

- 株価provider
- broad-market benchmark
- industry / peer benchmark
- 取引日カレンダー
- symbol表記
- regulator / exchange primary sources

## Jurisdiction別に分離するもの

- disclosure / securities-law exposure
- employment / harassment exposure
- board / fiduciary / governance exposure
- litigation exposure
- sector-specific licensing
- consumer / stakeholder reaction

`market=US` だからUS企業文化と決めつけない。外国企業ADR等ではissuer countryを別に持つ。

## Incident geography

多国籍企業では本社国と事件国を分ける。

例:

```yaml
market: JP
country: JP
incidentCountry: US
```

海外子会社事件は、

- issuer国のboard / disclosure責任
- incident国の現地規制 / litigation
- listing marketの価格反応

を別々に確認する。

## Jurisdiction-sensitive category

国・制度・時代差を強く見る:

- executive relationship
- sexual / harassment
- personal statements
- employee sabotage / viral misconduct

同国・同カテゴリ事例が薄い場合は自動通知を止め、local reviewへ回す。

## Structural category

世界事例を比較しやすい:

- accounting fraud / restatement
- organized fraud
- quality falsification
- product safety

ただし世界で1件しかない場合など、母数不足なら自動化しない。

## 階層型evidence pool

国別モデルを完全分離するとサンプル不足になる。

そのため、

1. same country + same category
2. same jurisdiction group + same category
3. global + same category
4. global structural analogy

の順で使う。

実装は `buildShockJurisdictionReview()` が、

- `local_strong`
- `local_plus_group`
- `group_plus_global`
- `global_only`
- `insufficient`

を返す。

サンプルが増えるほどlocal weightが増える。

## 古い事例

文化・SNS・雇用慣行に左右されるカテゴリは古い事例を早く減衰させる。

`temporalAnalogyPenalty` を類似距離へ加える。

会計・品質不正は比較寿命を長くする。

## Sector context

同じ事件でも業種でリスクが変わる。

- financial / insurance -> trust critical
- food / healthcare / transport -> safety critical
- casino / utility / telecom / defense等 -> license critical

個人事件だから軽い、という判断をしない。

## 原因帰属

株価下落を不祥事へ誤帰属しない。

`confounderStatus`:

- clear
- possible
- major
- unknown

`major / unknown` は通知BLOCK。

同日に earnings miss / guidance cut / financing / M&A / litigation 等があれば分離する。

## Information leak

公式発表前から株価が落ちている場合、event dateが誤っている可能性がある。

`informationLeakStatus=likely` はevent window再設定までBLOCK。

## Recurrence / remediation

`recurrenceStatus`:

- first_known
- repeat
- systemic
- unknown

`systemic` は isolated dip thesis をBLOCK。

`remediationStatus`:

- credible
- partial
- weak
- unknown

`weak` は通知BLOCK。

## 海外子会社の経済的重要度

`incidentRevenueExposurePct` を任意で記録する。

事件国売上2%と35%ではheadlineが同じでも企業価値影響は違う。

罰金・返金・営業停止費用等は、可能なら

`estimatedDirectCostPctMarketCap`

で規模調整する。

## Market + industry relative

broad marketだけではsector-wide shockを除けない。

US例:

- company -8%
- SPY -1%
- sector ETF -7%

ならSPY比では大きく見えるが、sector比ではほぼ企業固有ではない。

`industryRelativeShockDrawdownPct > -2%` が確認された場合、現行context gateでは通知BLOCK。

## 優先市場

1. JP — J-Quants + TOPIX
2. US — Twelve Data + SPY + SEC EDGAR
3. UK / EUROPE — research-only。price provider導入後live通知
4. AU / CA — research-only
5. OTHER — primary source / benchmark / price provider解決までfail-closed

## US price provider

`src/fetcher/twelve-data.ts`

```text
TWELVE_DATA_API_KEY=...
US_MARKET_BENCHMARK_SYMBOL=SPY
```

API key未設定ならUS価格を推測せず通知しない。

## SEC一次情報

`src/fetcher/sec-edgar.ts`

- company_tickers.json: symbol -> CIK
- submissions API
- 8-K / 6-K / 10-Q / 10-K / 20-F / 40-F等

```text
SEC_USER_AGENT=alpha-pon contact@example.com
SHOCK_SEC_SYMBOLS=MCD,INTC
SHOCK_SEC_LOOKBACK_DAYS=120
```

SEC提出があるだけではscoreを上げない。

## 通知hard gate

海外も少なくとも次を要求する。

- score >= 12
- confirmed evidence
- investigation substantially complete / closed / not applicable
- accountingIntegrity > 0
- event後20日以内 absolute shock <= -5%
- local broad-market relative shock <= -3%
- priceState = stabilized_after_drop
- jurisdiction evidence poolが十分、またはlocal review済み
- major/unknown confounderなし
- likely information leakなし
- systemic recurrenceなし
- weak remediationなし
- industry-relative evidenceがある場合、企業固有shockが残る

provider未設定なら discovery / research は続けるがLINE通知しない。

## US discovery -> evidence

```text
scan:shocks
  -> queue:shocks
  -> review:shock-sec
  -> primary evidence / score / context review
  -> report:shocks
  -> notify:shocks
```

US tickerは社名から推測しない。見出しにNYSE/NASDAQ/$TICKER等が明記された場合だけhintとして保持し、SEC ticker mapで確認する。

## Outcome calibration

`pnpm backfill:shock-outcomes`

- decision checkpoint起点
- 1w / 1m / 3m / 1y
- market-relative
- JP / USを別calibration

将来はcountry/categoryサンプルが十分になれば、hierarchical outcome calibrationへ拡張する。

少数例で国別thresholdを固定しない。

## Dataset bias

`pnpm audit:shock-history` で、

- country concentration
- era staleness
- success/failure imbalance
- company concentration
- category x country coverage

を監査する。

モデルの自信より、教材の偏りを先に疑う。

## 現在の安全状態

- JP: price provider実装済み
- US: Twelve Data / SEC EDGAR実装済み
- UK / EUROPE / AU / CA: 過去類似のみ、live notification fail-closed
- marketとissuer countryを分離
- incident countryを別管理可能
- jurisdiction evidence pool実装済み
- temporal decay実装済み
- confounder / recurrence / remediation / leak gate実装済み

**海外だから除外しない。海外だから日本感覚で採点もしない。分からない軸はunknownのまま保持し、必要なunknownは通知を止める。**
