import { resolve } from "node:path";
import {
  inspectSanrioRealPilotPreflight,
  renderSanrioRealPilotPreflight,
} from "../edinet-sanrio-real-pilot-preflight.js";

function main(): void {
  const root = resolve(process.cwd(), "data/edinet");
  const result = inspectSanrioRealPilotPreflight(root);
  process.stdout.write(renderSanrioRealPilotPreflight(result));

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
