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

console.log("pro-disagreement tests passed");
