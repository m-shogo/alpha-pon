# 企業固有ショック 採点シート

新しい不祥事・炎上を `config/idiosyncratic-shock-active.yml` に昇格する前に使う。

> 目的は「買う理由を作る」ことではなく、**何が未確認かを可視化すること**。分からない項目を楽観的に2点にしない。

## 0. 事件特定

- 会社名:
- 証券コード:
- 発生日/初報日:
- category:
- actorType:
- 一次情報URL:
- 主要報道URL:
- マクロ主因ではない: YES / NO
- `investigationStatus`: open / substantially_complete / closed / not_applicable / unknown
- 調査範囲を確定できる根拠:
- 事件前終値:
- 事件後安値:
- `shockDrawdownPct`:

`open / unknown` の間は、事件自体が確定していても通知へ進めない。

## 1. 10項目採点

| key | 0 | 1 | 2 | 今回 | 根拠 |
|---|---|---|---|---:|---|
| businessImpactContainment | 営業停止/顧客離れ等が大きい | 影響不明/限定 | 本業に直接影響しない |  |  |
| accountingIntegrity | 粉飾/重大虚偽/架空取引 | 訂正・監査影響が限定/未確定 | 財務報告への影響なし |  |  |
| actorSeparability | 組織/経営と不可分 | キーパーソン性あり | 個人/少人数を切離せる |  |  |
| organizationalContainment | 組織ぐるみ/統制問題 | 範囲調査中 | 局所的 |  |  |
| regulatoryContainment | 免許/長期事業制限リスク | 捜査/訴訟はあるが限定 | 規制影響小 |  |  |
| brandResilience | 顧客信頼が本質的に毀損 | 一時的毀損 | 商品/IP需要は概ね無傷 |  |  |
| managementContinuity | 人物依存極大 | 移行リスクあり | 後継/組織で継続可能 |  |  |
| fundamentalResilience | 業績悪化が同時進行 | 未確認 | 売上/利益/CF維持 |  |  |
| discountMagnitude | 下落小/割安感なし | 中程度/不明 | 実害より売られすぎ |  |  |
| priceStabilization | falling/volatile/急反発 | stabilizing | stabilized_after_drop |  |  |

**合計: /20**

### 会計の特例

行為者が1〜2人でも、架空循環取引・粉飾・過年度訂正などへ到達した場合は `actorSeparability` だけを見て高得点化しない。KDDI/BIGLOBE 2026のように**少人数起因でも `accountingIntegrity=0` なら通知block**。

## 2. ハードゲート

- [ ] score >= 12
- [ ] `evidenceStatus=confirmed`
- [ ] `investigationStatus=substantially_complete / closed / not_applicable`
- [ ] マクロが主因ではない
- [ ] **事件前比で実際に5%以上下落した (`shockDrawdownPct <= -5`)**
- [ ] `priceState=stabilized_after_drop`
- [ ] `accountingIntegrity > 0`
- [ ] 重大な上場廃止/免許取消リスクなし
- [ ] 会社/当局/取引所の一次情報あり、または独立した主要報道2件以上

**1つでも未チェックならLINE通知しない。**

横ばいの株が5日間静かなだけでは「下落一巡」と扱わない。`priceStabilization` と `shockDrawdownPct` は別ゲート。

## 3. 類似事例

`pnpm report:shocks` で上位類似を出す。人名や業界だけでなく、10項目ベクトルで近いかを見る。

- 類似1:
- 類似2:
- 類似3:
- 成功例だけでなく失敗例は含まれているか:
- 類似例の `researchConfidence` は十分か:

medium / low confidence seed は距離計算上ペナルティを受ける。古い低品質資料を主根拠にしない。

## 4. バイトテロ追加確認

該当するときだけ。

- [ ] 行為者は従業員/アルバイトか、顧客か
- [ ] 商品が顧客へ実際に提供されたか
- [ ] 1店舗だけか、複数店舗/全社か
- [ ] 営業停止は店舗単位か、全店か
- [ ] FC本部・教育・衛生管理の構造問題へ拡大していないか
- [ ] 既存店売上/来店客数への実害が出たか

大戸屋2019のように全店休業へ波及したケースは、局所バイトテロより低く採点する。

## 5. 再採点トリガー

以下が出たら過去scoreを固定せず再採点する。

- 第三者/特別調査委員会報告
- 調査範囲の拡大/終了
- 決算訂正・有報訂正
- 役員追加辞任
- 当局調査・行政処分
- 顧客補償/営業停止拡大
- 新たな類似不正の発覚
- 決算で業績影響が判明
- 株価が再び安値更新
- 逆に急反発し `rebounded_too_fast` になった

## 6. 12点閾値の検証

12点は仮説。日本株の過去事例は以下で定量検証する。

```text
pnpm backfill:shock-outcomes
pnpm backfill:shock-outcomes:write
```

- decision checkpoint → 1w / 1m / 3m / 1y
- TOPIX相対
- event前 → shock low 下落率
- score >=12 と score <12 の平均・中央値・プラス率比較

底値を後から選ばず、**当時判断可能だったcheckpointを基準**にする。

## 7. 最終記録

- 判定: research_priority / watch / caution / avoid
- 通知: PASS / WAIT
- WAIT blocker:
- investigationStatus:
- shockDrawdownPct:
- 次回確認日:
- 次に見る一次情報:
- 仮説を否定する条件:

`PASS` でも「調査候補」であり、売買推奨ではない。
