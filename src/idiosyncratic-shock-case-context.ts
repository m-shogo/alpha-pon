import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import type {
  HistoricalShockCase,
  ShockInvestigationStatus,
  ShockSource,
} from "./idiosyncratic-shock.js";
import type {
  ShockAnnouncementTiming,
  ShockConfounderStatus,
  ShockDisclosureObservability,
  ShockIncidentClusterStatus,
  ShockIncidentScope,
  ShockInformationLeakStatus,
  ShockLiquidityStatus,
  ShockListingStructure,
  ShockOwnershipControl,
  ShockRecurrenceStatus,
  ShockRemediationStatus,
  ShockStakeholder,
} from "./idiosyncratic-shock-context.js";

export type HistoricalStrategyEligibilityStatus = "confirmed_pass" | "confirmed_block" | "unknown";

export type HistoricalShockCaseContext = {
  incidentCountry?: string | null;
  sector?: string | null;
  stakeholder?: ShockStakeholder | null;
  incidentScope?: ShockIncidentScope | null;
  confounderStatus?: ShockConfounderStatus | null;
  informationLeakStatus?: ShockInformationLeakStatus | null;
  recurrenceStatus?: ShockRecurrenceStatus | null;
  remediationStatus?: ShockRemediationStatus | null;
  listingStructure?: ShockListingStructure | null;
  ownershipControl?: ShockOwnershipControl | null;
  liquidityStatus?: ShockLiquidityStatus | null;
  incidentClusterStatus?: ShockIncidentClusterStatus | null;
  disclosureObservability?: ShockDisclosureObservability | null;
  announcementTiming?: ShockAnnouncementTiming | null;
  priceReactionStartDate?: string | null;
  incidentRevenueExposurePct?: number | null;
  estimatedDirectCostPctMarketCap?: number | null;
  industryRelativeShockDrawdownPct?: number | null;
  /**
   * decisionCheckpoint時点で、価格以外の実運用hard gateがすべて検証できていたか。
   * confirmed_pass と書くだけではPASSにならず、下記structured evidenceもresolverが検証する。
   */
  strategyEligibilityAtCheckpoint?: HistoricalStrategyEligibilityStatus | null;
  strategyInvestigationStatusAtCheckpoint?: ShockInvestigationStatus | null;
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint?: boolean | null;
  strategyEligibilityNotes?: string | null;
  /** eligibility判定専用に追加確認した一次情報/major media。case本体のsource正本は変更しない。 */
  strategyEligibilityEvidenceSources?: ShockSource[] | null;
  notes?: string | null;
};

export type HistoricalStrategyEligibilityResolution = {
  status: HistoricalStrategyEligibilityStatus;
  blockers: string[];
  missingEvidence: string[];
};

const KNOWN_NON_PRIMARY_HOSTS = new Set([
  "minkabu.jp",
  "disclosure.catr.jp",
  "finance.yahoo.co.jp",
  "investing.com",
  "reuters.com",
  "kabutan.jp",
  "kabuyoho.jp",
  "gyokaidigest.com",
]);

const TRUSTED_EXCHANGE_HOST_SUFFIXES = [
  "jpx.co.jp",
  "tdnet.info",
  "nyse.com",
  "nasdaq.com",
  "londonstockexchange.com",
  "hkexnews.hk",
  "asx.com.au",
];

function normalizedHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function isGovernmentOrRegulatorHost(host: string): boolean {
  return host === "sec.gov"
    || host.endsWith(".gov")
    || host.endsWith(".gov.uk")
    || host.endsWith(".go.jp")
    || host.endsWith(".gov.au")
    || host.endsWith(".gc.ca");
}

/**
 * sourceTypeラベルだけで一次情報扱いしない。
 * 特にaggregatorをexchange/companyと誤分類してhistorical PASSを作る事故を防ぐ。
 */
export function isTrustedHistoricalPrimarySource(source: ShockSource): boolean {
  if (source.sourceType !== "company" && source.sourceType !== "regulator" && source.sourceType !== "exchange") return false;
  const host = normalizedHost(source.url);
  if (!host || KNOWN_NON_PRIMARY_HOSTS.has(host)) return false;
  if (source.sourceType === "regulator") return isGovernmentOrRegulatorHost(host);
  if (source.sourceType === "exchange") return TRUSTED_EXCHANGE_HOST_SUFFIXES.some(suffix => hostMatchesSuffix(host, suffix));
  // company sourceは世界中のissuer domainを固定allowlist化できないため、既知aggregatorをrejectし、
  // explicit structured eligibility + audit evidenceと組み合わせてfail-closedにする。
  return true;
}

function sourceGateSatisfied(item: HistoricalShockCase, context?: HistoricalShockCaseContext | null): boolean {
  const sources = [...item.sources, ...(context?.strategyEligibilityEvidenceSources ?? [])];
  const hasPrimary = sources.some(isTrustedHistoricalPrimarySource);
  const majorMediaCount = sources.filter(source => source.sourceType === "major_media").length;
  return hasPrimary || majorMediaCount >= 2;
}

/**
 * Historical strategy eligibilityをfail-closedで解決する。
 * - 明白なhard blockerはsidecar未記載でもconfirmed_block。
 * - confirmed_passは明示statusだけでは足りず、調査完了度・critical risk・confounder・sourceを構造化確認する。
 * - 証拠不足はconfirmed_blockではなくunknown。no-tradeにもcalibrationにも混ぜない。
 */
