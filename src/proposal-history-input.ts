export type ProposalHistoryInput = {
  priority: "S" | "A" | "B" | "Hold";
  title: string;
  reason?: string;
  action?: string;
};

const PRIORITIES = new Set<ProposalHistoryInput["priority"]>(["S", "A", "B", "Hold"]);

function isCanonicalText(value: unknown, required: boolean): value is string {
  if (typeof value !== "string") return false;
  if (value !== value.trim()) return false;
  return required ? value.length > 0 : true;
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
