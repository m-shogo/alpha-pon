import { todayJst } from "./date.js";
import { updateCompanyMemory } from "./company-memory.js";
import { assertCompanyMemoryScoreInputs } from "./company-memory-score-input.js";

function main() {
  const date = todayJst();
  assertCompanyMemoryScoreInputs();
  const records = updateCompanyMemory(date);
  console.log(`company memory: ${records.length}件`);
  console.log(`レポート: reports/company_memory_${date}.md`);
}

main();
