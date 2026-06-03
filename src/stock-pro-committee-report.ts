import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { buildLegendAgentVerdicts, summarizeLegendWarnings } from "./legend-pro-agents.js";
import { applyDisagreementSafetyLabel, buildProConsensus, buildProDisagreements } from "./pro-disagreement.js";
import type { AgentVerdict, BuffettQualitySnapshot, CommitteeDecision, IrEventEvidence, ProFinalLabel, StockProScore, ValuationSnapshot } from "./pro-types.js";
import type { AccuracySummary, HypothesisOutcome, WorldContext } from "./universe.js";

type AgentConfig = { agents?: Array<{ id: string; label: string; mission: string; must_check?: string[]; reject_when?: string[]; output: string }>; agent_order?: string[] };
type Company = { code: string; name: string; role?: string; noMoveHypothesis?: string; downsideHypothesis?: string; evidenceToCheck?: string[]; nonMoveReasonCandidates?: string[]; relatedCompanies?: string[] };
type Hypotheses = { categories?: Record<string, { label: string; thesis?: string; companies?: Company[] }> };
type NetworkEntry = { peers?: Array<{ code: string; name: string; relation: string }>; betterPeerRisk?: string[]; evidenceChecks?: string[]; customerOrDemandDrivers?: string[] };
type Network = { companies?: Record<string, NetworkEntry> };
type IrEventEntry = { type: string; label: string; date?: string | null; sourceUrl?: string | null; sourceStatus?: string };
type IrEvents = { companies?: Record<string, { events?: IrEventEntry[] }> };
type AgentView = { stance: ProFinalLabel | "注意"; points: string[] };

function readYaml<T>(path: string, fallback: T): T { if (!existsSync(path)) return fallback; return load(readFileSync(path, "utf-8")) as T; }
function readJson<T>(path: string, fallback: T): T { if (!existsSync(path)) return fallback; try { return JSON.parse(readFileSync(path, "utf-8")) as T; } catch { return fallback; } }
function toFinalLabel(stance: AgentView["stance"]): ProFinalLabel { return stance === "注意" ? "保留" : stance; }

function agentView(agentId: string, company: Company, network?: NetworkEntry, irEvents: IrEventEntry[] = []): AgentView {
  const points: string[] = [];
  let stance: AgentView["stance"] = "保留";
  if (agentId === "event_driven_agent") {
    if (irEvents.length === 0) { stance = "証拠不足"; points.push("直近IRイベント未登録。決算・総会・配当・資本政策確認が必要"); }
    else {
      const unconfirmed = irEvents.filter(event => !event.date || !event.sourceUrl || event.sourceStatus?.includes("required"));
      stance = unconfirmed.length > 0 ? "証拠不足" : "注意";
      for (const event of irEvents) points.push(`${event.label}: date=${event.date ?? "要確認"} source=${event.sourceStatus ?? "unknown"}`);
    }
  } else if (agentId === "theme_network_agent") {
    if (!network) { stance = "証拠不足"; points.push("company-network未登録。テーマの本命/周辺/競合が未確認"); }
    else {
      stance = (network.betterPeerRisk ?? []).length > 0 ? "保留" : "調査候補";
      for (const risk of network.betterPeerRisk ?? []) points.push(`better peer risk: ${risk}`);
      for (const peer of network.peers ?? []) points.push(`peer: ${peer.code} ${peer.name} / ${peer.relation}`);
    }
  } else if (agentId === "bear_case_agent") {
    if (!company.noMoveHypothesis && !company.downsideHypothesis) { stance = "証拠不足"; points.push("上がらない理由/下がる理由が不足"); }
    else {
      stance = "保留";
      if (company.noMoveHypothesis) points.push(`上がらない理由: ${company.noMoveHypothesis}`);
      if (company.downsideHypothesis) points.push(`下がる理由: ${company.downsideHypothesis}`);
      for (const reason of company.nonMoveReasonCandidates ?? []) points.push(`外れ理由候補: ${reason}`);
    }
  } else if (agentId === "valuation_agent") {
    const hasValuation = (company.evidenceToCheck ?? []).some(item => item.includes("PER") || item.includes("PBR") || item.includes("バリュエーション"));
    stance = hasValuation ? "保留" : "証拠不足";
    points.push(hasValuation ? "PER/PBR/過去レンジ確認対象あり" : "バリュエーション確認が不足");
  } else if (agentId === "buffett_quality_agent") {
    const hasQuality = (company.evidenceToCheck ?? []).some(item => item.includes("利益") || item.includes("ROIC") || item.includes("FCF") || item.includes("営業利益率"));
    stance = hasQuality ? "保留" : "証拠不足";
    points.push(hasQuality ? "財務品質確認対象あり" : "ROIC/FCF/利益率の確認が不足");
  } else if (agentId === "growth_agent") {
    const hasGrowth = (company.evidenceToCheck ?? []).some(item => item.includes("成長") || item.includes("売上") || item.includes("地域") || item.includes("海外"));
    stance = hasGrowth ? "保留" : "証拠不足";
    points.push(hasGrowth ? "成長ドライバー確認対象あり" : "売上/利益成長の確認が不足");
  } else if (agentId === "risk_manager_agent") {
    const risky = irEvents.length === 0 || !network || !company.noMoveHypothesis || !company.downsideHypothesis;
    stance = risky ? "保留" : "注意";
    if (irEvents.length === 0) points.push("IRイベント未確認では強い判断をしない");
    if (!network) points.push("network未確認では単独銘柄に寄せない");
    if (!company.noMoveHypothesis) points.push("上がらない理由が不足");
    if (!company.downsideHypothesis) points.push("下がる理由が不足");
  }
  if (points.length === 0) points.push("追加確認なし");
  return { stance, points };
}

