import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSourceHealthScoreRows } from "./source-health-input.js";

export function assertCompanyMemoryScoreInputs(reportsDir = "reports"): void {
  if (!existsSync(reportsDir)) return;

  for (const file of readdirSync(reportsDir).filter((name) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
    const path = join(reportsDir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    } catch (error) {
      throw new Error(`${file}: invalid score JSON (${error instanceof Error ? error.message : String(error)})`);
    }

    const normalized = normalizeSourceHealthScoreRows<unknown>(parsed);
    if (!normalized.valid) {
      throw new Error(`${file}: score root must be an array`);
    }
  }
}
