import {
  inspectSanrioRealPilotPreflightWithReadinessAdvisory,
  renderSanrioRealPilotPreflightWithReadinessAdvisory,
} from "../edinet-sanrio-real-pilot-readiness-advisory.js";
import { resolveCanonicalEdinetRoot } from "../edinet-local-root-boundary.js";

function main(): void {
  const root = resolveCanonicalEdinetRoot();
  const result = inspectSanrioRealPilotPreflightWithReadinessAdvisory(root);
  process.stdout.write(renderSanrioRealPilotPreflightWithReadinessAdvisory(result));

  if (result.stage === "missing_edinet_root") {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Sanrio real pilot preflight error";
  console.error(`Sanrio real pilot preflight failed: ${message}`);
  process.exitCode = 1;
}
