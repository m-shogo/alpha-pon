// Outcomeを観測する前のresearch definitionをhash固定する。
// Historical caseのrealized outcomeは意図的にhash対象外。score/context/evidence/anchor等の変更はhashを変える。

import { createHash } from "node:crypto";
import type { HistoricalShockCase, ShockSource } from "./idiosyncratic-shock.js";
import type { HistoricalShockCaseContext } from "./idiosyncratic-shock-case-context.js";

export const SHOCK_RESEARCH_SNAPSHOT_VERSION = 1 as const;

export type ShockResearchSnapshotCase = {
  id: string;
  checkpoint: string;
  score: number;
  inputSha256: string;
};

export type ShockResearchSnapshot = {
  version: typeof SHOCK_RESEARCH_SNAPSHOT_VERSION;
  generatedAt: string;
  scope: "pre_outcome_research_inputs";
  aggregateSha256: string;
  cases: ShockResearchSnapshotCase[];
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function sourceKey(source: ShockSource): string {
  return [source.url, source.publishedAt ?? "", source.sourceType, source.title].join("\u0000");
}

function normalizedSources(sources: ShockSource[] | null | undefined): ShockSource[] {
  return [...(sources ?? [])].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
}

function normalizedCase(item: HistoricalShockCase): Omit<HistoricalShockCase, "outcome"> {
  const { outcome: _ignoredOutcome, ...rest } = item;
  return {
    ...rest,
    sources: normalizedSources(rest.sources),
    tags: rest.tags ? [...rest.tags].sort() : undefined,
  };
}

function normalizedContext(context?: HistoricalShockCaseContext | null): HistoricalShockCaseContext | null {
  if (!context) return null;
  return {
    ...context,
    strategyEligibilityEvidenceSources: context.strategyEligibilityEvidenceSources
      ? normalizedSources(context.strategyEligibilityEvidenceSources)
      : context.strategyEligibilityEvidenceSources,
    reactionAnchorEvidenceSources: context.reactionAnchorEvidenceSources
      ? normalizedSources(context.reactionAnchorEvidenceSources)
      : context.reactionAnchorEvidenceSources,
  };
}

export function shockResearchInputHash(
  item: HistoricalShockCase,
  context?: HistoricalShockCaseContext | null,
): string {
  return sha256({
    case: normalizedCase(item),
    context: normalizedContext(context),
  });
}

export function buildShockResearchSnapshot(
  cases: HistoricalShockCase[],
  contexts: Map<string, HistoricalShockCaseContext>,
  generatedAt: string,
): ShockResearchSnapshot {
  const rows = [...cases]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => ({
      id: item.id,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      inputSha256: shockResearchInputHash(item, contexts.get(item.id)),
    }));

  return {
    version: SHOCK_RESEARCH_SNAPSHOT_VERSION,
    generatedAt,
    scope: "pre_outcome_research_inputs",
    aggregateSha256: sha256({ version: SHOCK_RESEARCH_SNAPSHOT_VERSION, scope: "pre_outcome_research_inputs", cases: rows }),
    cases: rows,
  };
}

export function assertShockResearchSnapshot(snapshot: ShockResearchSnapshot): void {
  if (snapshot.version !== SHOCK_RESEARCH_SNAPSHOT_VERSION) throw new Error(`shock research snapshot version must be ${SHOCK_RESEARCH_SNAPSHOT_VERSION}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.generatedAt)) throw new Error("shock research snapshot generatedAt must be YYYY-MM-DD");
  if (snapshot.scope !== "pre_outcome_research_inputs") throw new Error("shock research snapshot scope mismatch");
  if (!/^[a-f0-9]{64}$/.test(snapshot.aggregateSha256)) throw new Error("shock research snapshot aggregateSha256 must be sha256 hex");
  const ids = new Set<string>();
  for (const row of snapshot.cases) {
    if (!row.id) throw new Error("shock research snapshot case id is required");
    if (ids.has(row.id)) throw new Error(`duplicate shock research snapshot case: ${row.id}`);
    ids.add(row.id);
    if (!/^[a-f0-9]{64}$/.test(row.inputSha256)) throw new Error(`${row.id}: inputSha256 must be sha256 hex`);
  }
}
