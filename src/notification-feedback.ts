// 個人用の通知フィードバックDB。useful/noise を手動で記録し、朝刊改善に使う。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { todayJst } from "./date.js";

const DB_PATH = "data/notification-feedback.jsonl";
const REPORT_PATH = "reports/notification_feedback_latest.md";

type FeedbackValue = "useful" | "noise";

type FeedbackRecord = {
  date: string;
  value: FeedbackValue;
  topic: string;
  memo: string;
  createdAt: string;
};

function usage(): string {
  return [
    "使い方:",
    "  node --import tsx/esm src/notification-feedback.ts add useful <topic> [memo]",
    "  node --import tsx/esm src/notification-feedback.ts add noise <topic> [memo]",
    "  node --import tsx/esm src/notification-feedback.ts report",
  ].join("\n");
}

function readRecords(): FeedbackRecord[] {
  if (!existsSync(DB_PATH)) return [];
  return readFileSync(DB_PATH, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as FeedbackRecord);
}

function writeRecord(record: FeedbackRecord): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const current = existsSync(DB_PATH) ? readFileSync(DB_PATH, "utf-8") : "";
  writeFileSync(DB_PATH, `${current}${JSON.stringify(record)}\n`, "utf-8");
}

function renderReport(records: FeedbackRecord[]): string {
  const useful = records.filter(record => record.value === "useful").length;
  const noise = records.filter(record => record.value === "noise").length;
  const recent = records.slice(-10).reverse();
  return [
    "# Alpha Pon 通知フィードバック",
    "",
    `date: ${todayJst()}`,
    "",
    "## summary",
    "",
    `- useful: ${useful}`,
    `- noise: ${noise}`,
    `- total: ${records.length}`,
    "",
    "## recent",
    "",
    ...(recent.length > 0 ? recent.map(record => `- ${record.date} [${record.value}] ${record.topic}${record.memo ? ` — ${record.memo}` : ""}`) : ["- まだ記録なし"]),
    "",
    "## next improvements",
    "",
    noise > useful
      ? "- noise が多い。テーマ通知・キーワード・上限をさらに絞る。"
      : "- useful が同数以上。次は useful テーマを上位表示に寄せる。",
    "",
    "> LINE返信連携はまだ不要。まずは手動記録で個人用の好みを育てる。",
  ].join("\n");
}

function writeReport(records: FeedbackRecord[]): void {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, renderReport(records), "utf-8");
  console.log(`通知フィードバックレポート: ${REPORT_PATH} total=${records.length}`);
}

function main(): void {
  const [, , command, value, topic, ...memoParts] = process.argv;
  if (command === "add") {
    if (value !== "useful" && value !== "noise") throw new Error(usage());
    if (!topic) throw new Error(usage());
    writeRecord({ date: todayJst(), value, topic, memo: memoParts.join(" "), createdAt: new Date().toISOString() });
    console.log(`feedback added: ${value} ${topic}`);
  } else if (command !== "report" && command != null) {
    throw new Error(usage());
  }
  writeReport(readRecords());
}

main();
