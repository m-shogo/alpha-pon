// pnpm backup — DB・知識DB・生成データのスナップショットを保存する
// backups/YYYY-MM-DDTHH-mm-ss/ に存在するファイルだけコピー
// 最新 30 件を保持し古いバックアップを自動削除

import { createHash } from "crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { formatJstTimestampDir } from "../src/date.js";

const BACKUP_ROOT = "backups";
const MAX_BACKUPS = 30;

const TARGETS = [
  "data/alpha-pon-jobs.db",
  "data/hypothesis_outcomes.db",
  "data/hypothesis_predictions.jsonl",
  "data/hypothesis_outcomes.jsonl",
  "data/hypothesis_accuracy_summary.json",
  "data/run-cursors.json",
  "data/generated_company_rules_latest.json",
  "data/universe_candidates_latest.json",
  "config",
  "reports",
  "apps/web/public/generated",
];

const EXCLUDED_DIRS = new Set(["node_modules", ".next", "dist", "backups", ".git"]);

type CopiedFile = {
  source: string;
  destination: string;
  sizeBytes: number;
  sha256: string;
};

type BackupManifest = {
  createdAt: string;
  copiedFiles: CopiedFile[];
  skippedTargets: string[];
  totalBytes: number;
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeDestPath(src: string): string {
  return src.split("/").join("__");
}

function copyFile(src: string, destRoot: string, manifest: BackupManifest): void {
  const destFile = join(destRoot, safeDestPath(src));
  mkdirSync(dirname(destFile), { recursive: true });
  cpSync(src, destFile);
  const size = statSync(destFile).size;
  const item = {
    source: src,
    destination: destFile,
    sizeBytes: size,
    sha256: sha256(destFile),
  };
  manifest.copiedFiles.push(item);
  manifest.totalBytes += size;
  console.log(`[backup] ${src} → ${destFile} (${(size / 1024).toFixed(1)}KB)`);
}

function copyDirectory(srcDir: string, destRoot: string, manifest: BackupManifest): void {
  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const src = join(srcDir, entry);
    const stat = statSync(src);
    if (stat.isDirectory()) {
      copyDirectory(src, destRoot, manifest);
    } else if (stat.isFile()) {
      copyFile(src, destRoot, manifest);
    }
  }
}

function pruneOldBackups(): void {
  if (!existsSync(BACKUP_ROOT)) return;
  const dirs = readdirSync(BACKUP_ROOT)
    .filter(name => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(name))
    .sort();
  const excess = dirs.length - MAX_BACKUPS;
  for (let i = 0; i < excess; i++) {
    const target = join(BACKUP_ROOT, dirs[i]);
    rmSync(target, { recursive: true, force: true });
    console.log(`[backup] 古いバックアップを削除: ${target}`);
  }
}

const dest = join(BACKUP_ROOT, formatJstTimestampDir());
mkdirSync(dest, { recursive: true });

const manifest: BackupManifest = {
  createdAt: new Date().toISOString(),
  copiedFiles: [],
  skippedTargets: [],
  totalBytes: 0,
};

for (const src of TARGETS) {
  if (!existsSync(src)) {
    console.log(`[backup] スキップ（存在しない）: ${src}`);
    manifest.skippedTargets.push(src);
    continue;
  }
  const stat = statSync(src);
  if (stat.isDirectory()) copyDirectory(src, dest, manifest);
  else if (stat.isFile()) copyFile(src, dest, manifest);
}

writeFileSync(join(dest, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
pruneOldBackups();
console.log(`[backup] 完了: ${dest} (${manifest.copiedFiles.length}件, ${(manifest.totalBytes / 1024).toFixed(1)}KB)`);
