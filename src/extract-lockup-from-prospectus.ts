import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

type LockupCandidate = {
  id: string;
  code?: string;
  name: string;
  source: string;
  lockupDays?: number | null;
  lockupExpiryDate?: string | null;
  confidence: "low" | "medium";
  snippet: string;
};

const TEXT_PATH = process.env.PROSPECTUS_TEXT_PATH ?? "data/prospectus_text.txt";
const MEMO_PATH = "data/lockup_memos.jsonl";

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 600);
}

function extractDays(text: string): number | null {
  const m = text.match(/(90|120|180|360)\s*日/);
  return m ? Number(m[1]) : null;
}

function extractCode(text: string): string | undefined {
  return text.match(/\b(\d{4}|\d{3}[A-Z])\b/)?.[1];
}

function extractName(text: string): string {
  const m = text.match(/会社名[:：\s]+([^\n\r]{2,40})/);
  return m?.[1]?.trim() || "unknown-prospectus";
}

function extractCandidates(text: string, source: string): LockupCandidate[] {
  const plain = text.replace(/\r/g, "\n");
  const keywords = ["ロックアップ", "継続所有", "売却", "解除", "180日", "90日"];
  const windows: string[] = [];
  for (const keyword of keywords) {
    let index = plain.indexOf(keyword);
    while (index >= 0) {
      windows.push(plain.slice(Math.max(0, index - 250), Math.min(plain.length, index + 450)));
      index = plain.indexOf(keyword, index + keyword.length);
    }
  }
  const deduped = [...new Set(windows.map(normalizeSnippet))];
  const code = extractCode(plain);
  const name = extractName(plain);
  return deduped.map((snippet, i) => {
    const days = extractDays(snippet);
    return {
      id: `${code ?? "unknown"}-lockup-candidate-${i + 1}`,
      code,
      name,
      source,
      lockupDays: days,
      lockupExpiryDate: null,
      confidence: days ? "medium" : "low",
      snippet,
    };
  });
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = todayJst();
  const text = existsSync(TEXT_PATH) ? readFileSync(TEXT_PATH, "utf-8") : "";
  const candidates = text ? extractCandidates(text, TEXT_PATH) : [];

  const lines: string[] = [];
  lines.push("# 目論見書ロックアップ候補抽出", "", `date: ${generatedAt}`, "");
  lines.push("> 買い推奨ではありません。目論見書テキストからロックアップ関連候補を抜き、手動確認するためのレポートです。", "");
  lines.push(`- textPath: ${TEXT_PATH}`);
  lines.push(`- write: ${write}`);
  lines.push(`- candidates: ${candidates.length}`, "");

  if (!existsSync(TEXT_PATH)) {
    lines.push("## setup needed", "");
    lines.push("PDFを直接読むのではなく、まず目論見書本文をテキスト化して `data/prospectus_text.txt` に置いてください。", "");
  }

  lines.push("## candidates", "");
  for (const c of candidates) {
    lines.push(`### ${c.id}`, "");
    lines.push(`- code: ${c.code ?? "unknown"}`);
    lines.push(`- name: ${c.name}`);
    lines.push(`- lockupDays: ${c.lockupDays ?? "unknown"}`);
    lines.push(`- confidence: ${c.confidence}`);
    lines.push("- snippet:");
    lines.push(`  ${c.snippet}`);
    lines.push("");
  }

  if (write && candidates.length > 0) {
    mkdirSync("data", { recursive: true });
    for (const c of candidates) {
      appendFileSync(MEMO_PATH, `${JSON.stringify({ id: c.id, code: c.code, name: c.name, lockupDays: c.lockupDays ?? undefined, source: c.source, memo: c.snippet })}\n`, "utf-8");
    }
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/prospectus_lockup_extract_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/prospectus_lockup_extract_latest.json", JSON.stringify({ generatedAt, textPath: TEXT_PATH, write, candidates }, null, 2), "utf-8");
  console.log(`prospectus lockup extract generated: candidates=${candidates.length}, write=${write}`);
}

main();
