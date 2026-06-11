// 禁止文言が残っていないことを確認するテスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const FORBIDDEN_PATTERNS = [
  "買い候補",
  "新規買い候補",
  "買い足し候補",
  "買うかを今日確認",
  "買い足す条件を確認",
  "一部売り条件を確認",
  "一部売り検討",
  "人間より遅れない",
  "ENTRY_WATCHにする",
  "買うべき",
  "売るべき",
  "必ず上がる",
  "確実に上がる",
  "推奨銘柄",
];

// 許容する表現（これらを含む行はスキップ）
const ALLOWED_LINES = [
  "買い推奨ではない",
  "売買を推奨しない",
  "自動売買は行わない",
];

const THIS_FILE = "tests/safe-wording.test.ts";

function collectFiles(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (["node_modules", ".next", "dist", "backups", ".git"].includes(entry)) continue;
      results.push(...collectFiles(full, exts));
    } else if (exts.includes(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

const SCAN_DIRS = [
  join(ROOT, "src"),
  join(ROOT, "apps"),
];

const SCAN_FILES = [
  join(ROOT, "README.md"),
  join(ROOT, "data/generated_company_rules_latest.json"),
  join(ROOT, "apps/web/public/generated/company-rules.json"),
  join(ROOT, "apps/web/public/generated/alpha-pon-data.json"),
  join(ROOT, "docs/world-event-impact-review.md"),
  join(ROOT, "reports/world-impact-review.md"),
  join(ROOT, "reports/world-impact-audit.md"),
];

function checkFile(filePath: string, label: string) {
  if (!existsSync(filePath)) return;
  // このテストファイル自身はスキップ
  if (filePath.endsWith(THIS_FILE)) return;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isAllowed = ALLOWED_LINES.some(ok => line.includes(ok));
    if (isAllowed) continue;

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (line.includes(pattern)) {
        assert.fail(
          `禁止文言 "${pattern}" が ${label} の ${i + 1} 行目に残っています:\n  ${line.trim()}`
        );
      }
    }
  }
}

// ── テスト実行 ──────────────────────────────────────────────────────

const tsxFiles = SCAN_DIRS.flatMap(d => collectFiles(d, [".ts", ".tsx"]));

for (const f of tsxFiles) {
  const rel = f.replace(ROOT + "/", "");
  checkFile(f, rel);
}

for (const f of SCAN_FILES) {
  const rel = f.replace(ROOT + "/", "");
  checkFile(f, rel);
}

console.log(`safe-wording: ${tsxFiles.length} ソースファイル + ${SCAN_FILES.length} 生成ファイルをスキャン、禁止文言なし`);
