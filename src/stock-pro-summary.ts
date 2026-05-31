import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function uniqueLines(text: string, marker: string): string[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith(marker))
    .map(line => line.replace(marker, "").trim())
    .filter(Boolean)
    .filter((line, index, array) => array.indexOf(line) === index);
}

function main() {
  const date = todayJst();
  const sourcePath = "reports/stock_pro_agent_latest.md";
  const text = existsSync(sourcePath) ? readFileSync(sourcePath, "utf-8") : "";

  const labels = {
    research: countMatches(text, /final label: \*\*調査候補\*\*/g),
    hold: countMatches(text, /final label: \*\*保留\*\*/g),
    insufficient: countMatches(text, /final label: \*\*証拠不足\*\*/g),
    avoid: countMatches(text, /final label: \*\*避ける\*\*/g),
    doNotChase: countMatches(text, /final label: \*\*追わない\/保留\*\*/g),
  };
  const networkMissing = countMatches(text, /company-network\.yml に未登録|company-network\.yml 未接続|network:\n\s+- missing/g);
  const betterPeerRisk = countMatches(text, /better peer risk/g);
  const primaryMissing = countMatches(text, /一次情報不足|一次情報確認が不足/g);
  const overheat = countMatches(text, /過熱|織り込み済み|期待先行/g);
  const doNotChaseReasons = uniqueLines(text, "-").filter(line =>
    line.includes("追わない") ||
    line.includes("better peer risk") ||
    line.includes("一次情報不足") ||
    line.includes("織り込み済み") ||
    line.includes("期待先行") ||
    line.includes("network")
  ).slice(0, 30);

  const lines: string[] = [];
  lines.push("# alpha-pon stock pro summary");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("stock_pro_agent_latest.md の出力を集計し、朝一で見るべき偏りを出します。買い推奨ではありません。");
  lines.push("");
  lines.push("## final label distribution");
  lines.push("");
  lines.push(`- 調査候補: ${labels.research}`);
  lines.push(`- 保留: ${labels.hold}`);
  lines.push(`- 証拠不足: ${labels.insufficient}`);
  lines.push(`- 避ける: ${labels.avoid}`);
  lines.push(`- 追わない/保留: ${labels.doNotChase}`);
  lines.push("");
  lines.push("## risk counters");
  lines.push("");
  lines.push(`- company network missing: ${networkMissing}`);
  lines.push(`- better peer risk: ${betterPeerRisk}`);
  lines.push(`- primary source missing: ${primaryMissing}`);
  lines.push(`- overheat / priced-in: ${overheat}`);
  lines.push("");
  lines.push("## summary judgment");
  lines.push("");
  if (!text) {
    lines.push("- stock_pro_agent_latest.md がありません。daily本体またはstock-pro-agent-reportを確認してください。");
  } else if (labels.doNotChase + labels.insufficient + labels.avoid > labels.research) {
    lines.push("- 今日は安全側ラベルが多いです。調査候補を増やすより、追わない/保留の理由確認を優先します。");
  } else {
    lines.push("- 調査候補が一定数あります。ただし買い判断ではなく、一次情報・価格・財務品質の確認が前提です。");
  }
  if (networkMissing > 0) lines.push("- company-network未登録が残っています。単独考察を避け、ネットワークDB補完を優先してください。");
  if (betterPeerRisk > 0) lines.push("- better peer risk が出ています。テーマは正しくても本命銘柄が別にある可能性を確認してください。");
  if (primaryMissing > 0) lines.push("- 一次情報不足が目立ちます。ニュースやSNSだけで評価しないでください。");
  if (overheat > 0) lines.push("- 過熱/織り込み済み警告があります。飛びつきより反証確認を優先してください。");
  lines.push("");
  lines.push("## do-not-chase reason samples");
  lines.push("");
  if (doNotChaseReasons.length === 0) lines.push("- N/A");
  for (const reason of doNotChaseReasons) lines.push(`- ${reason}`);
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon stock pro summary | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stock_pro_summary_latest.md"), lines.join("\n"), "utf-8");
  console.log("stock pro summary generated");
}

main();
