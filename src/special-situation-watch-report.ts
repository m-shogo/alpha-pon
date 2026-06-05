// 特殊状況・時間差再評価ウォッチレポート生成
// carve-out / PE出口 / spin-off / lockup / cycle recovery 等の王道パターンを
// 調査優先候補・監視候補として蓄積し、チャンス候補を TOP / 通知向けに出す。
// 売買推奨ではない。
//
// pnpm watch:special

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import type { HypothesisOutcome } from "./universe.js";

// ─────────── 型定義 ───────────

const ALLOWED_FINAL_LABELS = [
  "構造監視候補",
  "チャンス候補",
  "調査優先候補",
  "需給待ち",
  "市況待ち",
  "初回決算待ち",
  "ロックアップ待ち",
  "証拠不足",
  "罠注意",
  "避ける",
] as const;
type FinalLabel = typeof ALLOWED_FINAL_LABELS[number];

const ALLOWED_CHANCE_LEVELS = ["none", "watch", "attention", "high"] as const;
type ChanceLevel = typeof ALLOWED_CHANCE_LEVELS[number];

const ALLOWED_WATCH_PHASES = [
  "pre_listing",
  "ipo_week",
  "first_earnings_wait",
  "lockup_wait",
  "sell_pressure_clearing",
  "cycle_confirmation",
  "fundamental_confirmation",
  "watch_only",
] as const;
type WatchPhase = typeof ALLOWED_WATCH_PHASES[number];

const ALLOWED_RISK_LEVELS = ["low", "medium", "high", "unknown"] as const;
type RiskLevel = typeof ALLOWED_RISK_LEVELS[number];

const ALLOWED_CONFIDENCE = ["official", "reported", "rumor", "unknown"] as const;
type Confidence = typeof ALLOWED_CONFIDENCE[number];

type PatternRule = {
  id: string;
  label: string;
  description: string;
  whyInteresting?: string[];
  whyDangerous?: string[];
  evidenceNeeded?: string[];
};

type ListingInfoConfig = {
  listedAt?: string | null;
  plannedListingAt?: string | null;
  ipoPrice?: number | null;
  firstPrice?: number | null;
  lockupExpiryAt?: string | null;
  firstEarningsAt?: string | null;
  source?: string | null;
  sourceCheckedAt?: string | null;
  confidence?: Confidence;
};

type CandidateConfig = {
  code: string;
  name: string;
  patterns: string[];
  watchPhase: WatchPhase;
  finalLabel: FinalLabel;
  chanceLevel: ChanceLevel;
  reasonSummary: string;
  parentOrSponsor?: string | null;
  sellerPressure?: RiskLevel;
  lockupRisk?: RiskLevel;
  debtRisk?: RiskLevel;
  capexRisk?: RiskLevel;
  cycleRisk?: RiskLevel;
  dilutionRisk?: RiskLevel;
  waitFor?: string[];
  listingInfo?: ListingInfoConfig;
  smallTicket?: {
    price?: number | null;
    minimumAmount?: number | null;
    isSmallTicket?: boolean;
    caution?: string[];
  };
};

type ReferenceEventConfig = {
  eventName: string;
  companyName: string;
  eventType:
    | "ipo_watch"
    | "listing_plan"
    | "listing_day"
    | "lockup"
    | "first_earnings"
    | "funding"
    | "regulation";
  plannedDate?: string | null;
  actualDate?: string | null;
  confidence: Confidence;
  source?: string | null;
  sourceCheckedAt?: string | null;
  relatedThemes?: string[];
  relatedJapaneseCompanies?: string[];
};

type SpecialSituationConfig = {
  version: number;
  description: string;
  defaultAction: string;
  neverTreatAs: string[];
  safetyRules?: string[];
  patterns: PatternRule[];
  candidates: CandidateConfig[];
  referenceEvents?: ReferenceEventConfig[];
  outcomeStats?: { minSampleSize?: number };
};

