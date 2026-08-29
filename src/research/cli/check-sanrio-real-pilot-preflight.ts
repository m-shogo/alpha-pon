import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import {
  inspectSanrioRealPilotPreflightWithReadinessAdvisory,
  renderSanrioRealPilotPreflightWithReadinessAdvisory,
} from "../edinet-sanrio-real-pilot-readiness-advisory.js";

function main(): void {
  const dataRoot = resolve(process.cwd(), "data");
  if (existsSync(dataRoot) && lstatSync(dataRoot).isSymbolicLink()) {
    throw new Error("data/edinet parent data directory must not be a symlink");
  }
  const root = resolve(dataRoot, "edinet");
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
