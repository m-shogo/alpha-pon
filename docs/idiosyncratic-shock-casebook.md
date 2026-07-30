# 企業固有ショック / 不祥事ディップ 過去事例ケースブック

> 研究用。買い推奨ではありません。score は「事件そのものが企業価値を恒久的に壊しにくく、下落後に調査しやすいか」の 20 点評価です。高得点 = 必ず上がる、ではありません。

## 正本

手書きの一覧は件数追加のたびに陳腐化するため、**過去事例そのものはYAMLを正本**とします。

- `data/idiosyncratic_shock_cases.yml`
- `data/idiosyncratic_shock_cases_expansion_*.yml`

loader は expansion ファイルを自動検出します。現在の全件一覧・score・checkpoint・outcome・confidence は次で自動生成します。

```text
pnpm report:shock-casebook
```

出力:

- `reports/idiosyncratic_shock_casebook_latest.md`
- `reports/idiosyncratic_shock_casebook_latest.json`

`pnpm audit:shock-history` は最低件数・重複ID・カテゴリ欠落・会計不正の誤高得点・出典分類などを監査します。

## まず見る境界

- **16–20点**: `research_priority` — 個人切除型など。価格が落ち着いた後の強い調査候補。
- **12–15点**: `watch` — 類似事例・一次情報・業績を追加確認。
- **8–11点**: `caution` — ブランド/規制/キーパーソン問題が重い。
- **0–7点**: `avoid` — 組織不正・粉飾など。「大きく下げた」を買い理由にしない。

12点以上でも通知はしません。最新hard gateは `docs/idiosyncratic-shock-playbook.md` が正本です。

## 現在のhard gate要約

- `score >= 12`
- `evidenceStatus=confirmed`
- 調査範囲が概ね確定している
- マクロ主因ではない
- **発覚後20日以内に絶対 -5%以上下落**
- **同じ窓でTOPIX/1306比 -3%以上の超過下落**
- `priceState=stabilized_after_drop`
- `accountingIntegrity > 0`
- 重大な免許取消/上場廃止リスクなし
- 一次情報または複数の主要報道で範囲確認済み

つまり「不祥事があった」「12点ある」「5日間横ばい」だけでは足りません。

## 類似型の見取り図

### A: 個人切除型 — 高得点になりやすい

McDonald's / Intel / Texas Instruments / Lockheed Martin / Booking / Keurig Dr Pepper / lululemon など。

共通点:

- 財務報告に影響なし
- 行為者が限定される
- 後継経営者がいる
- 商品・顧客需要・供給網が止まらない
- 規制免許に直結しない

ただし**実際に企業固有の下落が発生していなければ通知しない**。

### B: キーパーソン型

Wynn / HP / Papa John's / KADOKAWA / 日産 / WWE など。

本人を辞めさせても、創業者ブランド・戦略・提携・免許・会計まで揺れる可能性がある。

### C: バイトテロ / 顧客迷惑動画

バーミヤン / すき家 / 大戸屋 / ビッグエコー / Domino's / セブン-イレブン / スシロー / くら寿司 など。

同じバイトテロでも、

- 客へ提供されたか
- 1店舗か全社か
- 店舗休業か全店休業か
- 本部の教育/衛生管理問題へ広がったか
- 既存店売上・来店客数への実害

で点数を変える。大戸屋2019のように全店休業へ波及した型は、局所切離型より低評価。

### D: 組織ガバナンス型

Activision / フジ / eBay / CBS / 関西電力 / 第一生命 など。

初報では一人の問題に見えても、第三者委員会・当局・追加事案で企業文化や経営陣まで広がることがある。`investigationStatus=open/unknown` の間は通知しない。

### E: 会計・組織不正・品質偽装 — 原則ブロック

Olympus / 東芝 / Wells Fargo / Suruga Bank / Luckin / Volkswagen / 神戸製鋼 / 日野 / KDDI/BIGLOBE 2026 / エア・ウォーター / TOYO TIRE / SMBC日興 など。

少人数起因でも、架空取引・過年度訂正・法人起訴・免許/認証問題まで到達すれば個人切除型ではない。

### F: 顧客接点の個人犯罪

野村HD 2024 / MUFG 2024 など。

行為者は一人でも、金融機関の顧客資産・訪問営業・貸金庫など**信用そのもの**を傷つける事件は、CEOの私生活問題より厳しく採点する。

### G: 局所から全社へ拡大型

三菱電機品質問題など。

一工場・一部署の問題に見えても、全社調査で多数案件・管理職関与へ広がる場合がある。初報時に高得点を固定しない。

## 12点閾値の答え合わせ

現在の12点は仮説です。日本株の過去事例について、decision checkpoint起点で将来リターンを測ります。

```text
pnpm backfill:shock-outcomes
pnpm backfill:shock-outcomes:write
```

確認するもの:

- 1週 / 1か月 / 3か月 / 1年リターン
- TOPIX相対リターン
- score >=12 vs score <12
- 平均 / 中央値 / プラス率

**事件後の底値から測らず、当時十分な情報を確認できた checkpoint から測る**ことで、後知恵バイアスを抑えます。

## 追加ルール

新しい過去事例を追加するときは必ず、

- source
- eventDate
- decision checkpoint
- scoreVector
- researchConfidence
- outcome

を分離する。

成功例だけでなく、必ず「安く見えたが罠だった負例」を増やす。未来のoutcomeを当時scoreへ逆流させない。
