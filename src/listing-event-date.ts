import { addDaysJst } from "./date.js";

export function parseListingEventDate(date: string | null | undefined): Date | null {
  if (!date) return null;
  try {
    const normalized = addDaysJst(date, 0);
    return new Date(`${normalized}T00:00:00+09:00`);
  } catch {
    return null;
  }
}

export function listingEventDaysBetween(fromDate: string, toDate: string): number | null {
  const from = parseListingEventDate(fromDate);
  const to = parseListingEventDate(toDate);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
