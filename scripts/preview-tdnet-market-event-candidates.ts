import { fetchTdnetDisclosureSnapshot } from "../src/fetcher/jpx.js";
import { buildTdnetCandidatePreview } from "../src/market-events/tdnet-candidate-preview.js";

function flagValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function positiveIntegerFlag(name: string, fallback: number): number {
  const raw = flagValue(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const observationDate = flagValue("date") ?? undefined;
  const limit = positiveIntegerFlag("limit", 100);
  const snapshot = await fetchTdnetDisclosureSnapshot({ observationDate });
  const preview = buildTdnetCandidatePreview(snapshot);
  const visibleCandidates = preview.candidates.slice(0, limit);

  console.log(JSON.stringify({
    mode: "read-only-preview",
    safety: {
      marketEventWrite: false,
      checkpointWrite: false,
      watchlistWrite: false,
      notificationDelivery: false,
      inferredEventTime: false,
      inferredOccurrenceIdentity: false,
    },
    summary: {
      observationDate: preview.observationDate,
      explicitEmpty: preview.explicitEmpty,
      pageCount: preview.pageCount,
      disclosureCount: preview.disclosureCount,
      candidateCount: preview.candidateCount,
      unmatchedDisclosureCount: preview.unmatchedDisclosureCount,
      registrationReadyCount: preview.registrationReadyCount,
      blockerCounts: preview.blockerCounts,
      returnedCandidateCount: visibleCandidates.length,
      truncated: visibleCandidates.length < preview.candidateCount,
    },
    sourcePages: preview.pageUrls,
    candidates: visibleCandidates,
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
