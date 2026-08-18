import { addDaysJst } from "./date.js";

export type LockupMemo = {
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

function isOptionalRealDate(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

export function isLockupMemo(value: unknown): value is LockupMemo {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && isOptionalString(value.code)
    && isOptionalString(value.listingEventId)
    && isOptionalRealDate(value.listingDate)
    && (value.lockupDays === undefined || (typeof value.lockupDays === "number" && Number.isFinite(value.lockupDays)))
    && isOptionalRealDate(value.lockupExpiryDate)
    && isOptionalString(value.source)
    && isOptionalString(value.memo);
}