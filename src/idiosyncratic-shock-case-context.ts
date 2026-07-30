import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import type { HistoricalShockCase, ShockSource } from "./idiosyncratic-shock.js";
import type {
  ShockAnnouncementTiming,
  ShockDisclosureObservability,
  ShockIncidentClusterStatus,
  ShockIncidentScope,
  ShockLiquidityStatus,
  ShockListingStructure,
  ShockOwnershipControl,
  ShockRecurrenceStatus,
  ShockStakeholder,
} from "./idiosyncratic-shock-context.js";

export type HistoricalStrategyEligibilityStatus = "confirmed_pass" | "confirmed_block" | "unknown";

export type HistoricalShockCaseContext = {
  incidentCountry?: string | null;
  sector?: string | null;
  stakeholder?: ShockStakeholder | null;
  incidentScope?: ShockIncidentScope | null;
  recurrenceStatus?: ShockRecurrenceStatus | null;
  listingStructure?: ShockListingStructure | null;
  ownershipControl?: ShockOwnershipControl | null;
  liquidityStatus?: ShockLiquidityStatus | null;
  incidentClusterStatus?: ShockIncidentClusterStatus | null;
  disclosureObservability?: ShockDisclosureObservability | null;
  announcementTiming?: ShockAnnouncementTiming | null;
  priceReactionStartDate?: string | null;
  /**
   * decisionCheckpoint時点で、価格以外の実運用hard gateがすべて検証できていたか。
   * confirmed_pass の場合だけFirst Eligible Signalの価格探索へ進める。
   * 未記載/unknownをno-tradeとして扱わない。
   */
  strategyEligibilityAtCheckpoint?: HistoricalStrategyEligibilityStatus | null;
  strategyEligibilityNotes?: string | null;
  /** eligibility判定専用に追加確認した一次情報/major media。case本体のsource正本は変更しない。 */
  strategyEligibilityEvidenceSources?: ShockSource[] | null;
  notes?: string | null;
};

/**
 * sidecarが未調査でも、checkpoint score自体が現行hard gateを確実に破る場合は
 * confirmed_blockを機械的に導出する。PASSは決して推測せず、明示的なsidecar証拠を要求する。
 */
export function resolveHistoricalStrategyEligibility(
  item: HistoricalShockCase,
  explicitStatus?: HistoricalStrategyEligibilityStatus | null,
): HistoricalStrategyEligibilityStatus {
  if (explicitStatus === "confirmed_pass" || explicitStatus === "confirmed_block") return explicitStatus;
  if (item.score < 12) return "confirmed_block";
  if (item.scores.accountingIntegrity === 0) return "confirmed_block";
  if (item.macroPrimaryCause) return "confirmed_block";
  return "unknown";
}

type ContextFile = {
  version: number;
  generatedAt: string;
  description?: string;
  cases: Record<string, HistoricalShockCaseContext>;
};

const DEFAULT_PATH = "data/idiosyncratic_shock_case_context.yml";

export function loadHistoricalShockCaseContext(
  path = DEFAULT_PATH,
): Map<string, HistoricalShockCaseContext> {
  if (!existsSync(path)) return new Map();
  const raw = load(readFileSync(path, "utf-8")) as ContextFile;
  if (!raw || typeof raw !== "object" || !raw.cases || typeof raw.cases !== "object") {
    throw new Error(`${path}: cases object is required`);
  }
  return new Map(Object.entries(raw.cases));
}
