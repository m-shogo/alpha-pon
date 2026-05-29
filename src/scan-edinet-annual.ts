// EDINET 有価証券報告書スキャン
// watchlist 銘柄の直近有報を検出してレポートを生成する
// pnpm scan:edinet:annual

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  fetchEdinetDocList,
  findAnnualReports,
  filterBySecCodes,
  buildPdfUrl,
  toSecCode,
} from "./fetcher/edinet.js";
import { loadWatchlist } from "./config.js";
import { addDaysJst, todayJst } from "./date.js";

const SCAN_DAYS = parseInt(process.env.EDINET_ANNUAL_DAYS ?? "60", 10);

async function main() {
  const today = todayJst();
  console.log(`\nEDINET 有報スキャン: 直近${SCAN_DAYS}日 (${today})\n`);

  const watchlist = loadWatchlist();
  const activeSymbols = watchlist.symbols.filter(
    s => s.status !== "ignore" && s.status !== "expired"
  );

  const secCodes = activeSymbols.map(s => s.code);
  console.log(`対象銘柄: ${activeSymbols.length}件\n`);

  type FoundReport = {
    secCode: string;
    companyName: string;
    submitDateTime: string;
    periodStart: string;
    periodEnd: string;
    docID: string;
    docDescription: string;
    pdfUrl: string;
  };

  const found: FoundReport[] = [];

  for (let i = 0; i < SCAN_DAYS; i++) {
    const dateStr = addDaysJst(today, -i);
    const weekday = new Date(`${dateStr}T00:00:00+09:00`).getDay();
    if (weekday === 0 || weekday === 6) continue;

    process.stdout.write(`  ${dateStr} ... `);

    try {
      const docs = await fetchEdinetDocList(dateStr);
      const annualDocs = findAnnualReports(docs);
      const matched = filterBySecCodes(annualDocs, secCodes);

      if (matched.length > 0) {
        for (const doc of matched) {
          found.push({
            secCode: doc.secCode,
            companyName: doc.filerName,
            submitDateTime: doc.submitDateTime,
            periodStart: doc.periodStart,
            periodEnd: doc.periodEnd,
            docID: doc.docID,
            docDescription: doc.docDescription,
            pdfUrl: buildPdfUrl(doc.docID),
          });
          process.stdout.write(`${doc.filerName} `);
        }
        console.log();
      } else {
        console.log("なし");
      }

      await new Promise(r => setTimeout(r, 300));
    } catch {
      console.log("スキップ");
    }
  }

  if (found.length === 0) {
    console.log(`\nwatchlist銘柄の有報なし (直近${SCAN_DAYS}日)\n`);
    return;
  }

  console.log(`\n${found.length}件の有報を検出\n`);

  // watchlistとのマッピング
  const codeToSymbol = new Map(
    activeSymbols.map(s => [toSecCode(s.code), s])
  );

  const lines: string[] = [
    `# EDINET 有価証券報告書スキャン`,
    ``,
    `生成日: ${today}  `,
    `対象期間: 直近 ${SCAN_DAYS}日`,
    `対象銘柄: watchlist ${activeSymbols.length}件`,
    ``,
  ];

  lines.push(`## 検出有報 (${found.length}件)`);
  lines.push(``);

  for (const r of found.sort((a, b) => b.submitDateTime.localeCompare(a.submitDateTime))) {
    const sym = codeToSymbol.get(r.secCode);
    const symInfo = sym ? ` (${sym.code} · 優先度${sym.priority})` : "";
    lines.push(`### ${r.companyName}${symInfo}`);
    lines.push(``);
    lines.push(`| 項目 | 値 |`);
    lines.push(`|------|-----|`);
    lines.push(`| 提出日時 | ${r.submitDateTime} |`);
    lines.push(`| 対象期間 | ${r.periodStart} ～ ${r.periodEnd} |`);
    lines.push(`| 書類種別 | ${r.docDescription} |`);
    lines.push(`| PDF | [ダウンロード](${r.pdfUrl}) |`);
    lines.push(``);

    if (sym) {
      lines.push(`**watchlist情報**`);
      lines.push(`- ステータス: ${sym.status}`);
      lines.push(`- タグ: ${sym.tags.join(", ")}`);
      lines.push(`- ルール: ${sym.rules.join(", ")}`);
      lines.push(``);
    }

    lines.push(`> 💡 次のステップ: PDFをダウンロードして ChatGPT/Claude に要約を依頼`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`*alpha-pon v0.1 | ${today} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  const outputPath = join("reports", `edinet-annual_${today}.md`);
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`レポート: ${outputPath}`);
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
