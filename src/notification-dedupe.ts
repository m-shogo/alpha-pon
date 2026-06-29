// LINEテキスト通知の重複防止。日次で同じ本文を再送しない。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { todayJst } from "./date.js";

const DIR = "data/notification-dedupe";

type DedupeRecord = {
  key: string;
  sentAt: string;
  preview: string;
};

function pathForToday(): string {
  return `${DIR}/${todayJst()}.json`;
}

function keyFor(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

function readRecords(): DedupeRecord[] {
  const path = pathForToday();
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as DedupeRecord[];
}

export function shouldSendTextNotification(text: string): boolean {
  const key = keyFor(text);
  return !readRecords().some(record => record.key === key);
}

export function recordTextNotification(text: string): void {
  mkdirSync(DIR, { recursive: true });
  const records = readRecords();
  const key = keyFor(text);
  if (records.some(record => record.key === key)) return;
  records.push({ key, sentAt: new Date().toISOString(), preview: text.slice(0, 80) });
  writeFileSync(pathForToday(), JSON.stringify(records, null, 2), "utf-8");
}
