// LINE通知の重複防止。本文単位は当日、イベント単位は直近7日で再送しない。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { todayJst } from "./date.js";

const DIR = "data/notification-dedupe";

type DedupeRecord = {
  key: string;
  sentAt: string;
  preview: string;
  kind?: "text" | "event";
  scope?: string;
};

function pathForToday(): string {
  return `${DIR}/${todayJst()}.json`;
}

function hashKey(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 16);
}

function readRecords(): DedupeRecord[] {
  const path = pathForToday();
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as DedupeRecord[];
}

function readRecentRecords(days = 7): DedupeRecord[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter(name => name.endsWith(".json"))
    .sort()
    .slice(-days)
    .flatMap(name => {
      try {
        return JSON.parse(readFileSync(`${DIR}/${name}`, "utf-8")) as DedupeRecord[];
      } catch {
        return [];
      }
    });
}

function normalizeKeyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function isEmergencyEvent(title: string): boolean {
  return ["TOB", "公開買付", "MBO", "上場廃止", "監理銘柄", "決算延期", "決算発表の延期", "提出期限延長"]
    .some(keyword => title.includes(keyword));
}

function eventKey(scope: string, title: string, source = "unknown"): string {
  return hashKey([scope, normalizeKeyPart(source), normalizeKeyPart(title)].join("::"));
}

export function shouldSendTextNotification(text: string): boolean {
  const key = hashKey(text);
  return !readRecords().some(record => record.key === key);
}

export function recordTextNotification(text: string): void {
  mkdirSync(DIR, { recursive: true });
  const records = readRecords();
  const key = hashKey(text);
  if (records.some(record => record.key === key)) return;
  records.push({ key, sentAt: new Date().toISOString(), preview: text.slice(0, 80), kind: "text" });
  writeFileSync(pathForToday(), JSON.stringify(records, null, 2), "utf-8");
}

export function shouldSendEventNotification(input: { scope: string; title: string; source?: string; allowEmergencyRepeat?: boolean }): boolean {
  if ((input.allowEmergencyRepeat ?? true) && isEmergencyEvent(input.title)) return true;
  const key = eventKey(input.scope, input.title, input.source);
  return !readRecentRecords(7).some(record => record.kind === "event" && record.key === key);
}

export function recordEventNotification(input: { scope: string; title: string; source?: string; preview?: string }): void {
  mkdirSync(DIR, { recursive: true });
  const records = readRecords();
  const key = eventKey(input.scope, input.title, input.source);
  if (records.some(record => record.kind === "event" && record.key === key)) return;
  records.push({
    key,
    sentAt: new Date().toISOString(),
    preview: input.preview ?? input.title.slice(0, 80),
    kind: "event",
    scope: input.scope,
  });
  writeFileSync(pathForToday(), JSON.stringify(records, null, 2), "utf-8");
}

export function textNotificationCountToday(): number {
  return readRecords().filter(record => record.kind === "text" || record.kind == null).length;
}
