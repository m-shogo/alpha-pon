// Historical shock research queue向けの安定したreason taxonomy。
// resolver内部のhuman-readable文字列を、そのまま集計軸にしないためのadapter。

export type ShockResearchReasonCode =
  | "score_below_production_threshold"
  | "accounting_integrity_failed"
  | "macro_primary_cause"
  | "investigation_open"
  | "critical_listing_or_license_risk"
  | "major_confounder"
  | "likely_information_leak"
  | "systemic_recurrence"
  | "weak_remediation"
  | "liquidity_untradeable"
  | "incident_cascade"
  | "insufficient_idiosyncratic_drawdown"
  | "explicit_block"
  | "eligibility_unverified"
  | "investigation_status_unknown"
  | "critical_risk_unknown"
  | "confounder_unknown"
  | "source_gate_missing"
  | "reaction_date_missing"
  | "other";

export type ShockResearchReasonKind = "hard_block" | "missing_evidence";

export type ShockResearchReason = {
  code: ShockResearchReasonCode;
  kind: ShockResearchReasonKind;
  raw: string;
};

function classifyHardBlock(raw: string): ShockResearchReasonCode {
  if (/^score=\d+<12$/.test(raw)) return "score_below_production_threshold";
  if (raw === "accountingIntegrity=0") return "accounting_integrity_failed";
  if (raw === "macroPrimaryCause=true") return "macro_primary_cause";
  if (raw === "investigationStatus=open") return "investigation_open";
  if (raw === "criticalLicenseOrDelistingRisk=true") return "critical_listing_or_license_risk";
  if (raw === "confounderStatus=major") return "major_confounder";
  if (raw === "informationLeakStatus=likely") return "likely_information_leak";
  if (raw === "recurrenceStatus=systemic") return "systemic_recurrence";
  if (raw === "remediationStatus=weak") return "weak_remediation";
  if (raw === "liquidityStatus=halted" || raw === "liquidityStatus=limit_locked") return "liquidity_untradeable";
  if (raw === "incidentClusterStatus=cascade") return "incident_cascade";
  if (raw.startsWith("industryRelativeShockDrawdownPct=")) return "insufficient_idiosyncratic_drawdown";
  if (raw === "explicit confirmed_block") return "explicit_block";
  return "other";
}

function classifyMissingEvidence(raw: string): ShockResearchReasonCode {
  if (raw === "calibration eligibility pass/block not verified" || raw === "explicit pass/block not verified") return "eligibility_unverified";
  if (raw === "strategyInvestigationStatusAtCheckpoint") return "investigation_status_unknown";
  if (raw === "strategyCriticalLicenseOrDelistingRiskAtCheckpoint") return "critical_risk_unknown";
  if (raw === "confounderStatus") return "confounder_unknown";
  if (raw === "trusted primary source or >=2 major media") return "source_gate_missing";
  if (raw === "priceReactionStartDate for announcement timing") return "reaction_date_missing";
  return "other";
}

export function classifyShockResearchReasons(input: {
  blockers: string[];
  missingEvidence: string[];
}): ShockResearchReason[] {
  return [
    ...input.blockers.map(raw => ({ code: classifyHardBlock(raw), kind: "hard_block" as const, raw })),
    ...input.missingEvidence.map(raw => ({ code: classifyMissingEvidence(raw), kind: "missing_evidence" as const, raw })),
  ];
}

export function summarizeShockResearchReasons(reasons: ShockResearchReason[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of reasons) counts[reason.code] = (counts[reason.code] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
