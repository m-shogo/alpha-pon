import { todayJst } from "./date.js";
import { updateCompanyMemory } from "./company-memory.js";
import { assertExistingCompanyMemoryInputs } from "./company-memory-existing-input.js";
import { assertCompanyMemoryScoreInputs } from "./company-memory-score-input.js";

function main() {
  const date = todayJst();
  assertCompanyMemoryScoreInputs();
  assertExistingCompanyMemoryInputs();
  const records = updateCompanyMemory(date);
  console.log(`company memory: ${records.length}件`);
  console.log(`レポート: reports/company_memory_${date}.md`);
}

main();
