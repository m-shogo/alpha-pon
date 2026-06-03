# alpha-pon Pro意見食い違い検出ロードマップ

## 目的

先生・エージェントを増やしても、意見を平均点に潰さない。

目的は以下。

- 誰が賛成しているか
- 誰が慎重なのか
- 誰が強い反対理由を持っているか
- どの思想同士が食い違っているか
- 最終ラベルを安全側に倒すべきか

これは売買推奨ではなく、調査候補・保留・証拠不足・避けるを判断するための補助。

---

## 現在完了済み

### 1. 食い違い判定ヘルパー

追加済みファイル:

```text
src/pro-disagreement.ts
```

実装済み関数:

```ts
buildProConsensus()
buildProDisagreements()
applyDisagreementSafetyLabel()
```

役割:

```text
buildProConsensus:
- supportiveAgents
- cautiousAgents
- blockingAgents
- agreementLevel: high / mixed / conflict

buildProDisagreements:
- 意見が割れている場合に disagreements を作る

applyDisagreementSafetyLabel:
- 強い反対があれば「避ける」
- 証拠不足系の食い違いがあれば「証拠不足」
- 意見が割れていて調査候補なら「保留」
```

### 2. Pro委員会への接続

接続済みファイル:

```text
src/stock-pro-committee-report.ts
```

実装済み内容:

```ts
const consensus = buildProConsensus([...verdicts, ...legendVerdicts]);
const disagreements = buildProDisagreements([...verdicts, ...legendVerdicts]);
const safeFinalLabel = applyDisagreementSafetyLabel(baseDecision, consensus, disagreements);
```

出力に追加済み:

```text
originalFinalLabel
finalLabel
consensus
disagreements
```

### 3. 型接続

接続済みファイル:

```text
src/pro-types.ts
```

`CommitteeDecision` に以下を追加済み:

```text
originalFinalLabel
consensus
disagreements
```

### 4. UIデータ連携

接続済みファイル:

```text
src/pro-ui-data-addon.ts
```

`legendProCommittee` に以下を追加済み:

```text
originalFinalLabel
consensus
disagreements
```

### 5. テスト

追加済み:

```text
tests/pro-disagreement.test.ts
tests/pro-generated-data-shape.test.ts
```

`pnpm test` に組み込み済み。

### 6. 一発検証コマンド

追加済み:

```bash
pnpm verify:pro
```

内容:

```bash
pnpm pro:all
pnpm ui:data
node --import tsx/esm tests/pro-disagreement.test.ts
node --import tsx/esm tests/pro-generated-data-shape.test.ts
```

---

## 完成後の理想JSON

```json
{
  "code": "8136",
  "name": "サンリオ",
  "originalFinalLabel": "調査候補",
  "finalLabel": "保留",
  "consensus": {
    "agreementLevel": "mixed",
    "supportiveAgents": ["リンチ型", "成長株型"],
    "cautiousAgents": ["マークス型", "シモンズ型"],
    "blockingAgents": []
  },
  "disagreements": [
    {
      "topic": "unknown",
      "supportiveAgents": ["リンチ型"],
      "cautiousAgents": ["シモンズ型"],
      "summary": "賛成意見と慎重意見が混在しています。",
      "whyItMatters": "平均点にせず、慎重意見の理由を次の確認項目に残します。",
      "resolutionRule": "証拠不足"
    }
  ]
}
```

---

## 検証コマンド

まずはこれ:

```bash
pnpm verify:pro
```

全体確認:

```bash
pnpm check
pnpm pro:all
pnpm ui:data
pnpm health
pnpm backup
```

---

## 完了条件

以下が満たされたら、このフェーズは完了。

```text
reports/stock_pro_committee_latest.json に consensus が入る
reports/stock_pro_committee_latest.json に disagreements が入る
originalFinalLabel と finalLabel が両方入る
意見が割れた時に調査候補が保留/証拠不足へ安全側に倒れる
apps/web/public/generated/alpha-pon-data.json に legendProCommittee.consensus が入る
pnpm verify:pro が通る
pnpm check が通る
```

---

## 注意

先生を増やすほど、平均点にしてはいけない。

正しい方針:

```text
喧嘩を消さない
喧嘩を記録する
少数派の強い反対を無視しない
最終判断は安全側に倒す
```

## 残り

ローカル実行結果のレビュー。

見るファイル:

```text
reports/stock_pro_committee_latest.json
apps/web/public/generated/alpha-pon-data.json
```

確認ポイント:

```text
finalLabel が厳しすぎないか
証拠不足に倒れすぎていないか
consensus が自然か
disagreements が見やすいか
UIで見せる情報として十分か
```
