import { applyDisagreementSafetyLabel, buildProConsensus, buildProDisagreements } from "../src/pro-disagreement.js";
import type { AgentVerdict } from "../src/pro-types.js";

function verdict(overrides: Partial<AgentVerdict>): AgentVerdict {
  return {
    agentId: "test_agent",
    label: "テスト先生",
    stance: "保留",
    confidence: 0.5,
    positiveEvidence: [],
    negativeEvidence: [],
    missingEvidence: [],
    blockerReasons: [],
    scoreContribution: {},
    ...overrides,
  };
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

{
  const verdicts = [
    verdict({ agentId: "growth_agent", label: "成長株型", stance: "調査候補" }),
    verdict({ agentId: "simons_agent", label: "統計型", stance: "証拠不足", missingEvidence: ["検証件数が不足"] }),
  ];
  const consensus = buildProConsensus(verdicts);
  const disagreements = buildProDisagreements(verdicts);
  const finalLabel = applyDisagreementSafetyLabel("調査候補", consensus, disagreements);
  assert(consensus.blockingAgents.length === 0, "証拠不足だけでは blockingAgents に入れない");
  assert(finalLabel === "証拠不足", "証拠不足の食い違いは証拠不足へ倒す");
}

{
  const verdicts = [
    verdict({ agentId: "quality_agent", label: "品質型", stance: "調査候補" }),
    verdict({ agentId: "risk_agent", label: "リスク型", stance: "避ける", blockerReasons: ["重大リスク"] }),
  ];
  const consensus = buildProConsensus(verdicts);
  const disagreements = buildProDisagreements(verdicts);
  const finalLabel = applyDisagreementSafetyLabel("調査候補", consensus, disagreements);
  assert(consensus.blockingAgents.length === 1, "避けるだけを blockingAgents に入れる");
  assert(finalLabel === "避ける", "強い反対は避けるへ倒す");
}

{
  const verdicts = [
    verdict({ agentId: "quality_agent", label: "品質型", stance: "調査候補" }),
    verdict({ agentId: "cycle_agent", label: "サイクル型", stance: "保留" }),
  ];
  const consensus = buildProConsensus(verdicts);
  const disagreements = buildProDisagreements(verdicts);
  const finalLabel = applyDisagreementSafetyLabel("調査候補", consensus, disagreements);
  assert(finalLabel === "保留", "意見割れは調査候補を保留へ倒す");
}

// ---- 全員が「証拠不足」のケース ----
// 重要仕様:
//   agreementLevel: high  = 全員が同じ方向に合意しているという意味
//                         ≠「良い判断」「調査候補」という意味ではない
//   finalLabel が証拠不足のまま = 情報が足りないので何も変えない
//   disagreements が空    = 意見の対立はない（全員が同じ問題を指摘）
//   blockingAgents が空   = 強い反対はない（証拠不足 ≠ 避ける）

{
  const verdicts = [
    verdict({ agentId: "buffett_agent", label: "品質型", stance: "証拠不足", missingEvidence: ["ROIC未取得"] }),
    verdict({ agentId: "valuation_agent", label: "バリュエーション型", stance: "証拠不足", missingEvidence: ["PER未取得"] }),
    verdict({ agentId: "growth_agent", label: "成長株型", stance: "証拠不足", missingEvidence: ["売上成長率未確認"] }),
    verdict({ agentId: "risk_agent", label: "リスク型", stance: "証拠不足" }),
  ];
  const consensus = buildProConsensus(verdicts);
  const disagreements = buildProDisagreements(verdicts);
  const finalLabel = applyDisagreementSafetyLabel("証拠不足", consensus, disagreements);

  // agreementLevel は "high" (全員が証拠不足で一致 = 意見の対立なし)
  assert(consensus.agreementLevel === "high",
    `全員証拠不足なら agreementLevel は high (got: ${consensus.agreementLevel})`);

  // disagreements は空 (高い合意があるので食い違いなし)
  assert(disagreements.length === 0,
    `全員証拠不足なら disagreements は空 (got: ${disagreements.length}件)`);

  // blockingAgents は空 (証拠不足 ≠ 避ける)
  assert(consensus.blockingAgents.length === 0,
    `証拠不足だけでは blockingAgents に入れない (got: ${consensus.blockingAgents.join(", ")})`);

  // finalLabel は証拠不足のまま (安全ルールで変更されない)
  assert(finalLabel === "証拠不足",
    `全員証拠不足なら finalLabel は証拠不足のまま (got: ${finalLabel})`);
}

// ---- 全員が「証拠不足」でも missingEvidence なし ----
{
  const verdicts = [
    verdict({ agentId: "agent_a", label: "先生A", stance: "証拠不足" }),
    verdict({ agentId: "agent_b", label: "先生B", stance: "証拠不足" }),
  ];
  const consensus = buildProConsensus(verdicts);
  const disagreements = buildProDisagreements(verdicts);
  assert(consensus.agreementLevel === "high",
    `missingEvidence なしの全員証拠不足でも agreementLevel は high`);
  assert(disagreements.length === 0,
    `全員証拠不足なら disagreements は空`);
  assert(consensus.blockingAgents.length === 0,
    `証拠不足は blockingAgents に入らない`);
}

// ---- 全員が「調査候補」= high (良い意味での全員一致) ----
{
  const verdicts = [
    verdict({ agentId: "agent_a", label: "先生A", stance: "調査候補" }),
    verdict({ agentId: "agent_b", label: "先生B", stance: "調査候補" }),
    verdict({ agentId: "agent_c", label: "先生C", stance: "調査候補" }),
  ];
  const consensus = buildProConsensus(verdicts);
  const disagreements = buildProDisagreements(verdicts);
  const finalLabel = applyDisagreementSafetyLabel("調査候補", consensus, disagreements);
  assert(consensus.agreementLevel === "high",
    `全員調査候補なら agreementLevel は high`);
  assert(disagreements.length === 0,
    `全員調査候補なら disagreements は空`);
  assert(finalLabel === "調査候補",
    `全員調査候補なら finalLabel は調査候補のまま`);
}

// ---- agreementLevel は finalLabel とセットで読む ----
// high + 証拠不足 = 情報が足りないので何も決められない (≠ 良い)
// high + 調査候補 = 全員が良いと見ている (良い意味での一致)
// mixed / conflict = 意見が割れている → finalScore だけで判断しない
{
  const allGap = [
    verdict({ stance: "証拠不足" }),
    verdict({ stance: "証拠不足" }),
  ];
  const allPositive = [
    verdict({ stance: "調査候補" }),
    verdict({ stance: "調査候補" }),
  ];
  const gapConsensus = buildProConsensus(allGap);
  const positiveConsensus = buildProConsensus(allPositive);

  // どちらも agreementLevel は "high" だが意味が全く違う
  assert(gapConsensus.agreementLevel === "high", "全員証拠不足でも high");
  assert(positiveConsensus.agreementLevel === "high", "全員調査候補でも high");

  // finalLabel を見ることで意味が分かる
  const gapLabel = applyDisagreementSafetyLabel("証拠不足", gapConsensus, []);
  const positiveLabel = applyDisagreementSafetyLabel("調査候補", positiveConsensus, []);
  assert(gapLabel === "証拠不足", "high + 証拠不足 = 情報不足で全員一致");
  assert(positiveLabel === "調査候補", "high + 調査候補 = 全員良いと見ている");
}

console.log("pro-disagreement tests passed");
