import { addDaysJst } from "./date.js";

export type ProposalHistoryInput = {
  priority: "S" | "A" | "B" | "Hold";
  title: string;
  reason?: string;
  action?: string;
};

export type ProposalHistoryRecord = ProposalHistoryInput & {
  date: string;
  reason: string;
  action: string;
};

const PRIORITIES = new Set<ProposalHistoryInput["priority"]>(["S", "A", "B", "Hold"]);

function isCanonicalText(value: unknown, required: boolean): value is string {
  if (typeof value !== "string") return false;
  if (value !== value.trim()) return false;
  return required ? value.length > 0 : true;
}

function isRealDateOnOrBefore(value: unknown, asOf: string): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= asOf;
  } catch {
    return false;
  }
}

export function normalizeProposalHistoryRecord(value: unknown, asOf: string): ProposalHistoryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isRealDateOnOrBefore(candidate.date, asOf)
    || !PRIORITIES.has(candidate.priority as ProposalHistoryInput["priority"])
    || !isCanonicalText(candidate.title, true)
    || (candidate.reason !== undefined && !isCanonicalText(candidate.reason, false))
    || (candidate.action !== undefined && !isCanonicalText(candidate.action, false))
  ) {
    return null;
  }
  return {
    date: candidate.date,
    priority: candidate.priority as ProposalHistoryInput["priority"],
    title: candidate.title,
    reason: candidate.reason === undefined ? "" : candidate.reason as string,
    action: candidate.action === undefined ? "" : candidate.action as string,
  };
}

export function normalizeProposalHistoryInput(value: unknown): {
  proposals: ProposalHistoryInput[];
  invalidRowCount: number;
} {
  if (!Array.isArray(value)) {
    return { proposals: [], invalidRowCount: 1 };
  }

  const proposals: ProposalHistoryInput[] = [];
  let invalidRowCount = 0;

  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      invalidRowCount += 1;
      continue;
    }

    const candidate = row as Record<string, unknown>;
    if (
      !PRIORITIES.has(candidate.priority as ProposalHistoryInput["priority"])
      || !isCanonicalText(candidate.title, true)
      || (candidate.reason !== undefined && !isCanonicalText(candidate.reason, false))
      || (candidate.action !== undefined && !isCanonicalText(candidate.action, false))
    ) {
      invalidRowCount += 1;
      continue;
    }

    proposals.push({
      priority: candidate.priority as ProposalHistoryInput["priority"],
      title: candidate.title,
      ...(candidate.reason !== undefined ? { reason: candidate.reason as string } : {}),
      ...(candidate.action !== undefined ? { action: candidate.action as string } : {}),
    });
  }

  return { proposals, invalidRowCount };
}
