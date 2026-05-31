import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type CompanyHypothesis = {
  code: string;
  name: string;
  role: string;
  status?: string;
  upsideHypothesis?: string;
  noMoveHypothesis?: string;
  downsideHypothesis?: string;
  notGoodWhen?: string[];
  relatedCompanies?: string[];
  evidenceToCheck?: string[];
  nonMoveReasonCandidates?: string[];
  lastReviewedAt?: string;
};

type CompanyHypothesesConfig = {
  categories: Record<string, {
    label: string;
    thesis: string;
    companies: CompanyHypothesis[];
  }>;
};

type NetworkCompany = {
  name: string;
  categoryHints?: string[];
  peers?: Array<{ code: string; name: string; relation: string }>;
  customerOrDemandDrivers?: string[];
  betterPeerRisk?: string[];
  evidenceChecks?: string[];
};

type CompanyNetworkConfig = { companies: Record<string, NetworkCompany> };

type AgentConfig = {
  agents: Array<{
    id: string;
    label: string;
    mission: string;
    must_check: string[];
    reject_when: string[];
    output: string;
  }>;
  agent_order?: string[];
};

type CurrentRegime = {
  asOf: string;
  summary: string;
  activeRegimes?: Array<{
    id: string;
    level: string;
    why: string;
    watchCategories?: string[];
    caution?: string[];
  }>;
};

type ScoreEntry = {
  code: string;
  name: string;
  score?: number;
  alertLevel?: string;
  dataQuality?: string;
  warnings?: string[];
  marketContext?: {
    return60d?: number | null;
    relativeToTopix20d?: number | null;
    liquidityYen20d?: number | null;
  };
  financialQuality?: {
    roic?: number | null;
    roe?: number | null;
    fcfMargin?: number | null;
    operatingMargin?: number | null;
    equityRatio?: number | null;
    moatScore?: number;
    qualityScore?: number;
  };
  primaryDisclosureReview?: {
    decision?: string;
  };
};

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

