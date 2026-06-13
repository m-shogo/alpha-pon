// pnpm audit:safe-output
// 公開ページ・レポートテンプレート・docs に買い推奨に見える危険表現が
// 混ざっていないかを監査する。完全禁止ではなく「危険表現の audit」として扱い、
// 否定文・禁止説明・反面教師の文脈は許可リストで除外する。
//
// 対象: src/ apps/web/app/ apps/web/lib/ docs/
// 出力: reports/safe-output-audit.{json,md} → /ops にも反映される

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

// 注意: パターンは連結で組み立てる（tests/safe-wording.test.ts と自分自身の自己検出を回避）
const j = (...parts: string[]) => parts.join("");

export const SAFE_OUTPUT_PATTERNS: string[] = [
  j("買うべ", "き"),
  j("売るべ", "き"),
  j("必ず上", "がる"),
  j("確実に上", "がる"),
  j("必ず儲", "かる"),
  j("儲か", "る"),
  j("狙い", "目"),
  j("推奨銘", "柄"),
  j("買い推", "奨"),
  j("売り推", "奨"),
  j("今がチャン", "ス"),
  j("今が買い", "時"),
  j("利益確", "実"),
  j("エントリー推", "奨"),
  j("利確推", "奨"),
  j("損切り推", "奨"),
];

// 否定文・禁止説明・反面教師の文脈マーカー（これらを含む行は許可）
const ALLOWED_LINE_MARKERS: string[] = [
  j("ではな", "い"),
  j("ではな", "く"),
  j("ではありませ", "ん"),
  j("しな", "い"),
  j("禁", "止"),
  j("書かな", "い"),
  j("行わな", "い"),
  j("行いませ", "ん"),
  j("避け", "る"),
  j("使わな", "い"),
  j("出さな", "い"),
  "wrongTakeaways",
  'j("', // パターン定義行（連結構築）は許可
  j("がな", "い"),
  j("危険表", "現"),
  j("検出した", "い"),
  j("禁止語", ""),
  j("禁止文", "言"),
];

const SCAN_DIRS = ["src", join("apps", "web", "app"), join("apps", "web", "lib"), "docs"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".md"]);
const EXCLUDE_DIRS = new Set(["node_modules", ".next", "generated"]);

export type SafeOutputFinding = {
  file: string;
  line: number;
  maskedPattern: string;
  context: string;
};

function maskPattern(pattern: string): string {
  if (pattern.length <= 1) return pattern;
  return pattern[0] + "◯".repeat(pattern.length - 1);
}

function listFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listFiles(path));
    } else if (SCAN_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}

export function scanContentForUnsafeOutput(content: string, file: string): SafeOutputFinding[] {
  const findings: SafeOutputFinding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ALLOWED_LINE_MARKERS.some(marker => marker && line.includes(marker))) continue;
    for (const pattern of SAFE_OUTPUT_PATTERNS) {
      if (line.includes(pattern)) {
        findings.push({
          file,
          line: i + 1,
          maskedPattern: maskPattern(pattern),
          context: line.trim().slice(0, 80).replaceAll(pattern, maskPattern(pattern)),
        });
      }
    }
  }
  return findings;
}

function main(): void {
  const today = todayJst();
  const files = SCAN_DIRS.flatMap(listFiles);
  const findings: SafeOutputFinding[] = [];
  for (const file of files) {
    try {
      findings.push(...scanContentForUnsafeOutput(readFileSync(file, "utf-8"), file));
    } catch {
      // 読めないファイルはスキップ（監査の継続を優先）
    }
  }

  const healthStatus = findings.length > 0 ? "needs_attention" : "ok";
  const report = {
    schemaVersion: 1,
    generatedAt: today,
    healthStatus,
    scannedFiles: files.length,
    findingsCount: findings.length,
    findings,
    notes: [
      "公開出力の危険表現監査です。完全禁止ではなく確認対象として扱います。",
      "否定文・禁止説明・反面教師の文脈は許可リストで除外しています。",
      "検出語はマスク表示。原文は該当ファイルで確認してください。",
    ],
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "safe-output-audit.json"), JSON.stringify(report, null, 2) + "\n");

  const md: string[] = [];
  md.push("# 公開出力 安全表現監査");
  md.push("");
  md.push(`生成日: ${today}`);
  md.push(`healthStatus: ${healthStatus}`);
  md.push(`スキャン対象: ${files.length}ファイル / 検出: ${findings.length}件`);
  md.push("");
  if (findings.length === 0) {
    md.push("- 危険表現の検出なし");
  } else {
    for (const finding of findings.slice(0, 50)) {
      md.push(`- ${finding.file}:${finding.line} (${finding.maskedPattern}) — ${finding.context}`);
    }
  }
  md.push("");
  md.push("> 売買の推奨は行いません。この監査は表現の安全確認のためのものです。");
  writeFileSync(join("reports", "safe-output-audit.md"), md.join("\n"));

  console.log(`\n=== safe output audit (${today}) ===`);
  console.log(`healthStatus: ${healthStatus}`);
  console.log(`scannedFiles: ${files.length}`);
  console.log(`findings: ${findings.length}`);
  for (const finding of findings.slice(0, 10)) {
    console.log(`  ${finding.file}:${finding.line} (${finding.maskedPattern})`);
  }
  console.log("出力: reports/safe-output-audit.md / reports/safe-output-audit.json");
}

// テストから import された場合はスキャンを実行しない
if (process.argv[1]?.endsWith("safe-output-audit.ts")) {
  main();
}