function finalDecision(views: Array<{ stance: string }>): ProFinalLabel {
  const stances = views.map(v => v.stance);
  if (stances.includes("証拠不足")) return "証拠不足";
  if (stances.filter(v => v === "保留").length >= 2) return "保留";
  if (stances.includes("注意")) return "保留";
  return "調査候補";
}

function toVerdict(agentId: string, label: string, view: AgentView): AgentVerdict {
  const stance = toFinalLabel(view.stance);
  const missingEvidence = view.points.filter(point => /不足|未登録|未確認|要確認/.test(point));
  const blockerReasons = stance === "証拠不足" || stance === "避ける" ? missingEvidence : [];
  return { agentId, label, stance, confidence: stance === "証拠不足" ? 0.35 : stance === "保留" ? 0.55 : 0.7, positiveEvidence: stance === "調査候補" ? view.points : [], negativeEvidence: stance !== "調査候補" ? view.points : [], missingEvidence, blockerReasons, scoreContribution: { businessQuality: agentId === "buffett_quality_agent" ? (stance === "証拠不足" ? 20 : 50) : undefined, valuation: agentId === "valuation_agent" ? (stance === "証拠不足" ? 20 : 50) : undefined, timing: agentId === "event_driven_agent" ? (stance === "証拠不足" ? 20 : 55) : undefined, evidenceQuality: missingEvidence.length > 0 ? 30 : 65, riskPenalty: blockerReasons.length * 10 } };
}

function buildProScore(company: Company, finalLabel: ProFinalLabel, verdicts: AgentVerdict[]): StockProScore {
  const missingEvidence = [...new Set(verdicts.flatMap(v => v.missingEvidence))];
  const blockers = [...new Set(verdicts.flatMap(v => v.blockerReasons))];
  const avg = (values: number[]) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 50;
  const businessQualityScore = Math.round(avg(verdicts.map(v => v.scoreContribution.businessQuality).filter((v): v is number => v != null)));
  const valuationScore = Math.round(avg(verdicts.map(v => v.scoreContribution.valuation).filter((v): v is number => v != null)));
  const timingScore = Math.round(avg(verdicts.map(v => v.scoreContribution.timing).filter((v): v is number => v != null)));
  const evidenceQualityScore = Math.round(avg(verdicts.map(v => v.scoreContribution.evidenceQuality).filter((v): v is number => v != null)));
  const riskPenalty = Math.min(100, blockers.length * 10 + verdicts.filter(v => v.stance === "証拠不足").length * 8);
  const finalScore = Math.max(0, Math.round((businessQualityScore + valuationScore + timingScore + evidenceQualityScore) / 4 - riskPenalty));
  return { code: company.code, name: company.name, businessQualityScore, valuationScore, timingScore, evidenceQualityScore, riskPenalty, finalScore, finalLabel, blockers, missingEvidence };
}

