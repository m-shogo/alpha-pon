// pnpm backup — DB・データファイルのスナップショットを保存する
// backups/YYYY-MM-DDTHH-mm-ss/ に存在するファイルだけコピー
// 最新 30 件を保持し古いバックアップを自動削除

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";

const BACKUP_ROOT = "backups";
const MAX_BACKUPS = 30;

const TARGETS = [
  "data/alpha-pon-jobs.db",
  "data/hypothesis_outcomes.db",
  "data/hypothesis_predictions.jsonl",
  "data/hypothesis_outcomes.jsonl",
  "data/hypothesis_accuracy_summary.json",
  "data/run-cursors.json",
];

function timestampDir(): string {
  const now = new Date();
  const pad = (n: number, d = 2) => String(n).padStart(d, "0");
  const y   = now.getFullYear();
  const mo  = pad(now.getMonth() + 1);
  const d   = pad(now.getDate());
  const h   = pad(now.getHours());
  const mi  = pad(now.getMinutes());
  const s   = pad(now.getSeconds());
  return `${y}-${mo}-${d}T${h}-${mi}-${s}`;
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

const dest = join(BACKUP_ROOT, timestampDir());
mkdirSync(dest, { recursive: true });

let copied = 0;
for (const src of TARGETS) {
  if (!existsSync(src)) {
    console.log(`[backup] スキップ（存在しない）: ${src}`);
    continue;
  }
  const destFile = join(dest, src.replace(/\//g, "__"));
  cpSync(src, destFile);
  const size = statSync(destFile).size;
  console.log(`[backup] ${src} → ${destFile} (${(size / 1024).toFixed(1)}KB)`);
  copied++;
}

pruneOldBackups();
console.log(`[backup] 完了: ${dest} (${copied}件)`);
