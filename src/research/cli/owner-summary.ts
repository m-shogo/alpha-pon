import { join } from "node:path";
import { buildOwnerResearchSummary } from "../owner-summary.js";
import { loadResearchKnowledgeRepositorySnapshot } from "../research-knowledge-repository-loader.js";
import { loadResearchLog, loadResearchState, writeGeneratedJson } from "../io.js";
import { fail } from "./common.js";

const OUTPUT_PATH = join(process.cwd(), "apps", "web", "public", "generated", "research-summary.json");

function main(): void {
  const knowledge = loadResearchKnowledgeRepositorySnapshot();
  if (knowledge.issues.length > 0) {
    const codes = [...new Set(knowledge.issues.map((issue) => issue.code))].sort();
    fail(`Owner Research Summary は Research Knowledge integrity error を公開しません: ${codes.join(", ")}`);
  }

  const summary = buildOwnerResearchSummary({
    snapshot: knowledge.snapshot,
    issues: knowledge.issues,
    researchState: loadResearchState(),
    researchLog: loadResearchLog(),
    generatedAt: new Date().toISOString(),
  });

  writeGeneratedJson(OUTPUT_PATH, summary);
  console.log(`✓ ${OUTPUT_PATH} を生成しました`);
}

main();
