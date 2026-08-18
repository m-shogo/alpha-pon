import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "fs";
import { addDaysJst, todayJst } from "./date.js";
import { readListingEventRows } from "./listing-event-alert-input.js";
import { isListingEventReviewInputRow } from "./listing-event-review-input.js";

type ListingEvent = {
  id: string;
  code?: string;
  name: string;
  market?: string;
  eventType: string;
  eventDate?: string | null;
  source?: string;
  status?: string;
  notificationLevel?: "priority" | "morning_summary" | "log";
  whyWatch?: string;
  relatedPattern?: string;
  notes?: string[];
  evidenceToBackfill?: string[];
  lockupDays?: number | null;
  estimated?: boolean;
  confidence?: "low" | "medium" | "high";
};

const DATA_PATH = "data/listing_events.jsonl";
const MANUAL_MEMO_PATH = "data/lockup_memos.jsonl";

type LockupMemo = {
  id: string;
  code?: string;
  name: string;
  listingEventId?: string;
  listingDate?: string;
  lockupDays?: number;
  lockupExpiryDate?: string;
  source?: string;
  memo?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isLockupMemo(value: unknown): value is LockupMemo {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && isOptionalString(value.code)
    && isOptionalString(value.listingEventId)
    && isOptionalString(value.listingDate)
    && (value.lockupDays === undefined || (typeof value.lockupDays === "number" && Number.isFinite(value.lockupDays)))
    && isOptionalString(value.lockupExpiryDate)
    && isOptionalString(value.source)
    && isOptionalString(value.memo);
}

function isListingEvent(value: unknown): value is ListingEvent {
  return isListingEventReviewInputRow(value);
}

function keyOf(event: ListingEvent): string {
  return `${event.id}:${event.eventType}:${event.eventDate ?? "missing"}`;
}

function addDays(date: string, days: number): string | null {
  try {
    return addDaysJst(date, days);
  } catch {
    return null;
  }
}

function fromMemo(memo: LockupMemo): ListingEvent | null {
  const eventDate = memo.lockupExpiryDate ?? (memo.listingDate && memo.lockupDays ? addDays(memo.listingDate, memo.lockupDays) : null);
  return {
    id: `${memo.id}-lockup-expiry`,
    code: memo.code,
    name: memo.name,
    eventType: "lockup_expiry",
    eventDate,
    source: memo.source ?? "manual_lockup_memo",
    status: eventDate ? "watch" : "backfill_required",
    notificationLevel: "priority",
    whyWatch: "ロックアップ解除は既存株主/VC/社員の売り圧力が出る可能性がある重要需給イベント。",
    lockupDays: memo.lockupDays ?? null,
    estimated: !memo.lockupExpiryDate,
    confidence: memo.lockupExpiryDate ? "medium" : "low",
    notes: [memo.memo ?? "", "買い推奨ではなく需給イベント監視"].filter(Boolean),
    evidenceToBackfill: ["目論見書", "ロックアップ解除日", "解除対象株数", "主要株主", "解除条件"],
  };
}

function writeReport(params: {
  generatedAt: string;
  write: boolean;
  memoCount: number;
  appendable: ListingEvent[];
  duplicates: ListingEvent[];
  backfillRequired: ListingEvent[];
  warnings: string[];
}) {
  const lines: string[] = [];
  lines.push("# ロックアップ解除イベント抽出", "", `date: ${params.generatedAt}`, "");
  lines.push("> 買い推奨ではありません。手動メモ/目論見書メモからロックアップ解除イベントを作る入口です。", "");
  lines.push(`- write: ${params.write}`);
  lines.push(`- memoCount: ${params.memoCount}`);
  lines.push(`- appendable: ${params.appendable.length}`);
  lines.push(`- duplicates: ${params.duplicates.length}`);
  lines.push(`- backfillRequired: ${params.backfillRequired.length}`);
  lines.push(`- inputWarnings: ${params.warnings.length}`, "");
  for (const warning of params.warnings) lines.push(`- warning: ${warning}`);
  if (params.warnings.length > 0) lines.push("");

  if (!existsSync(MANUAL_MEMO_PATH)) {
    lines.push("## setup needed", "");
    lines.push("`data/lockup_memos.jsonl` に目論見書/手動メモからロックアップ条件を登録してください。", "");
    lines.push("例:");
    lines.push('```json');
    lines.push('{"id":"example-lockup","code":"0000","name":"サンプルIPO","listingDate":"2026-07-01","lockupDays":180,"source":"manual","memo":"主要株主180日ロックアップ"}');
    lines.push('```', "");
  }

  lines.push("## appendable", "");
  for (const event of params.appendable) lines.push(`- ${event.code ?? "no-code"} ${event.name} / ${event.eventDate ?? "未登録"} / confidence=${event.confidence}`);
  lines.push("", "## backfill required", "");
  for (const event of params.backfillRequired) lines.push(`- ${event.code ?? "no-code"} ${event.name} / eventDate 未登録 / ${event.evidenceToBackfill?.join(", ")}`);

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/lockup_event_extract_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/lockup_event_extract_latest.json", JSON.stringify(params, null, 2), "utf-8");
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = todayJst();
  const memoInput = readListingEventRows<LockupMemo>(MANUAL_MEMO_PATH, isLockupMemo);
  const existingInput = readListingEventRows<ListingEvent>(DATA_PATH, isListingEvent);
  const warnings = [...memoInput.warnings, ...existingInput.warnings];
  const existingKeys = new Set(existingInput.rows.map(keyOf));
  const events = memoInput.rows.map(fromMemo).filter((event): event is ListingEvent => event !== null);
  const appendable = events.filter(event => !existingKeys.has(keyOf(event)));
  const duplicates = events.filter(event => existingKeys.has(keyOf(event)));
  const backfillRequired = events.filter(event => !event.eventDate);
  if (write && appendable.length > 0) {
    mkdirSync("data", { recursive: true });
    for (const event of appendable) appendFileSync(DATA_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  }
  writeReport({
    generatedAt,
    write,
    memoCount: memoInput.rows.length,
    appendable,
    duplicates,
    backfillRequired,
    warnings,
  });
  console.log(`lockup event extraction generated: appendable=${appendable.length}, write=${write}, warnings=${warnings.length}`);
}

main();
