import { todayJst } from "./date.js";
import { updateCompanyMemory } from "./company-memory.js";

function main() {
  const date = todayJst();
  const records = updateCompanyMemory(date);
  console.log(`company memory: ${records.length}件`);
  console.log(`レポート: reports/company_memory_${date}.md`);
}

main();
