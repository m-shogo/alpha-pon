import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type AgentConfig = {
  agents?: Array<{ id: string; label: string; mission: string; must_check?: string[]; reject_when?: string[]; output: string }>;
  agent_order?: string[];
};

type Company = {
  code: string;
  name: string;
  noMoveHypothesis?: string;
  downsideHypothesis?: string;
  evidenceToCheck?: string[];
  nonMoveReasonCandidates?: string[];
  relatedCompanies?: string[];
};
type Hypotheses = { categories?: Record<string, { label: string; thesis?: string; companies?: Company[] }> };
type Network = { companies?: Record<string, { peers?: Array<{ code: string; name: string; relation: string }>; betterPeerRisk?: string[]; evidenceChecks?: string[]; customerOrDemandDrivers?: string[] }> };
type IrEvents = { companies?: Record<string, { events?: Array<{ type: string; label: string; date?: string | null; sourceUrl?: string | null; sourceStatus?: string }> }> };

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function agentView(agentId: string, company: Company, network?: Network["companies"][string], irEvents: IrEvents["companies"][string]["events"] = []): { stance: string; points: string[] } {
  const points: string[] = [];
  let stance = "保留";

  if (agentId === "event_driven_agent") {
    if (irEvents.length === 0) {
      stance = "証拠不足";
      points.push("直近IRイベント未登録。決算・総会・配当・資本政策確認が必要");
    } else {
      const unconfirmed = irEvents.filter(event => !event.date || !event.sourceUrl || event.sourceStatus?.includes("required"));
      stance = unconfirmed.length > 0 ? "証拠不足" : "注意";
      for (const event of irEvents) points.push(`${event.label}: date=${event.date ?? "要確認"} source=${event.sourceStatus ?? "unknown"}`);
    }
  } else if (agentId === "theme_network_agent") {
    if (!network) {
      stance = "証拠不足";
      points.push("company-network未登録。テーマの本命/周辺/競合が未確認");
    } else {
      stance = (network.betterPeerRisk ?? []).length > 0 ? "保留" : "調査候補";
      for (const risk of network.betterPeerRisk ?? []) points.push(`better peer risk: ${risk}`);
      for (const peer of network.peers ?? []) points.push(`peer: ${peer.code} ${peer.name} / ${peer.relation}`);
    }
  } else if (agentId === "bear_case_agent") {
    if (!company.noMoveHypothesis && !company.downsideHypothesis) {
      stance = "証拠不足";
      points.push("上がらない理由/下がる理由が不足");
    } else {
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

function finalDecision(views: Array<{ stance: string }>): string {
  const stances = views.map(v => v.stance);
  if (stances.includes("証拠不足")) return "証拠不足";
  if (stances.filter(v => v === "保留").length >= 2) return "保留";
  if (stances.includes("注意")) return "保留";
  return "調査候補";
}

function main() {
  const date = todayJst();
  const agents = readYaml<AgentConfig>("config/stock-pro-agents.yml", {});
  const hypotheses = readYaml<Hypotheses>("config/company-hypotheses.yml", {});
  const network = readYaml<Network>("config/company-network.yml", {});
  const irEvents = readYaml<IrEvents>("config/company-ir-events.yml", {});
  const agentById = new Map((agents.agents ?? []).map(agent => [agent.id, agent]));
  const order = agents.agent_order ?? (agents.agents ?? []).map(agent => agent.id);

  const lines: string[] = [];
  lines.push("# alpha-pon stock pro committee report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("複数の株Pro視点で同じ銘柄を見て、合意点・対立点・不足情報・次アクションを出します。買い推奨ではありません。");
  lines.push("");

  for (const [categoryId, category] of Object.entries(hypotheses.categories ?? {})) {
    lines.push(`## ${category.label} (${categoryId})`);
    lines.push("");
    for (const company of category.companies ?? []) {
      const companyNetwork = network.companies?.[company.code];
      const companyIrEvents = irEvents.companies?.[company.code]?.events ?? [];
      const views = order.map(agentId => ({ agentId, agent: agentById.get(agentId), ...agentView(agentId, company, companyNetwork, companyIrEvents) }));
      const decision = finalDecision(views);
      const disagreement = new Set(views.map(view => view.stance)).size > 1;

      lines.push(`### ${company.code} ${company.name}`);
      lines.push(`- committee decision: **${decision}**`);
      lines.push(`- disagreement: ${disagreement ? "あり" : "なし"}`);
      lines.push("- agent views:");
      for (const view of views) {
        lines.push(`  - ${view.agent?.label ?? view.agentId}: ${view.stance}`);
        for (const point of view.points.slice(0, 4)) lines.push(`    - ${point}`);
      }
      lines.push("- next actions:");
      if (decision === "証拠不足") {
        lines.push("  - 公式IRイベント、決算、総会/招集通知/議案、配当/資本政策を先に確認");
        lines.push("  - 財務品質・バリュエーション・競合比較を埋める");
      } else if (decision === "保留") {
        lines.push("  - 上がらない理由と下がる理由を補強");
        lines.push("  - better peer risk とバリュエーション過熱を確認");
      } else {
        lines.push("  - 調査候補。ただし買い判断ではなく、一次情報と価格確認を継続");
      }
      lines.push("");
    }
  }

  lines.push("## rule");
  lines.push("- 委員会decisionは買い推奨ではない");
  lines.push("- 1人でも証拠不足が強い場合、原則ラベルを上げない");
  lines.push("- agent viewsが割れた銘柄は、意見対立そのものを価値ある情報として残す");
  lines.push("- 調査候補より、保留/証拠不足の理由の質を上げる");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stock_pro_committee_latest.md"), lines.join("\n"), "utf-8");
  console.log("stock pro committee report generated");
}

main();
