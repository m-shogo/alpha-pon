// Pro委員会レポート生成
// 買い推奨ではありません。調査・検証・反証・学習用。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import type { ProVerdict, ProDecision, ProCommitteeReport } from "./pro-types.js";
import {
  detectAgreementLevel,
  detectDisagreements,
  applySafetyRule,
  toProScore,
  deriveOriginalFinalLabel,
  isBlock,
  isEvidenceGap,
  isCautious,
} from "./pro-disagreement.js";

// ---------- YAML 型 ----------

type AgentConfig = {
  agents?: Array<{
    id: string;
    label: string;
    mission: string;
    must_check?: string[];
    reject_when?: string[];
    output: string;
  }>;
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
type Hypotheses = {
  categories?: Record<string, { label: string; thesis?: string; companies?: Company[] }>;
};
type NetworkEntry = {
  peers?: Array<{ code: string; name: string; relation: string }>;
  betterPeerRisk?: string[];
  evidenceChecks?: string[];
  customerOrDemandDrivers?: string[];
};
type Network = { companies?: Record<string, NetworkEntry> };
type IrEventEntry = {
  type: string;
  label: string;
  date?: string | null;
  sourceUrl?: string | null;
  sourceStatus?: string;
};
type IrEvents = { companies?: Record<string, { events?: IrEventEntry[] }> };

// legend tier = 最終判断に強い影響を持つエージェント
const LEGEND_AGENT_IDS = new Set([
  "buffett_quality_agent",
  "valuation_agent",
  "risk_manager_agent",
]);

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

// ---------- エージェント個別判定 ----------

function agentView(
  agentId: string,
  agentLabel: string,
  company: Company,
  network?: NetworkEntry,
  irEvents: IrEventEntry[] = []
): { stance: string; points: string[] } {
  const points: string[] = [];
  let stance = "保留";

  if (agentId === "event_driven_agent") {
    if (irEvents.length === 0) {
      stance = "証拠不足";
      points.push("直近IRイベント未登録。決算・総会・配当・資本政策確認が必要");
    } else {
      const unconfirmed = irEvents.filter(
        e => !e.date || !e.sourceUrl || e.sourceStatus?.includes("required")
      );
      stance = unconfirmed.length > 0 ? "証拠不足" : "注意";
      for (const ev of irEvents)
        points.push(`${ev.label}: date=${ev.date ?? "要確認"} source=${ev.sourceStatus ?? "unknown"}`);
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
      for (const r of company.nonMoveReasonCandidates ?? []) points.push(`外れ理由候補: ${r}`);
    }
  } else if (agentId === "valuation_agent") {
    const hasValuation = (company.evidenceToCheck ?? []).some(
      item => item.includes("PER") || item.includes("PBR") || item.includes("バリュエーション")
    );
    stance = hasValuation ? "保留" : "証拠不足";
    points.push(
      hasValuation ? "PER/PBR/過去レンジ確認対象あり" : "バリュエーション確認が不足"
    );
  } else if (agentId === "buffett_quality_agent") {
    const hasQuality = (company.evidenceToCheck ?? []).some(
      item =>
        item.includes("利益") ||
        item.includes("ROIC") ||
        item.includes("FCF") ||
        item.includes("営業利益率")
    );
    stance = hasQuality ? "保留" : "証拠不足";
    points.push(hasQuality ? "財務品質確認対象あり" : "ROIC/FCF/利益率の確認が不足");
  } else if (agentId === "growth_agent") {
    const hasGrowth = (company.evidenceToCheck ?? []).some(
      item =>
        item.includes("成長") || item.includes("売上") || item.includes("地域") || item.includes("海外")
    );
    stance = hasGrowth ? "保留" : "証拠不足";
    points.push(hasGrowth ? "成長ドライバー確認対象あり" : "売上/利益成長の確認が不足");
  } else if (agentId === "risk_manager_agent") {
    const risky =
      irEvents.length === 0 ||
      !network ||
      !company.noMoveHypothesis ||
      !company.downsideHypothesis;
    stance = risky ? "保留" : "注意";
    if (irEvents.length === 0) points.push("IRイベント未確認では強い判断をしない");
    if (!network) points.push("network未確認では単独銘柄に寄せない");
    if (!company.noMoveHypothesis) points.push("上がらない理由が不足");
    if (!company.downsideHypothesis) points.push("下がる理由が不足");
  }

  if (points.length === 0) points.push("追加確認なし");
  return { stance, points };
}

// ---------- 委員会判定のマッピング ----------

function toTypedVerdict(
  agentId: string,
  agentLabel: string,
  stance: string,
  points: string[]
): ProVerdict {
  const validStance = (s: string): s is ProVerdict["stance"] =>
    ["調査候補", "保留", "証拠不足", "注意", "避ける"].includes(s);
  const normalizedStance: ProVerdict["stance"] = validStance(stance) ? stance : "保留";
  return {
    agentId,
    agentLabel,
    stance: normalizedStance,
    points,
    isBlock: isBlock({ stance }),
    isEvidenceGap: isEvidenceGap({ stance }),
    isCautious: isCautious({ stance }),
  };
}

// ---------- next actions / blockers / missingEvidence 生成 ----------

function buildNextActions(finalLabel: string, verdicts: ProVerdict[]): string[] {
  const actions: string[] = [];
  if (finalLabel === "証拠不足") {
    actions.push("公式IRイベント、決算、総会/招集通知/議案、配当/資本政策を先に確認");
    actions.push("財務品質・バリュエーション・競合比較を埋める");
  } else if (finalLabel === "避ける") {
    actions.push("ブロック理由を精査し、条件が変化したら再評価する");
    actions.push("避ける判定を出したエージェントの根拠を再確認");
  } else if (finalLabel === "保留") {
    actions.push("上がらない理由と下がる理由を補強");
    actions.push("better peer risk とバリュエーション過熱を確認");
  } else {
    actions.push("調査候補。買い判断ではなく、一次情報と価格確認を継続");
    actions.push("consensus / disagreements を確認してから次のアクションを決める");
  }
  // evidence gap がある場合は追加
  if (verdicts.some(v => v.isEvidenceGap)) {
    actions.push("証拠不足フィールドを埋めてから委員会を再実行する");
  }
  return actions;
}

function collectBlockers(verdicts: ProVerdict[]): string[] {
  return verdicts
    .filter(v => v.isBlock)
    .flatMap(v => v.points.slice(0, 3).map(p => `[${v.agentLabel}] ${p}`));
}

function collectMissingEvidence(verdicts: ProVerdict[]): string[] {
  return verdicts
    .filter(v => v.isEvidenceGap)
    .flatMap(v => v.points.slice(0, 3).map(p => `[${v.agentLabel}] ${p}`));
}

// ---------- メイン ----------

function main() {
  const date = todayJst();
  const agents = readYaml<AgentConfig>("config/stock-pro-agents.yml", {});
  const hypotheses = readYaml<Hypotheses>("config/company-hypotheses.yml", {});
  const network = readYaml<Network>("config/company-network.yml", {});
  const irEvents = readYaml<IrEvents>("config/company-ir-events.yml", {});
  const agentById = new Map((agents.agents ?? []).map(a => [a.id, a]));
  const order = agents.agent_order ?? (agents.agents ?? []).map(a => a.id);

  const lines: string[] = [];
  lines.push("# alpha-pon stock pro committee report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push(
    "複数の株Pro視点で同じ銘柄を見て、合意点・対立点・不足情報・次アクションを出します。買い推奨ではありません。"
  );
  lines.push("");

  const decisions: ProDecision[] = [];

  for (const [categoryId, category] of Object.entries(hypotheses.categories ?? {})) {
    lines.push(`## ${category.label} (${categoryId})`);
    lines.push("");

    for (const company of category.companies ?? []) {
      const companyNetwork = network.companies?.[company.code];
      const companyIrEvents = irEvents.companies?.[company.code]?.events ?? [];

      const verdicts: ProVerdict[] = order.map(agentId => {
        const agent = agentById.get(agentId);
        const label = agent?.label ?? agentId;
        const { stance, points } = agentView(agentId, label, company, companyNetwork, companyIrEvents);
        return toTypedVerdict(agentId, label, stance, points);
      });

      const legendVerdicts = verdicts.filter(v => LEGEND_AGENT_IDS.has(v.agentId));
      const legendWarnings = legendVerdicts
        .filter(v => v.isBlock || v.isEvidenceGap)
        .flatMap(v => v.points.slice(0, 2).map(p => `[${v.agentLabel}] ${p}`));

      const originalFinalLabel = deriveOriginalFinalLabel(verdicts);
      const finalLabel = applySafetyRule(originalFinalLabel, verdicts);
      const consensus = detectAgreementLevel(verdicts);
      const disagreements = detectDisagreements(verdicts);
      const proScore = toProScore(verdicts);
      const finalScore = proScore;

      const nextActions = buildNextActions(finalLabel, verdicts);
      const blockers = collectBlockers(verdicts);
      const missingEvidence = collectMissingEvidence(verdicts);

      const decision: ProDecision = {
        code: company.code,
        name: company.name,
        originalFinalLabel,
        finalLabel,
        finalScore,
        proScore,
        verdicts,
        legendVerdicts,
        legendWarnings,
        consensus,
        disagreements,
        nextActions,
        blockers,
        missingEvidence,
      };
      decisions.push(decision);

      // MD 出力
      const safetyOverridden = finalLabel !== originalFinalLabel;
      lines.push(`### ${company.code} ${company.name}`);
      lines.push(`- committee decision: **${finalLabel}**`);
      if (safetyOverridden) lines.push(`  - (安全ルール適用: ${originalFinalLabel} → ${finalLabel})`);
      lines.push(`- originalFinalLabel: ${originalFinalLabel}`);
      lines.push(`- consensus: ${consensus}`);
      lines.push(`- proScore: ${proScore}`);
      if (disagreements.length > 0) {
        lines.push("- disagreements:");
        for (const d of disagreements) {
          lines.push(`  - [${d.topic}] ${d.description}`);
        }
      }
      if (legendWarnings.length > 0) {
        lines.push("- legend warnings:");
        for (const w of legendWarnings) lines.push(`  - ${w}`);
      }
      lines.push("- agent views:");
      for (const v of verdicts) {
        lines.push(`  - ${v.agentLabel}: ${v.stance}`);
        for (const p of v.points.slice(0, 4)) lines.push(`    - ${p}`);
      }
      lines.push("- next actions:");
      for (const a of nextActions) lines.push(`  - ${a}`);
      if (blockers.length > 0) {
        lines.push("- blockers:");
        for (const b of blockers) lines.push(`  - ${b}`);
      }
      if (missingEvidence.length > 0) {
        lines.push("- missingEvidence:");
        for (const m of missingEvidence) lines.push(`  - ${m}`);
      }
      lines.push("");
    }
  }

  lines.push("## rule");
  lines.push("- 委員会decisionは買い推奨ではない");
  lines.push('- 1人でも"避ける"が出たら finalLabel を"避ける"に倒す');
  lines.push('- 証拠不足は"避ける"扱いにしない。情報が足りないだけ');
  lines.push("- disagreements があれば finalScore だけで判断しない");
  lines.push("- mixed/conflict の時は consensus の内訳を先に確認する");

  mkdirSync("reports", { recursive: true });

  // MD 出力
  writeFileSync(join("reports", "stock_pro_committee_latest.md"), lines.join("\n"), "utf-8");

  // JSON 出力 (新規追加)
  const report: ProCommitteeReport = { generatedAt: date, decisions };
  writeFileSync(
    join("reports", "stock_pro_committee_latest.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(
    `stock pro committee report generated: ${decisions.length} companies` +
    ` | decisions: ${decisions.map(d => `${d.code}=${d.finalLabel}`).join(" ")}`
  );
}

main();
