import type { ShockOutcomeDatasetEnvelope } from "./idiosyncratic-shock-outcome-contract.js";
import type { ShockResearchSnapshot } from "./idiosyncratic-shock-research-snapshot-contract.js";

export function assertShockOutcomeResearchSnapshotBinding(
  payload: Pick<ShockOutcomeDatasetEnvelope, "researchSnapshotSha256">,
  snapshot: Pick<ShockResearchSnapshot, "aggregateSha256">,
): void {
  if (payload.researchSnapshotSha256 !== snapshot.aggregateSha256) {
    throw new Error(
      `shock outcome research snapshot mismatch: dataset=${payload.researchSnapshotSha256} current=${snapshot.aggregateSha256}`,
    );
  }
}
