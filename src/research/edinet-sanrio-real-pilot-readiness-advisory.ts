import { resolve } from "node:path";
import {
  inspectSanrioRealPilotPreflightWithIntegrity,
} from "./edinet-sanrio-real-pilot-integrity.js";
import {
  renderSanrioRealPilotPreflight,
  type SanrioRealPilotPreflightResult,
} from "./edinet-sanrio-real-pilot-preflight.js";

export type SanrioRealPilotPreflightWithReadinessAdvisory = SanrioRealPilotPreflightResult & {
  readOnlyFollowUpCommand: string | null;
  readOnlyFollowUpPurpose: "foundation_readiness_evidence_gap_audit" | null;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function addSanrioFoundationReadinessAdvisory(
  result: SanrioRealPilotPreflightResult,
): SanrioRealPilotPreflightWithReadinessAdvisory {
  if (
    result.stage !== "parity_complete_foundation_gate_pending"
    || !result.selectedFiles.parityReviewRecord
  ) {
    return {
      ...result,
      readOnlyFollowUpCommand: null,
      readOnlyFollowUpPurpose: null,
    };
  }
  const parityReview = `data/edinet/${result.selectedFiles.parityReviewRecord}`;
  return {
    ...result,
    nextCommand: null,
    readOnlyFollowUpPurpose: "foundation_readiness_evidence_gap_audit",
    readOnlyFollowUpCommand: [
      "bash scripts/run-sanrio-configured-foundation-readiness-audit-local.sh \\",
      `  --parity-review ${shellQuote(parityReview)} \\`,
      "  --execute-readiness-audit",
    ].join("\n"),
  };
}

export function inspectSanrioRealPilotPreflightWithReadinessAdvisory(
  edinetRoot = resolve(process.cwd(), "data/edinet"),
): SanrioRealPilotPreflightWithReadinessAdvisory {
  return addSanrioFoundationReadinessAdvisory(
    inspectSanrioRealPilotPreflightWithIntegrity(edinetRoot),
  );
}

export function renderSanrioRealPilotPreflightWithReadinessAdvisory(
  result: SanrioRealPilotPreflightWithReadinessAdvisory,
): string {
  const base = renderSanrioRealPilotPreflight(result).trimEnd();
  if (!result.readOnlyFollowUpCommand) return `${base}\n`;
  return `${base}\nreadOnlyFollowUpPurpose: ${result.readOnlyFollowUpPurpose}\nreadOnlyFollowUpCommand:\n${result.readOnlyFollowUpCommand}\nfoundationGateStillPending: true\n`;
}
