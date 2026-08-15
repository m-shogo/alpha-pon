import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function assertExistingCompanyMemoryInputs(dir = join("data", "company_memory")): void {
  if (!existsSync(dir)) return;

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      throw new Error(`${file}: invalid company-memory JSON`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${file}: company-memory root must be an object`);
    }
  }
}
