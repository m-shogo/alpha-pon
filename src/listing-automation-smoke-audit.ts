import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

type SmokeCheck = {
  id: string;
  status: "ok" | "warning" | "fail";
  reason: string;
};

const REQUIRED_FILES = [
  "config/listing-event-watch.yml",
  "config/listing-notification-policy.yml",
  "config/must-watch-themes.yml",
  "src/sync-jpx-listings.ts",
  "src/listing-event-alerts.ts",
  "src/listing-event-alert-sender-policy.ts",
  "src/jquants-fetch-listing-review-prices.ts",
  "src/calc-listing-topix-relative.ts",
  "src/extract-lockup-from-prospectus.ts",
  "scripts/ipo-listing-watch-advanced.sh",
  "docs/ipo-listing-operations.md",
  "docs/ipo-listing-input-examples.md",
  "docs/ipo-listing-local-verification-v2.md",
];

const SAFE_WORD_FILES = [
  "src/listing-event-alert-sender-policy.ts",
  "src/listing-event-alerts.ts",
  "src/jquants-fetch-listing-review-prices.ts",
  "src/calc-listing-topix-relative.ts",
  "docs/ipo-listing-operations.md",
];

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function checkRequiredFiles(): SmokeCheck[] {
  return REQUIRED_FILES.map(path => ({ id: `file:${path}`, status: existsSync(path) ? "ok" : "fail", reason: existsSync(path) ? "exists" : "missing" }));
}

function checkSafeWording(): SmokeCheck[] {
  return SAFE_WORD_FILES.map(path => {
    const text = read(path);
    if (!text) return { id: `safe-wording:${path}`, status: "fail", reason: "file missing" };
    const hasSafety = text.includes("買い推奨ではありません") || text.includes("買い指示ではありません") || text.includes("買い推奨ではなく");
    return { id: `safe-wording:${path}`, status: hasSafety ? "ok" : "warning", reason: hasSafety ? "safe wording present" : "safe wording missing" };
  });
}

function checkNoZeroFill(): SmokeCheck[] {
  const files = ["src/update-listing-review-prices.ts", "src/review-listing-performance.ts", "src/calc-listing-topix-relative.ts"];
  return files.map(path => {
    const text = read(path);
    if (!text) return { id: `zero-fill:${path}`, status: "fail", reason: "file missing" };
    const suspicious = /reviewPrice\s*:\s*0|topixRelativeReturn\s*:\s*0|publicPrice\s*:\s*0|initialPrice\s*:\s*0/.test(text);
    return { id: `zero-fill:${path}`, status: suspicious ? "fail" : "ok", reason: suspicious ? "suspicious zero fill found" : "no obvious zero fill" };
  });
}

function checkDangerousDefaults(): SmokeCheck[] {
  const sender = read("src/listing-event-alert-sender-policy.ts");
  const checks: SmokeCheck[] = [];
  checks.push({
    id: "send-requires-flag",
    status: sender.includes('process.argv.includes("--send")') ? "ok" : "fail",
    reason: sender.includes('process.argv.includes("--send")') ? "--send guard found" : "--send guard missing",
  });
  const sync = read("src/sync-jpx-listings.ts");
  checks.push({
    id: "write-requires-flag:jpx",
    status: sync.includes('process.argv.includes("--write")') ? "ok" : "fail",
    reason: sync.includes('process.argv.includes("--write")') ? "--write guard found" : "--write guard missing",
  });
  const jquants = read("src/jquants-fetch-listing-review-prices.ts");
  checks.push({
    id: "write-csv-requires-flag:jquants",
    status: jquants.includes('process.argv.includes("--write-csv")') ? "ok" : "fail",
    reason: jquants.includes('process.argv.includes("--write-csv")') ? "--write-csv guard found" : "--write-csv guard missing",
  });
  return checks;
}

function main() {
  const generatedAt = todayJst();
  const checks = [...checkRequiredFiles(), ...checkSafeWording(), ...checkNoZeroFill(), ...checkDangerousDefaults()];
  const fails = checks.filter(check => check.status === "fail");
  const warnings = checks.filter(check => check.status === "warning");
  const lines: string[] = [];
  lines.push("# listing automation smoke audit", "", `date: ${generatedAt}`, "");
  lines.push("> 上場イベント自動化の軽量自己検査です。買い推奨ではありません。", "");
  lines.push(`- checks: ${checks.length}`);
  lines.push(`- fails: ${fails.length}`);
  lines.push(`- warnings: ${warnings.length}`, "");
  for (const check of checks) lines.push(`- [${check.status}] ${check.id}: ${check.reason}`);

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_automation_smoke_audit_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_automation_smoke_audit_latest.json", JSON.stringify({ generatedAt, checks }, null, 2), "utf-8");
  if (fails.length > 0) {
    console.error(`listing automation smoke audit failed: ${fails.length}`);
    process.exitCode = 1;
  } else {
    console.log(`listing automation smoke audit ok: warnings=${warnings.length}`);
  }
}

main();