type OutcomeStats = {
  sampleSize: number;
  sampleTooSmall: boolean;
  hitRate: number | null;
  avgReturn1w: number | null;
  avgReturn1m: number | null;
  avgTopixRelative1m: number | null;
};

type SpecialSituationCandidate = {
  code: string;
  name: string;
  patterns: string[];
  watchPhase: WatchPhase;
  finalLabel: FinalLabel;
  chanceLevel: ChanceLevel;
  notificationEligible: boolean;

  reasonSummary: string;
  whyInteresting: string[];
  whyDangerous: string[];
  evidenceNeeded: string[];
  waitFor: string[];

  parentOrSponsor: string | null;
  sellerPressure: RiskLevel;
  lockupRisk: RiskLevel;
  debtRisk: RiskLevel;
  capexRisk: RiskLevel;
  cycleRisk: RiskLevel;
  dilutionRisk: RiskLevel;

  listingInfo?: {
    listedAt?: string | null;
    plannedListingAt?: string | null;
    ipoPrice?: number | null;
    firstPrice?: number | null;
    lockupExpiryAt?: string | null;
    firstEarningsAt?: string | null;
    source?: string | null;
    sourceCheckedAt?: string | null;
    confidence: Confidence;
  };

  smallTicket?: {
    price: number | null;
    minimumAmount: number | null;
    isSmallTicket: boolean;
    caution: string[];
  };

  outcomeStats?: OutcomeStats;
};

type TopChanceItem = {
  code: string;
  name: string;
  finalLabel: FinalLabel;
  chanceLevel: ChanceLevel;
  reasonSummary: string;
  topReasons: string[];
  mainRisks: string[];
  nextCheck: string[];
  listingInfo?: {
    listedAt?: string | null;
    plannedListingAt?: string | null;
    lockupExpiryAt?: string | null;
    firstEarningsAt?: string | null;
    confidence: Confidence;
  };
};

type ReferenceEvent = ReferenceEventConfig;

type SpecialSituationWatchReport = {
  generatedAt: string;
  defaultAction: string;
  neverTreatAs: string[];
  safetyRules: string[];
  patterns: Array<{
    id: string;
    label: string;
    description: string;
    whyInteresting: string[];
    whyDangerous: string[];
    evidenceNeeded: string[];
  }>;
  candidates: SpecialSituationCandidate[];
  topChanceList: TopChanceItem[];
  referenceEvents: ReferenceEvent[];
};

// ─────────── ヘルパ ───────────

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function hitRate(rows: HypothesisOutcome[]): number | null {
  const judged = rows.filter(r => r.result === "hit" || r.result === "miss");
  if (judged.length === 0) return null;
  return judged.filter(r => r.result === "hit").length / judged.length;
}

function fallbackRisk(value: RiskLevel | undefined): RiskLevel {
  return value ?? "unknown";
}

function fallbackConfidence(value: Confidence | undefined): Confidence {
  return value ?? "unknown";
}

