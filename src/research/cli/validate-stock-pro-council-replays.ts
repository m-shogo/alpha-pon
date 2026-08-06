import { validateCouncilReplayRepository } from "../stock-pro-council-replay-repository.js";

const result = validateCouncilReplayRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Council replay: manifests=${result.replayCount} eligible=${result.eligibleCount} blocked=${result.blockedCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.replayCount === 0) {
  console.log("Replay contracts are valid, but no local manifest exists. Deterministic replay milestone remains unproven.");
} else {
  console.log("✓ COUNCIL_DETERMINISTIC_REPLAY_GREEN");
}