export function resolveHistoricalStrategyEligibilityDetailed(
  item: HistoricalShockCase,
  context?: HistoricalShockCaseContext | null,
): HistoricalStrategyEligibilityResolution {
  const explicitStatus = context?.strategyEligibilityAtCheckpoint ?? "unknown";
  const blockers: string[] = [];
  const missingEvidence: string[] = [];

  // checkpoint正本だけで確定できるhard blockers。手動PASSでも上書き不可。
  if (item.score < 12) blockers.push(`score=${item.score}<12`);
  if (item.scores.accountingIntegrity === 0) blockers.push("accountingIntegrity=0");
  if (item.macroPrimaryCause) blockers.push("macroPrimaryCause=true");

  // sidecarで明示されたknown blockers。
  const investigation = context?.strategyInvestigationStatusAtCheckpoint ?? "unknown";
  if (investigation === "open") blockers.push("investigationStatus=open");
  if (context?.strategyCriticalLicenseOrDelistingRiskAtCheckpoint === true) blockers.push("criticalLicenseOrDelistingRisk=true");
  if (context?.confounderStatus === "major") blockers.push("confounderStatus=major");
  if (context?.informationLeakStatus === "likely") blockers.push("informationLeakStatus=likely");
  if (context?.recurrenceStatus === "systemic") blockers.push("recurrenceStatus=systemic");
  if (context?.remediationStatus === "weak") blockers.push("remediationStatus=weak");
  if (context?.liquidityStatus === "halted" || context?.liquidityStatus === "limit_locked") blockers.push(`liquidityStatus=${context.liquidityStatus}`);
  if (context?.incidentClusterStatus === "cascade") blockers.push("incidentClusterStatus=cascade");
  if (context?.industryRelativeShockDrawdownPct != null && Number.isFinite(context.industryRelativeShockDrawdownPct) && context.industryRelativeShockDrawdownPct > -2) {
    blockers.push(`industryRelativeShockDrawdownPct=${context.industryRelativeShockDrawdownPct}`);
  }

  if (blockers.length > 0) return { status: "confirmed_block", blockers, missingEvidence };
  if (explicitStatus === "confirmed_block") return { status: "confirmed_block", blockers: ["explicit confirmed_block"], missingEvidence };
  if (explicitStatus !== "confirmed_pass") return { status: "unknown", blockers, missingEvidence: ["explicit pass/block not verified"] };

  // PASSだけは追加のstructured evidenceを必須にする。
  if (investigation === "unknown") missingEvidence.push("strategyInvestigationStatusAtCheckpoint");
  if (context?.strategyCriticalLicenseOrDelistingRiskAtCheckpoint == null) missingEvidence.push("strategyCriticalLicenseOrDelistingRiskAtCheckpoint");
  if (context?.confounderStatus == null || context.confounderStatus === "unknown") missingEvidence.push("confounderStatus");
  if (!sourceGateSatisfied(item, context)) missingEvidence.push("trusted primary source or >=2 major media");
  if ((context?.announcementTiming === "after_close" || context?.announcementTiming === "non_trading_day") && !context.priceReactionStartDate) {
    missingEvidence.push("priceReactionStartDate for announcement timing");
  }

  if (missingEvidence.length > 0) return { status: "unknown", blockers, missingEvidence };
  return { status: "confirmed_pass", blockers, missingEvidence };
}

export function resolveHistoricalStrategyEligibility(
  item: HistoricalShockCase,
  context?: HistoricalShockCaseContext | null,
): HistoricalStrategyEligibilityStatus {
  return resolveHistoricalStrategyEligibilityDetailed(item, context).status;
}

type ContextFile = {
  version: number;
  generatedAt: string;
  description?: string;
  cases: Record<string, HistoricalShockCaseContext>;
};

const DEFAULT_PATH = "data/idiosyncratic_shock_case_context.yml";
const CONTEXT_EXPANSION_PATTERN = /^idiosyncratic_shock_case_context_expansion_\d+\.yml$/;

function defaultHistoricalContextPaths(): string[] {
  const dataDir = "data";
  const expansions = existsSync(dataDir)
    ? readdirSync(dataDir)
      .filter(name => CONTEXT_EXPANSION_PATTERN.test(name))
      .sort()
      .map(name => join(dataDir, name))
    : [];
  return [DEFAULT_PATH, ...expansions].filter(existsSync);
}

function loadHistoricalContextFile(path: string): Array<[string, HistoricalShockCaseContext]> {
  const raw = load(readFileSync(path, "utf-8")) as ContextFile;
  if (!raw || typeof raw !== "object" || !raw.cases || typeof raw.cases !== "object") {
    throw new Error(`${path}: cases object is required`);
  }
  return Object.entries(raw.cases);
}

export function loadHistoricalShockCaseContext(
  path?: string,
): Map<string, HistoricalShockCaseContext> {
  const paths = path ? [path] : defaultHistoricalContextPaths();
  const result = new Map<string, HistoricalShockCaseContext>();
  for (const currentPath of paths) {
    for (const [id, context] of loadHistoricalContextFile(currentPath)) {
      if (result.has(id)) throw new Error(`duplicate historical shock context id: ${id}`);
      result.set(id, context);
    }
  }
  return result;
}
