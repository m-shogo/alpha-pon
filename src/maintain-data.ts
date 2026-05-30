import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { todayJst } from "./date.js";

type MaintenanceItem = {
  path: string;
  action: "ok" | "archive_needed" | "missing";
  sizeBytes?: number;
  note: string;
};

const MAX_JSONL_BYTES = Number(process.env.DATA_JSONL_MAX_BYTES ?? String(10 * 1024 * 1024));
const WATCH_PATHS = [
  join("data", "analogy_outcomes.jsonl"),
  join("data", "analogy_usage"),
  join("data", "analogy_predictions"),
  join("data", "world_event_reflections"),
];

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function inspectPath(path: string): MaintenanceItem[] {
  if (!existsSync(path)) {
    return [{ path, action: "missing", note: "まだ作成されていません" }];
  }

  const stat = statSync(path);
  if (stat.isDirectory()) {
    return readdirSync(path)
      .filter(file => file.endsWith(".jsonl"))
      .flatMap(file => inspectPath(join(path, file)));
  }

  if (!path.endsWith(".jsonl")) {
    return [{ path, action: "ok", sizeBytes: stat.size, note: "監視対象外の形式" }];
  }

  if (stat.size > MAX_JSONL_BYTES) {
    return [{ path, action: "archive_needed", sizeBytes: stat.size, note: `上限 ${MAX_JSONL_BYTES} bytes を超過` }];
  }

  return [{ path, action: "ok", sizeBytes: stat.size, note: "OK" }];
}

function buildArchivePath(path: string, date: string): string {
  const base = `${path}.${date}.archive`;
  if (!existsSync(base)) return base;

  for (let i = 2; i <= 999; i += 1) {
    const candidate = `${base}.${String(i).padStart(3, "0")}`;
    if (!existsSync(candidate)) return candidate;
  }

  throw new Error(`アーカイブ先の連番が上限に達しました: ${base}`);
}

function archiveFile(path: string, date: string): string {
  const archivePath = buildArchivePath(path, date);
  ensureDir(archivePath);
  renameSync(path, archivePath);
  writeFileSync(path, "", "utf-8");
  return archivePath;
}

function main() {
  const date = todayJst();
  mkdirSync("reports", { recursive: true });
  mkdirSync("data", { recursive: true });

  const dryRun = !process.argv.includes("--write");
  const items = WATCH_PATHS.flatMap(inspectPath);
  const actions: string[] = [];

  for (const item of items) {
    if (item.action === "archive_needed") {
      if (dryRun) actions.push(`[dry-run] ${item.path} をアーカイブ候補: ${item.note}`);
      else actions.push(`${item.path} を ${archiveFile(item.path, date)} にアーカイブ`);
    }
  }

  const lines = [
    "# alpha-pon データメンテナンス",
    "",
    `生成日: ${date}`,
    `モード: ${dryRun ? "dry-run" : "write"}`,
    `JSONL上限: ${MAX_JSONL_BYTES} bytes`,
    "",
    "## 監視結果",
    "",
    "| path | action | size | note |",
    "|------|--------|------|------|",
    ...items.map(item => `| ${item.path} | ${item.action} | ${item.sizeBytes ?? "-"} | ${item.note} |`),
    "",
    "## 実行アクション",
    "",
    ...(actions.length ? actions.map(action => `- ${action}`) : ["- なし"]),
    "",
  ];

  writeFileSync(join("reports", `maintenance_${date}.md`), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "maintenance_latest.md"), lines.join("\n"), "utf-8");
  console.log(`メンテナンス: reports/maintenance_${date}.md`);
}

main();
