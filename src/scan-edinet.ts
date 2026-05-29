// EDINET開示スキャン
// 直近5営業日の構造イベント（スピンオフ・会社分割等）を検出してレポート出力
// pnpm scan-edinet

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { scanEdinetDays, STRUCTURAL_KEYWORDS } from "./fetcher/edinet.js";
import { todayJst } from "./date.js";

async function main() {
  const today = todayJst();
  const scanDays = parseInt(process.env.EDINET_SCAN_DAYS ?? "5", 10);

  console.log(`\nEDINET構造イベントスキャン: 直近${scanDays}営業日\n`);

  const found = await scanEdinetDays(scanDays);

  if (found.size === 0) {
    console.log("構造イベントなし\n");
    return;
  }

  console.log(`${found.size}件の銘柄で構造イベント検出:\n`);

  const lines: string[] = [
    `# EDINET構造イベントスキャン ${today}`,
    "",
    `検索キーワード: ${STRUCTURAL_KEYWORDS.join(" / ")}`,
    "",
  ];

  for (const [secCode, docs] of found) {
    console.log(`  ${secCode}: ${docs.length}件の開示`);
    docs.forEach(d => console.log(`    - ${d.submitDateTime} ${d.docDescription}`));

    lines.push(`## ${secCode}`);
    for (const doc of docs) {
      lines.push(`- ${doc.submitDateTime} | ${doc.filerName} | ${doc.docDescription}`);
      if (doc.currentReportReason) {
        lines.push(`  > ${doc.currentReportReason}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("_watchlist.yml への追加を検討してください_");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `edinet-scan_${today}.md`), lines.join("\n"), "utf-8");
  console.log(`\nレポート: reports/edinet-scan_${today}.md`);
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
