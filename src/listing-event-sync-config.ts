import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import { addDaysJst } from "./date.js";
import {
  isListingEventReviewInputRow,
  type ListingEventReviewInputRow,
} from "./listing-event-review-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRealOptionalEventDate(row: ListingEventReviewInputRow): boolean {
  if (row.eventDate === undefined || row.eventDate === null) return true;
  try {
    return addDaysJst(row.eventDate, 0) === row.eventDate;
  } catch {
    return false;
  }
}

export function readListingEventSyncConfig(path: string): {
  rows: ListingEventReviewInputRow[];
  warnings: string[];
} {
  if (!existsSync(path)) return { rows: [], warnings: [] };

  let parsed: unknown;
  try {
    parsed = load(readFileSync(path, "utf-8"));
  } catch {
    return { rows: [], warnings: [`${path}: parse_error`] };
  }

  if (!isRecord(parsed)) return { rows: [], warnings: [`${path}: invalid_root`] };
  const manualSeedEvents = parsed.manualSeedEvents;
  if (manualSeedEvents === undefined) return { rows: [], warnings: [] };
  if (!Array.isArray(manualSeedEvents)) {
    return { rows: [], warnings: [`${path}: invalid_manual_seed_events_root`] };
  }

  const rows: ListingEventReviewInputRow[] = [];
  const invalidRows: number[] = [];
  manualSeedEvents.forEach((row, index) => {
    if (isListingEventReviewInputRow(row) && hasRealOptionalEventDate(row)) rows.push(row);
    else invalidRows.push(index + 1);
  });

  return {
    rows,
    warnings: invalidRows.length > 0
      ? [`${path}: invalid_manual_seed_rows=${invalidRows.join(",")}`]
      : [],
  };
}
