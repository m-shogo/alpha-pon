import type { LegendAgentVerdict } from "./legend-pro-types.js";
import type { AgentVerdict, ProFinalLabel } from "./pro-types.js";

export type AgreementLevel = "high" | "mixed" | "conflict";
export type ProConsensus = {
  agreementLevel: AgreementLevel;
  supportiveAgents: string[];
  cautiousAgents: string[];
  blockingAgents: string[];
};
export type ProDisagreement = {
  topic: "quality_vs_valuation" | "growth_vs_evidence" | "macro_vs_company" | "story_vs_statistics" | "upside_vs_downside" | "data_quality" | "unknown";
  supportiveAgents: string[];
  cautiousAgents: string[];
  summary: string;
  whyItMatters: string;
  resolutionRule: "保留" | "証拠不足" | "避ける";
};

type AnyVerdict = Pick<AgentVerdict | LegendAgentVerdict, "agentId" | "label" | "stance" | "missingEvidence" | "blockerReasons">;
const nameOf = (v: AnyVerdict) => v.label || v.agentId;
const isSupport = (v: AnyVerdict) => v.stance === "調査候補";
const isBlock = (v: AnyVerdict) => v.stance === "避ける";
const isEvidenceGap = (v: AnyVerdict) => v.stance === "証拠不足" || v.missingEvidence.length > 0 || v.blockerReasons.length > 0;
const isCaution = (v: AnyVerdict) => v.stance === "保留" || isEvidenceGap(v) || isBlock(v);

export function buildProConsensus(verdicts: AnyVerdict[]): ProConsensus {
  const supportiveAgents = verdicts.filter(isSupport).map(nameOf);
  const blockingAgents = verdicts.filter(isBlock).map(nameOf);
  const cautiousAgents = verdicts.filter(v => isCaution(v) && !isBlock(v)).map(nameOf);
  const cautionRatio = verdicts.length > 0 ? (cautiousAgents.length + blockingAgents.length) / verdicts.length : 1;

  // "conflict" は supportive と blocking/cautious が実際に対立している場合のみ
  // 全員が証拠不足 / 全員が保留 = 全員が合意しているので "high"
  // 証拠不足は "避ける" 扱いにしない
  let agreementLevel: AgreementLevel;
  if (blockingAgents.length > 0 && supportiveAgents.length > 0) {
    // 強い反対と賛成が共存 → 真の対立
    agreementLevel = "conflict";
  } else if (supportiveAgents.length > 0 && cautionRatio >= 0.25) {
    // 賛成はいるが慎重派も多い → 混在
    agreementLevel = "mixed";
  } else {
    // 全員が同じ方向（全員証拠不足 / 全員保留 / 全員調査候補）→ 高い合意
    agreementLevel = "high";
  }
  return { agreementLevel, supportiveAgents, cautiousAgents, blockingAgents };
}

export function buildProDisagreements(verdicts: AnyVerdict[]): ProDisagreement[] {
  const consensus = buildProConsensus(verdicts);
  if (consensus.agreementLevel === "high") return [];
  const hasEvidenceGap = verdicts.some(isEvidenceGap);
  const resolutionRule = consensus.blockingAgents.length > 0 ? "避ける" : hasEvidenceGap ? "証拠不足" : "保留";
  return [{
    topic: "unknown",
    supportiveAgents: consensus.supportiveAgents,
    cautiousAgents: [...consensus.cautiousAgents, ...consensus.blockingAgents],
    summary: "賛成意見と慎重意見が混在しています。",
    whyItMatters: "平均点にせず、慎重意見の理由を次の確認項目に残します。",
    resolutionRule,
  }];
}

export function applyDisagreementSafetyLabel(current: ProFinalLabel, consensus: ProConsensus, disagreements: ProDisagreement[]): ProFinalLabel {
  if (consensus.blockingAgents.length > 0) return "避ける";
  if (disagreements.some(item => item.resolutionRule === "証拠不足")) return "証拠不足";
  if (consensus.agreementLevel !== "high" && current === "調査候補") return "保留";
  return current;
}
