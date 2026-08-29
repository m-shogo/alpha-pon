import { join } from "node:path";
import { checkDecay } from "../decay.js";
import { checkEdgeRegistry, type Issue } from "../edge-registry.js";
import {
  loadResearchLog,
  loadResearchState,
  loadSchema,
  paths,
  readJsonl,
  writeGeneratedJson,
} from "../io.js";
import { buildOwnerResearchSummary } from "../owner-summary.js";
import { checkPit } from "../pit.js";
import { checkProductionIntegrity, type HoldoutAccessEntry } from "../promotion.js";
import { loadResearchKnowledgeRepositorySnapshot } from "../research-knowledge-repository-loader.js";
import { validate as validateSchema } from "../schema.js";
import { fail, todayJst } from "./common.js";

const OUTPUT_PATH = join(process.cwd(), "apps", "web", "public", "generated", "research-summary.json");

function main(): void {
  const knowledge = loadResearchKnowledgeRepositorySnapshot();
  if (knowledge.issues.length > 0) {
    const codes = [...new Set(knowledge.issues.map((issue) => issue.code))].sort();
    fail(`Owner Research Summary は Research Knowledge integrity error を公開しません: ${codes.join(", ")}`);
  }

  const researchState = loadResearchState();
  const researchLog = loadResearchLog();
  const asOf = todayJst();
  const accessLog = readJsonl(paths.holdoutAccessLog())
    .filter((raw) => validateSchema(raw, loadSchema("holdout-access")).length === 0)
    .map((raw) => raw as HoldoutAccessEntry);
  const researchOsIssues: Issue[] = [
    ...checkEdgeRegistry(researchState),
    ...checkPit(researchState),
    ...checkProductionIntegrity(researchState, accessLog, asOf),
    ...checkDecay(researchState, asOf),
  ];

  const summary = buildOwnerResearchSummary({
    snapshot: knowledge.snapshot,
    issues: knowledge.issues,
    researchOsIssues,
    researchState,
    researchLog,
    accessLog,
    asOf,
    generatedAt: new Date().toISOString(),
  });

  writeGeneratedJson(OUTPUT_PATH, summary);
  console.log(`✓ ${OUTPUT_PATH} を生成しました`);
}

main();