function latestScoreFile(): string | null {
  if (!existsSync("reports")) return null;
  const files = require("fs").readdirSync("reports")
    .filter((file: string) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  return files.at(-1) ? join("reports", files.at(-1)) : null;
}

function readScores(): ScoreEntry[] {
  const path = latestScoreFile();
  if (!path) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return Array.isArray(value) ? value as ScoreEntry[] : [];
  } catch {
    return [];
  }
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function evaluateCompany(company: CompanyHypothesis, score: ScoreEntry | undefined, network?: NetworkCompany): {
  good: string[];
  bad: string[];
  noMove: string[];
  blindSpots: string[];
  finalLabel: string;
} {
  const good: string[] = [];
  const bad: string[] = [];
  const noMove: string[] = [];
  const blindSpots: string[] = [];

  if (company.upsideHypothesis) good.push(company.upsideHypothesis);
  if (company.noMoveHypothesis) noMove.push(company.noMoveHypothesis);
  if (company.downsideHypothesis) bad.push(company.downsideHypothesis);

  if (network) {
    for (const risk of network.betterPeerRisk ?? []) {
      noMove.push(`関連会社/競合の方が本命かもしれない: ${risk}`);
    }
    for (const driver of network.customerOrDemandDrivers ?? []) {
      blindSpots.push(`需要ドライバー確認: ${driver}`);
    }
    for (const evidence of network.evidenceChecks ?? []) {
      blindSpots.push(`ネットワークDB確認: ${evidence}`);
    }
  } else {
    blindSpots.push("company-network.yml 未接続。関連会社・競合・better peer risk の確認が弱い");
    noMove.push("テーマは正しいが、銘柄選定の横比較が不足している可能性");
  }

  const fq = score?.financialQuality;
  const mc = score?.marketContext;
  const primary = score?.primaryDisclosureReview;

  if (fq) {
    if ((fq.qualityScore ?? 0) >= 10 || (fq.moatScore ?? 0) >= 7) good.push("財務品質/競争優位スコアが比較的強い可能性");
    if ((fq.roic ?? 0) >= 8) good.push(`ROIC ${fmtPct(fq.roic)} は一定水準以上`);
    if ((fq.fcfMargin ?? -999) < 0) bad.push("FCFマージンが弱く、利益が現金化されていない可能性");
    if ((fq.equityRatio ?? 100) < 30) bad.push("自己資本比率が低く、金融環境悪化に弱い可能性");
  } else {
    blindSpots.push("financialQuality が未取得。バフェット型/品質評価が弱い");
  }

  if (mc) {
    if ((mc.return60d ?? 0) >= 30) bad.push(`60日上昇率 ${fmtPct(mc.return60d)} で過熱・織り込み済みに注意`);
    if ((mc.relativeToTopix20d ?? 0) >= 15) bad.push(`TOPIX比20日 ${fmtPct(mc.relativeToTopix20d)} で期待先行の可能性`);
    if ((mc.return60d ?? 0) <= -15 && ((fq?.qualityScore ?? 0) >= 10 || (fq?.moatScore ?? 0) >= 7)) good.push("品質がある銘柄の押し目候補かもしれない。ただし悪材料確認が必要");
  } else {
    blindSpots.push("marketContext が未取得。過熱/押し目/地合い比較が弱い");
  }

  if (!primary || primary.decision === "missing") {
    blindSpots.push("一次情報確認が不足。ニュースやテーマだけで判断しない");
    noMove.push("一次情報が弱く、投資家が本気で評価しない可能性");
  } else if (primary.decision === "block") {
    bad.push("一次情報レビューがblock。好材料より悪材料を優先確認");
  } else if (primary.decision === "confirmed") {
    good.push("一次情報で一定の裏取りがある可能性");
  }

  for (const condition of company.notGoodWhen ?? []) bad.push(`ダメ条件: ${condition}`);
  for (const reason of company.nonMoveReasonCandidates ?? []) noMove.push(`外れたら疑う理由DB: ${reason}`);
  for (const evidence of company.evidenceToCheck ?? []) blindSpots.push(`確認不足なら見る: ${evidence}`);

  let finalLabel = "保留";
  if (bad.some(item => item.includes("block") || item.includes("希薄化") || item.includes("赤字") || item.includes("不祥事"))) finalLabel = "避ける";
  else if (!network || (network.betterPeerRisk ?? []).length >= 2) finalLabel = "追わない/保留";
  else if (blindSpots.length >= 3) finalLabel = "証拠不足";
  else if (good.length >= 3 && bad.length <= 3) finalLabel = "調査候補";

  return { good, bad, noMove, blindSpots, finalLabel };
}

function main() {
  const date = todayJst();
  const hypotheses = readYaml<CompanyHypothesesConfig>("config/company-hypotheses.yml");
  const network = readYaml<CompanyNetworkConfig>("config/company-network.yml");
  const agents = readYaml<AgentConfig>("config/stock-pro-agents.yml");
  const regime = readYaml<CurrentRegime>("config/current-regime.yml");
  const scores = readScores();
  const scoreByCode = new Map(scores.map(score => [score.code, score]));
  const activeCategories = new Set((regime.activeRegimes ?? []).flatMap(item => item.watchCategories ?? []));

  const lines: string[] = [];
  lines.push("# alpha-pon 株Proエージェント考察レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> バフェット型・成長株型・イベント型・バリュエーション型・反証型・テーマネットワーク型・リスク管理型の視点で、具体銘柄仮説を毎朝考察します。買い推奨ではありません。");
  lines.push("");
  lines.push(`- current regime asOf: ${regime.asOf}`);
  lines.push(`- regime summary: ${regime.summary}`);
  lines.push(`- agent order: ${(agents.agent_order ?? agents.agents.map(agent => agent.id)).join(" → ")}`);
  lines.push("");

  for (const [categoryId, category] of Object.entries(hypotheses.categories)) {
    const activeMark = activeCategories.has(categoryId) ? "🔥" : "🔎";
    lines.push(`## ${activeMark} ${category.label} (${categoryId})`);
    lines.push("");
    lines.push(`- thesis: ${category.thesis}`);
    if (activeCategories.has(categoryId)) lines.push("- 現在情勢DBで監視対象になっています。");
    else lines.push("- 現在情勢DBでは監視対象外です。強い一次情報がない限り、保留/追わないを優先します。");
    lines.push("");

    for (const company of category.companies ?? []) {
      const score = scoreByCode.get(company.code);
      const networkCompany = network.companies?.[company.code];
      const result = evaluateCompany(company, score, networkCompany);
      lines.push(`### ${company.code} ${company.name}`);
      lines.push(`- role: ${company.role}`);
      lines.push(`- status: ${company.status ?? "watch"}`);
      lines.push(`- final label: **${result.finalLabel}**`);
      if (score) lines.push(`- latest score: ${score.score ?? "N/A"} / ${score.alertLevel ?? "N/A"} / dataQuality=${score.dataQuality ?? "N/A"}`);
      else lines.push("- latest score: 未取得。watchlist未登録またはdaily対象外の可能性");
      lines.push("- 良いところ:");
      result.good.slice(0, 8).forEach(item => lines.push(`  - ${item}`));
      if (result.good.length === 0) lines.push("  - N/A");
      lines.push("- 悪いところ・下がる仮説:");
      result.bad.slice(0, 10).forEach(item => lines.push(`  - ${item}`));
      if (result.bad.length === 0) lines.push("  - N/A");
      lines.push("- 上がらない理由候補:");
      result.noMove.slice(0, 10).forEach(item => lines.push(`  - ${item}`));
      if (result.noMove.length === 0) lines.push("  - N/A");
      lines.push("- 見落とし・次に確認:");
      result.blindSpots.slice(0, 10).forEach(item => lines.push(`  - ${item}`));
      if (networkCompany) {
        lines.push("- company network:");
        for (const peer of networkCompany.peers ?? []) lines.push(`  - peer ${peer.code} ${peer.name}: ${peer.relation}`);
        for (const risk of networkCompany.betterPeerRisk ?? []) lines.push(`  - better peer risk: ${risk}`);
      }
      if ((company.relatedCompanies ?? []).length > 0) {
        lines.push("- 親会社・関連会社・競合候補:");
        company.relatedCompanies!.forEach(item => lines.push(`  - ${item}`));
      }
      lines.push("");
    }
  }

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- final label は買い判断ではない。調査キューの優先順位に使う");
  lines.push("- 具体銘柄が不要な局面では、無理に銘柄化せずテーマ監視へ切り替える");
  lines.push("- 上がらなかったら non-move reason を必ず1つ以上候補に残す");
  lines.push("- 現在情勢DBと合わないテーマは、無理に追わず保留する");
  lines.push("- better peer risk が強い銘柄は、単独で追わない/保留を優先する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon stock pro agent report | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stock_pro_agent_latest.md"), lines.join("\n"), "utf-8");
  console.log("stock pro agent report generated");
}

main();