function main() {
  const date = todayJst();
  const agents = readYaml<AgentConfig>("config/stock-pro-agents.yml", {});
  const hypotheses = readYaml<Hypotheses>("config/company-hypotheses.yml", {});
  const network = readYaml<Network>("config/company-network.yml", {});
  const irEvents = readYaml<IrEvents>("config/company-ir-events.yml", {});
  const buffettQuality = readJson<{ snapshots?: BuffettQualitySnapshot[] }>("data/buffett_quality_latest.json", { snapshots: [] });
  const valuationSnapshots = readJson<{ snapshots?: ValuationSnapshot[] }>("data/valuation_snapshot_latest.json", { snapshots: [] });
  const irEventEvidence = readJson<{ events?: IrEventEvidence[] }>("data/ir_event_evidence_latest.json", { events: [] });
  const outcomes = readJson<{ outcomes?: HypothesisOutcome[] }>("apps/web/public/generated/outcomes.json", { outcomes: [] }).outcomes ?? [];
  const accuracySummary = readJson<AccuracySummary | null>("data/hypothesis_accuracy_summary.json", null);
  const worldContext = readJson<WorldContext | null>("data/world_context_latest.json", null);
  const qualityByCode = new Map((buffettQuality.snapshots ?? []).map(item => [item.code, item]));
  const valuationByCode = new Map((valuationSnapshots.snapshots ?? []).map(item => [item.code, item]));
  const irEvidenceByCode = new Map<string, IrEventEvidence[]>();
  for (const event of irEventEvidence.events ?? []) irEvidenceByCode.set(event.code, [...(irEvidenceByCode.get(event.code) ?? []), event]);
  const agentById = new Map((agents.agents ?? []).map(agent => [agent.id, agent]));
  const order = agents.agent_order ?? (agents.agents ?? []).map(agent => agent.id);
  const lines: string[] = [];
  const decisions: CommitteeDecision[] = [];
  lines.push("# alpha-pon stock pro committee report", "", `date: ${date}`, "", "複数の株Pro視点で同じ銘柄を見て、合意点・対立点・不足情報・次アクションを出します。買い推奨ではありません。", "");

  for (const [categoryId, category] of Object.entries(hypotheses.categories ?? {})) {
    lines.push(`## ${category.label} (${categoryId})`, "");
    for (const company of category.companies ?? []) {
      const companyNetwork = network.companies?.[company.code];
      const companyIrEvents = irEvents.companies?.[company.code]?.events ?? [];
      const views = order.map(agentId => ({ agentId, agent: agentById.get(agentId), ...agentView(agentId, company, companyNetwork, companyIrEvents) }));
      const baseDecision = finalDecision(views);
      const disagreement = new Set(views.map(view => view.stance)).size > 1;
      const verdicts = views.map(view => toVerdict(view.agentId, view.agent?.label ?? view.agentId, { stance: view.stance, points: view.points }));
      const legendVerdicts = buildLegendAgentVerdicts({ company, network: companyNetwork, irEvents: irEvidenceByCode.get(company.code), buffettQuality: qualityByCode.get(company.code), valuation: valuationByCode.get(company.code), outcomes, accuracySummary, worldContext });
      const legendWarnings = summarizeLegendWarnings(legendVerdicts);
      const consensus = buildProConsensus([...verdicts, ...legendVerdicts]);
      const disagreements = buildProDisagreements([...verdicts, ...legendVerdicts]);
      const safeFinalLabel = applyDisagreementSafetyLabel(baseDecision, consensus, disagreements);
      const proScore = buildProScore(company, safeFinalLabel, verdicts);
      const nextActions = safeFinalLabel === "証拠不足" ? ["公式IRイベント、決算、総会/招集通知/議案、配当/資本政策を先に確認", "財務品質・バリュエーション・競合比較を埋める"] : safeFinalLabel === "保留" ? ["上がらない理由と下がる理由を補強", "better peer risk とバリュエーション過熱を確認"] : ["調査候補。ただし取引判断ではなく、一次情報と価格確認を継続"];
      decisions.push({ code: company.code, name: company.name, originalFinalLabel: baseDecision, finalLabel: safeFinalLabel, finalScore: proScore.finalScore, proScore, verdicts, legendVerdicts, legendWarnings, consensus, disagreements, nextActions, blockers: proScore.blockers, missingEvidence: proScore.missingEvidence });
      lines.push(`### ${company.code} ${company.name}`);
      lines.push(`- committee decision: **${safeFinalLabel}**`);
      lines.push(`- original decision: ${baseDecision}`);
      lines.push(`- final score: ${proScore.finalScore}`);
      lines.push(`- disagreement: ${disagreement || disagreements.length > 0 ? "あり" : "なし"}`);
      lines.push(`- agreement: ${consensus.agreementLevel}`);
      lines.push("- agent views:");
      for (const view of views) { lines.push(`  - ${view.agent?.label ?? view.agentId}: ${view.stance}`); for (const point of view.points.slice(0, 4)) lines.push(`    - ${point}`); }
      lines.push("- legend pro views:");
      for (const view of legendVerdicts.slice(0, 10)) lines.push(`  - ${view.label}: ${view.stance} (${view.confidence.toFixed(2)})`);
      if (legendWarnings.length > 0) { lines.push("- legend warnings:"); legendWarnings.slice(0, 6).forEach(warning => lines.push(`  - ${warning}`)); }
      if (disagreements.length > 0) {
        lines.push("- disagreements:");
        for (const item of disagreements) {
          lines.push(`  - ${item.topic}: ${item.summary}`);
          lines.push(`    - resolution: ${item.resolutionRule}`);
        }
      }
      lines.push("- next actions:");
      nextActions.forEach(action => lines.push(`  - ${action}`));
      lines.push("");
    }
  }

  lines.push("## rule", "- 委員会decisionは買い推奨ではない", "- 1人でも証拠不足が強い場合、原則ラベルを上げない", "- agent viewsが割れた銘柄は、意見対立そのものを価値ある情報として残す", "- 調査候補より、保留/証拠不足の理由の質を上げる");
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stock_pro_committee_latest.md"), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "stock_pro_committee_latest.json"), JSON.stringify({ generatedAt: date, decisions }, null, 2), "utf-8");
  console.log(`stock pro committee report generated: ${decisions.length}`);
}

main();
