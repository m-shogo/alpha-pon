# Pro Personas / alpha-pon 改善チェックリスト

alpha-pon は買い推奨ツールではなく、調査候補を見逃さないためのリサーチ補助ツール。  
このドキュメントは、いろいろな投資家・調査者の視点から不満が出そうな点を先に洗い出し、継続改善の軸にするためのもの。

---

## 1. バフェット型：事業品質・理解可能性を重視

### 不満

- その会社が何で稼いでいるか分からないままスコアが出るのは怖い
- テーマ性だけで高評価されると危険
- 短期材料より、長く稼げる事業かを見たい

### alpha-pon で見るべき項目

- `financialQuality.qualityScore`
- 営業利益率
- 売上前年比
- 営業利益前年比
- 下方修正有無
- `riskReview.checklist.circleOfCompetence`
- `riskReview.checklist.businessQuality`

### 改善方針

- 事業内容・収益源・競争優位を確認するステップを `nextSteps` に増やす
- テーマタグだけで加点しすぎない
- 財務品質が低い候補は通知ではなく調査ログに寄せる

---

## 2. マンガー型：避けるべき罠を先に潰す

### 不満

- 良い理由より、悪い理由が見えないと危ない
- 流行やSNSで盛り上がっているものほど疑ってほしい
- 一つでも致命的な懸念があれば止めてほしい

### alpha-pon で見るべき項目

- `riskReview.blockers`
- `riskReview.warnings`
- `hypeRisk.level`
- `negativeReasons`
- `warnings`

### 改善方針

- `riskReview.decision === "reject"` は通知対象から除外
- `hypeRisk.level === "high"` は重要通知しない
- よく出る blocker を `pnpm learn` で集計する

---

## 3. クオンツ型：検証できないスコアは信用しない

### 不満

- スコアが高いほど本当に成績が良いのか見えない
- ルール別・スコア帯別の期待値が見えない
- 件数が少ない時に過信しそう

### alpha-pon で見るべき項目

- `pnpm backtest`
- スコア帯別成績
- ルール別成績
- 優先度別成績
- 30日/90日/180日の平均・中央値・勝率

### 改善方針

- 最低サンプル数に満たないルールは強く評価しない
- ルール別に勝率・中央値が弱いものはスコアを下げる
- 外れた候補の共通点を `pnpm learn` で拾う

---

## 4. リスク管理型：損しにくさを最優先

### 不満

- 流動性が低い銘柄は売れないリスクがある
- ボラが高い銘柄は通知で煽られたくない
- データ不足なのに通知されるのは避けたい

### alpha-pon で見るべき項目

- 20日平均売買代金
- 20日ボラティリティ
- `dataQuality`
- `riskReview.checklist.liquidityOk`
- `riskReview.checklist.volatilityOk`
- `riskReview.checklist.enoughData`

### 改善方針

- `dataQuality !== "ok"` は通知しない
- 流動性不足は blocker として扱う
- ボラ高すぎは warning としてレポート上部に出す

---

## 5. イベント投資型：材料の質を重視

### 不満

- 開示タイトルだけでは材料の良し悪しが判断できない
- 上方修正・自社株買い・TOB・MBO・売出しを分けたい
- 材料の持続性が見えない

### alpha-pon で見るべき項目

- TDnet/EDINETスキャン
- `structural_event`
- `earnings_drop`
- `nextSteps`

### 改善方針

- 開示カテゴリを positive / negative / neutral に分類する
- 自社株買い、売出し、下方修正、TOB/MBO を別ルール化する
- PDF本文要約は後続の拡張対象

---

## 6. IPO・需給型：ロックアップと売り圧力を重視

### 不満

- 上場日だけではIPO需給を判断しきれない
- 公募価格、初値、VC、ロックアップ解除が欲しい
- 初値天井銘柄を避けたい

### alpha-pon で見るべき項目

- `listedAt`
- `ipo.daysSinceListing`
- `ipo.volumeRatioToFirstDay`
- `ipo.noNewLowDays`
- `ipo.lockupPassed`

### 改善方針

- IPO詳細データを将来追加する
- `listedAt` 未設定は warning
- IPO関連は `hypeRisk` を高めに見る

---

## 7. SNS・トレンド型：流行は材料ではなく警戒灯

### 不満

- SNSで流行っているだけの銘柄を拾うと危険
- 注目度と期待値を混同しやすい
- 急騰後に通知されると遅い

### alpha-pon で見るべき項目

- `hypeRisk.score`
- `hypeRisk.level`
- 5日リターン
- 20日リターン
- 20日ボラティリティ

### 改善方針

- `hypeRisk.level === "high"` は重要通知から除外
- 流行テーマは買い材料ではなく FOMO リスクとして扱う
- SNS情報を入れる場合も、一次情報・業績・バリュエーション確認を必須化する

---

## 試験運転中の通知方針

初期値は `NOTIFY_MODE=urgent_only`。

| モード | 動作 |
|---|---|
| `urgent_only` | 重要通知だけ送る。朝まとめは送らずレポートを見る |
| `summary` | 重要通知 + 朝まとめを送る |
| `off` | 通知せず、レポートだけ生成する |

試験運転中は `urgent_only` 推奨。  
通知対象は以下を満たす候補だけにする。

- `alertLevel === "urgent"`
- `dataQuality === "ok"`
- `riskReview.decision !== "reject"`
- `hypeRisk.level !== "high"`
- 重複通知抑制に引っかからない

---

## 継続改善ループ

1. `pnpm daily` で日次ログを貯める
2. `pnpm backtest` でリターンを検証する
3. `node --import tsx/esm src/learn.ts` で頻出する懸念を集計する
4. 弱いルールを下げる・削る
5. 強いルールだけ残す
6. ペルソナ別の不満が減っているか確認する

---

## 合格ライン

alpha-pon を信用しすぎない。  
以下が確認できるまでは、あくまで調査候補生成として使う。

- スコア帯別に期待値が確認できる
- ルール別に強弱が見える
- 外れた理由がログに残っている
- データ品質問題が通知前に止まる
- 過熱/FOMO候補が重要通知から外れる
- 重要通知の件数が少なく保たれている
