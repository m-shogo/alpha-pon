import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { validateHistoricalShockContextDocument } from "./idiosyncratic-shock-context-schema.js";

const DATA_DIR = "data";
const CONTEXT_PATTERN = /^idiosyncratic_shock_case_context(?:_expansion_\d+)?\.yml$/;
const ANCHOR_PATTERN = /^idiosyncratic_shock_reaction_anchors(?:_expansion_\d+)?\.yml$/;

function filesMatching(pattern: RegExp): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter(name => pattern.test(name))
    .sort()
    .map(name => join(DATA_DIR, name));
}

function main(): void {
  const files = [
    ...filesMatching(CONTEXT_PATTERN).map(path => ({ path, kind: "context" as const })),
    ...filesMatching(ANCHOR_PATTERN).map(path => ({ path, kind: "reaction_anchor" as const })),
  ];

  const issues = files.flatMap(({ path, kind }) => {
    try {
      const raw = load(readFileSync(path, "utf-8"));
      return validateHistoricalShockContextDocument(raw, path, kind);
    } catch (error) {
      return [{ path, message: error instanceof Error ? error.message : String(error) }];
    }
  });

  console.log(`shock context schema audit: files=${files.length} issues=${issues.length}`);
  for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
  if (files.length === 0 || issues.length > 0) process.exitCode = 1;
}

main();
