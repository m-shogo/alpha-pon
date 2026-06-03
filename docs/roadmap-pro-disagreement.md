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

### 1. 食い違い判定ヘルパー追加済み

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

---

## 未完了

### 1. stock-pro-committee-report.ts への接続

対象:

```text
src/stock-pro-committee-report.ts
```

やること:

```ts
import {
  buildProConsensus,
  buildProDisagreements,
  applyDisagreementSafetyLabel,
} from "./pro-disagreement.js";
```

既存の以下の付近に追加する。

```ts
const legendVerdicts = buildLegendAgentVerdicts(...)
const legendWarnings = summarizeLegendWarnings(legendVerdicts)
const proScore = buildProScore(company, decision, verdicts)
```

追加するコード:

```ts
const allVerdicts = [...verdicts, ...legendVerdicts];

const consensus = buildProConsensus(allVerdicts);
const disagreements = buildProDisagreements(allVerdicts);

const safeFinalLabel = applyDisagreementSafetyLabel(
  decision,
  consensus,
  disagreements
);
```

---

### 2. decisions.push の修正

現在:

```ts
decisions.push({
  code: company.code,
  name: company.name,
  finalLabel: decision,
  finalScore: proScore.finalScore,
  proScore,
  verdicts,
  legendVerdicts,
  legendWarnings,
  nextActions,
  blockers: proScore.blockers,
  missingEvidence: proScore.missingEvidence,
});
```

修正後:

```ts
decisions.push({
  code: company.code,
  name: company.name,

  originalFinalLabel: decision,
  finalLabel: safeFinalLabel,

  finalScore: proScore.finalScore,
  proScore,

  verdicts,
  legendVerdicts,
  legendWarnings,

  consensus,
  disagreements,

  nextActions,
  blockers: proScore.blockers,
  missingEvidence: proScore.missingEvidence,
});
```

---

### 3. Markdown出力にも食い違いを表示

`stock_pro_committee_latest.md` に以下を追加する。

```ts
lines.push(`- agreement: ${consensus.agreementLevel}`);

if (disagreements.length > 0) {
  lines.push("- disagreements:");
  for (const item of disagreements) {
    lines.push(`  - ${item.topic}: ${item.summary}`);
    lines.push(`    - resolution: ${item.resolutionRule}`);
  }
}
```

---

### 4. pro-types.ts の型拡張

対象:

```text
src/pro-types.ts
```

追加 import:

```ts
import type {
  ProConsensus,
  ProDisagreement,
} from "./pro-disagreement.js";
```

`CommitteeDecision` に追加:

```ts
export type CommitteeDecision = {
  code: string;
  name: string;

  originalFinalLabel?: ProFinalLabel;
  finalLabel: ProFinalLabel;

  finalScore: number;
  proScore: StockProScore;

  verdicts: AgentVerdict[];
  legendVerdicts?: LegendAgentVerdict[];
  legendWarnings?: string[];

  consensus?: ProConsensus;
  disagreements?: ProDisagreement[];

  nextActions: string[];
  blockers: string[];
  missingEvidence: string[];
};
```

---

### 5. UIデータにも追加

対象:

```text
src/pro-ui-data-addon.ts
```

`legendProCommittee` の mapping に以下も含める。

```ts
const legendProCommittee = {
  generatedAt: stockProCommitteeJson.generatedAt,
  decisions: stockProCommitteeJson.decisions.map(decision => ({
    code: decision.code,
    name: decision.name,

    originalFinalLabel: decision.originalFinalLabel,
    finalLabel: decision.finalLabel,
    finalScore: decision.finalScore,

    consensus: decision.consensus ?? null,
    disagreements: decision.disagreements ?? [],

    legendVerdicts: decision.legendVerdicts ?? [],
    legendWarnings: decision.legendWarnings ?? [],
  })),
};
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
      "topic": "story_vs_statistics",
      "supportiveAgents": ["リンチ型"],
      "cautiousAgents": ["シモンズ型"],
      "summary": "ストーリーの魅力と、統計・検証面の慎重意見が割れています。",
      "whyItMatters": "少数サンプルの成功体験を過信しないため、検証件数不足は安全側に扱います。",
      "resolutionRule": "証拠不足"
    }
  ]
}
```

---

## 検証コマンド

```bash
pnpm typecheck
pnpm typecheck:scripts
pnpm test
pnpm pro:all
pnpm ui:data
pnpm health
pnpm backup
```

---

## 完了条件

以下が満たされたら完了。

```text
reports/stock_pro_committee_latest.json に consensus が入る
reports/stock_pro_committee_latest.json に disagreements が入る
originalFinalLabel と finalLabel が両方入る
意見が割れた時に調査候補が保留/証拠不足へ安全側に倒れる
apps/web/public/generated/alpha-pon-data.json に legendProCommittee.consensus が入る
pnpm test が通る
pnpm pro:all が通る
pnpm ui:data が通る
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