function fmtPct(value: number | null): string {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

// ─────────── 統計 ───────────

function buildOutcomeStatsForCode(
  code: string,
  outcomes: HypothesisOutcome[],
  minSampleSize: number
): OutcomeStats {
  const rows = outcomes.filter(o => o.code === code);
  return {
    sampleSize: rows.length,
    sampleTooSmall: rows.length < minSampleSize,
    hitRate: hitRate(rows),
    avgReturn1w: avg(rows.map(r => r.return1w)),
    avgReturn1m: avg(rows.map(r => r.return1m)),
    avgTopixRelative1m: avg(rows.map(r => r.relativeToTopix1m)),
  };
}

// ─────────── 候補組み立て ───────────

function buildCandidate(
  config: CandidateConfig,
  patterns: PatternRule[],
  outcomes: HypothesisOutcome[],
  minSampleSize: number
): SpecialSituationCandidate {
  const patternIds = new Set(config.patterns ?? []);
  const matchedPatterns = patterns.filter(p => patternIds.has(p.id));

  // パターン由来の理由・リスク・evidence を集約 (重複除去)
  const whyInteresting = uniq(matchedPatterns.flatMap(p => p.whyInteresting ?? []));
  const whyDangerous = uniq(matchedPatterns.flatMap(p => p.whyDangerous ?? []));
  const evidenceNeeded = uniq(matchedPatterns.flatMap(p => p.evidenceNeeded ?? []));

  // ラベル検証
  if (!ALLOWED_FINAL_LABELS.includes(config.finalLabel)) {
    throw new Error(`不正な finalLabel: ${config.finalLabel} (code=${config.code})`);
  }
  if (!ALLOWED_CHANCE_LEVELS.includes(config.chanceLevel)) {
    throw new Error(`不正な chanceLevel: ${config.chanceLevel} (code=${config.code})`);
  }
  if (!ALLOWED_WATCH_PHASES.includes(config.watchPhase)) {
    throw new Error(`不正な watchPhase: ${config.watchPhase} (code=${config.code})`);
  }

  const stats = buildOutcomeStatsForCode(config.code, outcomes, minSampleSize);

  // 通知資格判定
  // - finalLabel が チャンス候補/調査優先候補
  // - chanceLevel が attention/high
  // - whyDangerous(リスク) が空でない
  // - evidenceNeeded が空でない
  // - sampleTooSmall=true は強い通知にしない
  const eligibleLabels: readonly FinalLabel[] = ["チャンス候補", "調査優先候補"];
  const eligibleLevels: readonly ChanceLevel[] = ["attention", "high"];
  const notificationEligible =
    eligibleLabels.includes(config.finalLabel) &&
    eligibleLevels.includes(config.chanceLevel) &&
    whyDangerous.length > 0 &&
    evidenceNeeded.length > 0 &&
    !stats.sampleTooSmall;

  const listingInfo = config.listingInfo
    ? {
        listedAt: config.listingInfo.listedAt ?? null,
        plannedListingAt: config.listingInfo.plannedListingAt ?? null,
        ipoPrice: config.listingInfo.ipoPrice ?? null,
        firstPrice: config.listingInfo.firstPrice ?? null,
        lockupExpiryAt: config.listingInfo.lockupExpiryAt ?? null,
        firstEarningsAt: config.listingInfo.firstEarningsAt ?? null,
        source: config.listingInfo.source ?? null,
        sourceCheckedAt: config.listingInfo.sourceCheckedAt ?? null,
        confidence: fallbackConfidence(config.listingInfo.confidence),
      }
    : undefined;

  const smallTicket = config.smallTicket
    ? {
        price: config.smallTicket.price ?? null,
        minimumAmount: config.smallTicket.minimumAmount ?? null,
        isSmallTicket: config.smallTicket.isSmallTicket ?? false,
        caution: config.smallTicket.caution ?? [
          "単価の低さを割安と誤認しないこと",
          "流動性・最低売買金額を確認すること",
        ],
      }
    : undefined;

  return {
    code: config.code,
    name: config.name,
    patterns: config.patterns ?? [],
    watchPhase: config.watchPhase,
    finalLabel: config.finalLabel,
    chanceLevel: config.chanceLevel,
    notificationEligible,
    reasonSummary: config.reasonSummary,
    whyInteresting,
    whyDangerous,
    evidenceNeeded,
    waitFor: config.waitFor ?? [],
    parentOrSponsor: config.parentOrSponsor ?? null,
    sellerPressure: fallbackRisk(config.sellerPressure),
    lockupRisk: fallbackRisk(config.lockupRisk),
    debtRisk: fallbackRisk(config.debtRisk),
    capexRisk: fallbackRisk(config.capexRisk),
    cycleRisk: fallbackRisk(config.cycleRisk),
    dilutionRisk: fallbackRisk(config.dilutionRisk),
    listingInfo,
    smallTicket,
    outcomeStats: stats,
  };
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

function buildTopChanceList(candidates: SpecialSituationCandidate[]): TopChanceItem[] {
  // chanceLevel の優先順位順 + notificationEligible 優先
  const levelOrder: Record<ChanceLevel, number> = { high: 0, attention: 1, watch: 2, none: 3 };
  return candidates
    .filter(c =>
      c.chanceLevel === "high" ||
      c.chanceLevel === "attention" ||
      c.finalLabel === "チャンス候補" ||
      c.finalLabel === "調査優先候補" ||
      c.finalLabel === "構造監視候補"
    )
    .sort((a, b) => {
      const lv = levelOrder[a.chanceLevel] - levelOrder[b.chanceLevel];
      if (lv !== 0) return lv;
      // 通知資格を優先
      return Number(b.notificationEligible) - Number(a.notificationEligible);
    })
    .map(c => ({
      code: c.code,
      name: c.name,
      finalLabel: c.finalLabel,
      chanceLevel: c.chanceLevel,
      reasonSummary: c.reasonSummary,
      topReasons: c.whyInteresting.slice(0, 3),
      mainRisks: c.whyDangerous.slice(0, 3),
      nextCheck: c.waitFor.length > 0 ? c.waitFor.slice(0, 4) : c.evidenceNeeded.slice(0, 4),
      listingInfo: c.listingInfo
        ? {
            listedAt: c.listingInfo.listedAt ?? null,
            plannedListingAt: c.listingInfo.plannedListingAt ?? null,
            lockupExpiryAt: c.listingInfo.lockupExpiryAt ?? null,
            firstEarningsAt: c.listingInfo.firstEarningsAt ?? null,
            confidence: c.listingInfo.confidence,
          }
        : undefined,
    }));
}

// ─────────── レポート生成 ───────────

function buildReport(config: SpecialSituationConfig): SpecialSituationWatchReport {
  const minSampleSize = config.outcomeStats?.minSampleSize ?? 5;
  const outcomes = readJsonl<HypothesisOutcome>("data/hypothesis_outcomes.jsonl");

  const candidates = (config.candidates ?? []).map(c =>
    buildCandidate(c, config.patterns, outcomes, minSampleSize)
  );

  const topChanceList = buildTopChanceList(candidates);

  const referenceEvents: ReferenceEvent[] = (config.referenceEvents ?? []).map(ev => ({
    eventName: ev.eventName,
    companyName: ev.companyName,
    eventType: ev.eventType,
    plannedDate: ev.plannedDate ?? null,
    actualDate: ev.actualDate ?? null,
    confidence: fallbackConfidence(ev.confidence),
    source: ev.source ?? null,
    sourceCheckedAt: ev.sourceCheckedAt ?? null,
    relatedThemes: ev.relatedThemes ?? [],
    relatedJapaneseCompanies: ev.relatedJapaneseCompanies ?? [],
  }));

  return {
    generatedAt: todayJst(),
    defaultAction: config.defaultAction,
    neverTreatAs: config.neverTreatAs,
    safetyRules: config.safetyRules ?? [],
    patterns: config.patterns.map(p => ({
      id: p.id,
      label: p.label,
      description: p.description,
      whyInteresting: p.whyInteresting ?? [],
      whyDangerous: p.whyDangerous ?? [],
      evidenceNeeded: p.evidenceNeeded ?? [],
    })),
    candidates,
    topChanceList,
    referenceEvents,
  };
}

// ─────────── Markdown レンダリング ───────────

function renderMarkdown(report: SpecialSituationWatchReport): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 特殊状況・時間差再評価ウォッチ", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push("> carve-out / PE出口 / spin-off / lockup / cycle recovery 等の王道パターンを、調査優先候補・監視候補として蓄積します。買い推奨ではありません。証拠確認が必要です。", "");

  lines.push("## default action", "");
  lines.push(`- ${report.defaultAction}`, "");

  lines.push("## never treat as", "");
  for (const item of report.neverTreatAs) lines.push(`- ${item}`);
  lines.push("");

  if (report.safetyRules.length > 0) {
    lines.push("## safety rules", "");
    for (const item of report.safetyRules) lines.push(`- ${item}`);
    lines.push("");
  }

  // TOP チャンス候補
  lines.push("## TOP: チャンス候補・調査優先候補（売買推奨ではありません）", "");
  if (report.topChanceList.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const item of report.topChanceList) {
      const conf = item.listingInfo?.confidence ? ` [${item.listingInfo.confidence}]` : "";
      lines.push(`### 【${item.finalLabel}】${item.code} ${item.name} (chanceLevel: ${item.chanceLevel})${conf}`);
      lines.push(`- 理由: ${item.reasonSummary}`);
      if (item.topReasons.length > 0) {
        lines.push("- なぜチャンスっぽいか:");
        for (const r of item.topReasons) lines.push(`  - ${r}`);
      }
      if (item.mainRisks.length > 0) {
        lines.push("- 主なリスク:");
        for (const r of item.mainRisks) lines.push(`  - ${r}`);
      }
      if (item.nextCheck.length > 0) {
        lines.push("- 次に確認すること:");
        for (const r of item.nextCheck) lines.push(`  - ${r}`);
      }
      if (item.listingInfo) {
        const info = item.listingInfo;
        const datesParts: string[] = [];
        if (info.listedAt) datesParts.push(`上場日: ${info.listedAt}`);
        if (info.plannedListingAt) datesParts.push(`上場予定: ${info.plannedListingAt}`);
        if (info.lockupExpiryAt) datesParts.push(`ロックアップ解除: ${info.lockupExpiryAt}`);
        if (info.firstEarningsAt) datesParts.push(`初回決算: ${info.firstEarningsAt}`);
        if (datesParts.length > 0) lines.push(`- listingInfo: ${datesParts.join(" / ")}`);
      }
      lines.push("");
    }
  }

  // patterns
  lines.push("## patterns", "");
  for (const p of report.patterns) {
    lines.push(`### ${p.label} (${p.id})`);
    lines.push(`- ${p.description}`);
    if (p.whyInteresting.length > 0) {
      lines.push("- なぜチャンスっぽいか:");
      for (const r of p.whyInteresting) lines.push(`  - ${r}`);
    }
    if (p.whyDangerous.length > 0) {
      lines.push("- 危険性:");
      for (const r of p.whyDangerous) lines.push(`  - ${r}`);
    }
    if (p.evidenceNeeded.length > 0) {
      lines.push("- 確認すべき証拠:");
      for (const r of p.evidenceNeeded) lines.push(`  - ${r}`);
    }
    lines.push("");
  }

  // candidates 全件
  lines.push("## candidates (全件)", "");
  lines.push("| code | name | finalLabel | chance | watchPhase | parent/sponsor | sellPress | lockup | debt | capex | cycle | dilut | sample | notice |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---:|---|");
  for (const c of report.candidates) {
    const stats = c.outcomeStats;
    const sample = stats ? `${stats.sampleSize}${stats.sampleTooSmall ? " ⚠小" : ""}` : "-";
    const notice = c.notificationEligible
      ? "通知候補"
      : stats?.sampleTooSmall
      ? "[参考値]"
      : "";
    lines.push(`| ${c.code} | ${c.name} | ${c.finalLabel} | ${c.chanceLevel} | ${c.watchPhase} | ${c.parentOrSponsor ?? "-"} | ${c.sellerPressure} | ${c.lockupRisk} | ${c.debtRisk} | ${c.capexRisk} | ${c.cycleRisk} | ${c.dilutionRisk} | ${sample} | ${notice} |`);
  }
  lines.push("");

  // outcomeStats 詳細
  lines.push("## outcome stats (per candidate)", "");
  lines.push("> sampleTooSmall=true の行は参考値です。強い判断の根拠にしないでください。", "");
  lines.push("| code | name | sample | hitRate | avgReturn1w | avgReturn1m | avgTopixRel1m |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const c of report.candidates) {
    const s = c.outcomeStats;
    if (!s) continue;
    lines.push(`| ${c.code} | ${c.name} | ${s.sampleSize}${s.sampleTooSmall ? " ⚠小" : ""} | ${s.hitRate == null ? "N/A" : `${Math.round(s.hitRate * 100)}%`} | ${fmtPct(s.avgReturn1w)} | ${fmtPct(s.avgReturn1m)} | ${fmtPct(s.avgTopixRelative1m)} |`);
  }
  lines.push("");

  // reference events
  if (report.referenceEvents.length > 0) {
    lines.push("## reference events (未上場・テーマ参照)", "");
    lines.push("> 公式/報道/噂を必ず分けます。報道・噂は強い判断に使いません。", "");
    for (const ev of report.referenceEvents) {
      lines.push(`### ${ev.eventName} (${ev.eventType}) [${ev.confidence}]`);
      lines.push(`- company: ${ev.companyName}`);
      if (ev.plannedDate) lines.push(`- plannedDate: ${ev.plannedDate}`);
      if (ev.actualDate) lines.push(`- actualDate: ${ev.actualDate}`);
      if (ev.source) lines.push(`- source: ${ev.source}`);
      if (ev.sourceCheckedAt) lines.push(`- sourceCheckedAt: ${ev.sourceCheckedAt}`);
      if ((ev.relatedThemes ?? []).length > 0) lines.push(`- relatedThemes: ${(ev.relatedThemes ?? []).join(", ")}`);
      if ((ev.relatedJapaneseCompanies ?? []).length > 0) lines.push(`- relatedJapaneseCompanies: ${(ev.relatedJapaneseCompanies ?? []).join(", ")}`);
      lines.push("");
    }
  }

  // 通知文サンプル
  lines.push("## 通知サンプル (notificationEligible=true のみ)", "");
  const notifiable = report.candidates.filter(c => c.notificationEligible);
  if (notifiable.length === 0) {
    lines.push("- 現時点で通知資格を満たす候補はありません（証拠不足/サンプル不足/リスク表示不足など）");
  } else {
    for (const c of notifiable) {
      lines.push("```");
      lines.push(`【${c.finalLabel}】${c.code} ${c.name}`);
      lines.push(`理由: ${c.reasonSummary}`);
      if (c.whyDangerous.length > 0) lines.push(`注意: ${c.whyDangerous.slice(0, 3).join(" / ")}`);
      if (c.waitFor.length > 0) lines.push(`次に確認: ${c.waitFor.slice(0, 4).join(" / ")}`);
      lines.push("※売買推奨ではありません。");
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## rule", "- 安い株探しではない", "- 単価が安い = 割安ではない", "- 調査候補は売買推奨ではない", "- sampleTooSmall は強い判断の根拠にしない", "- 公式・報道・噂を必ず分ける");
  lines.push("", `*alpha-pon special situation watch | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

// ─────────── main ───────────

function main() {
  const config = readYaml<SpecialSituationConfig>("config/special-situation-watch-rules.yml");
  const report = buildReport(config);
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    join("reports", "special_situation_watch_latest.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );
  writeFileSync(
    join("reports", "special_situation_watch_latest.md"),
    renderMarkdown(report),
    "utf-8"
  );
  console.log(
    `special situation watch generated: ${report.patterns.length} patterns, ${report.candidates.length} candidates, ${report.topChanceList.length} top chances, ${report.referenceEvents.length} reference events`
  );
}

main();
