export type NormalizedProIrEvent = {
  type?: string;
  eventType?: string;
  label?: string;
  title?: string;
  date?: string | null;
  eventDate?: string | null;
  publishedAt?: string | null;
  sourceUrl?: string | null;
  sourceStatus?: string | null;
  impact?: string | null;
  notes?: string[];
};

export type NormalizedProIrCompany = {
  name?: string;
  events: NormalizedProIrEvent[];
};

export type ProIrEventInputLoad = {
  companies: Record<string, NormalizedProIrCompany>;
  invalidCompanyCount: number;
  invalidEventCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function normalizeEvent(value: unknown): NormalizedProIrEvent | null {
  if (!isRecord(value)) return null;
  for (const field of ["type", "eventType", "label", "title", "date", "eventDate", "publishedAt", "sourceUrl", "sourceStatus", "impact"] as const) {
    if (!isOptionalString(value[field])) return null;
  }
  if (value.notes !== undefined && (!Array.isArray(value.notes) || !value.notes.every((item) => typeof item === "string"))) {
    return null;
  }
  return value as NormalizedProIrEvent;
}

export function normalizeProIrEventInput(raw: unknown): ProIrEventInputLoad {
  if (!isRecord(raw) || !isRecord(raw.companies)) {
    return { companies: {}, invalidCompanyCount: raw == null ? 0 : 1, invalidEventCount: 0 };
  }

  const companies: Record<string, NormalizedProIrCompany> = {};
  let invalidCompanyCount = 0;
  let invalidEventCount = 0;

  for (const [code, value] of Object.entries(raw.companies)) {
    if (!code.trim() || !isRecord(value)) {
      invalidCompanyCount += 1;
      continue;
    }
    if (value.name !== undefined && typeof value.name !== "string") {
      invalidCompanyCount += 1;
      continue;
    }
    if (value.events !== undefined && !Array.isArray(value.events)) {
      invalidCompanyCount += 1;
      continue;
    }

    const events: NormalizedProIrEvent[] = [];
    for (const event of value.events ?? []) {
      const normalized = normalizeEvent(event);
      if (!normalized) {
        invalidEventCount += 1;
        continue;
      }
      events.push(normalized);
    }
    companies[code] = { name: value.name as string | undefined, events };
  }

  return { companies, invalidCompanyCount, invalidEventCount };
}
