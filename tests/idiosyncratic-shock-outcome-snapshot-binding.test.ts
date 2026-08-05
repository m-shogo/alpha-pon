import assert from "node:assert/strict";
import { assertShockOutcomeResearchSnapshotBinding } from "../src/idiosyncratic-shock-outcome-snapshot-binding.js";

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);

assert.doesNotThrow(() => assertShockOutcomeResearchSnapshotBinding(
  { researchSnapshotSha256: shaA },
  { aggregateSha256: shaA },
));

assert.throws(
  () => assertShockOutcomeResearchSnapshotBinding(
    { researchSnapshotSha256: shaA },
    { aggregateSha256: shaB },
  ),
  /research snapshot mismatch/,
  "historical case/context/selection changes must invalidate an old outcome dataset",
);

console.log("idiosyncratic-shock outcome snapshot binding tests: stale dataset rejected");
