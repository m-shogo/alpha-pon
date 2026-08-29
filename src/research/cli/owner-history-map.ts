import { join } from "node:path";
import { writeGeneratedJson } from "../io.js";
import { buildOwnerResearchHistoryMap } from "../owner-history-map.js";
import { loadResearchKnowledgeRepositorySnapshot } from "../research-knowledge-repository-loader.js";
import { loadResearchState } from "../io.js";
import { fail } from "./common.js";

const OUTPUT_PATH = join(
  process.cwd(),
  "apps",
  "web",
  "public",
  "generated",
  "research-history-map.json",
);

function main(): void {
  const knowledge = loadResearchKnowledgeRepositorySnapshot();
  if (knowledge.issues.length > 0) {
    const codes = [...new Set(knowledge.issues.map((issue) => issue.code))].sort();
    fail(`Owner Research History Map は Research Knowledge integrity error を公開しません: ${codes.join(", ")}`);
  }

  const summary = buildOwnerResearchHistoryMap({
    snapshot: knowledge.snapshot,
    researchState: loadResearchState(),
    generatedAt: new Date().toISOString(),
  });

  writeGeneratedJson(OUTPUT_PATH, summary);
  console.log(`✓ ${OUTPUT_PATH} を生成しました`);
}

main();
