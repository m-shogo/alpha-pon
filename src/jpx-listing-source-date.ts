import { addDaysJst } from "./date.js";

export function normalizeJpxListingSourceDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/(20\d{2})[年\/.-]\s*(\d{1,2})[月\/.-]\s*(\d{1,2})日?/);
  if (!match) return null;
  const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  try {
    return addDaysJst(normalized, 0) === normalized ? normalized : null;
  } catch {
    return null;
  }
}
